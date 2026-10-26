import { describe, expect, it } from 'vitest'
import { initialNotesHtml, isEmptyNotes, plainToHtml, validarQuestoes } from '@/lib/notas'

describe('plainToHtml', () => {
  it('escapa HTML', () => {
    const h = plainToHtml('a <script>alert(1)</script> & b')
    expect(h).not.toContain('<script>')
    expect(h).toContain('&lt;script&gt;')
    expect(h).toContain('&amp;')
  })
  it('uma <p> por linha não vazia', () => {
    expect(plainToHtml('a\n\nb')).toBe('<p>a</p><p>b</p>')
  })
  it('vazio vira vazio', () => {
    expect(plainToHtml('')).toBe('')
    expect(plainToHtml(' \n ')).toBe('')
  })
})

describe('initialNotesHtml', () => {
  it('prefere notes_html, mesmo vazio', () => {
    expect(initialNotesHtml({ notes: 'x', notes_html: '' })).toBe('')
    expect(initialNotesHtml({ notes: 'x', notes_html: '<p>y</p>' })).toBe('<p>y</p>')
  })
  it('cai para notes legado escapado', () => {
    expect(initialNotesHtml({ notes: 'x', notes_html: null })).toBe('<p>x</p>')
    expect(initialNotesHtml(undefined)).toBe('')
  })
})

describe('isEmptyNotes', () => {
  it('detecta vazio', () => {
    expect(isEmptyNotes('')).toBe(true)
    expect(isEmptyNotes('<p></p>')).toBe(true)
    expect(isEmptyNotes('<p> </p>')).toBe(true)
    expect(isEmptyNotes('<p>oi</p>')).toBe(false)
  })
})

describe('validarQuestoes', () => {
  it('aceita combinações válidas', () => {
    expect(validarQuestoes('', '')).toBeNull()
    expect(validarQuestoes('10', '7')).toBeNull()
    expect(validarQuestoes('10', '')).toBeNull()
    expect(validarQuestoes('10', '0')).toBeNull()
  })
  it('rejeita inválidas', () => {
    expect(validarQuestoes('', '5')).toBeTruthy()
    expect(validarQuestoes('3', '5')).toBeTruthy()
    expect(validarQuestoes('0', '')).toBeTruthy()
    expect(validarQuestoes('2.5', '')).toBeTruthy()
    expect(validarQuestoes('10', '-1')).toBeTruthy()
  })
})
