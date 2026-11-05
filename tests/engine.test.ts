import { describe, expect, it } from 'vitest'
import { MatchEngine } from '../src/game/engine'
import { SparringAI } from '../src/game/ai'
import { FIGHTERS, ARENA_HALF_WIDTH, INTRO_TICKS, KO_SLOWMO_TICKS, ROUND_END_TICKS } from '../src/game/config'
import { NO_EDGES, NO_INPUT } from '../src/game/types'
import type { GameEvent, InputEdges } from '../src/game/types'

const BLOCK = { moveX: 0, block: true }
const edges = (k: 'lp' | 'hp' | 'lk' | 'hk' | 'dodge'): InputEdges => ({ ...NO_EDGES, [k]: true })

function newMatch(roundSeconds = 10): MatchEngine {
  const e = new MatchEngine([FIGHTERS[0], FIGHTERS[1]], { roundSeconds })
  while (e.phase === 'intro') e.step()
  // deterministic spacing: well inside every attack's range
  e.fighters[0].pos.x = 0
  e.fighters[1].pos.x = 1.2
  return e
}

function pump(e: MatchEngine, n: number, input2 = NO_INPUT) {
  for (let i = 0; i < n; i++) {
    e.step([NO_INPUT, input2])
    e.flush()
  }
}

describe('attacks & frame data', () => {
  it('an attack connects at most once per activation (no per-frame multi-hit)', () => {
    const e = newMatch()
    const hits: GameEvent[] = []
    e.subscribe((ev) => { if (ev.t === 'hit') hits.push(ev) })
    e.step([NO_INPUT, NO_INPUT], [edges('lp'), NO_EDGES])
    pump(e, 40)
    expect(hits).toHaveLength(1)
    expect(e.fighters[1].health).toBe(105 - 5) // PYRA 105 HP, VOLT jab = 5
    expect(e.fighters[1].state).toBe('idle') // hitstun (18f) expired within 40 ticks
  })

  it('attacks whiff completely out of range', () => {
    const e = newMatch()
    e.fighters[1].pos.x = 5.2
    const hits: GameEvent[] = []
    e.subscribe((ev) => { if (ev.t === 'hit') hits.push(ev) })
    e.step([NO_INPUT, NO_INPUT], [edges('hk'), NO_EDGES])
    pump(e, 50)
    expect(hits).toHaveLength(0)
    expect(e.fighters[1].health).toBe(105)
  })

  it('heavy kick knocks down', () => {
    const e = newMatch()
    e.step([NO_INPUT, NO_INPUT], [edges('hk'), NO_EDGES])
    pump(e, 60)
    const f2 = e.fighters[1]
    expect(f2.health).toBe(105 - 15)
    expect(['knockdown', 'getup']).toContain(f2.state)
  })

  it('chained jabs register as a combo with damage scaling', () => {
    const e = newMatch()
    const hits: GameEvent[] = []
    e.subscribe((ev) => { if (ev.t === 'hit') hits.push(ev) })
    e.step([NO_INPUT, NO_INPUT], [edges('lp'), NO_EDGES]) // tick 1 — jab starts
    // jab hits at tick 6, hitstop freezes both fighters ticks 7–10,
    // recovery finishes at tick 20 → free from tick 21
    for (let i = 0; i < 19; i++) e.step() // ticks 2–20
    e.step([NO_INPUT, NO_INPUT], [edges('lp'), NO_EDGES]) // tick 21 — second jab
    pump(e, 40)
    expect(hits).toHaveLength(2)
    expect(hits[1].t === 'hit' && hits[1].damage).toBe(5) // scaled 5 * 0.91 → 5
    expect(e.fighters[1].health).toBe(105 - 10)
    expect(e.fighters[0].stats.maxCombo).toBe(2)
  })
})

describe('defense', () => {
  it('blocking converts hits into chip damage and applies blockstun', () => {
    const e = newMatch()
    const f2 = e.fighters[1]
    f2.health = 3
    e.step([NO_INPUT, BLOCK], [edges('lp'), NO_EDGES])
    pump(e, 6, BLOCK)
    expect(f2.health).toBe(2) // chip = max(1, round(5 * 0.1)) = 1
    expect(f2.state).toBe('block')
    expect(f2.blockstunT).toBeGreaterThan(0)
  })

  it('chip damage can never KO', () => {
    const e = newMatch()
    const f2 = e.fighters[1]
    f2.health = 1
    e.step([NO_INPUT, BLOCK], [edges('hp'), NO_EDGES])
    pump(e, 10, BLOCK)
    expect(f2.health).toBe(1)
    expect(e.phase).toBe('fight')
  })

  it('dodge grants invulnerability through the active window', () => {
    const e = newMatch()
    const hits: GameEvent[] = []
    e.subscribe((ev) => { if (ev.t === 'hit') hits.push(ev) })
    // P1 attacks; P2 dodges on the same tick (invuln frames 1-13 vs hit at frame 5)
    e.step([NO_INPUT, NO_INPUT], [edges('lp'), edges('dodge')])
    pump(e, 40)
    expect(hits).toHaveLength(0)
    expect(e.fighters[1].health).toBe(105)
  })
})

