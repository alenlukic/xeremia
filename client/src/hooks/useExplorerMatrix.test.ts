import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  CELL_WIDTH_PX,
  bucketPool,
  cellKey,
  useExplorerMatrix,
} from './useExplorerMatrix'
import {
  BPM_BASE,
  BPM_RATIO,
  CAMELOT_ROWS,
  MATRIX_COLS,
  colForBpm,
} from '../utils/harmonic'
import type { PoolEntry, Track } from '../types'

function track(id: number, camelot: string | null, bpm: number | null): Track {
  return {
    id,
    title: `Track ${id}`,
    artist_names: [],
    bpm,
    key: null,
    camelot_code: camelot,
    genre: null,
    label: null,
    energy: null,
    date_added: null,
  }
}

function entry(id: number, t: Track | null): PoolEntry {
  return {
    id,
    set_id: 1,
    track_id: t?.id ?? 0,
    insertion_order: id,
    highlight_color: null,
    track: t,
  }
}

describe('matrix axes', () => {
  it('holds the 24 codes in order regardless of pool contents', () => {
    const { result } = renderHook(() => useExplorerMatrix([]))
    expect(result.current.rows).toEqual(CAMELOT_ROWS)
    expect(result.current.rows).toHaveLength(24)
    expect(result.current.cols).toBe(26)

    const populated = renderHook(() =>
      useExplorerMatrix([entry(1, track(1, '05B', 128))]),
    )
    expect(populated.result.current.rows).toEqual(CAMELOT_ROWS)
    expect(populated.result.current.cols).toBe(26)
  })

  it('spaces the BPM buckets by the geometric ratio', () => {
    const { result } = renderHook(() => useExplorerMatrix([]))
    for (const c of [0, 5, MATRIX_COLS - 1]) {
      expect(result.current.bucketRange(c)[0]).toBeCloseTo(
        BPM_BASE * Math.pow(BPM_RATIO, c),
        6,
      )
    }
    expect(result.current.bucketRange(0)[1]).toBeCloseTo(
      result.current.bucketRange(1)[0],
      6,
    )
  })

  it('keeps the cell width a developer constant in the matrix module', () => {
    expect(CELL_WIDTH_PX).toBeGreaterThanOrEqual(18)
    expect(CELL_WIDTH_PX).toBeLessThanOrEqual(34)
  })
})

describe('bucketPool', () => {
  it('files each track into its own key and BPM cohort', () => {
    const buckets = bucketPool([
      entry(1, track(1, '08A', 124)),
      entry(2, track(2, '08A', 124.4)),
      entry(3, track(3, '01B', 90)),
    ])
    const key = cellKey(CAMELOT_ROWS.indexOf('08A'), colForBpm(124))
    expect(buckets.get(key)).toHaveLength(2)
    expect(
      buckets.get(cellKey(CAMELOT_ROWS.indexOf('01B'), colForBpm(90))),
    ).toHaveLength(1)
  })

  it('skips entries the matrix cannot plot', () => {
    const buckets = bucketPool([
      entry(1, null),
      entry(2, track(2, null, 124)),
      entry(3, track(3, '08A', null)),
      entry(4, track(4, 'Abm', 124)),
    ])
    expect(buckets.size).toBe(0)
  })
})

describe('cohort BPM', () => {
  it('averages the cohort when populated', () => {
    const { result } = renderHook(() =>
      useExplorerMatrix([
        entry(1, track(1, '08A', 124)),
        entry(2, track(2, '08A', 126)),
      ]),
    )
    const r = CAMELOT_ROWS.indexOf('08A')
    const c = colForBpm(124)
    expect(result.current.bpmOf(r, c)).toBeCloseTo(125, 6)
  })

  it('falls back to the bucket centre for an empty cohort', () => {
    const { result } = renderHook(() => useExplorerMatrix([]))
    const [lo, hi] = result.current.bucketRange(4)
    const centre = result.current.bpmOf(0, 4)
    expect(centre).toBeGreaterThan(lo)
    expect(centre).toBeLessThan(hi)
  })
})

describe('selection and relations', () => {
  const pool = [entry(1, track(1, '08A', 124))]

  it('reports no relation before a selection', () => {
    const { result } = renderHook(() => useExplorerMatrix(pool))
    expect(result.current.relationTo(0, 0)).toBeNull()
  })

  it('scores every other cell once a cell is selected', () => {
    const { result } = renderHook(() => useExplorerMatrix(pool))
    const r = CAMELOT_ROWS.indexOf('08A')
    const c = colForBpm(124)
    act(() => {
      result.current.selectCell(r, c)
    })
    expect(result.current.selected).toEqual({ r, c })
    expect(result.current.relationTo(r, c)).toBeNull()

    const sameKeyNeighbour = result.current.relationTo(r, c + 1)
    expect(sameKeyNeighbour?.p).toBe(4)
    expect(sameKeyNeighbour?.borderStyle).toBe('solid')

    const unreachable = result.current.relationTo(r, MATRIX_COLS - 1)
    expect(unreachable?.p).toBe(-1)
  })

  it('encodes pitch effort as the border style', () => {
    const { result } = renderHook(() => useExplorerMatrix(pool))
    const r = CAMELOT_ROWS.indexOf('08A')
    const c = colForBpm(124)
    act(() => {
      result.current.selectCell(r, c)
    })
    const styles = new Set<string>()
    for (let row = 0; row < CAMELOT_ROWS.length; row++) {
      for (let col = 0; col < MATRIX_COLS; col++) {
        const rel = result.current.relationTo(row, col)
        if (rel && rel.p >= 0) {
          styles.add(rel.borderStyle)
        }
      }
    }
    expect(styles.has('solid')).toBe(true)
    expect(styles.has('dashed')).toBe(true)
    expect(styles.has('dotted')).toBe(true)
  })

  it('opens the inspector only from a populated cell', () => {
    const { result } = renderHook(() => useExplorerMatrix(pool))
    const r = CAMELOT_ROWS.indexOf('08A')
    const c = colForBpm(124)

    act(() => {
      result.current.selectCell(0, 0)
    })
    expect(result.current.selected).toEqual({ r: 0, c: 0 })
    expect(result.current.inspectorOpen).toBe(false)

    act(() => {
      result.current.selectCell(r, c)
    })
    expect(result.current.inspectorOpen).toBe(true)
    expect(result.current.selectedCohort).toHaveLength(1)

    // Clicking the same cell clears both.
    act(() => {
      result.current.selectCell(r, c)
    })
    expect(result.current.selected).toBeNull()
    expect(result.current.inspectorOpen).toBe(false)
  })

  it('flips the inspector to the left for a right-half cell', () => {
    const { result } = renderHook(() => useExplorerMatrix(pool))
    act(() => {
      result.current.selectCell(0, 3)
    })
    expect(result.current.inspectorSide).toBe('right')
    act(() => {
      result.current.selectCell(0, 20)
    })
    expect(result.current.inspectorSide).toBe('left')
  })

  it('closes the inspector when the selection clears', () => {
    const { result } = renderHook(() => useExplorerMatrix(pool))
    const r = CAMELOT_ROWS.indexOf('08A')
    act(() => {
      result.current.selectCell(r, colForBpm(124))
    })
    act(() => {
      result.current.clearSelection()
    })
    expect(result.current.selected).toBeNull()
    expect(result.current.inspectorOpen).toBe(false)
  })
})
