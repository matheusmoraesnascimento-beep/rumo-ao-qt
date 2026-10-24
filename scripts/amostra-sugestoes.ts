/** Amostra legível: texto OCR (início) × sugestão. Uso: npx tsx scripts/amostra-sugestoes.ts [N] */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { flattenSyllabus } from '../src/data/edital2026'
import { detUuid } from '../src/lib/ids'
import { suggestTopics } from '../src/lib/sugestao'
import { rng } from '../src/lib/simulado'
import type { Topic } from '../src/types/db'

const root = path.resolve(import.meta.dirname, '..')
const flat = flattenSyllabus()
const topics: Topic[] = flat.map((t) => ({ id: detUuid(`t:${t.slug}`), syllabus_version_id: 'sv', parent_id: t.parentSlug ? detUuid(`t:${t.parentSlug}`) : null, name: t.name, slug: t.slug, ordinal: t.ordinal, notes: null }))
const qs = JSON.parse(readFileSync(path.join(root, 'dados/questoes_2022_2026.json'), 'utf8')) as { id: string; ocr_text: string }[]
const r = rng('amostra'), n = Number(process.argv[2] ?? 14)
const pick = [...qs].sort(() => r() - 0.5).slice(0, n)
for (const q of pick) {
  const s = suggestTopics(q.ocr_text, topics)
  const head = q.ocr_text.replace(/\s+/g, ' ').slice(0, 150)
  console.log(`${q.id} | ${s.slice(0, 3).map((x) => `${x.kind === 'macro' ? '▸' : '+'}${x.name}[${x.hits.slice(0, 3).join(',')}]`).join(' ') || '(nada)'}\n   ${head}`)
}
