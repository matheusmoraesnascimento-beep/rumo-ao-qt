/**
 * Extração dos gabaritos OFICIAIS (PDFs do SSPM) da disciplina Informática.
 * Cada PDF traz DUAS colunas de cor (ex.: AMARELA | ROSA). Usa-se SOMENTE a coluna da cor do
 * caderno que o usuário possui; qualquer ambiguidade derruba a extração (nunca "chuta").
 */
export type KeyStatus = 'valida' | 'anulada' | 'alterada'

export interface KeyEntry {
  number: number
  answer: 'A' | 'B' | 'C' | 'D' | 'E' | null // null => anulada
  status: KeyStatus
  note?: string
}

/** Cor do caderno que o usuário tem, por ano (confirmada na capa/rodapé de cada prova). */
export const CADERNO_COR: Record<number, string> = { 2022: 'AMARELA', 2023: 'AMARELA', 2024: 'AMARELA', 2025: 'AMARELA', 2026: 'ROSA' }
export const GABARITO_PDF: Record<number, string> = {
  2022: 'CP-T-2022_FINAL.pdf',
  2023: 'GabFINAL_CPT_2023.pdf',
  2024: 'GabFinal_CP-T2024.pdf',
  2025: 'CP-T-2025_gabarito FINAL.pdf',
  2026: 'CP-T-2026_FINAL.pdf',
}

interface Token { number: number; kind: 'resp' | 'anulada' | 'alterada'; letter?: string }

const TOKEN = /(\d{2})\s*[-–—]\s*(?:(ANULADA)|ALTERADA\s*PARA\s*([A-E])|([A-E])(?![A-Za-z]))/gi

/** `pageText`: texto da página da disciplina (ex.: "Informática AMARELA AZUL 01 - B 26 - C ..."). */
export function parseDisciplinePage(pageText: string, year: number, cor: string): { entries: KeyEntry[]; colors: [string, string]; discipline: string } {
  const text = pageText.replace(/\s+/g, ' ').trim()
  const head = text.match(/^(.*?)\s+(AMARELA|AZUL|VERDE|ROSA|BRANCA|LARANJA)\s+(AMARELA|AZUL|VERDE|ROSA|BRANCA|LARANJA)\b/i)
  if (!head) throw new Error(`${year}: cabeçalho de cores não encontrado`)
  const discipline = head[1].trim()
  const colors: [string, string] = [head[2].toUpperCase(), head[3].toUpperCase()]
  const idx = colors.indexOf(cor.toUpperCase())
  if (idx < 0) throw new Error(`${year}: a cor ${cor} não está entre as colunas ${colors.join('/')}`)

  const body = text.slice(head[0].length)
  const tokens: Token[] = []
  for (const m of body.matchAll(TOKEN)) {
    const n = Number(m[1])
    if (m[2]) tokens.push({ number: n, kind: 'anulada' })
    else if (m[3]) tokens.push({ number: n, kind: 'alterada', letter: m[3].toUpperCase() })
    else tokens.push({ number: n, kind: 'resp', letter: m[4].toUpperCase() })
  }
  if (tokens.length !== 100) throw new Error(`${year}: esperava 100 entradas (2 cores × 50 questões), achei ${tokens.length}`)

  // Ordem do PDF por linha q=1..25: [cor1 q][cor1 q+25][cor2 q][cor2 q+25]
  const expected: number[] = []
  for (let q = 1; q <= 25; q++) expected.push(q, q + 25, q, q + 25)
  tokens.forEach((t, i) => {
    if (t.number !== expected[i]) throw new Error(`${year}: sequência inesperada na posição ${i} (veio ${t.number}, esperado ${expected[i]})`)
  })

  const entries: KeyEntry[] = []
  for (let q = 1; q <= 25; q++) {
    const row = tokens.slice((q - 1) * 4, q * 4)
    const mine = idx === 0 ? [row[0], row[1]] : [row[2], row[3]]
    for (const t of mine) {
      if (t.kind === 'anulada') entries.push({ number: t.number, answer: null, status: 'anulada', note: 'Questão anulada pela banca' })
      else if (t.kind === 'alterada') entries.push({ number: t.number, answer: t.letter as KeyEntry['answer'], status: 'alterada', note: `Gabarito alterado para ${t.letter} após recursos` })
      else entries.push({ number: t.number, answer: t.letter as KeyEntry['answer'], status: 'valida' })
    }
  }
  entries.sort((a, b) => a.number - b.number)
  if (entries.length !== 50 || entries.some((e, i) => e.number !== i + 1)) throw new Error(`${year}: não obtive as 50 questões da cor ${cor}`)
  return { entries, colors, discipline }
}
