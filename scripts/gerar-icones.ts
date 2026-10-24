/** Gera os PNGs do PWA a partir de um SVG (sem identidade oficial da Marinha). Uso: npx tsx scripts/gerar-icones.ts */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const out = path.resolve(import.meta.dirname, '../public/icons')
mkdirSync(out, { recursive: true })

// `pad` = margem de segurança (ícone "maskable" precisa do glifo dentro de ~80% do centro)
const svg = (size: number, pad: number, rounded: boolean) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" ${rounded ? 'rx="13"' : ''} fill="#0B2545"/>
  <g transform="translate(${32 - 32 * (1 - pad)} ${32 - 32 * (1 - pad)}) scale(${1 - pad})" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="15" r="4.2"/><path d="M32 19.5v32M22 29h20M13 41c3 8.5 11 12 19 12s16-3.500 19-12"/>
  </g>
  <path d="M0 58 Q16 52 32 58 T64 58 V64 H0Z" fill="#1F6E8C" opacity=".9"/>
</svg>`

const jobs: [string, number, number, boolean][] = [
  ['icon-192.png', 192, 0.1, true],
  ['icon-512.png', 512, 0.1, true],
  ['maskable-512.png', 512, 0.26, false],
  ['apple-touch-icon.png', 180, 0.1, false],
]
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, pad, rounded] of jobs) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0;background:transparent">${svg(size, pad, rounded)}</body>`)
  writeFileSync(path.join(out, name), await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }))
  console.log('ok', name)
}
await browser.close()
