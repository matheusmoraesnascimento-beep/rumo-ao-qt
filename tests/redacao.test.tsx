import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const sub = vi.hoisted(() => ({
  id: 's1', user_id: 'u', essay_id: 'e1', prompt_id: 'p1', plan: {}, draft: 'Texto inicial', word_count: 2,
  writing_seconds: 0, version: 1, status: 'rascunho', created_at: '2025-03-10T10:00:00Z', updated_at: '2025-03-10T10:00:00Z',
}))
const api = vi.hoisted(() => ({
  getSubmissions: vi.fn(async () => [sub]),
  getPrompts: vi.fn(async () => [{ id: 'p1', owner_id: null, origin: 'autoral', title: 'Amazônia Azul', prompt_text: 'Tema de treino', official: false }]),
  getAllFeedback: vi.fn(async () => []), getFeedback: vi.fn(async () => []),
  getSettings: vi.fn(async () => ({ writing_cadence: 'auto' })),
  updateSubmission: vi.fn(async () => undefined),
  createSubmission: vi.fn(async () => ({ ...sub, id: 's2', version: 2 })),
  addPrompt: vi.fn(), addFeedback: vi.fn(), uploadAttachment: vi.fn(),
}))
vi.mock('@/lib/api', () => api)

import Redacao from '@/features/redacao/Redacao'

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Redacao /></MemoryRouter></QueryClientProvider>)
beforeEach(() => { cleanup(); vi.clearAllMocks() })

describe('Oficina de redação', () => {
  it('deixa claro que temas são autorais/não oficiais e rubrica não é nota oficial', async () => {
    mount()
    expect(await screen.findByText(/autorais e não oficiais/i)).toBeInTheDocument()
    expect(screen.getByText(/não existe nota oficial/i)).toBeInTheDocument()
  })
  it('rascunho é persistido automaticamente (debounce) com contagem de palavras', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir' }))
    const area = await screen.findByLabelText('Texto da redação')
    await userEvent.clear(area)
    await userEvent.type(area, 'uma duas três')
    await waitFor(() => expect(api.updateSubmission).toHaveBeenCalledWith('s1', expect.objectContaining({ draft: 'uma duas três', word_count: 3 })), { timeout: 4000 })
    expect(await screen.findByText('rascunho salvo')).toBeInTheDocument()
  })
  it('"salvar como versão" fecha a versão atual e cria a v2 com o mesmo essay_id', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir' }))
    await userEvent.click(await screen.findByRole('button', { name: /salvar como versão/i }))
    await waitFor(() => expect(api.createSubmission).toHaveBeenCalledWith(expect.objectContaining({ essay_id: 'e1', version: 2 })))
    expect(api.updateSubmission).toHaveBeenCalledWith('s1', expect.objectContaining({ status: 'finalizada' }))
  })
})
