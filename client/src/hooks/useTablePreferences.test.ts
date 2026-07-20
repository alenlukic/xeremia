import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTablePreferences } from './useTablePreferences'
import * as http from '../api/http'
import { defaultTableConfig } from '../tablePreferences'

describe('useTablePreferences', () => {
  beforeEach(() => {
    vi.spyOn(http, 'fetchTablePreferences').mockResolvedValue({
      preferences: [],
    })
    vi.spyOn(http, 'updateTablePreferences').mockResolvedValue({
      table_id: 'search',
      ...defaultTableConfig('search'),
      column_order: defaultTableConfig('search').columnOrder,
      column_visibility: defaultTableConfig('search').columnVisibility,
      column_widths: defaultTableConfig('search').columnWidths,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes server configs on load', async () => {
    vi.mocked(http.fetchTablePreferences).mockResolvedValue({
      preferences: [
        {
          table_id: 'search',
          column_order: ['title', 'title', 'unknown'],
          column_visibility: { title: true, unknown: false },
          column_widths: { title: 5000 },
        },
      ],
    })
    const { result } = renderHook(() => useTablePreferences())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.configs.search.columnOrder).toContain('title')
    expect(
      result.current.configs.search.columnWidths.title,
    ).toBeLessThanOrEqual(2000)
  })

  it('debounces saves and flushes final width immediately', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useTablePreferences())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setColumnWidth('search', 'title', 180)
    })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    await vi.waitFor(() =>
      expect(http.updateTablePreferences).toHaveBeenCalled(),
    )

    act(() => {
      result.current.flushColumnWidth('search', 'title', 220)
    })
    await vi.waitFor(() =>
      expect(http.updateTablePreferences).toHaveBeenCalledWith(
        'search',
        expect.objectContaining({
          column_widths: expect.objectContaining({ title: 220 }),
        }),
      ),
    )
    vi.useRealTimers()
  })

  it('surfaces retryable save errors without discarding local state', async () => {
    vi.mocked(http.updateTablePreferences).mockRejectedValue(
      new Error('save failed'),
    )
    const { result } = renderHook(() => useTablePreferences())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.toggleVisibility('search', 'genre')
    })
    await vi.waitFor(() =>
      expect(result.current.saveErrors.search).toBe('save failed'),
    )
    expect(result.current.configs.search.columnVisibility.genre).toBe(false)
  })
})
