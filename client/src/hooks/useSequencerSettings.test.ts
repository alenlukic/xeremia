import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromSettings, useSequencerSettings } from './useSequencerSettings'

vi.mock('../api/http', () => ({
  updateSetSequencer: vi.fn(),
}))

describe('sequencer tile stars', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rehydrates committed and lane-scoped stars', () => {
    expect(
      fromSettings({
        starred_tiles: {
          'committed:7': true,
          '12:7': true,
        },
      }).starredTiles,
    ).toEqual({
      'committed:7': true,
      '12:7': true,
    })
  })

  it('rehydrates lane-scoped location pins', () => {
    expect(
      fromSettings({
        pinned_tiles: {
          '12:7': true,
        },
      }).pinnedTiles,
    ).toEqual({
      '12:7': true,
    })
  })
})

describe('useSequencerSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debounces saves and persists only the latest patch', async () => {
    vi.useFakeTimers()
    try {
      const http = await import('../api/http')
      vi.mocked(http.updateSetSequencer).mockResolvedValue(undefined)

      const { result } = renderHook(() => useSequencerSettings(7, null))

      await act(async () => {
        result.current.patch({ startMin: 390 })
        result.current.patch({ endMin: 540 })
      })

      expect(http.updateSetSequencer).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })

      expect(http.updateSetSequencer).toHaveBeenCalledTimes(1)
      expect(http.updateSetSequencer).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          start_minutes: 390,
          end_minutes: 540,
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips save on hydration, then saves later edits', async () => {
    vi.useFakeTimers()
    try {
      const http = await import('../api/http')
      vi.mocked(http.updateSetSequencer).mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useSequencerSettings(3, {
          start_minutes: 420,
          end_minutes: 600,
          px_per_min: 8,
          view: 'list',
        }),
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      expect(http.updateSetSequencer).not.toHaveBeenCalled()

      await act(async () => {
        result.current.patch({ pxPerMin: 9 })
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })

      expect(http.updateSetSequencer).toHaveBeenCalledTimes(1)
      expect(http.updateSetSequencer).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ px_per_min: 9 }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('adopts stored state when switching sets without immediate write-back', async () => {
    vi.useFakeTimers()
    try {
      const http = await import('../api/http')
      vi.mocked(http.updateSetSequencer).mockResolvedValue(undefined)

      const { result, rerender } = renderHook(
        ({ setId, stored }) => useSequencerSettings(setId, stored),
        {
          initialProps: {
            setId: 1 as number | null,
            stored: { start_minutes: 360, end_minutes: 480, px_per_min: 6 },
          },
        },
      )

      rerender({
        setId: 2,
        stored: { start_minutes: 300, end_minutes: 420, px_per_min: 10 },
      })

      expect(result.current.startMin).toBe(300)
      expect(result.current.endMin).toBe(420)
      expect(result.current.pxPerMin).toBe(10)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      expect(http.updateSetSequencer).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('surfaces saveError and clears it after a successful retry', async () => {
    vi.useFakeTimers()
    try {
      const http = await import('../api/http')
      vi.mocked(http.updateSetSequencer)
        .mockRejectedValueOnce(new Error('sequencer save failed'))
        .mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useSequencerSettings(8, null))

      await act(async () => {
        result.current.patch({ view: 'list' })
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
        await Promise.resolve()
      })
      expect(result.current.saveError).toBe('sequencer save failed')

      await act(async () => {
        result.current.patch({ view: 'lanes' })
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
        await Promise.resolve()
      })
      expect(result.current.saveError).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
