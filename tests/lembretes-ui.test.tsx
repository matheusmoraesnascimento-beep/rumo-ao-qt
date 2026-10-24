import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const db = vi.hoisted(() => ({ subs: [] as { id: string; endpoint: string; user_agent: string | null; created_at: string }[] }))
const settings = vi.hoisted(() => ({ value: { user_id: 'u', reminder_enabled: false, reminder_time: '19:00' } as Record<string, unknown> }))
const api = vi.hoisted(() => ({
  getSettings: vi.fn(async () => settings.value),
  saveSettings: vi.fn(async (p: Record<string, unknown>) => { settings.value = { ...settings.value, ...p } }),
  savePushSubscription: vi.fn(async () => undefined),
  deletePushSubscription: vi.fn(async (ep: string) => { db.subs = db.subs.filter((s) => s.endpoint !== ep) }),
  getPushSubscriptions: vi.fn(async () => db.subs),
}))
const pwa = vi.hoisted(() => ({
  support: { supported: true, ios: false, standalone: false } as { supported: boolean; reason?: string; ios: boolean; standalone: boolean },
  install: { canInstall: false, installed: false, install: vi.fn(async () => 'accepted') },
  endpoint: null as string | null,
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
  showTestNotification: vi.fn(async () => undefined),
}))
vi.mock('@/lib/api', () => api)
vi.mock('@/lib/pwa', () => ({
  detectPushSupport: () => pwa.support,
  useInstallPrompt: () => pwa.install,
  currentEndpoint: async () => pwa.endpoint,
  subscribePush: pwa.subscribePush,
  unsubscribePush: pwa.unsubscribePush,
  showTestNotification: pwa.showTestNotification,
}))
import { Lembretes } from '@/features/config/Lembretes'

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Lembretes /></QueryClientProvider>)

beforeEach(() => {
  cleanup(); vi.clearAllMocks()
  settings.value = { user_id: 'u', reminder_enabled: false, reminder_time: '19:00' }
  pwa.support = { supported: true, ios: false, standalone: false }
  pwa.install = { canInstall: false, installed: false, install: vi.fn(async () => 'accepted') }
  pwa.endpoint = null
  db.subs = []
  pwa.subscribePush.mockResolvedValue({ endpoint: 'https://push.example/x', p256dh: 'k', auth: 's' })
})

describe('Lembrete diário e instalação', () => {
  it('navegador sem suporte: explica o motivo e não oferece ligar', async () => {
    pwa.support = { supported: false, ios: true, standalone: false, reason: 'No iPhone/iPad, instale o app na Tela de Início…' }
    mount()
    expect(await screen.findByRole('note')).toHaveTextContent(/Tela de Início/)
    expect(screen.queryByRole('button', { name: 'Ligar lembrete' })).not.toBeInTheDocument()
  })
  it('ligar: pede permissão, grava a inscrição e o horário, e mostra ligado', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Ligar lembrete' }))
    await waitFor(() => expect(api.savePushSubscription).toHaveBeenCalledWith({ endpoint: 'https://push.example/x', p256dh: 'k', auth: 's' }))
    expect(api.saveSettings).toHaveBeenCalledWith({ reminder_enabled: true, reminder_time: '19:00' })
    expect(await screen.findByText(/Lembrete ligado para ~19:00/)).toBeInTheDocument()
  })
  it('permissão negada: mostra o erro e NÃO grava nada', async () => {
    pwa.subscribePush.mockRejectedValue(new Error('Permissão de notificação bloqueada no navegador.'))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Ligar lembrete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('bloqueada')
    expect(api.savePushSubscription).not.toHaveBeenCalled()
    expect(api.saveSettings).not.toHaveBeenCalled()
  })
  it('horário escolhido é o que vai para o banco', async () => {
    mount()
    const t = await screen.findByLabelText('Horário (Brasília)')
    await userEvent.clear(t)
    await userEvent.type(t, '07:30')
    await userEvent.click(screen.getByRole('button', { name: 'Ligar lembrete' }))
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ reminder_enabled: true, reminder_time: '07:30' }))
  })
  it('já ligado neste aparelho: oferece testar e desligar; desligar remove a inscrição', async () => {
    settings.value = { user_id: 'u', reminder_enabled: true, reminder_time: '19:00' }
    pwa.endpoint = 'https://push.example/x'
    db.subs = [{ id: '1', endpoint: 'https://push.example/x', user_agent: null, created_at: '' }]
    pwa.unsubscribePush.mockResolvedValue('https://push.example/x')
    mount()
    expect(await screen.findByText('ligado neste aparelho')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    expect(pwa.showTestNotification).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Desligar' }))
    await waitFor(() => expect(api.deletePushSubscription).toHaveBeenCalledWith('https://push.example/x'))
    expect(api.saveSettings).toHaveBeenCalledWith({ reminder_enabled: false })
  })
  it('desligar aqui mantém o lembrete ativo se houver outro aparelho inscrito', async () => {
    settings.value = { user_id: 'u', reminder_enabled: true, reminder_time: '19:00' }
    pwa.endpoint = 'https://push.example/x'
    db.subs = [{ id: '1', endpoint: 'https://push.example/x', user_agent: null, created_at: '' }, { id: '2', endpoint: 'https://push.example/outro', user_agent: null, created_at: '' }]
    pwa.unsubscribePush.mockResolvedValue('https://push.example/x')
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Desligar' }))
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ reminder_enabled: true }))
  })
  it('instalação: botão só aparece quando o navegador oferece; app instalado mostra aviso', async () => {
    pwa.install = { canInstall: true, installed: false, install: vi.fn(async () => 'accepted') }
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /Instalar app/ }))
    expect(pwa.install.install).toHaveBeenCalled()
    cleanup()
    pwa.install = { canInstall: false, installed: true, install: vi.fn() }
    mount()
    expect(await screen.findByText(/App instalado neste aparelho/)).toBeInTheDocument()
  })
  it('deixa claros os limites: janela de 3 h, dia bloqueado, 1 por dia', async () => {
    mount()
    expect(await screen.findByText(/janela de 3 h/)).toBeInTheDocument()
    expect(screen.getByText(/dia bloqueado/)).toBeInTheDocument()
    expect(screen.getByText(/mais de uma vez por dia/)).toBeInTheDocument()
  })
})
