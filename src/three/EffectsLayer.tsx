import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { MatchEngine } from '../game/engine'
import type { GameEvent } from '../game/types'
import { audio } from '../game/audio'
import { glowTexture } from './textures'

const MAX_PARTICLES = 384
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

/**
 * Presentation FX layer: GPU point-sprite particles, shockwave rings, impact
 * flashes — plus the audio bridge for combat events. Runs on real frame time
 * (not simulation time) so sparks keep flying during hit-stop.
 */
export function EffectsLayer({ engine }: { engine: MatchEngine }) {
  const { camera } = useThree()
  const glow = useMemo(glowTexture, [])

  const pool = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const pos = new Float32Array(MAX_PARTICLES * 3)
    const col = new Float32Array(MAX_PARTICLES * 3)
    const sizeAttr = new Float32Array(MAX_PARTICLES)
    const alpha = new Float32Array(MAX_PARTICLES)
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizeAttr, 1))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: glow } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vC;
        varying float vA;
        void main() {
          vC = aColor; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vC;
        varying float vA;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vC, vA * tex.a);
        }`,
    })
    return {
      geometry, material, pos, col, sizeAttr, alpha,
      vel: new Float32Array(MAX_PARTICLES * 3),
      life: new Float32Array(MAX_PARTICLES),
      maxLife: new Float32Array(MAX_PARTICLES),
      grav: new Float32Array(MAX_PARTICLES),
      cursor: 0,
    }
  }, [glow])

  const rings = useMemo(
    () => Array.from({ length: 6 }, () => ({
      mesh: new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.42, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      ),
      t: 0, dur: 0, maxScale: 1, flat: false, active: false,
    })),
    [],
  )

  const flashes = useMemo(
    () => Array.from({ length: 5 }, () => ({
      mesh: new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      ),
      t: 0, dur: 0, size: 1, active: false,
    })),
    [glow],
  )

  const spawnBurst = (x: number, y: number, z: number, color: THREE.Color, count: number, speed: number, size: number, lifeSec: number) => {
    for (let i = 0; i < count; i++) {
      const idx = pool.cursor
      pool.cursor = (pool.cursor + 1) % MAX_PARTICLES
      const a = Math.random() * Math.PI * 2
      const sp = speed * (0.35 + Math.random() * 0.9)
      pool.pos[idx * 3] = x
      pool.pos[idx * 3 + 1] = y
      pool.pos[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.15
      pool.vel[idx * 3] = Math.cos(a) * sp
      pool.vel[idx * 3 + 1] = Math.sin(a) * sp * 0.9 + 0.6
      pool.vel[idx * 3 + 2] = Math.sin(a) * sp * 0.3
      pool.col[idx * 3] = color.r
      pool.col[idx * 3 + 1] = color.g
      pool.col[idx * 3 + 2] = color.b
      pool.sizeAttr[idx] = size * (0.6 + Math.random() * 0.9)
      pool.life[idx] = pool.maxLife[idx] = lifeSec * (0.6 + Math.random() * 0.7)
      pool.alpha[idx] = 1
      pool.grav[idx] = -3.5 - Math.random() * 2.5
    }
  }

  const spawnRing = (x: number, y: number, z: number, color: THREE.Color, maxScale: number, dur: number, flat: boolean) => {
    const r = rings.find((r) => !r.active)
    if (!r) return
    r.active = true
    r.t = 0
    r.dur = dur
    r.maxScale = maxScale
    r.flat = flat
    r.mesh.position.set(x, y, z)
    r.mesh.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0)
    r.mesh.scale.setScalar(0.15)
    r.mesh.material.color.copy(color)
    r.mesh.material.opacity = 0.85
    r.mesh.visible = true
  }

  const spawnFlash = (x: number, y: number, z: number, size: number, color: THREE.Color) => {
    const f = flashes.find((f) => !f.active)
    if (!f) return
    f.active = true
    f.t = 0
    f.dur = 0.14
    f.size = size
    f.mesh.position.set(x, y, z)
    f.mesh.material.color.copy(color)
    f.mesh.material.opacity = 1
    f.mesh.visible = true
  }

  useEffect(() => {
    const colors = {
      cyan: new THREE.Color('#9ffaff'),
      white: new THREE.Color('#ffffff'),
      gold: new THREE.Color('#ffd27a'),
      red: new THREE.Color('#ff5a3c'),
      ex: new THREE.Color('#7df9ff'),
    }
    return engine.subscribe((e: GameEvent) => {
      switch (e.t) {
        case 'attack':
          audio.whoosh(e.heavy)
          break
        case 'hit':
          if (e.blocked) {
            audio.hit(e.heavy, true)
            spawnBurst(e.x, e.y, 0, colors.gold, 10, 2.4, 0.085, 0.3)
          } else if (e.ex) {
            audio.exHit()
            spawnBurst(e.x, e.y, 0, colors.ex, 44, 4.8, 0.14, 0.6)
            spawnRing(e.x, e.y, 0, colors.ex, 2.8, 0.5, false)
            spawnFlash(e.x, e.y, 0, 1.6, colors.ex)
          } else if (e.heavy) {
            audio.hit(true, false)
            spawnBurst(e.x, e.y, 0, colors.white, 26, 3.6, 0.12, 0.5)
            spawnRing(e.x, e.y, 0, colors.cyan, 1.8, 0.38, false)
            spawnFlash(e.x, e.y, 0, 0.95, colors.white)
          } else {
            audio.hit(false, false)
            spawnBurst(e.x, e.y, 0, colors.cyan, 14, 2.8, 0.09, 0.38)
            spawnFlash(e.x, e.y, 0, 0.55, colors.white)
          }
          break
        case 'ko': {
          audio.ko()
          const loser = engine.fighters[e.loser]
          spawnBurst(loser.pos.x, 1.1, 0, colors.red, 64, 5.8, 0.16, 0.85)
          spawnBurst(loser.pos.x, 1.1, 0, colors.white, 24, 3.2, 0.1, 0.5)
          spawnRing(loser.pos.x, 0.1, 0, colors.red, 5.0, 0.9, true)
          spawnFlash(loser.pos.x, 1.1, 0, 2.6, colors.white)
          break
        }
        case 'announce':
          if (e.kind === 'fight' || e.kind === 'ko' || e.kind === 'win') audio.announce(e.kind)
          break
        case 'exReady':
          audio.exReady()
          break
        default:
          break
      }
    })
  }, [engine])

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1)
    const { pos, vel, life, maxLife, alpha, grav } = pool
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) alpha[i] = 0
        continue
      }
      life[i] -= d
      const k = Math.max(0, life[i] / maxLife[i])
      alpha[i] = k * k
      vel[i * 3 + 1] += grav[i] * d
      pos[i * 3] += vel[i * 3] * d
      pos[i * 3 + 1] += vel[i * 3 + 1] * d
      pos[i * 3 + 2] += vel[i * 3 + 2] * d
    }
    pool.geometry.attributes.position.needsUpdate = true
    pool.geometry.attributes.aAlpha.needsUpdate = true
    pool.geometry.attributes.aColor.needsUpdate = true
    pool.geometry.attributes.aSize.needsUpdate = true

    for (const r of rings) {
      if (!r.active) continue
      r.t += d
      const k = r.t / r.dur
      if (k >= 1) {
        r.active = false
        r.mesh.visible = false
        continue
      }
      r.mesh.scale.setScalar(0.15 + r.maxScale * easeOut(k))
      r.mesh.material.opacity = 0.85 * (1 - k)
      if (!r.flat) r.mesh.lookAt(camera.position)
    }
    for (const f of flashes) {
      if (!f.active) continue
      f.t += d
      const k = f.t / f.dur
      if (k >= 1) {
        f.active = false
        f.mesh.visible = false
        continue
      }
      f.mesh.scale.setScalar(f.size * (0.4 + 0.6 * easeOut(k)))
      f.mesh.material.opacity = 1 - k
      f.mesh.quaternion.copy(camera.quaternion)
    }
  })

  return (
    <group>
      <points geometry={pool.geometry} material={pool.material} frustumCulled={false} />
      {rings.map((r, i) => (
        <primitive key={`ring-${i}`} object={r.mesh} visible={false} />
      ))}
      {flashes.map((f, i) => (
        <primitive key={`flash-${i}`} object={f.mesh} visible={false} />
      ))}
    </group>
  )
}
