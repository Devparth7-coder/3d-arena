import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { MatchEngine } from '../game/engine'
import { SparringAI } from '../game/ai'
import type { InputManager } from '../game/input'
import { NO_EDGES, NO_INPUT } from '../game/types'
import { TICK } from '../game/config'
import { useAppStore, type Quality } from '../state/store'
import { ArenaEnvironment } from './ArenaEnvironment'
import { FighterView, MenuRobot } from './RobotFighter'
import { CameraRig } from './CameraRig'
import { EffectsLayer } from './EffectsLayer'

export interface GameCanvasProps {
  engine: MatchEngine | null
  mode: 'menu' | 'fight'
  input?: RefObject<InputManager | null>
}

export function GameCanvas({ engine, mode, input }: GameCanvasProps) {
  const quality = useAppStore((s) => s.settings.quality)
  return (
    <Canvas
      shadows={quality !== 'low'}
      dpr={quality === 'high' ? [1, 1.75] : quality === 'medium' ? [1, 1.35] : 1}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.1, far: 90, position: [0, 2.4, 7] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.15
      }}
    >
      <SceneContent engine={engine} mode={mode} input={input} quality={quality} />
    </Canvas>
  )
}

function SceneContent({ engine, mode, input, quality }: GameCanvasProps & { quality: Quality }) {
  const { gl, scene } = useThree()
  const ai = useRef(new SparringAI())
  const acc = useRef(0)

  // image-based lighting for the metallic materials (no network fetch needed)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.35
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

  // simulation driver — fixed 60 Hz steps, presentation scales with engine time
  useFrame((_, dt) => {
    if (!engine) return
    const d = Math.min(dt, 0.1)
    acc.current += d * engine.timeScale
    let steps = 0
    while (acc.current >= TICK && steps < 6) {
      acc.current -= TICK
      steps++
      const p1 = input?.current ? input.current.poll() : NO_INPUT
      const p1e = input?.current ? input.current.takeEdges() : NO_EDGES
      const decision = ai.current.think(engine.fighters[1], engine.fighters[0])
      engine.step([p1, decision.input], [p1e, decision.edges])
    }
    engine.flush()
  })

  return (
    <>
      <color attach="background" args={['#04060b']} />
      <fog attach="fog" args={['#04060b', 13, 40]} />
      <ArenaEnvironment quality={quality} />
      {mode === 'fight' && engine ? (
        <>
          <FighterView engine={engine} index={0} />
          <FighterView engine={engine} index={1} />
          <EffectsLayer engine={engine} />
        </>
      ) : (
        <MenuRobot />
      )}
      <CameraRig engine={mode === 'fight' ? engine : null} mode={mode} />
      {quality !== 'low' && (
        <EffectComposer enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.55} luminanceSmoothing={0.22} radius={0.72} />
          <Vignette offset={0.22} darkness={0.55} />
        </EffectComposer>
      )}
    </>
  )
}
