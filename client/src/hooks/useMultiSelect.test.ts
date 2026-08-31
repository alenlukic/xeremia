import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMultiSelect } from './useMultiSelect'

const IDS = [1, 2, 3, 4, 5]

describe('useMultiSelect', () => {
  it('replaces the selection on a plain pick', () => {
    const { result } = renderHook(() => useMultiSelect(IDS))

    act(() => result.current.select(2))
    expect(result.current.orderedIds).toEqual([2])

    act(() => result.current.select(4))
    expect(result.current.orderedIds).toEqual([4])
  })

  it('adds and removes with ctrl or meta', () => {
    const { result } = renderHook(() => useMultiSelect(IDS))

    act(() => result.current.select(2))
    act(() => result.current.select(4, { metaKey: true }))
    expect(result.current.orderedIds).toEqual([2, 4])

    act(() => result.current.select(2, { ctrlKey: true }))
    expect(result.current.orderedIds).toEqual([4])
  })

  it('extends from the anchor with shift, in either direction', () => {
    const { result } = renderHook(() => useMultiSelect(IDS))

    act(() => result.current.select(4))
    act(() => result.current.select(2, { shiftKey: true }))
    // Reported in list order, not click order.
    expect(result.current.orderedIds).toEqual([2, 3, 4])

    // The anchor stays put, so a second shift-click re-extends from it.
    act(() => result.current.select(5, { shiftKey: true }))
    expect(result.current.orderedIds).toEqual([4, 5])
  })

  it('keeps the earlier selection when shift is combined with ctrl', () => {
    const { result } = renderHook(() => useMultiSelect(IDS))

    act(() => result.current.select(1))
    act(() => result.current.select(4, { metaKey: true }))
    act(() => result.current.select(5, { shiftKey: true, metaKey: true }))
    expect(result.current.orderedIds).toEqual([1, 4, 5])
  })

  it('reports the tri-state for the header checkmark', () => {
    const { result } = renderHook(() => useMultiSelect(IDS))
    expect(result.current.allSelected).toBe(false)
    expect(result.current.someSelected).toBe(false)

    act(() => result.current.select(2))
    expect(result.current.someSelected).toBe(true)
    expect(result.current.allSelected).toBe(false)

    act(() => result.current.selectAll())
    expect(result.current.allSelected).toBe(true)
    expect(result.current.someSelected).toBe(false)
  })

  it('toggles all: selects everything, then clears whatever is picked', () => {
    const { result } = renderHook(() => useMultiSelect(IDS))

    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(5)

    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(0)

    // A partial selection clears rather than growing to everything, so one
    // control can never leave the user with more selected than they expected.
    act(() => result.current.select(3))
    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(0)
  })

  it('drops rows that leave the list, so actions cannot reach them', () => {
    const { result, rerender } = renderHook(({ ids }) => useMultiSelect(ids), {
      initialProps: { ids: IDS },
    })

    act(() => result.current.selectAll())
    expect(result.current.count).toBe(5)

    // A filter narrows the view; the hidden rows must not stay selected.
    rerender({ ids: [1, 2] })
    expect(result.current.orderedIds).toEqual([1, 2])
  })

  it('treats an empty list as nothing selected', () => {
    const { result } = renderHook(() => useMultiSelect([]))
    act(() => result.current.selectAll())
    expect(result.current.count).toBe(0)
    expect(result.current.allSelected).toBe(false)
  })
})

describe('useMultiSelect scope', () => {
  it('never reaches past the filter, however the selection was made', () => {
    // The rows a filter leaves standing are the only eligible ones: there is
    // no path — select-all, shift-extend or ctrl-click — to a row the filter
    // is hiding, and no offer to widen to the unfiltered collection.
    const { result, rerender } = renderHook(({ ids }) => useMultiSelect(ids), {
      initialProps: { ids: [1, 2, 3, 4, 5] },
    })

    act(() => result.current.selectAll())
    rerender({ ids: [2, 4] })
    expect(result.current.orderedIds).toEqual([2, 4])

    act(() => result.current.selectAll())
    expect(result.current.orderedIds).toEqual([2, 4])

    // Shift-extend spans the listed rows, not the gap the filter removed.
    act(() => result.current.select(2))
    act(() => result.current.select(4, { shiftKey: true }))
    expect(result.current.orderedIds).toEqual([2, 4])
  })
})
