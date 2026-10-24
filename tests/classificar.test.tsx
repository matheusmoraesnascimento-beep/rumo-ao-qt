import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const T = vi.hoisted(() => ({
  redes: { id: 't-redes', syllabus_version_id: 'sv', parent_id: null, name: 'Redes de Computadores', slug: 'redes', ordinal: 0, notes: null },
  tcp: { id: 't-tcp', syllabus_version_id: 'sv', parent_id: 't-redes', name: 'TCP', slug: 'redes/tcp', ordinal: 0, notes: null },
  udp: { id: 't-udp', syllabus_version_id: 'sv', parent_id: 't-redes', name: 'UDP', slug: 'redes/udp', ordinal: 1, notes: null },
  seg: { id: 't-seg', syllabus_version_id: 'sv', parent_id: null, name: 'Segurança da Informação', slug: 'seg', ordinal: 1, notes: null },
}))
const Q = (id: string, n: number, body: string | null) => ({
  id, code: `CPT-2026-Q0${n}`, exam_id: 'e26', number: n, source_pdf: 'p.pdf', source_page: 2, source_column: 'left', ocr_body: body, options: [],
  image_path: `${id}.webp`, image_status: null, ocr_status: 'pending_review', has_figure: false, reviewed_at: null, annulled: false, annulled_note: null,
})
const bodies: Record<string, string> = {
  q1: 'No estabelecimento de conexão TCP ocorre o three-way handshake entre cliente e servidor, com controle de congestionamento.',
  q2: 'Texto sem nenhum termo relevante para esta área do conhecimento, apenas palavras comuns aqui.',
}
const api = vi.hoisted(() => ({
  getQuestionsLite: vi.fn(), getExams: vi.fn(), getTopics: vi.fn(), getUserQuestionTopics: vi.fn(),
  getQuestion: vi.fn(), replaceQuestionTopics: vi.fn(), signedUrl: vi.fn(async () => 'https://example.test/q.webp'),
}))
vi.mock('@/lib/api', () => api)
import Classificar from '@/features/questoes/Classificar'

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Classificar /></MemoryRouter></QueryClientProvider>)
const lite = (id: string, n: number) => ({ id, code: `c${n}`, exam_id: 'e26', number: n, ocr_status: 'pending_review', has_figure: false, annulled: false })

beforeEach(() => {
  cleanup(); vi.clearAllMocks()
  api.getQuestionsLite.mockResolvedValue([lite('q1', 1), lite('q2', 2)])
  api.getExams.mockResolvedValue([{ id: 'e26', slug: 's', year: 2026 }])
  api.getTopics.mockResolvedValue([T.redes, T.tcp, T.udp, T.seg])
  api.getUserQuestionTopics.mockResolvedValue([])
  api.getQuestion.mockImplementation(async (id: string) => Q(id, id === 'q1' ? 1 : 2, bodies[id]))
  api.replaceQuestionTopics.mockResolvedValue(undefined)
})

describe('classificação em lote', () => {
  it('sugere pelo texto OCR, abre a macroárea e NÃO grava nada sem confirmação', async () => {
    mount()
    expect(await screen.findByRole('button', { name: /▸ Redes de Computadores/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\+ TCP/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Assuntos de Redes de Computadores' })).toBeInTheDocument()
    expect(api.replaceQuestionTopics).not.toHaveBeenCalled()
  })
  it('clicar na sugestão de folha seleciona; salvar grava só o confirmado e avança', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /\+ TCP/ }))
    expect(screen.getByRole('button', { name: 'TCP', pressed: true })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e próxima' }))
    await waitFor(() => expect(api.replaceQuestionTopics).toHaveBeenCalledWith('q1', ['t-tcp']))
    expect(await screen.findByText('2/2')).toBeInTheDocument()
  })
  it('escolha manual: macroárea + assunto, sem depender de sugestão', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Pular' }))
    expect(await screen.findByText(/Sem sugestão para este texto/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Redes de Computadores', pressed: false }))
    await userEvent.click(screen.getByRole('button', { name: 'UDP' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e próxima' }))
    await waitFor(() => expect(api.replaceQuestionTopics).toHaveBeenCalledWith('q2', ['t-udp']))
  })
  it('Enter salva (atalho) e pular não grava', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /\+ TCP/ }))
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(api.replaceQuestionTopics).toHaveBeenCalledTimes(1))
    await userEvent.keyboard('p')
    expect(api.replaceQuestionTopics).toHaveBeenCalledTimes(1)
  })
  it('carrega a classificação existente e permite remover tudo', async () => {
    api.getUserQuestionTopics.mockResolvedValue([{ question_id: 'q1', topic_id: 't-tcp' }])
    mount()
    await userEvent.click(await screen.findByLabelText(/Só não classificadas/))
    expect(await screen.findByRole('button', { name: 'TCP', pressed: true })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e próxima' }))
    await waitFor(() => expect(api.replaceQuestionTopics).toHaveBeenCalledWith('q1', []))
  })
  it('mostra progresso e fila só com as não classificadas por padrão', async () => {
    api.getUserQuestionTopics.mockResolvedValue([{ question_id: 'q1', topic_id: 't-tcp' }])
    mount()
    expect(await screen.findByText(/1\/2 classificadas · fila atual: 1/)).toBeInTheDocument()
  })
  it('erro ao salvar é mostrado e não avança', async () => {
    api.replaceQuestionTopics.mockRejectedValueOnce(new Error('falha de rede'))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /\+ TCP/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e próxima' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('falha de rede')
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })
})
