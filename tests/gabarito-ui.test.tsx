import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const base = vi.hoisted(() => ({
  id: 'q1', code: 'CPT-2026-Q01', exam_id: 'e26', number: 1, source_pdf: 'p.pdf', source_page: 2, source_column: 'left',
  ocr_body: 'texto', options: [], image_path: 'q1.webp', image_status: null, ocr_status: 'pending_review', has_figure: false,
  reviewed_at: null, annulled: false, annulled_note: null,
}))
const ids = vi.hoisted(() => Array.from({ length: 50 }, (_, i) => `q${i + 1}`))
const api = vi.hoisted(() => ({
  getQuestion: vi.fn(),
  addAttempt: vi.fn(),
  revealAnswer: vi.fn(),
  getExams: vi.fn(async () => [{ id: 'e26', slug: 'cpt-2026', year: 2026 }]),
  getFlags: vi.fn(async () => []), getTopics: vi.fn(async () => []), getUserQuestionTopics: vi.fn(async () => []),
  signedUrl: vi.fn(async () => 'https://example.test/q.webp'),
  setFlag: vi.fn(), setUserQuestionTopic: vi.fn(), reportQuestion: vi.fn(), createCard: vi.fn(),
  getSimulation: vi.fn(), getQuestionsByIds: vi.fn(), getSimAttempts: vi.fn(), simulationReview: vi.fn(),
  patchSimulation: vi.fn(), upsertSimAttempt: vi.fn(), finalizeSimulation: vi.fn(),
}))
vi.mock('@/lib/api', () => api)

import QuestaoPage from '@/features/questoes/QuestaoPage'
import SimuladoRun from '@/features/simulados/SimuladoRun'

const wrap = (ui: ReactNode, route: string) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter></QueryClientProvider>)
const page = () => wrap(<Routes><Route path="/questoes/:id" element={<QuestaoPage />} /></Routes>, '/questoes/q1')

beforeEach(() => { cleanup(); vi.clearAllMocks(); api.getQuestion.mockResolvedValue(base) })

describe('questão avulsa: gabarito oficial só depois de responder', () => {
  it('antes de salvar não há gabarito na tela e o servidor não é consultado', async () => {
    page()
    await screen.findByRole('radio', { name: 'Alternativa A' })
    expect(screen.queryByText(/Gabarito oficial:/)).not.toBeInTheDocument()
    expect(api.revealAnswer).not.toHaveBeenCalled()
  })
  it('acerto verificado: mostra gabarito, alternativa marcada e ACERTOU', async () => {
    api.addAttempt.mockResolvedValue({ is_correct: true, key_status: 'valida' })
    api.revealAnswer.mockResolvedValue({ correct_option: 'D', status: 'valida', note: null })
    page()
    await userEvent.click(await screen.findByRole('radio', { name: 'Alternativa D' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar resposta' }))
    expect(await screen.findByText(/Gabarito oficial:/)).toHaveTextContent('Gabarito oficial: D — você marcou D: ACERTOU')
    expect(api.revealAnswer).toHaveBeenCalledWith('q1')
  })
  it('erro verificado: ERROU e oferece card de revisão do erro', async () => {
    api.addAttempt.mockResolvedValue({ is_correct: false, key_status: 'valida' })
    api.revealAnswer.mockResolvedValue({ correct_option: 'D', status: 'valida', note: null })
    page()
    await userEvent.click(await screen.findByRole('radio', { name: 'Alternativa B' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar resposta' }))
    expect(await screen.findByText(/ERROU/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /card de revisão do erro/i })).toBeInTheDocument()
  })
  it('gabarito alterado após recursos é sinalizado', async () => {
    api.addAttempt.mockResolvedValue({ is_correct: true, key_status: 'alterada' })
    api.revealAnswer.mockResolvedValue({ correct_option: 'E', status: 'alterada', note: 'x' })
    page()
    await userEvent.click(await screen.findByRole('radio', { name: 'Alternativa E' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar resposta' }))
    expect(await screen.findByText(/alterado após recursos/i)).toBeInTheDocument()
  })
})

describe('questão ANULADA: marcada, não removida, sem contar', () => {
  beforeEach(() => api.getQuestion.mockResolvedValue({ ...base, annulled: true }))
  it('mostra a marcação e o aviso antes mesmo de responder', async () => {
    page()
    expect(await screen.findByText('ANULADA pela banca')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/anulada.*não conta como acerto nem como erro/i)
  })
  it('depois de responder: "ANULADA", sem ACERTOU/ERROU e sem card de erro', async () => {
    api.addAttempt.mockResolvedValue({ is_correct: null, key_status: 'anulada' })
    api.revealAnswer.mockResolvedValue({ correct_option: null, status: 'anulada', note: 'x' })
    page()
    await userEvent.click(await screen.findByRole('radio', { name: 'Alternativa A' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar resposta' }))
    expect(await screen.findByText(/Questão ANULADA/)).toBeInTheDocument()
    expect(screen.queryByText(/ACERTOU|ERROU/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /card de revisão do erro/i })).not.toBeInTheDocument()
  })
})

describe('simulado finalizado: conferência oficial', () => {
  const finished = { id: 's1', user_id: 'u', mode: 'year', exam_id: 'e26', seed: null, question_ids: ids, marked: [], started_at: '2025-03-10T10:00:00Z', finished_at: '2025-03-10T13:00:00Z', time_limit_seconds: null, elapsed_seconds: 3600, duration_seconds: 3600, status: 'finalizado' }
  const qs = ids.map((id, i) => ({ ...base, id, code: `CPT-2026-Q${String(i + 1).padStart(2, '0')}`, number: i + 1, annulled: i === 2 }))
  const att = (q: string, sel: string, ok: boolean | null, ks: string) => ({ id: q, user_id: 'u', question_id: q, simulation_id: 's1', selected_option: sel, time_seconds: 1, confidence: null, self_grade: null, created_at: '2025-03-10T10:00:00Z', is_correct: ok, key_status: ks })
  beforeEach(() => {
    api.getSimulation.mockResolvedValue(finished)
    api.getQuestionsByIds.mockResolvedValue(qs)
    api.getSimAttempts.mockResolvedValue([att('q1', 'D', true, 'valida'), att('q2', 'B', false, 'valida'), att('q3', 'A', null, 'anulada')])
    api.simulationReview.mockResolvedValue([
      { question_id: 'q1', correct_option: 'D', status: 'valida', note: null },
      { question_id: 'q2', correct_option: 'A', status: 'valida', note: null },
      { question_id: 'q3', correct_option: null, status: 'anulada', note: null },
    ])
  })
  it('placar oficial exclui a anulada do total e lista a conferência', async () => {
    wrap(<Routes><Route path="/simulados/:id" element={<SimuladoRun />} /></Routes>, '/simulados/s1')
    expect(await screen.findByText('Acertos (gabarito oficial)')).toBeInTheDocument()
    expect(screen.getByText('1/49')).toBeInTheDocument()
    expect(screen.getByText(/1 anulada\(s\) fora da conta/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('certa')).toBeInTheDocument())
    expect(screen.getByText('errada')).toBeInTheDocument()
    expect(screen.getByText('ANULADA')).toBeInTheDocument()
    expect(screen.getByText(/não é a nota oficial do concurso/i)).toBeInTheDocument()
  })
})
