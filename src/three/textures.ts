import * as THREE from 'three'

/** Procedural canvas textures — no external image assets required. */

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export interface FloorTextures {
  map: THREE.CanvasTexture
  emissive: THREE.CanvasTexture
}

let floorCache: FloorTextures | null = null

export function floorTextures(): FloorTextures {
  if (floorCache) return floorCache

  const drawGrid = (ctx: CanvasRenderingContext2D, s: number, stroke: string, alpha: number) => {
    ctx.strokeStyle = stroke
    ctx.globalAlpha = alpha
    ctx.lineWidth = 2
    const cx = s / 2
    // concentric combat rings
    for (const r of [0.16, 0.3, 0.44, 0.62]) {
      ctx.beginPath()
      ctx.arc(cx, cx, s * r, 0, Math.PI * 2)
      ctx.stroke()
    }
    // radial spokes
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * s * 0.16, cx + Math.sin(a) * s * 0.16)
      ctx.lineTo(cx + Math.cos(a) * s * 0.62, cx + Math.sin(a) * s * 0.62)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  const map = canvasTexture(1024, (ctx, s) => {
    ctx.fillStyle = '#0a0d13'
    ctx.fillRect(0, 0, s, s)
    // subtle plate noise
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.022})`
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2)
    }
    drawGrid(ctx, s, '#1b2534', 0.9)
    // center emblem
    ctx.strokeStyle = '#232f42'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s * 0.075, 0, Math.PI * 2)
    ctx.stroke()
    // hazard rim
    ctx.strokeStyle = '#30161c'
    ctx.lineWidth = 26
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s * 0.478, 0, Math.PI * 2)
    ctx.stroke()
  })

  const emissive = canvasTexture(1024, (ctx, s) => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, s, s)
    drawGrid(ctx, s, '#0d94b8', 0.55)
    ctx.strokeStyle = '#29e6ff'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2)
    ctx.stroke()
    // red zone markers at the lateral bounds
    ctx.strokeStyle = '#ff3b52'
    ctx.lineWidth = 14
    for (const fx of [0.17, 0.83]) {
      ctx.beginPath()
      ctx.moveTo(s * fx, s * 0.18)
      ctx.lineTo(s * fx, s * 0.82)
      ctx.globalAlpha = 0.5
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  })

  floorCache = { map, emissive }
  return floorCache
}

let buildingCache: THREE.CanvasTexture | null = null

export function buildingTexture(): THREE.CanvasTexture {
  if (buildingCache) return buildingCache
  buildingCache = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, s, s)
    const cols = 6
    const rows = 16
    const cw = s / cols
    const ch = s / rows
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (Math.random() < 0.24) {
          const warm = Math.random() < 0.3
          ctx.fillStyle = warm ? '#ffd9a0' : Math.random() < 0.5 ? '#7fd8ff' : '#2b7d9e'
          ctx.globalAlpha = 0.35 + Math.random() * 0.55
          ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4)
        }
      }
    }
    ctx.globalAlpha = 1
  })
  return buildingCache
}

let glowCache: THREE.CanvasTexture | null = null

/** Soft radial dot — particles / flashes / light cones. */
export function glowTexture(): THREE.CanvasTexture {
  if (glowCache) return glowCache
  glowCache = canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
  return glowCache
}

let coneCache: THREE.CanvasTexture | null = null

/** Vertical gradient (bright top → transparent bottom) for volumetric cones. */
export function coneTexture(): THREE.CanvasTexture {
  if (coneCache) return coneCache
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 128)
  coneCache = new THREE.CanvasTexture(canvas)
  return coneCache
}

let screenCache: THREE.CanvasTexture | null = null

/** Arena banner screens. */
export function screenTexture(): THREE.CanvasTexture {
  if (screenCache) return screenCache
  screenCache = canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#050a12'
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = 'rgba(41,230,255,0.14)'
    ctx.lineWidth = 1
    for (let y = 0; y < s; y += 6) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke()
    }
    ctx.fillStyle = '#29e6ff'
    ctx.font = '900 150px "Arial Black", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = 0.92
    ctx.fillText('ARENA', s / 2, s / 2 - 10)
    ctx.fillStyle = '#ff3b52'
    ctx.font = '700 46px "Arial Black", sans-serif'
    ctx.fillText('SECTOR 07', s / 2, s / 2 + 100)
    ctx.globalAlpha = 1
  })
  return screenCache
}

/** Deterministic PRNG so the skyline is identical every session. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
