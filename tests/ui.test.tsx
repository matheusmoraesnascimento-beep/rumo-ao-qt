import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => {
  const ids = Array.from({ length: 50 }, (_, i) => `q${i + 1}`)
  return { ids, api: {} as Record<string, ReturnType<typeof vi.fn>> }
})

vi.mock('@/lib/api', () => {
  const f = (v: unknown) => vi.fn(async () => v)
  const api = {
    getSettings: f({ user_id: 'u', goal_correct: 40, baseline_2026: 21, exam_date: null, daily_review_cap: 20, weekly_availability: { mon: 120, tue: 120, wed: 120, thu: 120, fri: 120, sat: 0, sun: 0 }, writing_cadence: 'auto', include_writing: true, min_new_topic_share: 0.2, theme: 'system' }),
    getTopics: f([]), getProgress: f([]), getCards: f([]), getAttempts: f([]), getUserQuestionTopics: f([]), getSessions: f([]),
    getBlockedDays: f([]), getSubmissions: f([]), getQuestionsLite: f([]), getSimulations: f([]), getSimAttempts: f([]),
    getExams: f([{ id: 'e26', slug: 'cpt-2026', year: 2026 }]),
    signedUrl: f('https://example.test/img.webp'),
    getSimulation: f({ id: 's1', user_id: 'u', mode: 'year', exam_id: 'e26', seed: null, question_ids: mocks.ids, marked: [], started_at: '2025-03-10T10:00:00Z', finished_at: null, time_limit_seconds: null, elapsed_seconds: 120, duration_seconds: null, status: 'em_andamento' }),
    getQuestionsByIds: f(mocks.ids.map((id, i) => ({ id, code: `CPT-2026-Q${String(i + 1).padStart(2, '0')}`, exam_id: 'e26', number: i + 1, source_pdf: 'p.pdf', source_page: 2, source_column: 'left', ocr_body: 'texto ocr', options: [], image_path: `${id}.webp`, image_status: null, ocr_status: 'pending_review', has_figure: false, reviewed_at: null }))),
    upsertSimAttempt: f(undefined), patchSimulation: f(undefined),
    updateSubmission: f(undefined), createSubmission: f(undefined), getPrompts: f([]), getAllFeedback: f([]), getFeedback: f([]),
  }
  mocks.api = api
  return api
})

import { QuestionView } from '@/features/questoes/QuestionView'
import { AnswerPanel } from '@/features/questoes/AnswerPanel'
import Dashboard from '@/features/dashboard/Dashboard'
import SimuladoRun from '@/features/simulados/SimuladoRun'
import type { Question } from '@/types/db'

const wrap = (ui: ReactNode, route = '/') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter></QueryClientProvider>)
}
const Q: Question = { id: 'q1', code: 'CPT-2026-Q01', exam_id: 'e26', number: 1, source_pdf: 'p.pdf', source_page: 2, source_column: 'left', ocr_body: 'Enunciado OCR', options: [], image_path: 'q1.webp', image_status: null, ocr_status: 'pending_review', has_figure: true, reviewed_at: null, annulled: false, annulled_note: null }

beforeEach(() => cleanup())

describe('questão: fidelidade e gabarito só após responder', () => {
  it('mostra imagem original por padrão e avisa que o gabarito vem após responder', async () => {
    wrap(<QuestionView q={Q} exam={2026} />)
    expect(screen.getByText('Gabarito após responder')).toBeInTheDocument()
    expect(screen.queryByText(/ANULADA/)).not.toBeInTheDocument()
    expect(screen.getByText('OCR não revisado')).toBeInTheDocument()
    const img = await screen.findByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.test/img.webp')
    expect(screen.queryByText('Enunciado OCR')).not.toBeInTheDocument()
  })
  it('texto OCR não revisado aparece só sob demanda, com aviso', async () => {
    wrap(<QuestionView q={Q} />)
    await userEvent.click(screen.getByRole('button', { name: /texto \(ocr\)/i }))
    expect(screen.getByText('Enunciado OCR')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/imagem original prevalece/i)
  })
  it('sem recorte disponível: avisa e não inventa conteúdo', async () => {
    mocks.api.signedUrl.mockRejectedValue(new Error('Object not found'))
    wrap(<QuestionView q={{ ...Q, ocr_body: null, ocr_status: 'needs_manual_transcription' }} />)
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(/indisponível/i)
    expect(screen.getByRole('button', { name: /texto \(ocr\)/i })).toBeDisabled()
    mocks.api.signedUrl.mockResolvedValue('https://example.test/img.webp')
  })
  it('painel de resposta: autoavaliação rotulada como autodeclarada e sem "correta"', async () => {
    const onChange = vi.fn()
    render(<AnswerPanel value={{ selected: null, selfGrade: null, confidence: null }} onChange={onChange} />)
    expect(screen.getByText(/autodeclarada/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Alternativa C' }))
    expect(onChange).toHaveBeenCalledWith({ selected: 'C', selfGrade: null, confidence: null })
    expect(screen.queryByText(/resposta correta|gabarito oficial/i)).not.toBeInTheDocument()
  })
})

describe('dashboard', () => {
  it('21/50 aparece só como base declarada; prova "a confirmar"; sem simulado não há gráfico de resultado', async () => {
    wrap(<Dashboard />)
    expect(await screen.findByText('Base 2026 (declarada)')).toBeInTheDocument()
    expect(screen.getByText('21/50')).toBeInTheDocument()
    expect(screen.getByText('a confirmar')).toBeInTheDocument()
    expect(screen.getByText(/base histórica declarada/i)).toBeInTheDocument()
    for (const t of ['Estudar 25 minutos', 'Revisar agora (0)', 'Resolver questões']) expect(screen.getByText(t)).toBeInTheDocument()
  })
})

describe('simulado: retomada após refresh', () => {
  it('hidrata resposta, tempo e contagem a partir do banco', async () => {
    mocks.api.getSimAttempts.mockResolvedValueOnce([{ id: 'a', user_id: 'u', question_id: 'q1', simulation_id: 's1', selected_option: 'B', time_seconds: 10, confidence: 3, self_grade: null, created_at: '2025-03-10T10:01:00Z' }])
    wrap(<Routes><Route path="/simulados/:id" element={<SimuladoRun />} /></Routes>, '/simulados/s1')
    expect(await screen.findByText(/1\/50 respondidas/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Alternativa B' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Tempo')).toHaveTextContent(/00:02:0\d/)
  })
  it('responder persiste imediatamente (upsert) e mostra "salvo"', async () => {
    wrap(<Routes><Route path="/simulados/:id" element={<SimuladoRun />} /></Routes>, '/simulados/s1')
    await userEvent.click(await screen.findByRole('radio', { name: 'Alternativa D' }))
    await waitFor(() => expect(mocks.api.upsertSimAttempt).toHaveBeenCalledWith(expect.objectContaining({ simulation_id: 's1', question_id: 'q1', selected_option: 'D' })))
    expect(await screen.findByText('salvo')).toBeInTheDocument()
  })
  it('finalizar exige passar pela tela de revisão', async () => {
    wrap(<Routes><Route path="/simulados/:id" element={<SimuladoRun />} /></Routes>, '/simulados/s1')
    await userEvent.click(await screen.findByRole('button', { name: /revisar e finalizar/i }))
    expect(screen.getByText(/Revisão antes de finalizar/)).toBeInTheDocument()
    expect(screen.getByText(/Em branco:/)).toBeInTheDocument()
    expect(mocks.api.patchSimulation).not.toHaveBeenCalledWith('s1', expect.objectContaining({ status: 'finalizado' }))
  })
})

void fireEvent
