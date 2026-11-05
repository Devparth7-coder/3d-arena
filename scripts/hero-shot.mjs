// Captures a full-quality combat screenshot for documentation.
import { chromium } from 'playwright'
import fs from 'node:fs'

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)))
await p.goto('http://localhost:5173/#play', { waitUntil: 'networkidle', timeout: 60000 })
await p.waitForFunction(() => {
  const eng = window.__ARENA_ENGINE
  return eng && eng.phase === 'fight' && eng.tick > 60
}, null, { timeout: 240000 })
// let the AI exchange a few blows so the shot has action (sparks, damage bars)
await p.waitForTimeout(8000)
fs.mkdirSync('docs', { recursive: true })
await p.screenshot({ path: 'docs/fight-hq.png' })
const state = await p.evaluate(() => {
  const eng = window.__ARENA_ENGINE
  return {
    hp: [eng.fighters[0].health, eng.fighters[1].health],
    timer: Math.ceil(eng.timer / 60),
    tick: eng.tick,
  }
})
console.log('saved docs/fight-hq.png', JSON.stringify(state))
await browser.close()
