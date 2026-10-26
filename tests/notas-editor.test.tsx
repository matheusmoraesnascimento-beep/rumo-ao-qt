import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotasEditor } from '@/features/edital/NotasEditor'
import { NotasLeitura } from '@/features/edital/NotasLeitura'

describe('NotasLeitura', () => {
  it('preserva parágrafo, tabela e destaque', async () => {
    const { container } = render(
      <NotasLeitura html="<p>oi</p><table><tbody><tr><td><p>cel</p></td></tr></tbody></table><p><mark>x</mark></p>" />,
    )
    await waitFor(() => expect(screen.getByText('oi')).toBeInTheDocument())
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelector('mark')).not.toBeNull()
  })

  it('não injeta <script>', async () => {
    const { container } = render(<NotasLeitura html="<script>alert(1)</script><p>ok</p>" />)
    await waitFor(() => expect(screen.getByText('ok')).toBeInTheDocument())
    expect(container.querySelector('script')).toBeNull()
  })
})

describe('NotasEditor', () => {
  it('mostra a toolbar, alterna Negrito e emite HTML ao inserir tabela', async () => {
    const onChange = vi.fn()
    render(<NotasEditor initialHtml="<p>oi</p>" onChange={onChange} ariaLabel="Resumo" />)
    const negrito = await screen.findByRole('button', { name: 'Negrito' })
    await screen.findByRole('textbox', { name: 'Resumo' })
    expect(negrito).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(negrito)
    expect(negrito).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Tabela' }))
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('<table')))
  })
})
