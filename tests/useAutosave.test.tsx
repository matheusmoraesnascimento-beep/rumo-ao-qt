import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutosave } from '@/lib/useAutosave'

const KEY = 'notas:t1'

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

const setup = (save: (v: string) => Promise<void>, initial = { value: 'a', saved: 'a' }) =>
  renderHook((p: { value: string; saved: string }) => useAutosave({ storageKey: KEY, save, ...p }), { initialProps: initial })

describe('useAutosave', () => {
  it('só salva após o debounce, uma vez, com o último valor', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender } = setup(save)
    rerender({ value: 'ab', saved: 'a' })
    rerender({ value: 'abc', saved: 'a' })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(save).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(600))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('abc')
  })

  it('grava rascunho local ao editar e limpa após salvar', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender, result } = setup(save)
    rerender({ value: 'ab', saved: 'a' })
    expect(localStorage.getItem(KEY)).toBe('ab')
    expect(result.current.status).toBe('salvando')
    await act(() => vi.advanceTimersByTimeAsync(1600))
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(result.current.status).toBe('salvo')
  })

  it('falha: status nao-salvo, mantém rascunho e tenta de novo em 5 s', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { rerender, result } = setup(save)
    rerender({ value: 'ab', saved: 'a' })
    await act(() => vi.advanceTimersByTimeAsync(1600))
    expect(result.current.status).toBe('nao-salvo')
    expect(localStorage.getItem(KEY)).toBe('ab')
    await act(() => vi.advanceTimersByTimeAsync(5100))
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('salvo')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('devolve rascunho pré-existente no mount', () => {
    localStorage.setItem(KEY, 'rascunho')
    const { result } = setup(vi.fn().mockResolvedValue(undefined))
    expect(result.current.draft).toBe('rascunho')
  })

  it('sem rascunho, draft é null', () => {
    expect(setup(vi.fn().mockResolvedValue(undefined)).result.current.draft).toBeNull()
  })

  it('flush salva imediatamente', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender, result } = setup(save)
    rerender({ value: 'ab', saved: 'a' })
    await act(() => result.current.flush())
    expect(save).toHaveBeenCalledWith('ab')
  })

  it('localStorage lançando exceção não quebra', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender } = setup(save)
    rerender({ value: 'ab', saved: 'a' })
    await act(() => vi.advanceTimersByTimeAsync(1600))
    expect(save).toHaveBeenCalledWith('ab')
    spy.mockRestore()
  })
})
