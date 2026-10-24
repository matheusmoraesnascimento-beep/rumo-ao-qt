/**
 * Gera supabase/seed_gabaritos.sql a partir de dados/gabaritos_informatica.json (extraído dos PDFs oficiais).
 * O arquivo gerado NÃO vai ao Git. Uso: npm run gabaritos:seed
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { detUuid } from '../src/lib/ids'
import type { KeyEntry } from './lib/gabaritos'

const root = path.resolve(import.meta.dirname, '..')
const data = JSON.parse(readFileSync(path.join(root, 'dados/gabaritos_informatica.json'), 'utf8')) as Record<string, { cor: string; fonte: string; questoes: KeyEntry[] }>
const q = (s: string | null) => (s === null ? 'null' : `'${s.replace(/'/g, "''")}'`)

const sql: string[] = ['-- GERADO por scripts/gerar-seed-gabaritos.ts — gabaritos oficiais (SSPM). NÃO versionar.', 'begin;']
let total = 0, anuladas = 0
for (const [year, g] of Object.entries(data)) {
  if (g.questoes.length !== 50) throw new Error(`${year}: gabarito incompleto`)
  for (const e of g.questoes) {
    const code = `CPT-${year}-Q${String(e.number).padStart(2, '0')}`
    const id = detUuid(`question:${code}`)
    sql.push(
      `insert into public.answer_keys (question_id, correct_option, status, note, booklet_color, source_file) values (${q(id)}, ${q(e.answer)}, ${q(e.status)}, ${q(e.note ?? null)}, ${q(g.cor)}, ${q(g.fonte)}) ` +
        `on conflict (question_id) do update set correct_option = excluded.correct_option, status = excluded.status, note = excluded.note, booklet_color = excluded.booklet_color, source_file = excluded.source_file, imported_at = now();`,
    )
    sql.push(`update public.questions set annulled = ${e.status === 'anulada'}, annulled_note = ${q(e.status === 'anulada' ? 'Questão anulada pela banca (gabarito final)' : null)} where id = ${q(id)};`)
    total++
    if (e.status === 'anulada') anuladas++
  }
}
sql.push(`do $$ begin if (select count(*) from public.answer_keys) <> 250 then raise exception 'esperava 250 gabaritos'; end if; end $$;`, 'commit;')
writeFileSync(path.join(root, 'supabase/seed_gabaritos.sql'), sql.join('\n') + '\n', 'utf8')
console.log(`seed_gabaritos.sql: ${total} gabaritos, ${anuladas} anuladas marcadas.`)
