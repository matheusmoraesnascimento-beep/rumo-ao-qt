/**
 * Gera supabase/seed.sql (idempotente) a partir de:
 *  - src/data/edital2026.ts (árvore provisória)
 *  - dados/questoes_2022_2026.json (250 questões, SEM gabarito)
 * Uso: npm run seed:gen
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { EDITAL_2026, SYLLABUS_META, flattenSyllabus } from '../src/data/edital2026'
import { PROMPTS_AUTORAIS } from '../src/data/temasRedacao'
import { detUuid } from '../src/lib/ids'
import { statusOcr, validarQuestoes, YEARS } from './lib/importacao'

const root = path.resolve(import.meta.dirname, '..')
const q = (s: string | null | undefined) => (s == null ? 'null' : `'${s.replace(/'/g, "''")}'`)
const jsonb = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`

const raw = JSON.parse(readFileSync(path.join(root, 'dados/questoes_2022_2026.json'), 'utf8'))
const { questoes, relatorio } = validarQuestoes(raw, (p) => existsSync(path.join(root, p)))
if (relatorio.erros.length || relatorio.semImagem.length) {
  console.error('Validação falhou:', relatorio.erros, 'sem imagem:', relatorio.semImagem)
  process.exit(1)
}

const out: string[] = ['-- GERADO por scripts/gerar-seed.ts — não editar à mão. Catálogo: provas, edital provisório e temas autorais.', 'begin;']
const outQ: string[] = ['-- GERADO — 250 questões (OCR sem revisão, SEM gabarito). Material de prova: NÃO versionar no Git (veja README).', 'begin;']

for (const y of YEARS) {
  out.push(
    `insert into public.exams (id, slug, year, official_status, source_url) values (${q(detUuid(`exam:${y}`))}, 'cpt-informatica-${y}', ${y}, 'historica', null) on conflict (slug) do nothing;`,
  )
}

const svId = detUuid(`syllabus:${SYLLABUS_META.year}:${SYLLABUS_META.label}`)
out.push(
  `insert into public.syllabus_versions (id, exam_id, year, label, status, source_url) values (${q(svId)}, ${q(detUuid('exam:2026'))}, ${SYLLABUS_META.year}, ${q(SYLLABUS_META.label)}, ${q(SYLLABUS_META.status)}, ${q(SYLLABUS_META.sourceUrl)}) on conflict (id) do update set label = excluded.label, source_url = excluded.source_url;`,
)

const topics = flattenSyllabus(EDITAL_2026)
const idOf = (slug: string) => detUuid(`topic:${svId}:${slug}`)
for (const t of topics) {
  out.push(
    `insert into public.topics (id, syllabus_version_id, parent_id, name, slug, ordinal, source_exam_year) values (${q(idOf(t.slug))}, ${q(svId)}, ${t.parentSlug ? q(idOf(t.parentSlug)) : 'null'}, ${q(t.name)}, ${q(t.slug)}, ${t.ordinal}, 2026) on conflict (id) do update set name = excluded.name, ordinal = excluded.ordinal;`,
  )
}

PROMPTS_AUTORAIS.forEach((p, i) => {
  out.push(
    `insert into public.writing_prompts (id, owner_id, origin, title, prompt_text, official) values (${q(detUuid(`prompt:${i}`))}, null, 'autoral', ${q(p.title)}, ${q(p.text)}, false) on conflict (id) do update set title = excluded.title, prompt_text = excluded.prompt_text;`,
  )
})

out.push('commit;')
for (const x of questoes) {
  const st = statusOcr(x)
  // Sem texto confiável => sem corpo (não fabricar). Imagem/página-fonte continua vinculada.
  const body = st === 'needs_manual_transcription' ? null : x.ocr_text
  const imagem = path.posix.basename(x.image_path)
  outQ.push(
    `insert into public.questions (id, code, exam_id, number, source_pdf, source_page, source_column, source_spans, ocr_body, options, image_path, image_status, ocr_status, has_figure, text_hash) values (${q(detUuid(`question:${x.id}`))}, ${q(x.id)}, ${q(detUuid(`exam:${x.exam_year}`))}, ${x.number}, ${q(x.source_pdf)}, ${x.source_page ?? 'null'}, ${q(x.source_column)}, ${jsonb(x.source_spans ?? [])}, ${q(body)}, ${jsonb(x.options)}, ${q(imagem)}, ${q(x.image_status)}, ${q(st)}, ${x.has_figure ?? 'null'}, ${q(x.text_hash)}) ` +
      `on conflict (code) do update set source_pdf = excluded.source_pdf, source_page = excluded.source_page, source_column = excluded.source_column, source_spans = excluded.source_spans, ocr_body = excluded.ocr_body, options = excluded.options, image_path = excluded.image_path, image_status = excluded.image_status, ocr_status = excluded.ocr_status, text_hash = excluded.text_hash ` +
      `where public.questions.ocr_status <> 'reviewed';`, // nunca sobrescrever texto já conferido
  )
}
outQ.push(
  `insert into public.import_audit (batch_name, checksum, records_validated, records_imported, errors) values ('seed.sql', ${q(relatorio.checksum)}, ${questoes.length}, ${questoes.length}, '[]'::jsonb);`,
  'commit;',
)

writeFileSync(path.join(root, 'supabase/seed.sql'), out.join('\n') + '\n', 'utf8')
writeFileSync(path.join(root, 'supabase/seed_questoes.sql'), outQ.join('\n') + '\n', 'utf8')
console.log(
  `seed.sql: ${topics.length} tópicos, ${questoes.length} questões (${relatorio.pendentesOcr} OCR pendente, ${relatorio.semTextoConfiavel.length} transcrição manual).`,
)
