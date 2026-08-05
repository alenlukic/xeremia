import { useCallback, useEffect, useState } from 'react'

export type WidgetId = 'browser' | 'matches' | 'pool' | 'explorer' | 'sequencer'
export interface Placement { r: 0 | 1; c: 0 | 1 | 2; span: 1 | 2 }
export type LayoutPlace = Partial<Record<WidgetId, Placement>>

export const LAYOUT_PRESETS: Record<string, LayoutPlace> = {
  'Track DND fanout': {
    browser: { r: 0, c: 0, span: 2 },
    pool: { r: 0, c: 2, span: 1 },
    matches: { r: 1, c: 0, span: 2 },
    sequencer: { r: 1, c: 2, span: 1 },
  },
  'Pool curation': {
    pool: { r: 0, c: 0, span: 2 },
    browser: { r: 0, c: 2, span: 1 },
    sequencer: { r: 1, c: 0, span: 2 },
    matches: { r: 1, c: 2, span: 1 },
  },
  'Explorer sandbox': {
    explorer: { r: 0, c: 0, span: 2 },
    browser: { r: 0, c: 2, span: 1 },
    sequencer: { r: 1, c: 0, span: 2 },
    matches: { r: 1, c: 2, span: 1 },
  },
}

const STORAGE_KEY = 'xeremia:workspace-layout:v1'
// TODO(server): optionally persist through /api/admin/table-preferences with a
// dedicated 'workspace' table id so layouts follow the device hash.

interface Persisted {
  preset: string
  place: LayoutPlace
  cols: [number, number, number]
  rows: [number, number]
  custom: Record<string, LayoutPlace>
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Persisted
  } catch { /* fall through to defaults */ }
  return {
    preset: 'Explorer sandbox',
    place: LAYOUT_PRESETS['Explorer sandbox'],
    cols: [1, 1, 1],
    rows: [1, 1],
    custom: {},
  }
}

export function useWorkspaceLayout() {
  const [state, setState] = useState<Persisted>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch { /* quota errors are non-critical */ }
  }, [state])

  const presets = { ...LAYOUT_PRESETS, ...state.custom }

  const selectPreset = useCallback((name: string) => {
    setState((s) => {
      const preset = { ...LAYOUT_PRESETS, ...s.custom }[name]
      if (!preset) return s
      // Choosing a preset also resets fr allocations.
      return { ...s, preset: name, place: preset, cols: [1, 1, 1], rows: [1, 1] }
    })
  }, [])

  const setPlace = useCallback((fn: (place: LayoutPlace) => LayoutPlace) => {
    setState((s) => ({ ...s, preset: 'Custom', place: fn(s.place) }))
  }, [])

  const saveCustomPreset = useCallback(() => {
    setState((s) => {
      const name = `Custom ${Object.keys(s.custom).length + 1}`
      return { ...s, preset: name, custom: { ...s.custom, [name]: s.place } }
    })
  }, [])

  /** Move the divider between grid tracks; fr values clamp at 0.3 (cols) / 0.35 (rows). */
  const resize = useCallback(
    (axis: 'col' | 'row', k: number, fr0: number[], deltaFrac: number) => {
      setState((s) => {
        const min = axis === 'col' ? 0.3 : 0.35
        const d = Math.max(min - fr0[k - 1], Math.min(fr0[k] - min, deltaFrac))
        const next = fr0.slice()
        next[k - 1] += d
        next[k] -= d
        return axis === 'col'
          ? { ...s, cols: next as [number, number, number] }
          : { ...s, rows: next as [number, number] }
      })
    },
    [],
  )

  return {
    preset: state.preset,
    presets,
    place: state.place,
    cols: state.cols,
    rows: state.rows,
    selectPreset,
    setPlace,
    saveCustomPreset,
    resize,
  }
}
