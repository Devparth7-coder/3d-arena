import type { Fighter } from './engine'
import type { InputEdges, PlayerInput } from './types'
import { NO_EDGES, NO_INPUT } from './types'
import { ARENA_HALF_WIDTH, METER_MAX } from './config'

export interface AIDecision {
  input: PlayerInput
  edges: InputEdges
}

export interface AIParams {
  /** 0..1 — chance per decision window to attack when in range */
  aggression: number
  /** 0..1 — chance to defend when the opponent's attack is incoming */
  defense: number
}

/**
 * Milestone-1 sparring opponent ("SPARRING CORE v0.4").
 * Distance management, block/dodge reactions, weighted move choice, EX usage.
 * The full multi-difficulty AI system with personalities is Phase 4.
 */
export class SparringAI {
  private cd = 40
  private heldInput: PlayerInput = NO_INPUT
  private holdFrames = 0

  constructor(private params: AIParams = { aggression: 0.55, defense: 0.45 }) {}

  think(me: Fighter, opp: Fighter): AIDecision {
    if (this.holdFrames > 0) {
      this.holdFrames--
      return { input: this.heldInput, edges: NO_EDGES }
    }

    const dist = Math.abs(opp.pos.x - me.pos.x)
    const toward: 1 | -1 = opp.pos.x > me.pos.x ? 1 : -1

    // ── defense: react to an attack that can still connect ───────────────────
    const threat =
      opp.state === 'attack' && opp.attack !== null &&
      opp.attack.frame < opp.attack.def.startup + opp.attack.def.active &&
      dist < opp.attack.def.range + 1.1

    if (threat && Math.random() < this.params.defense) {
      if (Math.random() < 0.2) {
        this.holdFrames = 18
        this.heldInput = NO_INPUT
        return { input: NO_INPUT, edges: { ...NO_EDGES, dodge: true } }
      }
      this.holdFrames = 24
      this.heldInput = { moveX: 0, block: true }
      return { input: this.heldInput, edges: NO_EDGES }
    }

    // ── offense: weighted move choice when in range ───────────────────────────
    if (this.cd <= 0 && dist < 1.95 && Math.random() < this.params.aggression) {
      this.cd = 26 + Math.floor(Math.random() * 46)
      let kind: 'lp' | 'hp' | 'lk' | 'hk'
      const r = Math.random()
      kind = r < 0.34 ? 'lp' : r < 0.58 ? 'lk' : r < 0.8 ? 'hp' : 'hk'
      if (me.meter >= METER_MAX && Math.random() < 0.5) kind = Math.random() < 0.5 ? 'hp' : 'hk'
      return { input: NO_INPUT, edges: { ...NO_EDGES, [kind]: true } }
    }
    this.cd--

    // ── movement: close distance, respect spacing, don't corner yourself ──────
    if (dist > 1.6) {
      this.holdFrames = 6
      this.heldInput = { moveX: toward, block: false }
    } else if (dist < 1.05 && Math.random() < 0.3) {
      const retreatDir = -toward
      const cornered = Math.abs(me.pos.x + retreatDir * 1.5) > ARENA_HALF_WIDTH
      this.holdFrames = 8
      this.heldInput = { moveX: cornered ? toward : retreatDir, block: false }
    } else if (Math.random() < 0.18) {
      this.holdFrames = 12
      this.heldInput = { moveX: 0, block: Math.random() < 0.3 }
    } else {
      this.holdFrames = 4
      this.heldInput = { moveX: toward, block: false }
    }
    return { input: this.heldInput, edges: NO_EDGES }
  }
}
