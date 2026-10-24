/**
 * Lê dados/gabaritos/*.pdf e grava dados/gabaritos_informatica.json (Informática, cor do SEU caderno).
 * Uso: npm run gabaritos:extrair
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CADERNO_COR, GABARITO_PDF, parseDisciplinePage, type KeyEntry } from './lib/gabaritos'

const root = path.resolve(import.meta.dirname, '..')
const out: Record<string, { cor: string; colunas: string[]; fonte: string; questoes: KeyEntry[] }> = {}

for (const year of Object.keys(GABARITO_PDF).map(Number)) {
  const file = GABARITO_PDF[year]
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path.join(root, 'dados/gabaritos', file))), useSystemFonts: true }).promise
  let found: ReturnType<typeof parseDisciplinePage> | null = null
  let count = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    const text = tc.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim()
    if (/^Inform[aá]tica\s/i.test(text)) {
      count++
      found = parseDisciplinePage(text, year, CADERNO_COR[year])
    }
  }
  if (count !== 1 || !found) throw new Error(`${year}: esperava exatamente 1 página de Informática, achei ${count}`)
  out[year] = { cor: CADERNO_COR[year], colunas: found.colors, fonte: file, questoes: found.entries }
  const an = found.entries.filter((e) => e.status === 'anulada').map((e) => e.number)
  const al = found.entries.filter((e) => e.status === 'alterada').map((e) => `${e.number}→${e.answer}`)
  console.log(`${year} [${CADERNO_COR[year]} | colunas ${found.colors.join('/')}] 50 questões · anuladas: ${an.join(',') || '—'} · alteradas: ${al.join(',') || '—'}`)
}
writeFileSync(path.join(root, 'dados/gabaritos_informatica.json'), JSON.stringify(out, null, 2), 'utf8')
console.log('dados/gabaritos_informatica.json gravado (fora do Git).')
