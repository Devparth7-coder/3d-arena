import { useEffect, useRef, useState } from 'react'
import type { MatchEngine } from '../game/engine'
import type { GameEvent } from '../game/types'

/**
 * Combat HUD. Runs on its own rAF loop and mutates DOM refs directly —
 * React state is only used for rare announcements, keeping the 60 FPS bars
//  and meters free of re-renders.
 */
export function Hud({ engine }: { engine: MatchEngine }) {
  const [a, b] = engine.fighters
  const fillRefs = useRef<Array<HTMLDivElement | null>>([])
  const ghostRefs = useRef<Array<HTMLDivElement | null>>([])
  const meterRefs = useRef<Array<HTMLDivElement | null>>([])
  const exRefs = useRef<Array<HTMLSpanElement | null>>([])
  const pipRefs = useRef<Array<Array<HTMLSpanElement | null>>>([[], []])
  const comboRefs = useRef<Array<HTMLDivElement | null>>([])
  const timerRef = useRef<HTMLDivElement | null>(null)
  const timerWrapRef = useRef<HTMLDivElement | null>(null)
  const roundRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const ghost = [a.health, b.health]
    let raf = 0
    const loop = () => {
      const fs = engine.fighters
      for (let i = 0; i < 2; i++) {
        const f = fs[i]
        const fill = fillRefs.current[i]
        const gh = ghostRefs.current[i]
        if (fill) {
          fill.style.width = `${Math.max(0, (f.health / f.maxHealth) * 100)}%`
          fill.classList.toggle('low', f.health > 0 && f.health <= f.maxHealth * 0.25)
        }
        if (gh) {
          if (ghost[i] < f.health) ghost[i] = f.health
          else ghost[i] = Math.max(f.health, ghost[i] - Math.max(0.1, (ghost[i] - f.health) * 0.05))
          gh.style.width = `${(ghost[i] / f.maxHealth) * 100}%`
        }
        const meter = meterRefs.current[i]
        if (meter) meter.style.width = `${f.meter}%`
        exRefs.current[i]?.classList.toggle('on', f.meter >= 100)
        for (let r = 0; r < engine.roundsToWin; r++) {
          pipRefs.current[i][r]?.classList.toggle('won', r < f.roundsWon)
        }
        // combo counter on the attacker's side
        const combo = fs[1 - i].comboOnMe
        const el = comboRefs.current[i]
        if (el) {
          if (combo >= 2 && (f.state === 'attack' || fs[1 - i].state === 'hitstun' || fs[1 - i].state === 'knockdown')) {
            const n = el.querySelector('.n')
            if (n && n.textContent !== String(combo)) {
              n.textContent = String(combo)
              el.classList.remove('pop')
              void el.offsetWidth
              el.classList.add('pop')
            }
            el.classList.add('show')
          } else {
            el.classList.remove('show')
          }
        }
      }
      if (timerRef.current) timerRef.current.textContent = String(Math.ceil(engine.timer / 60))
      timerWrapRef.current?.classList.toggle('danger', engine.timer <= 600 && engine.phase === 'fight')
      if (roundRef.current) roundRef.current.textContent = `ROUND ${engine.round}`
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [engine])

  const [ann, setAnn] = useState<{ text: string; kind: string; id: number } | null>(null)
  const [flash, setFlash] = useState(0)

  useEffect(() => {
    let id = 0
    let to: ReturnType<typeof setTimeout> | undefined
    return engine.subscribe((e: GameEvent) => {
      if (e.t === 'announce') {
        id += 1
        setAnn({ text: e.text, kind: e.kind, id })
        clearTimeout(to)
        to = setTimeout(() => setAnn(null), e.kind === 'ko' ? 2100 : 1500)
      } else if (e.t === 'ko') {
        setFlash(Date.now())
      }
    })
  }, [engine])

  const block = (i: number) => {
    const f = engine.fighters[i]
    const right = i === 1
    return (
      <div className={`fighter-block ${right ? 'right' : 'left'}`} style={{ ['--fc' as string]: f.cfg.color }}>
        <div className="nameplate">
          <span className="np-name">{f.cfg.name}</span>
          <span className="np-epithet">{f.cfg.epithet}</span>
        </div>
        <div className="bar">
          <div className="ghost" ref={(el) => { ghostRefs.current[i] = el }} />
          <div className="fill" ref={(el) => { fillRefs.current[i] = el }} />
        </div>
        <div className="pips">
          {Array.from({ length: engine.roundsToWin }, (_, r) => (
            <span key={r} ref={(el) => { pipRefs.current[i][r] = el }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="hud">
      <div className="hud-top">
        {block(0)}
        <div className="timer-wrap" ref={timerWrapRef}>
          <div className="round-label" ref={roundRef}>ROUND 1</div>
          <div className="timer" ref={timerRef}>60</div>
        </div>
        {block(1)}
      </div>

      <div className="hud-bottom">
        <div className="meter-block left">
          <span className="ex" ref={(el) => { exRefs.current[0] = el }}>EX</span>
          <div className="meter"><div className="meter-fill p1" ref={(el) => { meterRefs.current[0] = el }} /></div>
        </div>
        <div className="meter-block right">
          <div className="meter"><div className="meter-fill p2" ref={(el) => { meterRefs.current[1] = el }} /></div>
          <span className="ex" ref={(el) => { exRefs.current[1] = el }}>EX</span>
        </div>
      </div>

      <div className="combo left" ref={(el) => { comboRefs.current[0] = el }}><span className="n">2</span><span className="lbl">HITS</span></div>
      <div className="combo right" ref={(el) => { comboRefs.current[1] = el }}><span className="n">2</span><span className="lbl">HITS</span></div>

      {ann && <div key={ann.id} className={`announce k-${ann.kind}`}>{ann.text}</div>}
      {flash > 0 && <div key={flash} className="screen-flash" />}
      <div className="hud-hint">ESC · PAUSE</div>
    </div>
  )
}
