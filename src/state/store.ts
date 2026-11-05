import { create } from 'zustand'
import type { MatchSummary } from '../game/types'

export type Screen = 'menu' | 'fight' | 'results'

export type Quality = 'low' | 'medium' | 'high'

export interface Settings {
  master: number
  music: number
  sfx: number
  shake: boolean
  quality: Quality
}

const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.55, sfx: 0.9, shake: true, quality: 'high' }

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('arena.settings')
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch { /* corrupted storage — fall back to defaults */ }
  return DEFAULT_SETTINGS
}

function persistSettings(s: Settings) {
  try { localStorage.setItem('arena.settings', JSON.stringify(s)) } catch { /* storage unavailable */ }
}

interface AppState {
  screen: Screen
  settings: Settings
  summary: MatchSummary | null
  /** increments on every match start/rematch — used as a remount key */
  matchSeq: number
  startMatch: () => void
  endMatch: (summary: MatchSummary) => void
  rematch: () => void
  toMenu: () => void
  updateSettings: (patch: Partial<Settings>) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'menu',
  settings: loadSettings(),
  summary: null,
  matchSeq: 0,

  startMatch: () => set((s) => ({ screen: 'fight', summary: null, matchSeq: s.matchSeq + 1 })),

  endMatch: (summary) => set({ screen: 'results', summary }),

  rematch: () => set((s) => ({ screen: 'fight', summary: null, matchSeq: s.matchSeq + 1 })),

  toMenu: () => set({ screen: 'menu', summary: null }),

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    persistSettings(settings)
    set({ settings })
  },
}))
