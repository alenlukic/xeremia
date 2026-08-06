import { useCallback, useMemo, useState } from 'react'
import {
  CAMELOT_ROWS,
  MATRIX_COLS,
  bucketCentreBpm,
  bucketLoBpm,
  colForBpm,
  pairTracks,
} from '../utils/harmonic'
import type { PairResult } from '../utils/harmonic'
import type { PoolEntry, Track } from '../types'

// The BPM cohort matrix: 24 literal Camelot rows × 26 geometric BPM buckets.
// The axes are fixed, so a cell address means the same thing for every set.

/**
 * Cell geometry. Developer constants: the mock allows 18–34px, and the shipped
 * value is the mock's 26×18. No user-facing control adjusts them.
 */
export const CELL_WIDTH_PX = 26
export const CELL_HEIGHT_PX = 18
export const CELL_GAP_PX = 2

export interface MatrixCell {
  r: number
  c: number
}

export interface CellRelation extends PairResult {
  /** Border style for the pitch effort: none, one side, both sides. */
  borderStyle: 'solid' | 'dashed' | 'dotted'
}

const BORDER_STYLES = ['solid', 'dashed', 'dotted'] as const

export function cellKey(r: number, c: number): string {
  return `${r}:${c}`
}

/** Group plottable pool tracks into their key × BPM cohort. */
export function bucketPool(pool: PoolEntry[]): Map<string, Track[]> {
  const buckets = new Map<string, Track[]>()
  for (const entry of pool) {
    const track = entry.track
    if (!track || track.camelot_code == null || track.bpm == null) {
      continue
    }
    const row = CAMELOT_ROWS.indexOf(track.camelot_code)
    if (row < 0) {
      continue
    }
    const key = cellKey(row, colForBpm(track.bpm))
    const list = buckets.get(key)
    if (list) {
      list.push(track)
    } else {
      buckets.set(key, [track])
    }
  }
  return buckets
}

export function useExplorerMatrix(pool: PoolEntry[]) {
  const [selected, setSelected] = useState<MatrixCell | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [hover, setHover] = useState<
    (MatrixCell & { rect: { l: number; r: number; t: number } }) | null
  >(null)

  const buckets = useMemo(() => bucketPool(pool), [pool])

  const cohort = useCallback(
    (r: number, c: number) => buckets.get(cellKey(r, c)) ?? [],
    [buckets],
  )

  /** Representative BPM: the cohort mean when populated, else the bucket centre. */
  const bpmOf = useCallback(
    (r: number, c: number) => {
      const list = buckets.get(cellKey(r, c))
      if (list && list.length > 0) {
        return list.reduce((sum, t) => sum + (t.bpm ?? 0), 0) / list.length
      }
      return bucketCentreBpm(c)
    },
    [buckets],
  )

  /** Best relation from the selected cell to (r, c), or null without a selection. */
  const relationTo = useCallback(
    (r: number, c: number): CellRelation | null => {
      if (!selected || (selected.r === r && selected.c === c)) {
        return null
      }
      const pair = pairTracks(
        bpmOf(selected.r, selected.c),
        CAMELOT_ROWS[selected.r],
        bpmOf(r, c),
        CAMELOT_ROWS[r],
      )
      return { ...pair, borderStyle: BORDER_STYLES[pair.effort] }
    },
    [selected, bpmOf],
  )

  const selectCell = useCallback(
    (r: number, c: number) => {
      const isSelected = !!selected && selected.r === r && selected.c === c
      const populated = (buckets.get(cellKey(r, c)) ?? []).length > 0
      setSelected(isSelected ? null : { r, c })
      // The inspector opens only from a populated cell, never on its own.
      setInspectorOpen(isSelected ? false : populated)
    },
    [selected, buckets],
  )

  const clearSelection = useCallback(() => {
    setSelected(null)
    setInspectorOpen(false)
  }, [])

  const closeInspector = useCallback(() => setInspectorOpen(false), [])

  const bucketRange = useCallback(
    (c: number): [number, number] => [bucketLoBpm(c), bucketLoBpm(c + 1)],
    [],
  )

  return {
    rows: CAMELOT_ROWS,
    cols: MATRIX_COLS,
    buckets,
    selected,
    hover,
    inspectorOpen,
    /** Side of the grid the inspector opens on: the far half from the selection. */
    inspectorSide:
      selected && selected.c >= MATRIX_COLS / 2
        ? ('left' as const)
        : ('right' as const),
    selectedCohort: selected ? cohort(selected.r, selected.c) : [],
    cohort,
    bpmOf,
    bucketRange,
    relationTo,
    selectCell,
    clearSelection,
    closeInspector,
    setHover,
  }
}
