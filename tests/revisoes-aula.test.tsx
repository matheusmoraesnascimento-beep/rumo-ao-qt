import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const base = {
  user_id: 'u',
  question_id: null,
  back: '',
  algorithm: 'interval-v1',
  level: 0,
  last_reviewed_at: null,
  lapses: 0,
  review_count: 0,
  created_at: '2026-10-25T10:00:00Z',
}
const aula = {
  ...base,
  id: 'a1',
  kind: 'aula',
  topic_id: 't1',
  front: 'Nome antigo',
  due_at: '2026-10-25T03:00:00Z',
}
const card = {
  ...base,
  id: 'c1',
  kind: 'card',
  topic_id: null,
  front: 'Pergunta',
  back: 'Resposta',
  due_at: '2026-10-25T03:00:00Z',
}
const futura = {
  ...base,
  id: 'a2',
  kind: 'aula',
  topic_id: 't1',
  front: 'x',
  due_at: '2099-01-01T03:00:00Z',
}
const state = vi.hoisted(() => ({ cards: [] as unknown[] }))
const api = vi.hoisted(() => ({
  getCards: vi.fn(async () => state.cards),
  getSettings: vi.fn(async () => ({ daily_review_cap: 20 })),
  getProfile: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })),
  getTopics: vi.fn(async () => [
    {
      id: 't1',
      syllabus_version_id: 'v',
      parent_id: null,
      name: 'Nome atual',
      slug: 'n',
      ordinal: 0,
    },
  ]),
  getProgress: vi.fn(async () => [
    {
      user_id: 'u',
      topic_id: 't1',
      status: 'revisando',
      confidence: 1,
      notes: null,
      notes_html: '<p>meu resumo</p>',
      first_studied_at: null,
      last_studied_at: null,
    },
  ]),
  getReviewEvents: vi.fn(async () => []),
  reviewCard: vi.fn<(id: string, rating: number, eventId: string, tz: string) => Promise<object>>(
    async () => ({}),
  ),
  deleteCard: vi.fn(async () => undefined),
  rescheduleCard: vi.fn(async () => ({})),
  createCard: vi.fn(async () => ({})),
  concluirAssunto: vi.fn(),
  upsertProgress: vi.fn(),
}))
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), ...api }))

import Revisoes from '@/features/revisoes/Revisoes'

