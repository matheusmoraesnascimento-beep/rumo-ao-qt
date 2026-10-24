/* Service worker do Rumo ao QT.
 * - Cache SÓ do "casco" estático (HTML + assets com hash). Nunca guarda Supabase/Auth/API: dados vêm sempre da rede.
 * - Sem skipWaiting: uma versão nova só assume quando as abas antigas fecham (evita chunks quebrados no meio do uso).
 * - Push: exibe o lembrete e abre o app na tela certa ao tocar.
 * Isto NÃO é modo offline: sem rede o app abre, mas dados e gravações dependem do Supabase. */
const VERSION = 'rumo-v1'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './manifest.webmanifest', './icons/icon-192.png'])).catch(() => undefined))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return // Supabase e demais origens: rede direta

  // Páginas: rede primeiro (pega a versão nova); sem rede, abre o casco em cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./').then((r) => r || Response.error())),
    )
    return
  }

  // Assets com hash no nome (imutáveis): cache primeiro.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      }),
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* payload inválido: usa padrão */ }
  const title = data.title || 'Rumo ao QT'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Hora de estudar um pouco hoje.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.tag || 'lembrete-diario', // substitui o anterior, sem empilhar
      data: { url: data.url || './#/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || './#/', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.registration.scope))
      if (open) return open.focus().then((w) => ('navigate' in w ? w.navigate(target) : w))
      return self.clients.openWindow(target)
    }),
  )
})
