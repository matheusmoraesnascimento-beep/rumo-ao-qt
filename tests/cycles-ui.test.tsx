import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ context: {} as Record<string, unknown> }))
const api = vi.hoisted(() => ({ command: vi.fn(), refresh: vi.fn() }))
vi.mock('@/features/ciclos/useCycles', () => ({ useCycles: () => state.context }))
vi.mock('@/features/ciclos/api', () => ({
  cycleCommand: api.command,
  useRefreshCycles: () => api.refresh,
  useIdempotentCommand: () => api.command,
}))

import GuidedSession from '@/features/ciclos/GuidedSession'
import CycleToday from '@/features/ciclos/CycleToday'

const topic = { id: 'topic-a', name: 'Processos', syllabus_version_id: 'version', parent_id: null }
const item = {
  id: 'item-a',
  plan_id: 'plan',
  topic_id: topic.id,
  ordinal: 0,
  budget_minutes: 90,
  manual_weight: 1,
  paused: false,
  skipped_on: null,
}
const session = {
  id: 'session-a',
  plan_id: 'plan',
  item_id: item.id,
  topic_id: topic.id,
  passage_number: 1,
  state: 'paused',
  elapsed_seconds: 3300,
  resumed_at: null,
}
const plan = {
  id: 'plan',
  syllabus_version_id: 'version',
  current_item_id: item.id,
  revision: 7,
  passage_number: 1,
  preferences: {},
  exceptions: {},
}

function mount(Component: typeof GuidedSession | typeof CycleToday) {
  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cleanup()
  api.command.mockReset().mockResolvedValue({})
  api.refresh.mockReset().mockResolvedValue(undefined)
  state.context = {
    plan,
    items: [item],
    topics: [topic],
    leaves: [topic],
    running: session,
    next: item,
    stages: [],
    attempts: [],
    sessions: [],
    cards: [],
    uqt: [],
    blocked: [],
    questions: [],
    localDate: '2026-11-03',
    loading: false,
    cycleLoading: false,
    error: null,
    cycleError: null,
    cycleData: { available: true, sessions: [session] },
    versions: { data: [{ id: 'version', label: '2026 (referência provisória)' }] },
    settings: {
      daily_review_cap: 20,
      goal_correct: 40,
      baseline_2026: 21,
      exam_date: null,
      weekly_availability: { mon: 120, tue: 120, wed: 120, thu: 120, fri: 120, sat: 0, sun: 0 },
    },
  }
})

