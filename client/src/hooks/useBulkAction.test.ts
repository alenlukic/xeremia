import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useBulkAction } from './useBulkAction'

/** A promise the test resolves by hand, to hold a step open. */
function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useBulkAction', () => {
  it('reports progress across the selection and clears when done', async () => {
    const { result } = renderHook(() => useBulkAction())
    const first = deferred()
    const each = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const onDone = vi.fn()

    act(() => {
      void result.current.run('Removing', [1, 2, 3], each, onDone)
    })

    await waitFor(() =>
      expect(result.current.progress).toEqual({
        label: 'Removing',
        done: 0,
        total: 3,
      }),
    )
    expect(result.current.running).toBe(true)

    await act(async () => {
      first.resolve()
    })

    await waitFor(() => expect(result.current.progress).toBeNull())
    expect(each).toHaveBeenCalledTimes(3)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(result.current.running).toBe(false)
  })

  it('refuses a second pass while one is in flight', async () => {
    const { result } = renderHook(() => useBulkAction())
    const held = deferred()
    const each = vi.fn().mockReturnValue(held.promise)

    act(() => {
      void result.current.run('Removing', [1, 2], each)
    })
    await waitFor(() => expect(result.current.running).toBe(true))

    // A double-click must not start a second sweep over the same rows.
    act(() => {
      void result.current.run('Removing', [1, 2], each)
    })
    expect(each).toHaveBeenCalledTimes(1)

    await act(async () => {
      held.resolve()
    })
  })

  it('does nothing for an empty selection', () => {
    const { result } = renderHook(() => useBulkAction())
    const each = vi.fn()

    act(() => {
      void result.current.run('Removing', [], each)
    })

    expect(each).not.toHaveBeenCalled()
    expect(result.current.progress).toBeNull()
  })
})
