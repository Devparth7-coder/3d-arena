import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { MatchEngine } from '../game/engine'
import { INTRO_TICKS } from '../game/config'
import { useAppStore } from '../state/store'

const ease = (t: number) => t * t * (3 - 2 * t)

/**
 * Cinematic camera director.
 * - fight: dynamic framing that widens with fighter separation
 * - intro: low sweep from behind player one into the fight angle
 * - KO / round end: slow orbit around the round winner
 * - menu: slow showcase orbit
 * Plus trauma-based screen shake driven by combat events.
 */
export function CameraRig({ engine, mode }: { engine: MatchEngine | null; mode: 'menu' | 'fight' }) {
  const shakeEnabled = useAppStore((s) => s.settings.shake)
  const trauma = useRef(0)
  const look = useRef(new THREE.Vector3(0, 1.2, 0))
  const orbit = useRef({ active: false, angle: 0 })
  const tp = useRef(new THREE.Vector3(0, 2.4, 7))
  const tl = useRef(new THREE.Vector3(0, 1.2, 0))

  useEffect(() => {
    if (!engine) return
    return engine.subscribe((e) => {
      if (!shakeEnabled) return
      if (e.t === 'hit') {
        const mag = e.blocked ? 0.07 : e.heavy ? 0.32 : 0.15
        trauma.current = Math.min(1, trauma.current + mag + (e.ex ? 0.22 : 0))
      } else if (e.t === 'ko') {
        trauma.current = 1
      }
    })
  }, [engine, shakeEnabled])

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1)
    const cam = state.camera

    if (mode === 'menu') {
      const t = state.clock.elapsedTime * 0.09
      tp.current.set(Math.sin(t) * 6.2, 2.15 + Math.sin(t * 0.6) * 0.35, Math.cos(t) * 6.2)
      tl.current.set(0.5, 1.25, 0)
    } else if (engine) {
      const [a, b] = engine.fighters
      const mid = (a.pos.x + b.pos.x) / 2
      const dist = Math.max(1.1, Math.min(8.4, Math.abs(a.pos.x - b.pos.x)))
      const fy = 1.62 + dist * 0.075
      const fz = 3.55 + dist * 0.42

      switch (engine.phase) {
        case 'intro': {
          const p = ease(Math.min(1, engine.phaseT / INTRO_TICKS))
          const sx = a.pos.x - 2.8
          const sy = 0.95
          const sz = 1.7
          tp.current.set(
            sx + (mid * 0.86 - sx) * p,
            sy + (fy - sy) * p,
            sz + (fz - sz) * p,
          )
          tl.current.set(a.pos.x + (mid * 0.92 - a.pos.x) * p, 1.35 - 0.33 * p, 0)
          break
        }
        case 'koSlowmo':
        case 'roundEnd':
        case 'matchEnd': {
          const wi = engine.roundWinner >= 0 ? engine.roundWinner : 0
          const w = engine.fighters[wi]
          if (!orbit.current.active) {
            orbit.current.active = true
            orbit.current.angle = Math.atan2(cam.position.z, cam.position.x - w.pos.x)
          }
          orbit.current.angle += d * 0.5
          tp.current.set(w.pos.x + Math.sin(orbit.current.angle) * 3.2, 1.4, Math.cos(orbit.current.angle) * 3.2)
          tl.current.set(w.pos.x, 1.0, 0)
          break
        }
        default: {
          orbit.current.active = false
          tp.current.set(mid * 0.86, fy, fz)
          tl.current.set(mid * 0.92, 1.02, 0)
        }
      }
    }

    trauma.current = Math.max(0, trauma.current - d * 1.9)
    const sh = trauma.current * trauma.current * 0.3

    const k = 1 - Math.exp(-(mode === 'menu' ? 1.8 : 4.5) * d)
    cam.position.x += (tp.current.x - cam.position.x) * k
    cam.position.y += (tp.current.y - cam.position.y) * k
    cam.position.z += (tp.current.z - cam.position.z) * k
    if (sh > 0.001) {
      cam.position.x += (Math.random() - 0.5) * sh
      cam.position.y += (Math.random() - 0.5) * sh
      cam.position.z += (Math.random() - 0.5) * sh * 0.5
    }
    look.current.lerp(tl.current, 1 - Math.exp(-5.5 * d))
    cam.lookAt(look.current)
  })

  return null
}
