import type {
  AttackDef, AttackKind, FighterConfig, FighterStats, GameEvent, InputEdges,
  MatchPhase, MatchSummary, PlayerInput,
} from './types'
import { NO_EDGES, NO_INPUT } from './types'
import {
  ARENA_HALF_WIDTH, ATTACKS, CHIP_RATIO, COMBO_SCALE_MIN, COMBO_SCALE_STEP,
  DODGE_COOLDOWN, DODGE_FRAMES, DODGE_INVULN, DODGE_SPEED, EX_DAMAGE_MULT,
  GETUP_FRAMES, GETUP_INVULN, INTRO_TICKS, KNOCKDOWN_FRAMES, KO_SLOWMO_TICKS,
  METER_DEFENDER_RATIO, METER_MAX, PUSH_RADIUS, ROUND_END_TICKS,
  ROUND_TIME_SECONDS, ROUNDS_TO_WIN, TICK,
} from './config'

export type FighterState =
  | 'intro' | 'idle' | 'walkF' | 'walkB' | 'run' | 'attack' | 'block'
  | 'dodge' | 'hitstun' | 'knockdown' | 'getup' | 'ko' | 'victory'

const FREE_STATES: ReadonlySet<FighterState> = new Set(['idle', 'walkF', 'walkB', 'run'])
const clampX = (x: number) => Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, x))

/** Applies a fighter's tempo (frame speed) and power (damage) to shared frame data. */
function scaleMove(def: AttackDef, tempo: number, power: number): AttackDef {
  return {
    ...def,
    startup: Math.max(1, Math.round(def.startup / tempo)),
    active: Math.max(1, Math.round(def.active / tempo)),
    recovery: Math.max(1, Math.round(def.recovery / tempo)),
    damage: Math.round(def.damage * power),
  }
}

export interface ActiveAttack {
  def: AttackDef
  frame: number
  ex: boolean
  hitDone: boolean
}

export class Fighter {
  readonly cfg: FighterConfig
  readonly index: number
  readonly moves: Record<AttackKind, AttackDef>

  pos = { x: 0, z: 0 }
  vx = 0
  facing: 1 | -1 = 1
  health: number
  meter = 0
  state: FighterState = 'intro'
  stateFrame = 0
  attack: ActiveAttack | null = null
  hitstunT = 0
  blockstunT = 0
  knockdownT = 0
  invuln = 0
  dodgeCd = 0
  comboOnMe = 0
  roundsWon = 0
  flash = 0
  stats: FighterStats = { damage: 0, hits: 0, maxCombo: 0, blocks: 0 }

  constructor(cfg: FighterConfig, index: number) {
    this.cfg = cfg
    this.index = index
    this.health = cfg.health
    this.moves = {
      LP: scaleMove(ATTACKS.LP, cfg.tempo, cfg.attackPower),
      HP: scaleMove(ATTACKS.HP, cfg.tempo, cfg.attackPower),
      LK: scaleMove(ATTACKS.LK, cfg.tempo, cfg.attackPower),
      HK: scaleMove(ATTACKS.HK, cfg.tempo, cfg.attackPower),
    }
  }

  get maxHealth() { return this.cfg.health }
  get meterFull() { return this.meter >= METER_MAX }
  get attackTotal() { return this.attack ? this.attack.def.startup + this.attack.def.active + this.attack.def.recovery : 0 }
}

export interface MatchOptions {
  roundsToWin?: number
  roundSeconds?: number
}

/**
 * Deterministic, fixed-step (60 Hz) fighting simulation.
 * Knows nothing about THREE.js, the DOM, or audio — the presentation layer
 * subscribes to events and reads state. This separation is what will allow a
 * server to run the same code authoritatively for online matches (Phase 7).
 */
export class MatchEngine {
  readonly fighters: [Fighter, Fighter]
  readonly roundsToWin: number
  readonly roundTicks: number

  phase: MatchPhase = 'intro'
  phaseT = 0
  round = 1
  timer: number
  hitstop = 0
  paused = false
  finished = false
  tick = 0
  /** winner index of the round currently being celebrated (-1 = draw) */
  roundWinner = -1

  private events: GameEvent[] = []
  private listeners = new Set<(e: GameEvent) => void>()
  private pendingWinner = -1

  constructor(cfgs: [FighterConfig, FighterConfig], opts: MatchOptions = {}) {
    this.fighters = [new Fighter(cfgs[0], 0), new Fighter(cfgs[1], 1)]
    this.roundsToWin = opts.roundsToWin ?? ROUNDS_TO_WIN
    this.roundTicks = Math.round((opts.roundSeconds ?? ROUND_TIME_SECONDS) * 60)
    this.timer = this.roundTicks
    this.resetRound()
  }

