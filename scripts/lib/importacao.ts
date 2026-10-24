import { z } from 'zod'
import { createHash } from 'node:crypto'

export const YEARS = [2022, 2023, 2024, 2025, 2026] as const

export const QuestaoJsonSchema = z
  .object({
    id: z.string().regex(/^CPT-20(22|23|24|25|26)-Q(0[1-9]|[1-4][0-9]|50)$/),
    exam_year: z.number().int().min(2022).max(2026),
    number: z.number().int().min(1).max(50),
    source_pdf: z.string().min(1),
    source_page: z.number().int().positive().nullable(),
    source_column: z.enum(['left', 'right', 'full']).nullable(),
    source_spans: z.array(z.record(z.string(), z.unknown())).optional(),
    ocr_text: z.string(),
    options: z.array(z.unknown()),
    image_path: z.string().min(1),
    image_status: z.string().optional(),
    ocr_status: z.string(),
    has_figure: z.boolean().nullable(),
    topic_ids: z.array(z.string()),
    correct_option: z.null(), // gabarito PROIBIDO: sempre null
    text_hash: z.string().optional(),
  })
  .refine((q) => q.id === `CPT-${q.exam_year}-Q${String(q.number).padStart(2, '0')}`, {
    message: 'id inconsistente com ano/número',
  })

export type QuestaoJson = z.infer<typeof QuestaoJsonSchema>

export interface RelatorioImportacao {
  total: number
  porAno: Record<number, number>
  faltando: Record<number, number[]>
  duplicados: string[]
  semTextoConfiavel: string[] // vira needs_manual_transcription
  pendentesOcr: number
  semImagem: string[]
  erros: string[]
  checksum: string
}

export function statusOcr(q: Pick<QuestaoJson, 'ocr_text' | 'ocr_status'>): string {
  // Nunca fabricar texto: OCR vazio/curto => transcrição manual necessária.
  if (q.ocr_text.trim().length < 30) return 'needs_manual_transcription'
  return q.ocr_status === 'reviewed' ? 'reviewed' : 'pending_review'
}

export function validarQuestoes(
  raw: unknown,
  imagemExiste: (p: string) => boolean = () => true,
): { questoes: QuestaoJson[]; relatorio: RelatorioImportacao } {
  const erros: string[] = []
  const questoes: QuestaoJson[] = []
  if (!Array.isArray(raw)) throw new Error('JSON de questões deve ser um array')
  raw.forEach((item, i) => {
    // Falha dura se houver qualquer resposta correta, antes do schema.
    if (item && typeof item === 'object' && (item as { correct_option?: unknown }).correct_option != null) {
      erros.push(`GABARITO PROIBIDO em ${(item as { id?: string }).id ?? `#${i}`}`)
      return
    }
    const r = QuestaoJsonSchema.safeParse(item)
    if (!r.success) erros.push(`#${i} ${(item as { id?: string })?.id ?? ''}: ${r.error.issues[0]?.message}`)
    else questoes.push(r.data)
  })

  const ids = new Set<string>()
  const duplicados: string[] = []
  for (const q of questoes) {
    if (ids.has(q.id)) duplicados.push(q.id)
    ids.add(q.id)
  }
  const porAno: Record<number, number> = {}
  const faltando: Record<number, number[]> = {}
  for (const y of YEARS) {
    const nums = new Set(questoes.filter((q) => q.exam_year === y).map((q) => q.number))
    porAno[y] = nums.size
    faltando[y] = Array.from({ length: 50 }, (_, k) => k + 1).filter((n) => !nums.has(n))
  }
  const semImagem = questoes.filter((q) => !imagemExiste(q.image_path)).map((q) => q.id)
  const semTextoConfiavel = questoes.filter((q) => statusOcr(q) === 'needs_manual_transcription').map((q) => q.id)
  const pendentesOcr = questoes.filter((q) => statusOcr(q) === 'pending_review').length
  const checksum = createHash('sha256').update(JSON.stringify(questoes.map((q) => [q.id, q.text_hash]))).digest('hex')
  if (questoes.length !== 250) erros.push(`esperadas 250 questões, encontradas ${questoes.length}`)
  for (const y of YEARS) if (faltando[y].length) erros.push(`${y}: faltam ${faltando[y].join(',')}`)
  if (duplicados.length) erros.push(`duplicados: ${duplicados.join(',')}`)

  return {
    questoes,
    relatorio: { total: questoes.length, porAno, faltando, duplicados, semTextoConfiavel, pendentesOcr, semImagem, erros, checksum },
  }
}
