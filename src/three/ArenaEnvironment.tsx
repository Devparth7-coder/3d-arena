import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Sparkles } from '@react-three/drei'
import type { Quality } from '../state/store'
import { buildingTexture, coneTexture, floorTextures, mulberry32, screenTexture } from './textures'

/**
 * SECTOR 07 GRID — dark futuristic combat arena.
 * Elevated emissive platform, energy pylons at the play bounds, a skyline of
 * lit towers beyond the fog, banner screens, volumetric-style light cones.
 */
export function ArenaEnvironment({ quality }: { quality: Quality }) {
  const floor = useMemo(floorTextures, [])
  const building = useMemo(buildingTexture, [])
  const screen = useMemo(screenTexture, [])
  const cone = useMemo(coneTexture, [])
  const bannersRef = useRef<THREE.Mesh[]>([])

  // ── skyline (instanced, seeded) ─────────────────────────────────────────────
  const skyline = useMemo(() => {
    const rand = mulberry32(70_7)
    const count = 42
    const m = new THREE.Matrix4()
    const items: THREE.Matrix4[] = []
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.12
      const r = 16 + rand() * 17
      const h = 4 + rand() * 15
      const w = 1.6 + rand() * 2.6
      m.makeRotationY(rand() * Math.PI)
      m.scale(new THREE.Vector3(w, h, w))
      m.setPosition(Math.cos(a) * r, h / 2 - 2.5, Math.sin(a) * r)
      items.push(m.clone())
    }
    return items
  }, [])

  const skylineRef = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    skyline.forEach((m, i) => skylineRef.current.setMatrixAt(i, m))
    skylineRef.current.instanceMatrix.needsUpdate = true
  }, [skyline])

  const shadowSize = quality === 'high' ? 2048 : 1024

  return (
    <group>
      {/* fog + base lighting */}
      <ambientLight intensity={0.3} />
      <hemisphereLight args={['#16213a', '#05060a', 0.75]} />

      {/* key light — casts the fighters' shadows */}
      <spotLight
        position={[0, 9.5, 5.5]}
        angle={0.62}
        penumbra={0.7}
        intensity={quality === 'low' ? 700 : 1250}
        distance={30}
        decay={1.55}
        color="#eaf4ff"
        castShadow={quality !== 'low'}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-bias={-0.00025}
        shadow-camera-near={3}
        shadow-camera-far={22}
      />
      {/* fighter-color rim lights — cyan stage left, red stage right */}
      <spotLight position={[-8.5, 4.5, -3.5]} angle={0.8} penumbra={0.9} intensity={220} distance={26} decay={1.6} color="#29e6ff" />
      <spotLight position={[8.5, 4.5, -3.5]} angle={0.8} penumbra={0.9} intensity={220} distance={26} decay={1.6} color="#ff3b52" />
      <directionalLight position={[0, 5, -8]} intensity={0.3} color="#3b4a66" />

      {/* combat platform */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <circleGeometry args={[8, 72]} />
        <meshStandardMaterial
          map={floor.map}
          emissiveMap={floor.emissive}
          emissive="#ffffff"
          emissiveIntensity={1.4}
          metalness={0.72}
          roughness={0.42}
          envMapIntensity={0.5}
        />
      </mesh>
      {/* platform underside + emissive rim */}
      <mesh position={[0, -0.75, 0]}>
        <cylinderGeometry args={[8.02, 7.2, 1.5, 72, 1, true]} />
        <meshStandardMaterial color="#0a0e15" metalness={0.7} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.05, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[7.95, 0.07, 10, 90]} />
        <meshStandardMaterial color="#0d2027" emissive="#29e6ff" emissiveIntensity={2.4} metalness={0.4} roughness={0.4} />
      </mesh>
      {/* floor glow strip under the rim */}
      <mesh position={[0, -1.52, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[7.6, 0.05, 8, 90]} />
        <meshBasicMaterial color="#29e6ff" transparent opacity={0.5} />
      </mesh>

      {/* boundary pylons at the lateral play bounds (±5.95) */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 5.95, 0, 0]}>
          {[-1, 1].map((z) => (
            <group key={z} position={[0, 0, z * 2.3]}>
              <mesh position={[0, 1.5, 0]} castShadow>
                <boxGeometry args={[0.14, 3, 0.14]} />
                <meshStandardMaterial color="#131824" metalness={0.85} roughness={0.35} />
              </mesh>
              <mesh position={[0, 3.05, 0]}>
                <boxGeometry args={[0.2, 0.2, 0.2]} />
                <meshStandardMaterial color="#0a0f16" emissive={s < 0 ? '#29e6ff' : '#ff3b52'} emissiveIntensity={3} />
              </mesh>
              <pointLight position={[0, 3.05, 0]} color={s < 0 ? '#29e6ff' : '#ff3b52'} intensity={6} distance={6} decay={1.8} />
            </group>
          ))}
        </group>
      ))}

      {/* overhead rig ring */}
      <mesh position={[0, 6.6, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[8.6, 0.09, 8, 80]} />
        <meshStandardMaterial color="#0c1018" emissive="#cfeaff" emissiveIntensity={1.6} metalness={0.5} roughness={0.4} />
      </mesh>
      {[-2.9, 2.9].map((x) => (
        <mesh key={x} position={[x, 3.3, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 6.6, 8]} />
          <meshStandardMaterial color="#1a2230" metalness={0.8} roughness={0.4} />
        </mesh>
      ))}

      {/* volumetric-style light cones */}
      {[[-5.5, 0, '#29e6ff'], [5.5, 0, '#ff3b52'], [0, -4.5, '#9fd8ff'], [0, 4.5, '#9fd8ff']].map((c, i) => (
        <mesh key={i} position={[c[0] as number, 6.4, c[1] as number]}>
          <cylinderGeometry args={[0.16, 1.55, 6.2, 20, 1, true]} />
          <meshBasicMaterial
            color={c[2] as string}
            alphaMap={cone}
            transparent
            opacity={0.10}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* banner screens */}
      {[-5.6, 5.6].map((x, i) => (
        <mesh
          key={x}
          ref={(m) => { if (m) bannersRef.current[i] = m }}
          position={[x, 3.1, -9.2]}
          rotation-y={x < 0 ? Math.PI / 7 : -Math.PI / 7}
        >
          <planeGeometry args={[4.4, 2.2]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      ))}

      {/* distant skyline */}
      <instancedMesh ref={skylineRef} args={[undefined, undefined, skyline.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#070a10"
          emissiveMap={building}
          emissive="#ffffff"
          emissiveIntensity={0.85}
          metalness={0.3}
          roughness={0.9}
        />
      </instancedMesh>

      {/* floating dust / energy motes */}
      {quality !== 'low' && (
        <Sparkles count={quality === 'high' ? 130 : 60} scale={[15, 6, 12]} position={[0, 3, 0]} size={2.4} speed={0.25} opacity={0.5} color="#9fe8ff" />
      )}
    </group>
  )
}