const mount = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <Revisoes />
      </MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.cards = []
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('Revisões: aulas', () => {
  it('aula vencida mostra o resumo, nome atual do assunto e os 6 botões sem "Mostrar verso"', async () => {
    state.cards = [aula]
    mount()
    expect(await screen.findByText('meu resumo')).toBeInTheDocument()
    expect(screen.getAllByText('Nome atual').length).toBeGreaterThan(0)
    expect(screen.queryByText('Nome antigo')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mostrar verso' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Editar resumo' })).toHaveAttribute(
      'href',
      '/edital/t1',
    )
    for (const r of [0, 1, 2, 3, 4, 5])
      expect(screen.getByRole('button', { name: new RegExp(`^${r}`) })).toBeInTheDocument()
  })

  it('nota 4 chama reviewCard; reenvio após falha reutiliza o mesmo client_event_id', async () => {
    state.cards = [aula]
    api.reviewCard.mockRejectedValueOnce(new Error('offline'))
    mount()
    await screen.findByText('meu resumo')
    await userEvent.click(screen.getByRole('button', { name: /^4/ }))
    await waitFor(() => expect(api.reviewCard).toHaveBeenCalledTimes(1))
    expect(api.reviewCard).toHaveBeenCalledWith('a1', 4, expect.any(String), 'America/Sao_Paulo')
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: /^4/ }))
    await waitFor(() => expect(api.reviewCard).toHaveBeenCalledTimes(2))
    expect(api.reviewCard.mock.calls[1][2]).toBe(api.reviewCard.mock.calls[0][2])
  })

  it('card normal continua exigindo "Mostrar verso"', async () => {
    state.cards = [card]
    mount()
    expect(await screen.findByRole('button', { name: 'Mostrar verso' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar resumo' })).toBeNull()
  })

  it('lista de próximos mostra Badge "aula" e confirmação própria na exclusão', async () => {
    state.cards = [futura]
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount()
    await userEvent.selectOptions(
      await screen.findByLabelText('Período das próximas revisões'),
      'all',
    )
    expect(await screen.findByText('aula')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Excluir esta aula?'))
    expect(api.deleteCard).not.toHaveBeenCalled()
  })

  it('resumo vazio mostra aviso', async () => {
    state.cards = [aula]
    api.getProgress.mockResolvedValueOnce([])
    mount()
    expect(await screen.findByText('(resumo vazio)')).toBeInTheDocument()
  })

  it('copia roteiro em texto seguro com recuperação ativa e sem inventar gabaritos', async () => {
    state.cards = [aula]
    api.getProgress.mockResolvedValueOnce([
      {
        user_id: 'u',
        topic_id: 't1',
        status: 'revisando',
        confidence: 1,
        notes: null,
        notes_html:
          '<p>Processos &amp; threads</p><script>segredo-malicioso()</script><img src="x" onerror="alert(1)"><p>Escalonamento</p>',
        first_studied_at: null,
        last_studied_at: null,
      },
    ])
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    mount()
    const script = await screen.findByLabelText('Roteiro para revisar no ChatGPT')
    expect((script as HTMLTextAreaElement).value).toContain('uma pergunta por vez')
    expect((script as HTMLTextAreaElement).value).toContain('Não invente gabarito oficial')
    expect((script as HTMLTextAreaElement).value).toContain('Processos & threads')
    expect((script as HTMLTextAreaElement).value).not.toMatch(
      /<script|segredo-malicioso|onerror|<p>/,
    )
    expect(copy).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Copiar roteiro para o ChatGPT' }))
    expect(copy).toHaveBeenCalledWith((script as HTMLTextAreaElement).value)
    expect(
      await screen.findByText('Roteiro copiado. Cole na sua conversa do ChatGPT.'),
    ).toBeInTheDocument()
    expect(api.reviewCard).not.toHaveBeenCalled()
  })

  it('mostra a próxima data retornada pelo servidor somente depois de persistir', async () => {
    state.cards = [aula]
    let save!: (card: object) => void
    api.reviewCard.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          save = resolve
        }),
    )
    mount()
    await screen.findByText('meu resumo')
    await userEvent.click(screen.getByRole('button', { name: /^4/ }))
    expect(screen.getByRole('button', { name: /^4/ })).toBeDisabled()
    expect(screen.queryByText(/Próxima revisão:/)).toBeNull()
    save({ ...aula, due_at: '2099-01-02T03:00:00Z' })
    expect(await screen.findByText(/Próxima revisão: 02\/01\/2099 00:00/)).toBeInTheDocument()
  })

  it('falha preserva pendência e trava outra dificuldade durante o reenvio', async () => {
    state.cards = [aula]
    api.reviewCard.mockRejectedValueOnce(new Error('sem rede'))
    mount()
    await screen.findByText('meu resumo')
    await userEvent.click(screen.getByRole('button', { name: /^4/ }))
    await screen.findByRole('alert')
    expect(screen.queryByText(/Próxima revisão:/)).toBeNull()
    expect(screen.getByRole('button', { name: /^5/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^4/ })).toBeEnabled()
    expect(screen.getByText('meu resumo')).toBeInTheDocument()
  })

  it('filtra datas reais dos próximos 7/30 dias e mantém as demais em todas agendadas', async () => {
    state.cards = [
      {
        ...futura,
        id: 'near',
        topic_id: null,
        front: 'Revisão próxima',
        due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      },
      {
        ...futura,
        id: 'month',
        topic_id: null,
        front: 'Revisão no mês',
        due_at: new Date(Date.now() + 20 * 86400000).toISOString(),
      },
      {
        ...futura,
        id: 'later',
        topic_id: null,
        front: 'Revisão distante',
        due_at: new Date(Date.now() + 45 * 86400000).toISOString(),
      },
    ]
    mount()
    const horizon = await screen.findByLabelText('Período das próximas revisões')
    expect(screen.getByText('Revisão próxima')).toBeInTheDocument()
    expect(screen.getByText('Revisão no mês')).toBeInTheDocument()
    expect(screen.queryByText('Revisão distante')).toBeNull()
    await userEvent.selectOptions(horizon, '7')
    expect(screen.queryByText('Revisão no mês')).toBeNull()
    await userEvent.selectOptions(horizon, 'all')
    expect(screen.getByText('Revisão distante')).toBeInTheDocument()
    expect(api.rescheduleCard).not.toHaveBeenCalled()
  })

  it('agenda aula diretamente sem concluir assunto ou alterar progresso', async () => {
    state.cards = []
    mount()
    await userEvent.selectOptions(await screen.findByLabelText('Assunto para agendar'), 't1')
    await userEvent.click(screen.getByRole('button', { name: 'Agendar revisão para amanhã' }))
    await waitFor(() =>
      expect(api.createCard).toHaveBeenCalledWith({
        kind: 'aula',
        topic_id: 't1',
        front: 'Nome atual',
        due_at: expect.any(String),
      }),
    )
    expect(api.concluirAssunto).not.toHaveBeenCalled()
    expect(api.upsertProgress).not.toHaveBeenCalled()
    expect(await screen.findByText(/O progresso do assunto foi preservado/)).toBeInTheDocument()
  })
})
