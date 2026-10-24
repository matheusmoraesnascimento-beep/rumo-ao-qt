import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildMessage, isGone } from '../scripts/lib/lembretes'
import { urlBase64ToUint8Array } from '../src/lib/pwa'

const root = path.resolve(import.meta.dirname, '..')

describe('mensagem do lembrete', () => {
  it('revisões vencidas: singular/plural, tempo estimado e link para /revisoes', () => {
    expect(buildMessage({ kind: 'revisoes', due_count: 1 })).toMatchObject({ body: 'Você tem 1 revisão vencida. Leva uns 2 min.', url: './#/revisoes' })
    expect(buildMessage({ kind: 'revisoes', due_count: 12 }).body).toBe('Você tem 12 revisões vencidas. Leva uns 18 min.')
  })
  it('tempo estimado tem teto (30 min), mesmo com fila enorme', () => {
    expect(buildMessage({ kind: 'revisoes', due_count: 200 }).body).toContain('uns 30 min')
  })
  it('sem revisões: convite curto de estudo, sem culpa e sem cobrança', () => {
    const m = buildMessage({ kind: 'estudo', due_count: 0 })
    expect(m.body).toMatch(/25 minutos/)
    expect(m.body).not.toMatch(/atrasad|esquec|falt|perdeu/i)
    expect(m.url).toBe('./#/agenda?iniciar=25')
  })
  it('kind "revisoes" com contagem 0 cai no convite de estudo (nunca "0 revisões")', () => {
    expect(buildMessage({ kind: 'revisoes', due_count: 0 }).body).not.toMatch(/0 revis/)
  })
  it('mesma tag => a notificação nova substitui a anterior', () => {
    expect(buildMessage({ kind: 'estudo', due_count: 0 }).tag).toBe(buildMessage({ kind: 'revisoes', due_count: 3 }).tag)
  })
  it('404/410 = inscrição morta; outros erros tentam de novo', () => {
    expect(isGone(404) && isGone(410)).toBe(true)
    expect([undefined, 429, 500, 413].some((c) => isGone(c))).toBe(false)
  })
})

describe('conversão da chave VAPID', () => {
  it('base64url -> bytes (65 bytes de chave pública P-256)', () => {
    const pub = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
    const u = urlBase64ToUint8Array(pub)
    expect(u).toHaveLength(65)
    expect(u[0]).toBe(0x04)
  })
})

describe('artefatos do PWA', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'))
  it('manifest instalável: standalone, escopo relativo (subpasta do Pages), ícones 192/512/maskable', () => {
    expect(manifest).toMatchObject({ display: 'standalone', scope: './', start_url: './#/', lang: 'pt-BR' })
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`)
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))
    for (const i of manifest.icons) expect(i.src.startsWith('/')).toBe(false) // nada absoluto: quebraria em /rumo-ao-qt/
  })
  it('manifest não usa nome/identidade oficial da Marinha', () => {
    expect(JSON.stringify(manifest)).toMatch(/sem vínculo com a Marinha/)
    expect(manifest.name).toBe('Rumo ao QT')
  })
  const sw = readFileSync(path.join(root, 'public/sw.js'), 'utf8')
  it('service worker: nunca intercepta outras origens (Supabase) nem não-GET e não força skipWaiting', () => {
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return/)
    expect(sw).toMatch(/req\.method !== 'GET'/)
    expect(sw).not.toMatch(/skipWaiting\(\)/)
  })
  it('service worker trata push e clique, com tag para não empilhar', () => {
    expect(sw).toMatch(/addEventListener\('push'/)
    expect(sw).toMatch(/addEventListener\('notificationclick'/)
    expect(sw).toMatch(/tag: data\.tag/)
  })
  it('index.html liga manifest e apple-touch-icon pelo BASE_URL (funciona em subpasta)', () => {
    const html = readFileSync(path.join(root, 'index.html'), 'utf8')
    expect(html).toMatch(/href="%BASE_URL%manifest\.webmanifest"/)
    expect(html).toMatch(/href="%BASE_URL%icons\/apple-touch-icon\.png"/)
  })
})
