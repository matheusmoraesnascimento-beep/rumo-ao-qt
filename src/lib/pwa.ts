import { useEffect, useState } from 'react'

/** Registra o service worker (só em produção). Falha silenciosa: o app funciona sem ele. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}

export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export interface PushSupport { supported: boolean; reason?: string; ios: boolean; standalone: boolean }

export function detectPushSupport(): PushSupport {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, ios, standalone, reason: ios && !standalone ? 'No iPhone/iPad, instale o app na Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.' : 'Este navegador não suporta notificações push.' }
  }
  if (!VAPID_PUBLIC_KEY) return { supported: false, ios, standalone, reason: 'Chave de notificação (VAPID) não configurada neste build.' }
  return { supported: true, ios, standalone }
}

export interface SubscriptionPayload { endpoint: string; p256dh: string; auth: string }

/** Cria uma inscrição NOVA (descarta a antiga, para não herdar endpoint de outra conta neste navegador). */
export async function subscribePush(): Promise<SubscriptionPayload> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Permissão de notificação bloqueada no navegador. Libere nas configurações do site.' : 'Permissão de notificação não concedida.')
  const reg = await navigator.serviceWorker.ready
  const old = await reg.pushManager.getSubscription()
  if (old) await old.unsubscribe()
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error('Inscrição de notificação incompleta.')
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }
}

export async function unsubscribePush(): Promise<string | null> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return null
  const ep = sub.endpoint
  await sub.unsubscribe()
  return ep
}

export async function currentEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null
}

/** Notificação local de teste (valida permissão e service worker, sem passar pelo servidor). */
export async function showTestNotification() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Rumo ao QT', { body: 'Notificações funcionando. Este é um teste.', icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, tag: 'teste' })
}

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/** Captura o convite de instalação do navegador (Chrome/Edge/Android). */
export function useInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches ?? false)
  useEffect(() => {
    const onBefore = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent) }
    const onInstalled = () => { setInstalled(true); setEvt(null) }
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onBefore); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  return {
    canInstall: !!evt && !installed,
    installed,
    install: async () => { if (!evt) return null; await evt.prompt(); const r = await evt.userChoice; setEvt(null); return r.outcome },
  }
}

export function useOnline(): boolean {
  const [on, setOn] = useState(() => navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false)
    window.addEventListener('online', a); window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  return on
}
