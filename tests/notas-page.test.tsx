import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const topics = vi.hoisted(() => [
  { id: 'pai', syllabus_version_id: 'v', parent_id: null, name: 'Pai', slug: 'pai', ordinal: 0 },
  { id: 'folha', syllabus_version_id: 'v', parent_id: 'pai', name: 'Redes', slug: 'redes', ordinal: 0 },
])
const state = vi.hoisted(() => ({ progress: [] as unknown[] }))
const api = vi.hoisted(() => ({
  getTopics: vi.fn(async () => topics),
  getProgress: vi.fn(async () => state.progress),
  upsertProgress: vi.fn(async () => undefined),
  saveNotesHtml: vi.fn(async () => undefined),
  concluirAssunto: vi.fn(async () => ({ id: 'c1' })),
}))
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), ...api }))
vi.mock('@/features/edital/NotasEditor', () => ({
  NotasEditor: ({ initialHtml, onChange, ariaLabel }: { initialHtml: string; onChange: (h: string) => void; ariaLabel: string }) => (
    <textarea aria-label={ariaLabel} defaultValue={initialHtml} onChange={(e) => onChange(e.target.value)} />
  ),
}))

import NotasPage from '@/features/edital/NotasPage'

const Where = () => <p data-testid="loc">{useLocation().pathname}</p>
const mount = (id: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/edital/${id}`]}>
        <Routes>
          <Route path="/edital/:topicId" element={<NotasPage />} />
          <Route path="/edital" element={<p>lista do edital</p>} />
          <Route path="/revisoes" element={<p>tela de revisões</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  state.progress = []
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('NotasPage', () => {
  it('nota antiga em texto puro aparece literal, sem virar HTML', async () => {
    state.progress = [{ user_id: 'u', topic_id: 'folha', status: 'estudando', confidence: 1, notes: 'linha <b>', notes_html: null, first_studied_at: null, last_studied_at: null }]
    mount('folha')
    const box = await screen.findByLabelText(/resumo/i)
    expect(box).toHaveValue('<p>linha &lt;b&gt;</p>')
  })

  it('id inexistente e assunto pai redirecionam para /edital', async () => {
    mount('nada')
    expect(await screen.findByText('lista do edital')).toBeInTheDocument()
    cleanup()
    mount('pai')
    expect(await screen.findByText('lista do edital')).toBeInTheDocument()
  })

  it('salva após debounce e indica "salvo"; falha indica "não salvo" e mantém o texto', async () => {
    mount('folha')
    const box = await screen.findByLabelText(/resumo/i)
    await userEvent.type(box, 'abc')
    await waitFor(() => expect(api.saveNotesHtml).toHaveBeenCalledWith('folha', 'abc'), { timeout: 4000 })
    expect(await screen.findByText(/salvo/i, { selector: '[data-testid="autosave"]' })).toBeInTheDocument()

    api.saveNotesHtml.mockRejectedValueOnce(new Error('offline'))
    await userEvent.type(box, 'd')
    expect(await screen.findByText(/não salvo/i, undefined, { timeout: 4000 })).toBeInTheDocument()
    expect(box).toHaveValue('abcd')
  })

  it('concluir com resumo vazio pede confirmação; recusar não chama nada', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount('folha')
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir assunto' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.concluirAssunto).not.toHaveBeenCalled()
  })

  it('diálogo valida questões e conclui indo para /revisoes', async () => {
    state.progress = [{ user_id: 'u', topic_id: 'folha', status: 'estudando', confidence: 1, notes: null, notes_html: '<p>x</p>', first_studied_at: null, last_studied_at: null }]
    mount('folha')
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir assunto' }))
    const feitas = await screen.findByLabelText('Questões feitas')
    const acertos = screen.getByLabelText('Acertos')
    const enviar = screen.getByRole('button', { name: 'Salvar e ir para revisões' })

    await userEvent.type(feitas, '3')
    await userEvent.type(acertos, '5')
    await userEvent.click(enviar)
    expect(await screen.findByRole('alert')).toHaveTextContent(/acertos/i)
    expect(api.concluirAssunto).not.toHaveBeenCalled()

    await userEvent.clear(feitas)
    await userEvent.clear(acertos)
    await userEvent.type(feitas, '10')
    await userEvent.type(acertos, '7')
    await userEvent.click(enviar)
    await waitFor(() => expect(api.concluirAssunto).toHaveBeenCalledWith({ topicId: 'folha', done: 10, correct: 7 }))
    expect(await screen.findByText('tela de revisões')).toBeInTheDocument()
  })

  it('campos vazios concluem sem questões; duplo clique chama uma vez', async () => {
    state.progress = [{ user_id: 'u', topic_id: 'folha', status: 'estudando', confidence: 1, notes: null, notes_html: '<p>x</p>', first_studied_at: null, last_studied_at: null }]
    api.concluirAssunto.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r({ id: 'c1' }), 100)))
    mount('folha')
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir assunto' }))
    const enviar = await screen.findByRole('button', { name: 'Salvar e ir para revisões' })
    await userEvent.dblClick(enviar)
    await waitFor(() => expect(api.concluirAssunto).toHaveBeenCalledTimes(1))
    expect(api.concluirAssunto).toHaveBeenCalledWith({ topicId: 'folha' })
  })
})