describe('sessão guiada: persistência confirmada e conclusão explícita', () => {
  it('reenvia falha com a mesma chave sem mostrar sucesso antes de salvar', async () => {
    api.command.mockRejectedValueOnce(new Error('sem rede'))
    mount(GuidedSession)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão parcial' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu registro não foi confirmado')
    expect(screen.queryByText(/Sessão salva/)).toBeNull()
    expect(api.refresh).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão parcial' }))
    await waitFor(() => expect(api.command).toHaveBeenCalledTimes(2))
    expect(api.command.mock.calls[1][2]).toBe(api.command.mock.calls[0][2])
    expect(api.command.mock.calls[1][1]).toEqual(api.command.mock.calls[0][1])
    expect(await screen.findByRole('status')).toHaveTextContent('Sessão salva')
    expect(api.refresh).toHaveBeenCalledTimes(1)
  })

  it('sessão parcial registra conteúdo e dificuldade sem concluir passagem nem exigir checklist', async () => {
    mount(GuidedSession)
    expect(screen.getByLabelText('Tempo líquido da sessão')).toHaveTextContent('00:55:00')
    await userEvent.type(
      screen.getByLabelText('Conteúdo estudado, dúvidas e próxima ação'),
      'Faltam sincronização e exercícios.',
    )
    expect(
      screen.getByRole('button', { name: 'Finalizar e concluir passagem do assunto' }),
    ).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão parcial' }))
    expect(api.command).toHaveBeenCalledWith(
      'finish',
      expect.objectContaining({
        plan_id: 'plan',
        item_id: 'item-a',
        session_id: 'session-a',
        complete: false,
        notes: 'Faltam sincronização e exercícios.',
        difficulty: 2,
      }),
      expect.any(String),
    )
    expect(api.command.mock.calls[0][1]).not.toHaveProperty('checklist')
  })

  it('tempo sozinho não habilita conclusão; exige checklist e evidência nas notas', async () => {
    mount(GuidedSession)
    const finish = screen.getByRole('button', { name: 'Finalizar e concluir passagem do assunto' })
    expect(finish).toBeDisabled()
    await userEvent.click(
      screen.getByLabelText('Confirmei os objetivos e o conteúdo desta passagem.'),
    )
    await userEvent.click(
      screen.getByLabelText('Registrei minha compreensão, dificuldades e próxima ação nas notas.'),
    )
    expect(finish).toBeDisabled()
    await userEvent.type(
      screen.getByLabelText('Conteúdo estudado, dúvidas e próxima ação'),
      'Expliquei processos e threads. Rever condições de corrida.',
    )
    expect(finish).toBeEnabled()
    await userEvent.click(finish)
    expect(api.command).toHaveBeenCalledWith(
      'finish',
      expect.objectContaining({
        complete: true,
        checklist: { covered: true, assessed: true, practice: false },
      }),
      expect.any(String),
    )
  })

  it('segunda passagem exige também prática explícita para concluir', async () => {
    state.context.plan = { ...plan, passage_number: 2 }
    state.context.running = { ...session, passage_number: 2 }
    mount(GuidedSession)
    await userEvent.type(
      screen.getByLabelText('Conteúdo estudado, dúvidas e próxima ação'),
      'Exercícios autorais de escalonamento resolvidos e conferidos.',
    )
    await userEvent.click(
      screen.getByLabelText('Confirmei os objetivos e o conteúdo desta passagem.'),
    )
    await userEvent.click(
      screen.getByLabelText('Registrei minha compreensão, dificuldades e próxima ação nas notas.'),
    )
    const finish = screen.getByRole('button', { name: 'Finalizar e concluir passagem do assunto' })
    expect(finish).toBeDisabled()
    await userEvent.click(
      screen.getByLabelText(
        'Realizei exercícios/questões ou consolidação e registrei a evidência nas notas.',
      ),
    )
    expect(finish).toBeEnabled()
  })

  it('bloqueia ações enquanto o servidor não confirma uma gravação', async () => {
    let confirm!: (value: object) => void
    api.command.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          confirm = resolve
        }),
    )
    mount(GuidedSession)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão parcial' }))
    expect(screen.getByRole('button', { name: 'Salvar sessão parcial' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeDisabled()
    expect(screen.queryByRole('status')).toBeNull()
    confirm({})
    expect(await screen.findByRole('status')).toHaveTextContent('Sessão salva')
  })
})

describe('Hoje: orientação a partir dos dados reais', () => {
  it('dia de zero minutos preserva cursor e mostra fila guardada', async () => {
    state.context.running = undefined
    mount(CycleToday)
    await userEvent.click(screen.getByRole('button', { name: '0 min' }))
    expect(
      screen.getByText(
        'Sem estudo planejado hoje. A fila fica guardada e o cursor continua no mesmo lugar.',
      ),
    ).toBeInTheDocument()
    expect(api.command).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Iniciar sessão guiada' })).toHaveAttribute(
      'href',
      '/sessao?item=item-a',
    )
  })

  it('banco sem migration mantém prévia e acesso ao histórico', () => {
    state.context.plan = undefined
    state.context.cycleData = { available: false }
    mount(CycleToday)
    expect(screen.getByText(/A atualização do banco ainda não foi aplicada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pré-visualizar meu plano' })).toHaveAttribute(
      'href',
      '/plano',
    )
    expect(screen.getByRole('link', { name: 'Continuar no edital' })).toHaveAttribute(
      'href',
      '/edital',
    )
  })
})
