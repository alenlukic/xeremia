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
import type { Track } from '../types'

// The BPM cohort matrix: 26 geometric BPM bucket rows × 24 literal Camelot
// columns. The axes are fixed, so a cell address means the same thing for
// every set. Internally a cell keeps its historical (r, c) address: r indexes
// CAMELOT_ROWS and c indexes the BPM buckets, whichever way they render.

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

/** Group plottable tracks into their key × BPM cohort. */
export function bucketTracks(tracks: Track[]): Map<string, Track[]> {
  const buckets = new Map<string, Track[]>()
  for (const track of tracks) {
    if (track.camelot_code == null || track.bpm == null) {
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

/** A track the rest of the workspace has focused, e.g. a selected lane tile. */
export interface MatrixFocus {
  camelot_code: string | null
  bpm: number | null
}

export function useExplorerMatrix(
  tracks: Track[],
  focus?: MatrixFocus | null,
) {
  const [selected, setSelected] = useState<MatrixCell | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [hover, setHover] = useState<
    (MatrixCell & { rect: { l: number; r: number; t: number } }) | null
  >(null)

  // Light the grid for whatever the workspace has focused, exactly as if that
  // cell had been clicked. Adjusted during render rather than in an effect so
  // it lands in the same pass and never cascades.
  const focusKey =
    focus?.camelot_code && focus.bpm != null
      ? `${focus.camelot_code}:${focus.bpm}`
      : null
  const [lastFocusKey, setLastFocusKey] = useState(focusKey)
  // Remembered so dropping the focus only clears lighting that the focus put
  // there, never a cell the DJ picked by hand.
  const [focusDriven, setFocusDriven] = useState(false)
  if (focusKey !== lastFocusKey) {
    setLastFocusKey(focusKey)
    if (focusKey && focus?.camelot_code && focus.bpm != null) {
      const r = CAMELOT_ROWS.indexOf(focus.camelot_code)
      if (r >= 0) {
        // The inspector stays shut: this is a highlight, not a cell click.
        setSelected({ r, c: colForBpm(focus.bpm) })
        setFocusDriven(true)
      }
    } else if (focusDriven) {
      setSelected(null)
      setFocusDriven(false)
    }
  }

  const buckets = useMemo(() => bucketTracks(tracks), [tracks])

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
      setFocusDriven(false)
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
    /**
     * True while the lit cell came from the workspace focus rather than a
     * click, which is what the grid scrolls to bring into view.
     */
    focusDriven,
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
