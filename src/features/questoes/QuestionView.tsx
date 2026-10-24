import { useEffect, useState } from 'react'
import { AlertTriangle, FileImage } from 'lucide-react'
import { Badge, Button, Spinner } from '@/components/ui'
import { useSignedUrl } from '@/lib/queries'
import type { Question } from '@/types/db'

const OCR_LABEL = {
  pending_review: 'OCR não revisado',
  needs_manual_transcription: 'Transcrição manual necessária',
  reviewed: 'Transcrição conferida',
} as const

/**
 * Imagem original = modo padrão (fidelidade). Texto OCR só sob demanda, com aviso,
 * e como texto principal apenas se a transcrição foi conferida por humano (reviewed).
 */
export function QuestionView({ q, exam }: { q: Question; exam?: number }) {
  const reviewed = q.ocr_status === 'reviewed' && !!q.ocr_body
  const padrao = reviewed && !q.has_figure ? 'texto' : 'imagem' // dúvida/figura/código => imagem
  const [mode, setMode] = useState<'imagem' | 'texto'>(padrao)
  useEffect(() => setMode(padrao), [q.id, padrao])
  const url = useSignedUrl(q.image_path)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>{q.code}</strong>
        {exam && <Badge>{exam}</Badge>}
        <Badge tone={q.ocr_status === 'reviewed' ? 'ok' : 'warn'}>{OCR_LABEL[q.ocr_status]}</Badge>
        {q.has_figure && <Badge tone="sea">contém figura/código</Badge>}
        {q.annulled ? <Badge tone="bad">ANULADA pela banca</Badge> : <Badge>Gabarito após responder</Badge>}
        {q.source_page && <span className="text-muted">{q.source_pdf}, p. {q.source_page}{q.source_column ? `, coluna ${q.source_column === 'left' ? 'esq.' : 'dir.'}` : ''}</span>}
      </div>
      {q.annulled && (
        <p role="note" className="flex items-start gap-2 rounded-lg border border-bad/40 bg-bad/10 p-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />Esta questão foi <strong>anulada</strong> pela banca (gabarito final). Pode ser estudada, mas não conta como acerto nem como erro.</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant={mode === 'imagem' ? 'primary' : 'secondary'} onClick={() => setMode('imagem')}><FileImage className="size-4" /> Imagem original</Button>
        <Button size="sm" variant={mode === 'texto' ? 'primary' : 'secondary'} onClick={() => setMode('texto')} disabled={!q.ocr_body}>Texto (OCR)</Button>
      </div>
      {mode === 'imagem' ? (
        url.isLoading ? <Spinner label="Carregando recorte…" /> :
        url.data ? (
          <img src={url.data} alt={`Recorte original da questão ${q.number}${exam ? ` de ${exam}` : ''}.${q.annulled ? ' Questão anulada pela banca.' : ''}`} className="max-h-[75vh] w-full rounded-lg border border-line bg-white object-contain" />
        ) : (
          <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
            Recorte indisponível ({url.error instanceof Error ? url.error.message : 'sem imagem enviada ao bucket privado'}). Use o texto OCR com cautela ou consulte a página-fonte no PDF original.
          </div>
        )
      ) : (
        <div>
          {!reviewed && (
            <p role="note" className="mb-2 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />Transcrição automática (OCR) sem revisão: pode ter erros em símbolos, código, tabelas e alternativas. A imagem original prevalece.</p>
          )}
          <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-sans text-sm leading-relaxed">{q.ocr_body}</pre>
        </div>
      )}
    </div>
  )
}

export const OPTIONS = ['A', 'B', 'C', 'D', 'E'] as const