describe('EX meter', () => {
  it('a full meter empowers heavies into unblockable EX strikes and consumes the meter', () => {
    const e = newMatch()
    const f1 = e.fighters[0]
    const f2 = e.fighters[1]
    f1.meter = 100
    e.step([NO_INPUT, BLOCK], [edges('hp'), NO_EDGES])
    expect(f1.meter).toBe(0) // consumed on activation
    pump(e, 60, BLOCK)
    expect(f2.health).toBe(105 - Math.round(11 * 1.6)) // 18 damage through block
    expect(['knockdown', 'getup']).toContain(f2.state)
  })
})

describe('round & match flow', () => {
  it('KO triggers the cinematic, awards the round, and resets for the next round', () => {
    const e = newMatch()
    const f1 = e.fighters[0]
    e.fighters[1].health = 5
    e.step([NO_INPUT, NO_INPUT], [edges('hk'), NO_EDGES])
    pump(e, 30) // hit lands at frame 13 → KO
    expect(e.phase).toBe('koSlowmo')
    expect(e.fighters[1].state).toBe('ko')
    for (let i = 0; i < KO_SLOWMO_TICKS + 5; i++) { e.step(); e.flush() }
    expect(e.phase).toBe('roundEnd')
    expect(f1.roundsWon).toBe(1)
    expect(f1.state).toBe('victory')
    for (let i = 0; i < ROUND_END_TICKS + INTRO_TICKS + 10; i++) { e.step(); e.flush() }
    expect(e.phase).toBe('fight') // round 2 underway
    expect(e.fighters[1].health).toBe(105) // health restored
  })

  it('first to two round wins takes the match', () => {
    const e = newMatch()
    let matchEnd: GameEvent | undefined
    e.subscribe((ev) => { if (ev.t === 'matchEnd') matchEnd = ev })
    for (let round = 0; round < 2; round++) {
      while (e.phase !== 'fight') { e.step(); e.flush() }
      e.fighters[0].pos.x = 0
      e.fighters[1].pos.x = 1.2
      e.fighters[1].health = 5
      e.step([NO_INPUT, NO_INPUT], [edges('hk'), NO_EDGES])
      pump(e, 30)
      for (let i = 0; i < KO_SLOWMO_TICKS + ROUND_END_TICKS + 5; i++) { e.step(); e.flush() }
    }
    expect(e.finished).toBe(true)
    expect(e.phase).toBe('matchEnd')
    expect(matchEnd && matchEnd.t === 'matchEnd' && matchEnd.winner).toBe(0)
    expect(matchEnd && matchEnd.t === 'matchEnd' && matchEnd.summary.rounds).toEqual([2, 0])
  })

  it('time-up awards the round to the fighter with more health', () => {
    const e = newMatch()
    e.fighters[0].health = 80
    e.fighters[1].health = 40
    for (let i = 0; i < 610; i++) { e.step(); e.flush() }
    expect(e.fighters[0].roundsWon).toBe(1)
  })
})

describe('physical integrity', () => {
  it('fighters never overlap (pushbox) and stay inside the arena bounds', () => {
    const e = newMatch()
    e.fighters[0].pos.x = 0
    e.fighters[1].pos.x = 0.2
    for (let i = 0; i < 30; i++) { e.step(); e.flush() }
    const gap = Math.abs(e.fighters[0].pos.x - e.fighters[1].pos.x)
    expect(gap).toBeGreaterThanOrEqual(0.88)
    for (const f of e.fighters) {
      expect(f.pos.x).toBeLessThanOrEqual(ARENA_HALF_WIDTH + 1e-9)
      expect(f.pos.x).toBeGreaterThanOrEqual(-ARENA_HALF_WIDTH - 1e-9)
    }
  })

  it('a full AI vs AI match runs without corrupting state', () => {
    const e = new MatchEngine([FIGHTERS[0], FIGHTERS[1]], { roundSeconds: 15 })
    while (e.phase === 'intro') e.step()
    const ai0 = new SparringAI()
    const ai1 = new SparringAI()
    for (let i = 0; i < 60 * 75 && !e.finished; i++) {
      const d0 = ai0.think(e.fighters[0], e.fighters[1])
      const d1 = ai1.think(e.fighters[1], e.fighters[0])
      e.step([d0.input, d1.input], [d0.edges, d1.edges])
      e.flush()
      for (const f of e.fighters) {
        expect(Number.isFinite(f.pos.x)).toBe(true)
        expect(Number.isFinite(f.health)).toBe(true)
        expect(f.health).toBeGreaterThanOrEqual(0)
        expect(f.health).toBeLessThanOrEqual(f.cfg.health)
      }
    }
  })
})
