import { useEffect, useMemo, useRef, useState } from 'react'
import { MatchEngine } from '../game/engine'
import { FIGHTERS } from '../game/config'
import { InputManager } from '../game/input'
import { useAppStore } from '../state/store'
import { GameCanvas } from '../three/Scene'
import { Hud } from './Hud'

export function FightScreen() {
  const engine = useMemo(() => new MatchEngine([FIGHTERS[0], FIGHTERS[1]]), [])
  const [paused, setPaused] = useState(false)
  const inputRef = useRef<InputManager | null>(null)
  const pausedRef = useRef(false)

  const togglePause = () => {
    if (engine.finished) return
    const next = !pausedRef.current
    pausedRef.current = next
    engine.paused = next
    setPaused(next)
  }

  useEffect(() => {
    const im = new InputManager(() => togglePause())
    inputRef.current = im
    return () => im.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const off = engine.subscribe((e) => {
      if (e.t === 'matchEnd') {
        window.setTimeout(() => useAppStore.getState().endMatch(e.summary), 2100)
      }
    })
    // dev affordances for automated visual checks (#ko / #results in the URL)
    let interval = 0
    if (import.meta.env.DEV) {
      const h = window.location.hash
      ;(window as unknown as { __ARENA_ENGINE?: MatchEngine }).__ARENA_ENGINE = engine
      if (h.includes('ko') || h.includes('results')) {
        interval = window.setInterval(() => {
          if (engine.finished) return
          if (engine.phase === 'fight') {
            window.clearInterval(interval)
            engine.debugKO(1)
            if (h.includes('results')) {
              window.setTimeout(() => engine.debugFinish(0), 6000)
            }
          }
        }, 300)
      }
    }
    return () => {
      off()
      if (interval) window.clearInterval(interval)
    }
  }, [engine])

  return (
    <div className="fight-root">
      <GameCanvas engine={engine} mode="fight" input={inputRef} />
      <Hud engine={engine} />
      {paused && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>PAUSED</h2>
            <button onClick={togglePause}>RESUME</button>
            <button onClick={() => useAppStore.getState().rematch()}>RESTART MATCH</button>
            <button onClick={() => useAppStore.getState().toMenu()}>MAIN MENU</button>
          </div>
        </div>
      )}
    </div>
  )
}
