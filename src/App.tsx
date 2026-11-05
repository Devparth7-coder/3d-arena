import { Suspense, useEffect } from 'react'
import { audio } from './game/audio'
import { useAppStore } from './state/store'
import { MainMenu } from './ui/MainMenu'
import { FightScreen } from './ui/FightScreen'
import { Results } from './ui/Results'

function Boot() {
  return (
    <div className="boot">
      <div className="boot-logo">ARENA</div>
      <div className="boot-bar"><i /></div>
      <div className="boot-sub">LOADING COMBAT SYSTEMS</div>
    </div>
  )
}

export default function App() {
  const screen = useAppStore((s) => s.screen)
  const matchSeq = useAppStore((s) => s.matchSeq)
  const settings = useAppStore((s) => s.settings)

  // audio context must be unlocked by a user gesture (browser autoplay policy)
  useEffect(() => {
    const unlock = () => audio.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    audio.setVolumes(settings)
  }, [settings])

  useEffect(() => {
    audio.setScreenMusic(screen === 'menu' ? 'menu' : screen === 'fight' ? 'fight' : null)
  }, [screen])

  // dev/test hooks: #play jumps straight into a match, #low forces low quality
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const h = window.location.hash
    if (h.includes('low')) useAppStore.getState().updateSettings({ quality: 'low' })
    if (h.includes('play')) useAppStore.getState().startMatch()
  }, [])

  return (
    <div className="app">
      <Suspense fallback={<Boot />}>
        {screen === 'menu' && <MainMenu />}
        {screen === 'fight' && <FightScreen key={matchSeq} />}
        {screen === 'results' && <Results />}
      </Suspense>
    </div>
  )
}
