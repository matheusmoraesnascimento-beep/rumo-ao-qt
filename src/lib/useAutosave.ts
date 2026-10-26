import { useCallback, useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'salvo' | 'salvando' | 'nao-salvo'

interface Options {
  storageKey: string
  value: string
  saved: string
  save: (v: string) => Promise<void>
  delayMs?: number
}

const RETRY_MS = 5000

function readDraft(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeDraft(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* sem cota/privado: segue só com o salvamento remoto */
  }
}
function clearDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* idem */
  }
}

export function useAutosave({ storageKey, value, saved, save, delayMs = 1500 }: Options) {
  const [draft] = useState(() => readDraft(storageKey))
  const [status, setStatus] = useState<AutosaveStatus>('salvo')
  const latest = useRef({ value, save, storageKey })
  latest.current = { value, save, storageKey }
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const attempt = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current)
    const { value: v, save: doSave, storageKey: key } = latest.current
    setStatus('salvando')
    try {
      await doSave(v)
      if (latest.current.value === v) clearDraft(key)
      setStatus(latest.current.value === v ? 'salvo' : 'salvando')
    } catch {
      setStatus('nao-salvo')
      timer.current = setTimeout(() => void attempt(), RETRY_MS)
    }
  }, [])

  useEffect(() => {
    if (value === saved) {
      clearTimeout(timer.current)
      setStatus('salvo')
      return
    }
    writeDraft(storageKey, value)
    setStatus('salvando')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void attempt(), delayMs)
    return () => clearTimeout(timer.current)
  }, [value, saved, storageKey, delayMs, attempt])

  const flush = useCallback(async () => {
    if (latest.current.value === saved) return
    await attempt()
  }, [attempt, saved])

  return { status, flush, draft }
}
