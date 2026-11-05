import { useState } from 'react'
import { audio } from '../game/audio'
import { ACTION_LABELS } from '../game/input'
import { useAppStore } from '../state/store'
import { GameCanvas } from '../three/Scene'

type Panel = 'settings' | 'controls' | 'roadmap' | null

const ROADMAP: Array<{ phase: string; title: string; status: 'done' | 'partial' | 'next' | 'planned'; note: string }> = [
  { phase: 'P1', title: 'Arena · camera · fighters · movement · combat', status: 'done', note: 'Live in this build' },
  { phase: 'P2', title: 'Character animation state machines', status: 'partial', note: 'Rigged skeletal anims + procedural layer; per-character combat move-set next' },
  { phase: 'P3', title: 'Physics props · guard breaks · juggles', status: 'partial', note: 'Combos, blocks, dodges, knockdowns live; Rapier-driven debris pending' },
  { phase: 'P4', title: 'AI opponent · difficulties · personalities', status: 'partial', note: 'Sparring Core v0.4 live; full AI system next milestone' },
  { phase: 'P5', title: 'Character select · more arenas · specials', status: 'planned', note: 'EX meter and two fighters already in' },
  { phase: 'P6', title: 'Local multiplayer (2P keyboard)', status: 'planned', note: 'Input abstraction ready' },
  { phase: 'P7', title: 'Online multiplayer · matchmaking · server authority', status: 'planned', note: 'Deterministic sim already decoupled from rendering' },
  { phase: 'P8', title: 'Profiles · rankings · match history', status: 'planned', note: 'Requires backend' },
  { phase: 'P9', title: 'Audio/visual polish · optimization · deploy', status: 'partial', note: 'Procedural audio + FX live; pass ongoing' },
]

export function MainMenu() {
  const startMatch = useAppStore((s) => s.startMatch)
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [panel, setPanel] = useState<Panel>(null)

  const open = (p: Panel) => {
    audio.ui('click')
    setPanel((cur) => (cur === p ? null : p))
  }
  const hover = () => audio.ui('hover')

  return (
    <div className="menu-root">
      <div className="menu-canvas">
        <GameCanvas engine={null} mode="menu" />
      </div>
      <div className="menu-veil" />
      <div className="menu-content">
        <div className="kicker">SECTOR 07 // SPARRING BUILD</div>
        <h1 className="title" aria-label="ARENA">
          {['A', 'R', 'E', 'N', 'A'].map((c, i) => (
            <span key={i} style={{ animationDelay: `${i * 70}ms` }}>{c}</span>
          ))}
        </h1>
        <div className="tagline">3D COMBAT SIMULATION · BROWSER NATIVE</div>

        <nav className="menu-nav">
          <button
            className="primary"
            onMouseEnter={hover}
            onClick={() => { audio.ui('click'); startMatch() }}
          >
            VS CPU <small>SPARRING CORE v0.4</small>
          </button>
          <button onMouseEnter={hover} onClick={() => open('controls')}>CONTROLS</button>
          <button onMouseEnter={hover} onClick={() => open('settings')}>SETTINGS</button>
          <button onMouseEnter={hover} onClick={() => open('roadmap')}>ROADMAP</button>
        </nav>

        <div className="menu-note">Best of 3 · 60s rounds · EX meter empowers your next heavy attack</div>
        <div className="menu-foot">
          v0.1.0 — MILESTONE 1 · fighter model “RobotExpressive” © Tomás Laulhé / Don McCurdy (CC-BY)
        </div>
      </div>

      {panel === 'settings' && (
        <div className="panel" onMouseEnter={hover}>
          <h3>SETTINGS</h3>
          <label className="slider-row">
            <span>MASTER</span>
            <input
              type="range" min={0} max={100} value={Math.round(settings.master * 100)}
              onChange={(e) => updateSettings({ master: Number(e.target.value) / 100 })}
            />
          </label>
          <label className="slider-row">
            <span>MUSIC</span>
            <input
              type="range" min={0} max={100} value={Math.round(settings.music * 100)}
              onChange={(e) => updateSettings({ music: Number(e.target.value) / 100 })}
            />
          </label>
          <label className="slider-row">
            <span>SFX</span>
            <input
              type="range" min={0} max={100} value={Math.round(settings.sfx * 100)}
              onChange={(e) => updateSettings({ sfx: Number(e.target.value) / 100 })}
            />
          </label>
          <div className="toggle-row">
            <span>SCREEN SHAKE</span>
            <button className={settings.shake ? 'on' : ''} onClick={() => updateSettings({ shake: !settings.shake })}>
              {settings.shake ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="toggle-row">
            <span>QUALITY</span>
            <div className="seg">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button key={q} className={settings.quality === q ? 'on' : ''} onClick={() => updateSettings({ quality: q })}>
                  {q.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <button className="close" onClick={() => open('settings')}>CLOSE</button>
        </div>
      )}

      {panel === 'controls' && (
        <div className="panel" onMouseEnter={hover}>
          <h3>CONTROLS — PLAYER 1</h3>
          <div className="controls-grid">
            {ACTION_LABELS.filter((a) => a.action !== 'pause').map((a) => (
              <div key={a.action} className="ctrl-row">
                <span className="ctrl-label">{a.label}</span>
                <span className="keys">{a.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
              </div>
            ))}
            <div className="ctrl-row">
              <span className="ctrl-label">PAUSE</span>
              <span className="keys"><kbd>ESC</kbd></span>
            </div>
          </div>
          <p className="ctrl-hint">Fill the EX meter, then land a heavy punch or kick — it becomes an unblockable EX strike.</p>
          <button className="close" onClick={() => open('controls')}>CLOSE</button>
        </div>
      )}

      {panel === 'roadmap' && (
        <div className="panel roadmap" onMouseEnter={hover}>
          <h3>DEVELOPMENT ROADMAP</h3>
          {ROADMAP.map((r) => (
            <div key={r.phase} className={`road-row ${r.status}`}>
              <span className="road-phase">{r.phase}</span>
              <span className="road-title">{r.title}</span>
              <span className="road-note">{r.note}</span>
            </div>
          ))}
          <button className="close" onClick={() => open('roadmap')}>CLOSE</button>
        </div>
      )}
    </div>
  )
}
