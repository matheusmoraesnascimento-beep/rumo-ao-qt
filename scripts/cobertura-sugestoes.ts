/** Mede quantas das 250 questões recebem sugestão (informativo; NÃO é acurácia). Uso: npx tsx scripts/cobertura-sugestoes.ts */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { flattenSyllabus } from '../src/data/edital2026'
import { detUuid } from '../src/lib/ids'
import { suggestTopics } from '../src/lib/sugestao'
import type { Topic } from '../src/types/db'

const root = path.resolve(import.meta.dirname, '..')
const flat = flattenSyllabus()
const topics: Topic[] = flat.map((t) => ({ id: detUuid(`t:${t.slug}`), syllabus_version_id: 'sv', parent_id: t.parentSlug ? detUuid(`t:${t.parentSlug}`) : null, name: t.name, slug: t.slug, ordinal: t.ordinal, notes: null }))
const qs = JSON.parse(readFileSync(path.join(root, 'dados/questoes_2022_2026.json'), 'utf8')) as { id: string; ocr_text: string }[]
const macro = new Map<string, number>()
let withMacro = 0, withLeaf = 0, none = 0
for (const q of qs) {
  const s = suggestTopics(q.ocr_text, topics)
  const m = s.find((x) => x.kind === 'macro')
  if (m) { withMacro++; macro.set(m.name, (macro.get(m.name) ?? 0) + 1) } else none++
  if (s.some((x) => x.kind === 'folha')) withLeaf++
}
console.log(`total ${qs.length} · com sugestão de macroárea ${withMacro} · com sugestão de assunto ${withLeaf} · sem sugestão ${none}`)
console.log([...macro].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${c} ${n}`).join('\n'))
