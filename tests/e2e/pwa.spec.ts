import { expect, test } from '@playwright/test'

const BASE = '/rumo-ao-qt/'

test.describe('PWA instalável (build em subpasta)', () => {
  test('manifest e ícones são servidos com o tipo correto e escopo da subpasta', async ({ request }) => {
    const r = await request.get(`${BASE}manifest.webmanifest`)
    expect(r.status()).toBe(200)
    const m = await r.json()
    expect(m).toMatchObject({ name: 'Rumo ao QT', display: 'standalone', scope: './', start_url: './#/' })
    for (const i of m.icons) {
      const ic = await request.get(`${BASE}${i.src}`)
      expect(ic.status(), i.src).toBe(200)
      expect(ic.headers()['content-type']).toContain('image/png')
    }
    expect((await request.get(`${BASE}icons/apple-touch-icon.png`)).status()).toBe(200)
  })

  test('index.html aponta para o manifest e o navegador o reconhece', async ({ page }) => {
    await page.goto(`${BASE}#/entrar`)
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBe(`${BASE}manifest.webmanifest`)
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#0B2545')
  })

  test('service worker registra no escopo da subpasta e controla a página', async ({ page }) => {
    await page.goto(`${BASE}#/entrar`)
    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.scope
    })
    expect(scope.endsWith(BASE)).toBe(true)
    await page.reload()
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  })

  test('sem rede o app abre (casco em cache) e avisa que dados dependem da internet', async ({ page, context }) => {
    await page.goto(`${BASE}#/entrar`)
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload() // garante cache do casco + assets
    await expect(page.getByRole('heading', { name: 'Configuração pendente' })).toBeVisible()
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Configuração pendente' })).toBeVisible()
    expect(await page.title()).toBe('Rumo ao QT')
    await context.setOffline(false)
  })

  test('o service worker não guarda respostas de outras origens (Supabase fica sempre na rede)', async ({ page }) => {
    await page.goto(`${BASE}#/entrar`)
    await page.evaluate(() => navigator.serviceWorker.ready)
    const urls = await page.evaluate(async () => {
      const out: string[] = []
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url)
      return out
    })
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => new URL(u).origin === new URL(page.url()).origin)).toBe(true)
    expect(urls.some((u) => /supabase/i.test(u))).toBe(false)
  })

  test('push de verdade: evento entregue ao service worker vira notificação com texto, tag e link', async ({ page, context }) => {
    const origin = 'http://localhost:4173'
    await context.grantPermissions(['notifications'], { origin })
    await page.goto(`${BASE}#/entrar`)
    await page.evaluate(() => navigator.serviceWorker.ready)

    const cdp = await context.newCDPSession(page)
    const regs: string[] = []
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e: { registrations: { registrationId: string; scopeURL: string }[] }) => {
      for (const r of e.registrations) if (r.scopeURL.endsWith(BASE)) regs.push(r.registrationId)
    })
    await cdp.send('ServiceWorker.enable')
    await expect.poll(() => regs.length).toBeGreaterThan(0)

    const send = (body: string) => cdp.send('ServiceWorker.deliverPushMessage', {
      origin, registrationId: regs[0],
      data: JSON.stringify({ title: 'Rumo ao QT', body, url: './#/revisoes', tag: 'lembrete-diario' }),
    })
    await send('Você tem 3 revisões vencidas. Leva uns 5 min.')
    await send('Você tem 2 revisões vencidas. Leva uns 3 min.')

    await expect.poll(async () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({ tag: 'lembrete-diario' })).length)).toBe(1)
    const n = await page.evaluate(async () => {
      const x = (await (await navigator.serviceWorker.ready).getNotifications({ tag: 'lembrete-diario' }))[0]
      return { title: x.title, body: x.body, url: (x.data as { url: string }).url }
    })
    expect(n).toEqual({ title: 'Rumo ao QT', body: 'Você tem 2 revisões vencidas. Leva uns 3 min.', url: './#/revisoes' })
  })

  test('push com payload inválido ainda mostra um lembrete padrão (nunca silencia)', async ({ page, context }) => {
    const origin = 'http://localhost:4173'
    await context.grantPermissions(['notifications'], { origin })
    await page.goto(`${BASE}#/entrar`)
    await page.evaluate(() => navigator.serviceWorker.ready)
    const cdp = await context.newCDPSession(page)
    const regs: string[] = []
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e: { registrations: { registrationId: string; scopeURL: string }[] }) => {
      for (const r of e.registrations) if (r.scopeURL.endsWith(BASE)) regs.push(r.registrationId)
    })
    await cdp.send('ServiceWorker.enable')
    await expect.poll(() => regs.length).toBeGreaterThan(0)
    await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId: regs[0], data: '{isto não é json' })
    await expect.poll(async () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length)).toBeGreaterThan(0)
    const title = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications())[0].title)
    expect(title).toBe('Rumo ao QT')
  })
})
