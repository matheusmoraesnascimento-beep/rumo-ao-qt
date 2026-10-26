import type { TopicProgress } from '@/types/db'

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function plainToHtml(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${l.replace(/[&<>"']/g, (c) => ESC[c])}</p>`)
    .join('')
}

export function initialNotesHtml(p: Pick<TopicProgress, 'notes' | 'notes_html'> | undefined): string {
  if (p?.notes_html != null) return p.notes_html
  return plainToHtml(p?.notes ?? '')
}

export function isEmptyNotes(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '') === ''
}

export function validarQuestoes(done: string, correct: string): string | null {
  const d = done.trim()
  const c = correct.trim()
  if (!d && !c) return null
  if (!d) return 'Informe quantas questões foram feitas.'
  if (!/^\d+$/.test(d) || Number(d) < 1) return 'Questões feitas deve ser um inteiro maior que zero.'
  if (!c) return null
  if (!/^\d+$/.test(c)) return 'Acertos deve ser um inteiro maior ou igual a zero.'
  if (Number(c) > Number(d)) return 'Acertos não pode ser maior que questões feitas.'
  return null
}
