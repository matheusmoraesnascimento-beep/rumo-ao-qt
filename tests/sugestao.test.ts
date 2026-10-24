import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { flattenSyllabus } from '../src/data/edital2026'
import { detUuid } from '../src/lib/ids'
import { KEYWORD_DEFS, normalize, suggestTopics } from '../src/lib/sugestao'
import type { Topic } from '../src/types/db'

const flat = flattenSyllabus()
const topics: Topic[] = flat.map((t) => ({
  id: detUuid(`t:${t.slug}`), syllabus_version_id: 'sv', parent_id: t.parentSlug ? detUuid(`t:${t.parentSlug}`) : null,
  name: t.name, slug: t.slug, ordinal: t.ordinal, notes: null,
}))

describe('dicionário de sugestões x edital', () => {
  it('toda macroárea e toda folha citadas existem no edital (e a folha é única na macro)', () => {
    const byMacro = (m: string) => flat.filter((t) => t.macroSlug === flat.find((x) => x.name === m && x.depth === 0)!.slug)
    for (const def of KEYWORD_DEFS) {
      expect(flat.some((t) => t.depth === 0 && t.name === def.macro), `macro ${def.macro}`).toBe(true)
      const nodes = byMacro(def.macro)
      const hasChild = new Set(nodes.map((n) => n.parentSlug))
      for (const leaf of Object.keys(def.leaves ?? {})) {
        const m = nodes.filter((n) => n.name === leaf && !hasChild.has(n.slug))
        expect(m.length, `${def.macro} > ${leaf}`).toBe(1)
      }
    }
  })
  it('normaliza acentos e caixa', () => expect(normalize('Árvore BINÁRIA')).toBe('arvore binaria'))
})

describe('sugestão por palavras-chave', () => {
  it('texto curto/vazio não sugere nada', () => {
    expect(suggestTopics('', topics)).toEqual([])
    expect(suggestTopics('abc', topics)).toEqual([])
  })
  it('PMO → Gerência de Projetos, com termos que justificam', () => {
    const s = suggestTopics('De acordo com Heldman (2009), sobre o escritório de gerenciamento de projetos (Project Management Office - PMO), analise as afirmativas sobre estrutura organizacional', topics)
    expect(s[0].name).toMatch(/Gerência de Projetos|Estruturas organizacionais/)
    expect(s[0].hits.length).toBeGreaterThan(0)
  })
  it('termo curto não casa dentro de outra palavra ("ip" em "tipo")', () => {
    const s = suggestTopics('Qual é o tipo de variável utilizado para armazenar números inteiros neste trecho de código?', topics)
    expect(s.find((x) => x.name === 'Redes de Computadores')).toBeUndefined()
  })
  it('TCP/handshake sugere folha TCP dentro de Redes', () => {
    const s = suggestTopics('No estabelecimento de conexão TCP ocorre o three-way handshake entre cliente e servidor', topics)
    expect(s.map((x) => x.name)).toEqual(expect.arrayContaining(['Redes de Computadores', 'TCP']))
  })
})

const dataFile = path.resolve(import.meta.dirname, '../dados/questoes_2022_2026.json')
describe.skipIf(!existsSync(dataFile))('cobertura nas 250 questões reais (informativo)', () => {
  it('a maioria recebe ao menos uma sugestão de macroárea', () => {
    const qs = JSON.parse(readFileSync(dataFile, 'utf8')) as { id: string; ocr_text: string }[]
    const comSugestao = qs.filter((q) => suggestTopics(q.ocr_text, topics).some((s) => s.kind === 'macro')).length
    console.log(`sugestão de macroárea em ${comSugestao}/${qs.length} questões`)
    expect(comSugestao / qs.length).toBeGreaterThan(0.6)
  })
})