  // ── event plumbing ──────────────────────────────────────────────────────────
  subscribe(fn: (e: GameEvent) => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private emit(e: GameEvent) { this.events.push(e) }

  /** Called once per rendered frame by the driver: delivers all queued events. */
  flush() {
    if (this.events.length === 0) return
    const batch = this.events
    this.events = []
    for (const e of batch) for (const fn of this.listeners) fn(e)
  }

  /** Global slow-motion factor for the presentation layer during KO cinematics. */
  get timeScale() { return this.phase === 'koSlowmo' ? 0.35 : 1 }

  // ── main step (one 60 Hz tick) ──────────────────────────────────────────────
  step(inputs: readonly [PlayerInput, PlayerInput] = [NO_INPUT, NO_INPUT],
       edges: readonly [InputEdges, InputEdges] = [NO_EDGES, NO_EDGES]) {
    if (this.paused) return
    this.tick++
    switch (this.phase) {
      case 'intro': {
        this.phaseT++
        if (this.phaseT === 1) {
          const decider = this.fighters.every(f => f.roundsWon === this.roundsToWin - 1)
          this.emit({ t: 'announce', text: decider ? 'FINAL ROUND' : `ROUND ${this.round}`, kind: 'round' })
        }
        if (this.phaseT === 125) {
          for (const f of this.fighters) { f.state = 'idle'; f.stateFrame = 0 }
        }
        if (this.phaseT >= INTRO_TICKS) {
          this.phase = 'fight'
          this.phaseT = 0
          this.emit({ t: 'announce', text: 'FIGHT', kind: 'fight' })
        }
        break
      }
      case 'fight': {
        if (this.hitstop > 0) { this.hitstop--; break }
        this.timer = Math.max(0, this.timer - 1)
        this.updateFighter(0, inputs[0], edges[0])
        this.updateFighter(1, inputs[1], edges[1])
        this.separate()
        this.resolveHit(0)
        this.resolveHit(1)
        if (this.timer <= 0 && this.phase === 'fight') this.timeUp()
        break
      }
      case 'koSlowmo': {
        this.phaseT++
        this.settle(this.fighters[0])
        this.settle(this.fighters[1])
        if (this.phaseT >= KO_SLOWMO_TICKS) this.endRound(this.pendingWinner, false)
        break
      }
      case 'roundEnd': {
        this.phaseT++
        if (this.phaseT >= ROUND_END_TICKS) {
          const w = this.fighters.findIndex(f => f.roundsWon >= this.roundsToWin)
          if (w >= 0) this.finishMatch(w)
          else { this.round++; this.resetRound() }
        }
        break
      }
      case 'matchEnd':
        break
    }
  }

  // ── fighter update ──────────────────────────────────────────────────────────
  private updateFighter(i: number, input: PlayerInput, edges: InputEdges) {
    const f = this.fighters[i]
    const opp = this.fighters[1 - i]
    if (f.dodgeCd > 0) f.dodgeCd--
    if (f.invuln > 0) f.invuln--
    if (f.flash > 0) f.flash--

    if (f.state === 'ko' || f.state === 'victory') { this.settle(f); return }

    if (FREE_STATES.has(f.state)) {
      const kind: AttackKind | null =
        edges.lp ? 'LP' : edges.hp ? 'HP' : edges.lk ? 'LK' : edges.hk ? 'HK' : null
      if (kind) {
        this.startAttack(f, kind)
      } else if (edges.dodge && f.dodgeCd === 0) {
        this.startDodge(f)
      } else if (input.block) {
        f.state = 'block'; f.stateFrame = 0; f.vx = 0
      } else if (input.moveX !== 0) {
        const dir = input.moveX > 0 ? 1 : -1
        const toward: 1 | -1 = opp.pos.x === f.pos.x ? f.facing : (opp.pos.x > f.pos.x ? 1 : -1)
        const fwd = dir === toward
        const dist = Math.abs(opp.pos.x - f.pos.x)
        if (fwd && dist > 3.6) {
          f.state = 'run'; f.vx = dir * f.cfg.runSpeed
        } else {
          f.state = fwd ? 'walkF' : 'walkB'
          f.vx = dir * (fwd ? f.cfg.walkSpeed : f.cfg.backSpeed)
        }
      } else {
        f.state = 'idle'; f.vx = 0
      }
      if (FREE_STATES.has(f.state)) {
        f.facing = opp.pos.x === f.pos.x ? f.facing : (opp.pos.x > f.pos.x ? 1 : -1)
      }
    } else {
      switch (f.state) {
        case 'attack': {
          const atk = f.attack!
          atk.frame++
          f.vx = atk.frame <= atk.def.startup + atk.def.active ? atk.def.lunge * f.facing : 0
          if (atk.frame >= f.attackTotal) { f.state = 'idle'; f.stateFrame = 0; f.attack = null }
          break
        }
        case 'block':
          f.stateFrame++
          if (f.blockstunT > 0) { f.blockstunT--; f.vx *= 0.85 }
          else if (!input.block) { f.state = 'idle'; f.stateFrame = 0; f.vx = 0 }
          else f.vx = 0
          break
        case 'dodge':
          f.stateFrame++
          f.vx *= 0.86
          if (f.stateFrame >= DODGE_FRAMES) { f.state = 'idle'; f.stateFrame = 0; f.vx = 0 }
          break
        case 'hitstun':
          f.stateFrame++
          f.vx *= 0.88
          if (f.stateFrame >= f.hitstunT) { f.state = 'idle'; f.stateFrame = 0; f.comboOnMe = 0 }
          break
        case 'knockdown':
          f.stateFrame++
          f.vx *= 0.9
          if (f.stateFrame >= f.knockdownT) { f.state = 'getup'; f.stateFrame = 0; f.invuln = GETUP_INVULN }
          break
        case 'getup':
          f.stateFrame++
          if (f.stateFrame >= GETUP_FRAMES) { f.state = 'idle'; f.stateFrame = 0; f.comboOnMe = 0 }
          break
        default:
          break
      }
    }

    f.pos.x = clampX(f.pos.x + f.vx * TICK)
  }

  private settle(f: Fighter) {
    f.vx *= 0.9
    f.pos.x = clampX(f.pos.x + f.vx * TICK)
    if (f.flash > 0) f.flash--
  }

  // ── actions ─────────────────────────────────────────────────────────────────
  private startAttack(f: Fighter, kind: AttackKind) {
    const def = f.moves[kind]
    const ex = def.heavy && f.meterFull
    if (ex) f.meter = 0
    f.state = 'attack'
    f.stateFrame = 0
    f.attack = { def, frame: 0, ex, hitDone: false }
    f.vx = 0
    this.emit({ t: 'attack', who: f.index, kind, heavy: def.heavy, ex })
  }

  private startDodge(f: Fighter) {
    f.state = 'dodge'
    f.stateFrame = 0
    f.vx = -f.facing * DODGE_SPEED
    f.invuln = DODGE_INVULN
    f.dodgeCd = DODGE_COOLDOWN
  }

  // ── collision ───────────────────────────────────────────────────────────────
  private separate() {
    const [a, b] = this.fighters
    const dx = b.pos.x - a.pos.x
    const gap = Math.abs(dx)
    const min = PUSH_RADIUS * 2
    if (gap >= min) return
    const push = (min - gap) / 2
    const s = dx === 0 ? 1 : dx > 0 ? 1 : -1
    a.pos.x = clampX(a.pos.x - push * s)
    b.pos.x = clampX(b.pos.x + push * s)
  }

  // ── hit resolution ──────────────────────────────────────────────────────────
  private resolveHit(ai: number) {
    const a = this.fighters[ai]
    const d = this.fighters[1 - ai]
    if (this.phase !== 'fight' || !a.attack || a.attack.hitDone) return
    const { def, ex, frame } = a.attack
    if (frame < def.startup || frame >= def.startup + def.active) return

    const dx = d.pos.x - a.pos.x
    if (Math.abs(dx) > def.range + PUSH_RADIUS) return
    if (dx !== 0 && Math.sign(dx) !== a.facing) return

    a.attack.hitDone = true // an attack connects at most once per activation
    if (d.invuln > 0 || d.state === 'ko' || d.state === 'getup' || d.state === 'knockdown') return

    const dir: 1 | -1 = dx === 0 ? a.facing : (dx > 0 ? 1 : -1)
    const contactX = a.pos.x + a.facing * def.range * 0.8

    if (d.state === 'block' && !ex) {
      const chip = Math.max(1, Math.round(def.damage * CHIP_RATIO))
      d.health = Math.max(1, d.health - chip) // chip damage can never KO
      d.blockstunT = def.blockstun
      d.stateFrame = 0
      d.vx = dir * def.pushback
      a.vx = -dir * def.pushback * 0.45
      d.stats.blocks++
      a.stats.damage += chip
      this.hitstop = Math.max(this.hitstop, Math.round(def.hitstop * 0.55))
      this.addMeter(a, def.meterGain * 0.5)
      this.addMeter(d, def.meterGain * 0.7)
      this.emit({ t: 'hit', who: ai, victim: 1 - ai, x: contactX, y: def.hitY, blocked: true, heavy: def.heavy, ex: false, damage: chip })
      return
    }

    const combo = d.state === 'hitstun' ? d.comboOnMe + 1 : 1
    d.comboOnMe = combo
    const scale = Math.max(COMBO_SCALE_MIN, 1 - COMBO_SCALE_STEP * (combo - 1))
    const dmg = Math.round(def.damage * scale * (ex ? EX_DAMAGE_MULT : 1))
    d.health = Math.max(0, d.health - dmg)
    a.stats.damage += dmg
    a.stats.hits++
    a.stats.maxCombo = Math.max(a.stats.maxCombo, combo)
    d.flash = 6
    d.attack = null

    const kill = d.health <= 0
    if (kill || def.knockdown || ex) {
      d.state = 'knockdown'
      d.stateFrame = 0
      d.knockdownT = KNOCKDOWN_FRAMES
      d.vx = dir * def.pushback * 1.2
    } else {
      d.state = 'hitstun'
      d.stateFrame = 0
      d.hitstunT = def.hitstun
      d.vx = dir * def.pushback
    }

    this.hitstop = Math.max(this.hitstop, def.hitstop + (ex ? 5 : 0))
    this.addMeter(a, ex ? 0 : def.meterGain)
    this.addMeter(d, def.meterGain * METER_DEFENDER_RATIO)
    this.emit({ t: 'hit', who: ai, victim: 1 - ai, x: contactX, y: def.hitY, blocked: false, heavy: def.heavy, ex, damage: dmg })

    if (kill) this.handleKO(1 - ai)
  }

  private addMeter(f: Fighter, amount: number) {
    if (amount <= 0) return
    const was = f.meter
    f.meter = Math.min(METER_MAX, f.meter + amount)
    if (was < METER_MAX && f.meter >= METER_MAX) this.emit({ t: 'exReady', who: f.index })
  }

  // ── round / match flow ──────────────────────────────────────────────────────
  private resetRound() {
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i]
      f.pos.x = i === 0 ? -2.4 : 2.4
      f.pos.z = 0
      f.vx = 0
      f.facing = i === 0 ? 1 : -1
      f.health = f.cfg.health
      f.state = 'intro'
      f.stateFrame = 0
      f.attack = null
      f.hitstunT = 0
      f.blockstunT = 0
      f.knockdownT = 0
      f.invuln = 0
      f.dodgeCd = 0
      f.comboOnMe = 0
      f.flash = 0
    }
    this.phase = 'intro'
    this.phaseT = 0
    this.timer = this.roundTicks
    this.hitstop = 0
    this.roundWinner = -1
  }

  private handleKO(loser: number) {
    if (this.phase !== 'fight') return
    const l = this.fighters[loser]
    l.attack = null
    l.state = 'ko'
    l.stateFrame = 0
    this.phase = 'koSlowmo'
    this.phaseT = 0
    this.pendingWinner = 1 - loser
    this.emit({ t: 'ko', loser })
    this.emit({ t: 'announce', text: 'K.O.', kind: 'ko' })
  }

  private timeUp() {
    this.emit({ t: 'announce', text: 'TIME UP', kind: 'timeup' })
    const [a, b] = this.fighters
    const w = a.health === b.health ? -1 : a.health > b.health ? 0 : 1
    if (w === -1) this.emit({ t: 'announce', text: 'DRAW', kind: 'draw' })
    this.endRound(w, true)
  }

  private endRound(winner: number, byTimeout: boolean) {
    this.phase = 'roundEnd'
    this.phaseT = 0
    this.roundWinner = winner
    const perfect = winner >= 0 && this.fighters[winner].health === this.fighters[winner].cfg.health
    if (winner >= 0) {
      const w = this.fighters[winner]
      const l = this.fighters[1 - winner]
      w.roundsWon++
      w.state = 'victory'
      w.stateFrame = 0
      w.attack = null
      w.vx = 0
      if (l.state !== 'ko' && l.state !== 'knockdown') { l.state = 'idle'; l.attack = null; l.vx = 0 }
      this.emit({ t: 'announce', text: `${w.cfg.name} WINS`, kind: 'win' })
      if (perfect) this.emit({ t: 'announce', text: 'PERFECT', kind: 'perfect' })
    }
    this.emit({ t: 'roundEnd', winner, perfect, byTimeout })
  }

  private finishMatch(winner: number) {
    this.phase = 'matchEnd'
    this.phaseT = 0
    this.finished = true
    this.emit({
      t: 'matchEnd',
      winner,
      summary: {
        winner,
        rounds: [this.fighters[0].roundsWon, this.fighters[1].roundsWon],
        stats: [{ ...this.fighters[0].stats }, { ...this.fighters[1].stats }],
        ticks: this.tick,
      },
    })
  }

  /** Dev/testing affordance: instantly KO a fighter (used by automated checks). */
  debugKO(loser: number) {
    if (this.phase !== 'fight') return
    this.fighters[loser].health = 0
    this.handleKO(loser)
  }

  /** Dev/testing affordance: jump straight to the match-end state. */
  debugFinish(winner: number) {
    if (this.finished) return
    this.fighters[winner].roundsWon = this.roundsToWin
    this.finishMatch(winner)
  }
}
