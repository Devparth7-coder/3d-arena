import { audio } from '../game/audio'
import { FIGHTERS } from '../game/config'
import { useAppStore } from '../state/store'

export function Results() {
  const summary = useAppStore((s) => s.summary)
  const rematch = useAppStore((s) => s.rematch)
  const toMenu = useAppStore((s) => s.toMenu)
  if (!summary) return null

  const w = summary.winner === 1 ? 1 : 0
  const winCfg = FIGHTERS[w]

  return (
    <div className="results-root">
      <div className="results-glow" />
      <div className="results-card">
        <div className="results-kicker">MATCH COMPLETE</div>
        <h2 className="results-winner" style={{ ['--wc' as string]: winCfg.color }}>
          {winCfg.name} WINS
        </h2>
        <div className="results-columns">
          {([0, 1] as const).map((i) => {
            const f = FIGHTERS[i]
            const s = summary.stats[i]
            const stats: Array<[string, string]> = [
              ['ROUNDS', String(summary.rounds[i])],
              ['DAMAGE DEALT', String(s.damage)],
              ['HITS LANDED', String(s.hits)],
              ['MAX COMBO', String(s.maxCombo)],
              ['BLOCKS', String(s.blocks)],
            ]
            return (
              <div key={i} className={`results-col ${i === w ? 'winner' : ''}`}>
                <div className="col-name" style={{ ['--fc' as string]: f.color }}>{f.name}</div>
                {stats.map(([label, value]) => (
                  <div key={label} className="col-stat">
                    <span className="stat-l">{label}</span>
                    <span className="stat-v">{value}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        <div className="results-actions">
          <button
            onMouseEnter={() => audio.ui('hover')}
            onClick={() => { audio.ui('click'); rematch() }}
          >
            REMATCH
          </button>
          <button
            onMouseEnter={() => audio.ui('hover')}
            onClick={() => { audio.ui('click'); toMenu() }}
          >
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  )
}
