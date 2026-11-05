import type { InputEdges, PlayerInput } from './types'

export type Action = 'left' | 'right' | 'block' | 'dodge' | 'lp' | 'hp' | 'lk' | 'hk' | 'pause'

/**
 * Player 1 default layout (Phase 6 adds the mirrored player-2 map):
 *   A / D  or  ◄ / ►   move
 *   S      or  ▼        block (hold)
 *   SPACE               dodge (backdash, i-frames)
 *   U / I               light punch / heavy punch
 *   J / K               light kick / heavy kick
 *   ESC                 pause
 */
export const DEFAULT_BINDS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  block: ['KeyS', 'ArrowDown'],
  dodge: ['Space'],
  lp: ['KeyU'],
  hp: ['KeyI'],
  lk: ['KeyJ'],
  hk: ['KeyK'],
  pause: ['Escape'],
}

export const ACTION_LABELS: Array<{ action: Action; label: string; keys: string[] }> = [
  { action: 'left', label: 'MOVE', keys: ['A', 'D'] },
  { action: 'block', label: 'BLOCK (HOLD)', keys: ['S'] },
  { action: 'dodge', label: 'DODGE', keys: ['SPACE'] },
  { action: 'lp', label: 'LIGHT PUNCH', keys: ['U'] },
  { action: 'hp', label: 'HEAVY PUNCH', keys: ['I'] },
  { action: 'lk', label: 'LIGHT KICK', keys: ['J'] },
  { action: 'hk', label: 'HEAVY KICK', keys: ['K'] },
  { action: 'pause', label: 'PAUSE', keys: ['ESC'] },
]

export class InputManager {
  private down = new Set<string>()
  private edges = new Set<Action>()
  private disposers: Array<() => void> = []

  constructor(private onPause?: () => void, private binds: Record<Action, string[]> = DEFAULT_BINDS) {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      this.down.add(e.code)
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      const action = this.actionFor(e.code)
      if (action) {
        this.edges.add(action)
        if (action === 'pause') this.onPause?.()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => { this.down.delete(e.code) }
    const onBlur = () => { this.down.clear() }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    this.disposers.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
    )
  }

  private actionFor(code: string): Action | null {
    for (const [action, codes] of Object.entries(this.binds) as Array<[Action, string[]]>) {
      if (codes.includes(code)) return action
    }
    return null
  }

  private isDown(action: Action): boolean {
    return this.binds[action].some((c) => this.down.has(c))
  }

  /** Held state — safe to call multiple times per frame. */
  poll(): PlayerInput {
    return {
      moveX: (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0),
      block: this.isDown('block'),
    }
  }

  /** Presses since the last call — consumed exactly once. */
  takeEdges(): InputEdges {
    const e: InputEdges = {
      lp: this.edges.has('lp'),
      hp: this.edges.has('hp'),
      lk: this.edges.has('lk'),
      hk: this.edges.has('hk'),
      dodge: this.edges.has('dodge'),
    }
    this.edges.clear()
    return e
  }

  dispose() {
    for (const d of this.disposers) d()
    this.disposers = []
    this.down.clear()
    this.edges.clear()
  }
}
