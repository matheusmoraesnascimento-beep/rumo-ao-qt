import { OPTIONS } from './QuestionView'
import type { SelfGrade } from '@/types/db'

export interface AnswerState { selected: string | null; selfGrade: SelfGrade | null; confidence: number | null }

/** Registra a resposta do aluno SEM correção automática (não há gabarito). */
export function AnswerPanel({ value, onChange, disabled }: { value: AnswerState; onChange: (v: AnswerState) => void; disabled?: boolean }) {
  return (
    <div className="space-y-3">
      <fieldset disabled={disabled}>
        <legend className="mb-1 text-sm font-medium">Sua resposta</legend>
        <div role="radiogroup" aria-label="Alternativa escolhida" className="flex gap-2">
          {OPTIONS.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={value.selected === o} aria-label={`Alternativa ${o}`}
              onClick={() => onChange({ ...value, selected: value.selected === o ? null : o })}
              className={`size-11 rounded-lg border text-base font-semibold ${value.selected === o ? 'border-navy bg-navy text-white dark:border-sea dark:bg-sea dark:text-[#06101f]' : 'border-line bg-surface'}`}>{o}</button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend className="mb-1 text-sm font-medium">Autoavaliação <span className="font-normal text-muted">(autodeclarada — não há correção oficial)</span></legend>
        <div className="flex flex-wrap gap-2">
          {([['acertei', 'Acertei'], ['errei', 'Errei'], ['nao_sei', 'Não sei conferir']] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={value.selfGrade === k}
              onClick={() => onChange({ ...value, selfGrade: value.selfGrade === k ? null : k })}
              className={`rounded-lg border px-3 py-2 text-sm ${value.selfGrade === k ? 'border-sea bg-sea/15 font-medium' : 'border-line bg-surface'}`}>{l}</button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend className="mb-1 text-sm font-medium">Confiança (0–5)</legend>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={value.confidence === n} aria-label={`Confiança ${n}`}
              onClick={() => onChange({ ...value, confidence: value.confidence === n ? null : n })}
              className={`size-9 rounded-lg border text-sm ${value.confidence === n ? 'border-sea bg-sea/15 font-semibold' : 'border-line bg-surface'}`}>{n}</button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
