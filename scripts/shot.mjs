// Visual verification harness — captures real rendered frames of the game.
// Usage: node scripts/shot.mjs [url] [outPrefix] [waitMs]
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5173/'
const prefix = process.argv[3] ?? 'shot'
const waitMs = Number(process.argv[4] ?? 4000)

const browser = await chromium.launch({
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--disable-gpu-sandbox',
    '--no-sandbox',
  ],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('console', (m) => {
  const t = m.text()
  if (!t.includes('Download the React DevTools')) console.log('[console]', t.slice(0, 300))
})
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)))

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
const webgl = await page.evaluate(() => {
  const c = document.createElement('canvas')
  return !!(c.getContext('webgl2') || c.getContext('webgl'))
})
console.log('WebGL available:', webgl)
await page.waitForTimeout(waitMs)
await page.screenshot({ path: `scripts/out/${prefix}.png` })
console.log('saved scripts/out/' + prefix + '.png')
await browser.close()
