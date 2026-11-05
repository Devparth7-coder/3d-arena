// Visual + behavioral verification for ARENA (headless, SwiftShader WebGL).
// Waits on real game state (not wall-clock) so slow software rendering still
// exercises the true flow: menu → fight → KO cinematic → results → rematch.
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import fs from 'node:fs'

const BASE = 'http://localhost:5173/'
const OUT = 'scripts/out'
fs.mkdirSync(OUT, { recursive: true })

function analyze(buf) {
  const png = PNG.sync.read(buf)
  const { width, height, data } = png
  let sum = 0
  let cyan = 0
  let red = 0
  let bright = 0
  const n = width * height
  for (let i = 0; i < n; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255
    sum += lum
    if (lum > 0.55) bright++
    if (b > 120 && b > r + 40 && g > 60) cyan++
    if (r > 130 && r > b + 50 && g < r) red++
  }
  return {
    meanLum: sum / n,
    brightFrac: bright / n,
    cyanFrac: cyan / n,
    redFrac: red / n,
  }
}

const failures = []
const check = (name, cond, detail = '') => {
  const ok = typeof cond === 'function' ? cond() : cond
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
})

async function page(hash) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)))
  await p.goto(BASE + hash, { waitUntil: 'networkidle', timeout: 45000 })
  return p
}
const closePage = (p) => p.context().close()
const shot = (p, name) => p.screenshot().then((buf) => { fs.writeFileSync(`${OUT}/${name}.png`, buf); return buf })

// ── 1. main menu (full quality) ──────────────────────────────────────────────
{
  const p = await page('')
  await p.waitForTimeout(4500)
  const buf = await shot(p, 'menu')
  const a = analyze(buf)
  check('menu: renders content', a.meanLum > 0.02 && a.meanLum < 0.85, `meanLum=${a.meanLum.toFixed(3)}`)
  check('menu: cyan accents', a.cyanFrac > 0.0005, `cyan=${(a.cyanFrac * 100).toFixed(2)}%`)
  check('menu: 4 nav buttons', (await p.locator('.menu-nav button').count()) === 4)
  check('menu: title', (await p.locator('.title').textContent()) === 'ARENA')
  // settings panel works
  await p.locator('.menu-nav button', { hasText: 'SETTINGS' }).click()
  await p.waitForTimeout(400)
  check('menu: settings panel opens', (await p.locator('.panel .slider-row').count()) === 3)
  await shot(p, 'menu-settings')
  await p.locator('.panel .close').click()
  await closePage(p)
}

// ── 2. fight (low quality for software-renderer speed) ──────────────────────
{
  const p = await page('#play&low')
  // wait until the round actually starts (timer becomes visible & phase = fight)
  await p.waitForFunction(() => {
    const eng = window.__ARENA_ENGINE
    return eng && eng.phase === 'fight'
  }, null, { timeout: 90000 })
  await p.waitForTimeout(1200) // let a few combat ticks run
  const buf = await shot(p, 'fight')
  const a = analyze(buf)
  check('fight: scene renders', a.meanLum > 0.015 && a.meanLum < 0.85, `meanLum=${a.meanLum.toFixed(3)}`)
  check('fight: cyan fighter visible', a.cyanFrac > 0.0008, `cyan=${(a.cyanFrac * 100).toFixed(2)}%`)
  check('fight: red fighter visible', a.redFrac > 0.0008, `red=${(a.redFrac * 100).toFixed(2)}%`)
  check('fight: HUD bars', (await p.locator('.bar').count()) === 2)
  const fps = await p.evaluate(() =>
    new Promise((resolve) => {
      let frames = 0
      const t0 = performance.now()
      const loop = () => {
        frames++
        if (performance.now() - t0 < 2000) requestAnimationFrame(loop)
        else resolve(frames / 2)
      }
      requestAnimationFrame(loop)
    }),
  )
  check('fight: render loop alive (software GL)', fps > 1, `${fps.toFixed(1)} fps under SwiftShader (CPU rasterizer; real GPUs are not represented by this number)`)

  // real input pipeline: place fighters in range, press U (light punch), verify damage
  await p.evaluate(() => {
    const eng = window.__ARENA_ENGINE
    eng.fighters[0].pos.x = 0
    eng.fighters[1].pos.x = 1.2
    history.replaceState(null, '', '/')
  })
  await p.keyboard.down('KeyU')
  await p.waitForTimeout(300)
  await p.keyboard.up('KeyU')
  await p.waitForFunction(() => {
    const eng = window.__ARENA_ENGINE
    return eng && eng.fighters[1].health < eng.fighters[1].cfg.health
  }, null, { timeout: 30000 })
  check('fight: keyboard input → attack → damage', true,
    `P2 health ${await p.evaluate(() => window.__ARENA_ENGINE.fighters[1].health)}`)
  await shot(p, 'fight-hit')
  await closePage(p)
}

// ── 3. KO cinematic ──────────────────────────────────────────────────────────
{
  const p = await page('#play&ko&low')
  await p.waitForFunction(() => {
    const eng = window.__ARENA_ENGINE
    return eng && (eng.phase === 'koSlowmo' || eng.phase === 'roundEnd')
  }, null, { timeout: 120000 })
  await p.waitForTimeout(1500)
  const buf = await shot(p, 'ko')
  const a = analyze(buf)
  check('ko: cinematic reached', true)
  check('ko: dramatic frame (fx/bloom)', a.brightFrac > 0.001 || a.redFrac > 0.0015, `bright=${(a.brightFrac * 100).toFixed(2)}% red=${(a.redFrac * 100).toFixed(2)}%`)
  await closePage(p)
}

// ── 4. results + rematch + pause ─────────────────────────────────────────────
{
  const p = await page('#play&results&low')
  await p.waitForSelector('.results-winner', { timeout: 150000 })
  await p.waitForTimeout(800)
  const buf = await shot(p, 'results')
  const a = analyze(buf)
  check('results: rendered', a.meanLum > 0.01, `meanLum=${a.meanLum.toFixed(3)}`)
  const winner = await p.locator('.results-winner').textContent()
  check('results: winner announced', !!winner && winner.includes('WINS'), `"${winner}"`)
  check('results: 10 stat rows', (await p.locator('.col-stat').count()) === 10)

  // neutralize the auto-KO dev hook before restarting, then rematch
  await p.evaluate(() => history.replaceState(null, '', '/'))
  await p.locator('.results-actions button').first().click()
  await p.waitForSelector('.hud', { timeout: 30000 })
  await p.waitForFunction(() => {
    const eng = window.__ARENA_ENGINE
    return eng && eng.phase === 'fight'
  }, null, { timeout: 300000 })
  check('results: rematch starts a new match', true,
    `engine tick=${await p.evaluate(() => window.__ARENA_ENGINE.tick)}`)

  // pause overlay via ESC
  await p.keyboard.press('Escape')
  await p.waitForSelector('.overlay', { timeout: 30000 })
  check('fight: ESC opens pause overlay', true)
  await p.keyboard.press('Escape')
  await p.waitForFunction(() => {
    const eng = window.__ARENA_ENGINE
    return eng && eng.paused === false && eng.phase === 'fight'
  }, null, { timeout: 30000 })
  check('fight: ESC again resumes', true)
  await closePage(p)
}

await browser.close()
console.log('')
if (failures.length) {
  console.log(`✗ ${failures.length} check(s) failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('✓ all visual/behavioral checks passed')
