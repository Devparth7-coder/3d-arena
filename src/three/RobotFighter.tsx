import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Fighter, MatchEngine } from '../game/engine'
import type { FighterConfig } from '../game/types'
import { FIGHTERS } from '../game/config'

export const MODEL_URL = '/models/RobotExpressive.glb'
useGLTF.preload(MODEL_URL)

// Robot model: "RobotExpressive" © Tomás Laulhé / Don McCurdy — CC-BY (three.js examples)

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1)
const ease = (t: number) => t * t * (3 - 2 * t)

interface BaseSpec {
  clip: string
  ts: number
  fade?: number
  once?: boolean
  reversed?: boolean
}

interface Rig {
  root: THREE.Group
  mixer: THREE.AnimationMixer
  actions: Record<string, THREE.AnimationAction>
  clipDur: Record<string, number>
  bones: Record<string, THREE.Bone>
  morph: THREE.Mesh | null
  morphIdx: Record<string, number>
  bodyMats: Array<{ mat: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number }>
  accentMats: THREE.MeshStandardMaterial[]
  currentKey: string
  currentAction: THREE.AnimationAction | null
  lastAttack: object | null
  blockSmooth: number
  face: { angry: number; surprised: number; sad: number }
}

const BONE_NAMES = [
  'Hips', 'Abdomen', 'Torso', 'Neck', 'Head',
  'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R',
  'UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R',
  'Foot.L', 'Foot.R',
] as const

function buildRig(src: THREE.Object3D, animations: THREE.AnimationClip[], cfg: FighterConfig): Rig {
  const root = SkeletonUtils.clone(src) as THREE.Group

  // normalize to a ~1.85 m fighter (config scale differentiates silhouettes)
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const height = box.max.y - box.min.y
  root.scale.setScalar((1.85 * cfg.scale) / height)

  const mixer = new THREE.AnimationMixer(root)
  const actions: Record<string, THREE.AnimationAction> = {}
  const clipDur: Record<string, number> = {}
  for (const clip of animations) {
    actions[clip.name] = mixer.clipAction(clip)
    clipDur[clip.name] = clip.duration
  }

  const bones: Record<string, THREE.Bone> = {}
  for (const name of BONE_NAMES) {
    const b = root.getObjectByName(name)
    if (b) bones[name] = b as THREE.Bone
  }

  let morph: THREE.Mesh | null = null
  const morphIdx: Record<string, number> = {}
  const bodyMats: Rig['bodyMats'] = []
  const accentMats: THREE.MeshStandardMaterial[] = []

  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.frustumCulled = false // skinned meshes can be culled incorrectly mid-animation
    if (mesh.morphTargetDictionary) {
      morph = mesh
      for (const [name, idx] of Object.entries(mesh.morphTargetDictionary)) morphIdx[name] = idx
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const cloned = mats.map((m) => {
      const mat = (m as THREE.MeshStandardMaterial).clone()
      if (mat.name === 'Main') {
        mat.color.set(cfg.bodyTint)
        mat.metalness = 0.68
        mat.roughness = 0.42
        mat.emissive.set(cfg.colorDim)
        mat.emissiveIntensity = 0.35
        mat.envMapIntensity = 0.55
      } else if (mat.name === 'Grey') {
        // joints glow with the fighter's signature color
        mat.color.set('#232a36')
        mat.metalness = 0.85
        mat.roughness = 0.5
        mat.emissive.set(cfg.color)
        mat.emissiveIntensity = 0.55
        accentMats.push(mat)
      } else {
        mat.color.set('#0d1016')
        mat.metalness = 0.6
        mat.roughness = 0.6
      }
      bodyMats.push({ mat, emissive: mat.emissive.clone(), intensity: mat.emissiveIntensity })
      return mat
    })
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
  })

  return {
    root, mixer, actions, clipDur, bones, morph: morph as THREE.Mesh | null, morphIdx,
    bodyMats, accentMats,
    currentKey: '', currentAction: null, lastAttack: null, blockSmooth: 0,
    face: { angry: 0, surprised: 0, sad: 0 },
  }
}

