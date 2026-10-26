import { useState } from 'react'
import { Button, Field, Input } from '@/components/ui'
import { validarQuestoes } from '@/lib/notas'
import { errMsg } from '@/lib/utils'

interface Props {
  topicName: string
  onCancel: () => void
  onConfirm: (v: { done?: number; correct?: number }) => Promise<void>
}

export function ConcluirDialog({ topicName, onCancel, onConfirm }: Props) {
  const [done, setDone] = useState('')
  const [correct, setCorrect] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enviar() {
    const msg = validarQuestoes(done, correct)
    if (msg) return setErro(msg)
    setErro(null)
    setBusy(true)
    try {
      await onConfirm({
        ...(done.trim() && { done: Number(done) }),
        ...(correct.trim() && { correct: Number(correct) }),
      })
    } catch (e) {
      setErro(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="concluir-titulo" className="w-full max-w-sm space-y-3 rounded-xl border border-line bg-surface p-4 shadow-lg">
        <h2 id="concluir-titulo" className="text-lg font-semibold">Concluir “{topicName}”</h2>
        <p className="text-sm text-muted">Uma aula de revisão será agendada para amanhã. Se fez questões deste assunto, registre (opcional).</p>
        <Field label="Questões feitas">
          <Input inputMode="numeric" value={done} onChange={(e) => setDone(e.target.value)} />
        </Field>
        <Field label="Acertos">
          <Input inputMode="numeric" value={correct} onChange={(e) => setCorrect(e.target.value)} />
        </Field>
        {erro && <p role="alert" className="text-sm text-bad">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button>
          <Button disabled={busy} loading={busy} onClick={enviar}>Salvar e ir para revisões</Button>
        </div>
      </div>
    </div>
  )
}
