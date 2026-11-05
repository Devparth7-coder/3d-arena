import type { AttackDef, AttackKind, FighterConfig } from './types'

// ── simulation constants (all timing at 60 ticks per second) ─────────────────
export const TPS = 60
export const TICK = 1 / 60
export const ARENA_HALF_WIDTH = 5.4
export const PUSH_RADIUS = 0.45

export const ROUND_TIME_SECONDS = 60
export const ROUNDS_TO_WIN = 2
export const INTRO_TICKS = 170
export const KO_SLOWMO_TICKS = 85
export const ROUND_END_TICKS = 165

export const METER_MAX = 100
export const EX_DAMAGE_MULT = 1.6
export const METER_DEFENDER_RATIO = 0.35
export const CHIP_RATIO = 0.1
export const COMBO_SCALE_MIN = 0.35
export const COMBO_SCALE_STEP = 0.09

export const DODGE_FRAMES = 20
export const DODGE_INVULN = 13
export const DODGE_SPEED = 6.5
export const DODGE_COOLDOWN = 58

export const KNOCKDOWN_FRAMES = 42
export const GETUP_FRAMES = 26
export const GETUP_INVULN = 20

// ── move list · shared frame data ────────────────────────────────────────────
// Per-fighter tuning (tempo / power) is applied in the engine, so every
// character's version of a move is real frame data, not a visual skin.
export const ATTACKS: Record<AttackKind, AttackDef> = {
  LP: {
    kind: 'LP', name: 'JAB', heavy: false,
    startup: 5, active: 3, recovery: 8,
    damage: 5, range: 1.35, hitY: 1.35,
    lunge: 0.6, pushback: 1.7,
    hitstun: 18, blockstun: 10, hitstop: 4, meterGain: 6, knockdown: false,
  },
  HP: {
    kind: 'HP', name: 'RIOT FIST', heavy: true,
    startup: 10, active: 4, recovery: 14,
    damage: 11, range: 1.5, hitY: 1.3,
    lunge: 1.3, pushback: 2.7,
    hitstun: 24, blockstun: 16, hitstop: 8, meterGain: 10, knockdown: false,
  },
  LK: {
    kind: 'LK', name: 'SHIN KICK', heavy: false,
    startup: 7, active: 4, recovery: 9,
    damage: 7, range: 1.7, hitY: 0.75,
    lunge: 0.8, pushback: 1.9,
    hitstun: 19, blockstun: 12, hitstop: 5, meterGain: 7, knockdown: false,
  },
  HK: {
    kind: 'HK', name: 'AXE KICK', heavy: true,
    startup: 14, active: 5, recovery: 18,
    damage: 15, range: 1.9, hitY: 1.0,
    lunge: 1.8, pushback: 3.4,
    hitstun: 30, blockstun: 19, hitstop: 10, meterGain: 12, knockdown: true,
  },
}

// ── roster (Milestone 1: two fighters; selection screen lands in Phase 5) ────
export const FIGHTERS: FighterConfig[] = [
  {
    id: 'volt',
    name: 'VOLT',
    epithet: 'STORM PROTOCOL',
    bio: 'A decommissioned grid-enforcement unit rewired for the pits. Fast, precise, relentless pressure.',
    color: '#29e6ff',
    colorDim: '#0d5e75',
    bodyTint: '#141a26',
    scale: 1.0,
    health: 100,
    walkSpeed: 2.5,
    backSpeed: 1.9,
    runSpeed: 5.2,
    attackPower: 1.0,
    tempo: 1.08,
    stats: { power: 3, speed: 5, defense: 3, range: 3 },
  },
  {
    id: 'pyra',
    name: 'PYRA',
    epithet: 'FURNACE CODE',
    bio: 'Assembled from foundry frames that never cooled down. Slower to move — every hit carries furnace weight.',
    color: '#ff3b52',
    colorDim: '#7e1424',
    bodyTint: '#261519',
    scale: 1.08,
    health: 105,
    walkSpeed: 2.1,
    backSpeed: 1.6,
    runSpeed: 4.6,
    attackPower: 1.15,
    tempo: 0.94,
    stats: { power: 5, speed: 2, defense: 4, range: 3 },
  },
]