function play(rig: Rig, spec: BaseSpec, force = false) {
  const key = `${spec.clip}:${spec.reversed ? 'r' : 'f'}`
  if (!force && rig.currentKey === key) {
    rig.currentAction!.timeScale = spec.ts
    return
  }
  const next = rig.actions[spec.clip]
  if (!next) return
  rig.currentAction?.fadeOut(spec.fade ?? 0.16)
  next.reset()
  next.setLoop(spec.once || spec.reversed ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
  next.clampWhenFinished = !!spec.once
  if (spec.reversed) {
    next.time = Math.max(0, rig.clipDur[spec.clip] - 0.001)
    next.timeScale = -Math.abs(spec.ts)
  } else {
    next.timeScale = spec.ts
  }
  next.fadeIn(spec.fade ?? 0.16).play()
  rig.currentKey = key
  rig.currentAction = next
}

/** Which keyframed clip best matches the simulation state. */
function baseSpecFor(rig: Rig, f: Fighter, engine: MatchEngine, index: number): BaseSpec {
  switch (f.state) {
    case 'intro':
      if (engine.phaseT < 105) {
        return index === 0
          ? { clip: 'Wave', ts: 1.0, once: true, fade: 0.3 }
          : { clip: 'Punch', ts: 0.85, once: true, fade: 0.3 }
      }
      return { clip: 'Idle', ts: 1 }
    case 'idle': return { clip: 'Idle', ts: 1 }
    case 'walkF': return { clip: 'Walking', ts: clamp(0.8 + Math.abs(f.vx) * 0.25, 0.7, 1.6) }
    case 'walkB': return { clip: 'Walking', ts: -(0.75 + Math.abs(f.vx) * 0.2) }
    case 'run': return { clip: 'Running', ts: 1.05 }
    case 'attack': {
      const a = f.attack!
      // heavy punch uses the keyframed Punch clip stretched over the move's real frames
      if (a.def.kind === 'HP') {
        const durSec = f.attackTotal / 60
        return { clip: 'Punch', ts: rig.clipDur['Punch'] / durSec, once: true, fade: 0.05 }
      }
      // jabs and kicks are procedural on top of Idle for exact frame alignment
      return { clip: 'Idle', ts: 1, fade: 0.08 }
    }
    case 'block': return { clip: 'Idle', ts: 1, fade: 0.1 }
    case 'dodge': return { clip: 'Idle', ts: 1, fade: 0.1 }
    case 'hitstun': return { clip: 'Idle', ts: 1.4, fade: 0.06 }
    case 'knockdown': return { clip: 'Death', ts: 1, once: true, fade: 0.08 }
    case 'getup': return { clip: 'Death', ts: 2.4, once: true, reversed: true, fade: 0.1 }
    case 'ko': return { clip: 'Death', ts: 1, once: true, fade: 0.04 }
    case 'victory': return { clip: 'ThumbsUp', ts: 1, once: true, fade: 0.2 }
    default: return { clip: 'Idle', ts: 1 }
  }
}

/** Additive procedural layer — applied after mixer.update every frame. */
function proceduralLayer(rig: Rig, f: Fighter, engine: MatchEngine, time: number) {
  const b = rig.bones

  // locomotion lean
  if (b.Torso) {
    if (f.state === 'run') b.Torso.rotation.x += 0.14
    else if (f.state === 'walkF') b.Torso.rotation.x += 0.05
  }

  // block guard (smoothed)
  const blockTarget = f.state === 'block' ? 1 : 0
  rig.blockSmooth += (blockTarget - rig.blockSmooth) * 0.28
  if (rig.blockSmooth > 0.01 && b.UpperArmL && b.UpperArmR && b.LowerArmL && b.LowerArmR) {
    const k = rig.blockSmooth
    b.UpperArmL.rotation.x += -1.12 * k
    b.UpperArmR.rotation.x += -1.02 * k
    b.LowerArmL.rotation.x += -1.35 * k
    b.LowerArmR.rotation.x += -1.3 * k
    b.Torso && (b.Torso.rotation.x += 0.09 * k)
  }

  // hit flinch
  if (f.state === 'hitstun' || (f.state === 'knockdown' && f.stateFrame < 12)) {
    const span = f.state === 'hitstun' ? Math.max(1, f.hitstunT) : 12
    const k = Math.max(0, 1 - f.stateFrame / span)
    if (b.Torso) b.Torso.rotation.x += -0.34 * k
    if (b.Head) b.Head.rotation.x += -0.16 * k
    if (b.Abdomen) b.Abdomen.rotation.x += -0.14 * k
  }

  // dodge lean-back
  if (f.state === 'dodge') {
    const k = Math.sin((f.stateFrame / 20) * Math.PI)
    if (b.Torso) b.Torso.rotation.x += -0.32 * k
    if (b.UpperArmL) b.UpperArmL.rotation.x += 0.35 * k
    if (b.UpperArmR) b.UpperArmR.rotation.x += 0.35 * k
  }

  // attacks
  if (f.state === 'attack' && f.attack) {
    const a = f.attack
    const total = f.attackTotal
    const p = clamp(a.frame / total, 0, 1)
    const sFrac = a.def.startup / total
    const aEnd = (a.def.startup + a.def.active) / total
    const w = ease(seg(p, 0, sFrac * 0.92))
    const s = ease(seg(p, sFrac * 0.72, aEnd))
    const r = ease(seg(p, aEnd, 1))
    const strike = s * (1 - r)
    const wind = w * (1 - s)
    const amp = a.ex ? 1.18 : 1

    if (a.def.kind === 'LP' && b.UpperArmR && b.LowerArmR) {
      b.UpperArmR.rotation.x += (-0.3 * wind - 1.25 * strike) * amp
      b.LowerArmR.rotation.x += (-1.15 * wind - 0.05 * strike) * amp
      if (b.Torso) b.Torso.rotation.y += (0.2 * wind - 0.34 * strike) * amp
      if (b.Abdomen) b.Abdomen.rotation.y += (0.1 * wind - 0.16 * strike) * amp
      if (b.UpperArmL) b.UpperArmL.rotation.x += -0.5 * (0.4 + 0.3 * strike)
      if (b.LowerArmL) b.LowerArmL.rotation.x += -1.0
    } else if (a.def.kind === 'HP' && b.Torso) {
      // arm driven by the keyframed Punch clip; add torso commitment
      b.Torso.rotation.y += -0.18 * strike * amp
      if (b.UpperArmL) b.UpperArmL.rotation.x += -0.4 * strike
      if (a.ex && b.LowerArmL) b.LowerArmL.rotation.x += -0.9 * strike // EX: off-hand guard punch
    } else if (a.def.kind === 'LK' && b.UpperLegR && b.LowerLegR) {
      b.UpperLegR.rotation.x += (0.35 * wind - 1.32 * strike) * amp
      b.LowerLegR.rotation.x += (1.35 * wind + 0.05 * strike) * amp
      if (b.Torso) b.Torso.rotation.x += -0.15 * strike
      if (b.UpperArmL) b.UpperArmL.rotation.x += -0.55 * strike
      if (b.LowerArmL) b.LowerArmL.rotation.x += -1.0 * strike
      if (b.UpperArmR) b.UpperArmR.rotation.x += 0.35 * strike
    } else if (a.def.kind === 'HK' && b.UpperLegR && b.LowerLegR) {
      b.UpperLegR.rotation.x += (0.62 * wind - 1.62 * strike) * amp
      b.LowerLegR.rotation.x += (1.7 * wind + 0.05 * strike) * amp
      if (b.Torso) b.Torso.rotation.x += (0.08 * wind - 0.3 * strike)
      if (b.UpperArmL) b.UpperArmL.rotation.x += -0.85 * strike
      if (b.LowerArmL) b.LowerArmL.rotation.x += -0.8 * strike
      if (b.UpperArmR) b.UpperArmR.rotation.x += 0.45 * strike
    }
  }

  // face morphs
  const wantAngry = (f.state === 'attack' || f.state === 'block' || f.state === 'victory' || f.meterFull) ? 1 : 0
  const wantSurprised = (f.state === 'hitstun' || f.state === 'knockdown' || f.state === 'dodge') ? 1 : 0
  const wantSad = f.state === 'ko' ? 1 : 0
  rig.face.angry += (wantAngry - rig.face.angry) * 0.18
  rig.face.surprised += (wantSurprised - rig.face.surprised) * 0.2
  rig.face.sad += (wantSad - rig.face.sad) * 0.1
  if (rig.morph) {
    const infl = rig.morph.morphTargetInfluences!
    if (rig.morphIdx.Angry !== undefined) infl[rig.morphIdx.Angry] = rig.face.angry
    if (rig.morphIdx.Surprised !== undefined) infl[rig.morphIdx.Surprised] = rig.face.surprised
    if (rig.morphIdx.Sad !== undefined) infl[rig.morphIdx.Sad] = rig.face.sad
  }

  // EX charge glow on the accent (joint) materials
  const glow = f.meterFull ? 0.85 + Math.sin(time * 9) * 0.4 : 0.55
  for (const m of rig.accentMats) m.emissiveIntensity = glow

  // white flash on hit
  if (f.flash > 0) {
    const k = (f.flash / 6) * 0.85
    const white = new THREE.Color(0xffffff)
    for (const { mat, emissive, intensity } of rig.bodyMats) {
      mat.emissive.copy(emissive).lerp(white, k)
      mat.emissiveIntensity = intensity + k * 2.2
    }
  } else {
    for (const { mat, emissive, intensity } of rig.bodyMats) {
      if (mat.emissiveIntensity !== intensity || !mat.emissive.equals(emissive)) {
        mat.emissive.copy(emissive)
        mat.emissiveIntensity = intensity
      }
    }
  }

  void engine
}

export function FighterView({ engine, index }: { engine: MatchEngine; index: number }) {
  const { scene, animations } = useGLTF(MODEL_URL)
  const fighter = engine.fighters[index]
  const rig = useMemo(() => {
    const r = buildRig(scene, animations, fighter.cfg)
    r.root.position.x = fighter.pos.x
    r.root.rotation.y = fighter.facing === 1 ? Math.PI / 2 : -Math.PI / 2
    return r
  }, [scene, animations, fighter])

  useEffect(() => {
    return () => {
      rig.mixer.stopAllAction()
      for (const { mat } of rig.bodyMats) mat.dispose()
    }
  }, [rig])

  useFrame((state, dt) => {
    const f = engine.fighters[index]
    const d = Math.min(dt, 0.1)

    // base clip
    const spec = baseSpecFor(rig, f, engine, index)
    const forceRestart = f.state === 'attack' && rig.lastAttack !== f.attack
    if (forceRestart) rig.lastAttack = f.attack
    play(rig, spec, forceRestart)

    // mixer steps with cinematic time; frozen during hitstop for impact weight
    const frozen = engine.hitstop > 0 && engine.phase === 'fight'
    if (!frozen) rig.mixer.update(d * engine.timeScale)

    proceduralLayer(rig, f, engine, state.clock.elapsedTime)

    // transform sync (damped — also smooths the 20 Hz sim during KO slow-mo)
    const root = rig.root
    root.position.x += (f.pos.x - root.position.x) * Math.min(1, d * 16)
    root.position.z = 0
    root.position.y = 0
    const targetRot = f.facing === 1 ? Math.PI / 2 : -Math.PI / 2
    root.rotation.y += (targetRot - root.rotation.y) * Math.min(1, d * 10)
  })

  return <primitive object={rig.root} />
}

/** Idle showcase robot used behind the main menu. */
export function MenuRobot() {
  const { scene, animations } = useGLTF(MODEL_URL)
  const rig = useMemo(() => buildRig(scene, animations, FIGHTERS[0]), [scene, animations])
  const emote = useRef({ next: 4, until: 0 })

  useEffect(() => {
    rig.root.position.set(1.35, 0, 0)
    rig.root.rotation.y = 0.55
    return () => {
      rig.mixer.stopAllAction()
      for (const { mat } of rig.bodyMats) mat.dispose()
    }
  }, [rig])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const e = emote.current
    if (t >= e.next && t >= e.until) {
      const emotes = ['Wave', 'Yes', 'No', 'ThumbsUp', 'Dance']
      const clip = emotes[Math.floor(Math.random() * emotes.length)]
      play(rig, { clip, ts: clip === 'Dance' ? 0.9 : 1, once: clip !== 'Dance', fade: 0.25 })
      e.until = t + (rig.clipDur[clip] ?? 1.5) + 0.4
      e.next = e.until + 4 + Math.random() * 5
    } else if (t >= e.until && rig.currentKey !== 'Idle') {
      play(rig, { clip: 'Idle', ts: 1, fade: 0.4 })
    }
    rig.mixer.update(Math.min(dt, 0.1))
    if (rig.morph && rig.morphIdx.Angry !== undefined) {
      rig.morph.morphTargetInfluences![rig.morphIdx.Angry] = 0.2 + Math.sin(t * 0.7) * 0.2
    }
  })

  return <primitive object={rig.root} />
}
