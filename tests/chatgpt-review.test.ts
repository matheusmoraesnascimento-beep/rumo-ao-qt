import { describe, expect, it } from 'vitest'
import { buildChatGptReviewScript, reviewNotesText } from '../src/lib/chatgpt-review'

describe('roteiro de revisão manual no ChatGPT', () => {
  it('remove HTML e conteúdo executável mantendo parágrafos e entidades como texto', () => {
    expect(
      reviewNotesText(
        '<p>Processos &amp; threads</p><script>segredo()</script><style>p{color:red}</style><p>CPU<br>Memória</p>',
      ),
    ).toBe('Processos & threads\nCPU\nMemória')
  })
  it('limita o resumo sem fabricar conteúdo e informa ausência de notas', () => {
    expect(reviewNotesText('<p>abcdefghij</p>', 5)).toBe('abcde')
    const script = buildChatGptReviewScript('Redes', '')
    expect(script).toContain('Sem resumo registrado')
    expect(script).toContain('Aguarde minha tentativa')
    expect(script).toContain('não são acertos verificados')
  })
})
