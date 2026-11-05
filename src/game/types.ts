// ── ARENA · core shared types ────────────────────────────────────────────────
// The simulation layer (src/game) is intentionally free of any rendering or
// DOM dependency: it must stay deterministic and node-testable so it can later
// run authoritatively on the server for online play (Phase 7).

export type AttackKind = 'LP' | 'HP' | 'LK' | 'HK'

/** Frame-data driven attack definition (all frame counts at 60 ticks/s). */
export interface AttackDef {
  kind: AttackKind
  name: string
  heavy: boolean
  /** frames before the hitbox is live */
  startup: number
  /** frames the hitbox can connect */
  active: number
  /** frames after the active window before the fighter can act */
  recovery: number
  damage: number
  /** horizontal reach in world units */
  range: number
  /** contact point height, used for FX placement */
  hitY: number
  /** forward drift speed (m/s) while startup+active */
  lunge: number
  /** knockback speed applied to the defender (m/s) */
  pushback: number
  hitstun: number
  blockstun: number
  /** freeze frames applied to both fighters on contact */
  hitstop: number
  meterGain: number
  knockdown: boolean
}

export interface FighterConfig {
  id: string
  name: string
  epithet: string
  bio: string
  /** primary accent — emissive trim, UI, FX */
  color: string
  colorDim: string
  bodyTint: string
  scale: number
  health: number
  walkSpeed: number
  backSpeed: number
  runSpeed: number
  /** damage multiplier */
  attackPower: number
  /** animation/framespeed multiplier (>1 = faster moves) */
  tempo: number
  /** 1–5 bars shown in the UI (must reflect real data) */
  stats: { power: number; speed: number; defense: number; range: number }
}

export interface PlayerInput {
  /** -1..1 horizontal intent */
  moveX: number
  block: boolean
}

export interface InputEdges {
  lp: boolean
  hp: boolean
  lk: boolean
  hk: boolean
  dodge: boolean
}

export const NO_INPUT: PlayerInput = { moveX: 0, block: false }
export const NO_EDGES: InputEdges = { lp: false, hp: false, lk: false, hk: false, dodge: false }

export type AnnounceKind = 'round' | 'fight' | 'ko' | 'timeup' | 'win' | 'perfect' | 'draw' | 'ex'

export interface FighterStats {
  damage: number
  hits: number
  maxCombo: number
  blocks: number
}

export interface MatchSummary {
  winner: number
  rounds: [number, number]
  stats: [FighterStats, FighterStats]
  ticks: number
}

export type MatchPhase = 'intro' | 'fight' | 'koSlowmo' | 'roundEnd' | 'matchEnd'

export type GameEvent =
  | { t: 'announce'; text: string; kind: AnnounceKind }
  | { t: 'attack'; who: number; kind: AttackKind; heavy: boolean; ex: boolean }
  | { t: 'hit'; who: number; victim: number; x: number; y: number; blocked: boolean; heavy: boolean; ex: boolean; damage: number }
  | { t: 'ko'; loser: number }
  | { t: 'exReady'; who: number }
  | { t: 'roundEnd'; winner: number; perfect: boolean; byTimeout: boolean }
  | { t: 'matchEnd'; winner: number; summary: MatchSummary }
