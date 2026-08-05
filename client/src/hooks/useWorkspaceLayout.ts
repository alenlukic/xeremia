import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWorkspaceLayout, saveWorkspaceLayout } from '../api/http'
import type {
  LayoutPlace,
  Placement,
  SavedLayout,
  ShellId,
  WidgetId,
  WorkspaceLayoutState,
} from '../types'

export type { LayoutPlace, Placement, SavedLayout, ShellId, WidgetId }

export const WIDGET_IDS: WidgetId[] = [
  'browser',
  'matches',
  'pool',
  'explorer',
  'sequencer',
]

export const WIDGET_LABELS: Record<WidgetId, string> = {
  browser: 'Browser',
  matches: 'Matches',
  pool: 'Pool',
  explorer: 'Explorer',
  sequencer: 'Sequencer',
}

export const GRID_ROWS = 2
export const GRID_COLS = 3

// Every preset places all five widgets. Six cells hold five widgets only when
// exactly one of them spans two columns.
export const LAYOUT_PRESETS: Record<string, LayoutPlace> = {
  'Track DND fanout': {
    browser: { r: 0, c: 0, span: 2 },
    pool: { r: 0, c: 2, span: 1 },
    matches: { r: 1, c: 0, span: 1 },
    explorer: { r: 1, c: 1, span: 1 },
    sequencer: { r: 1, c: 2, span: 1 },
  },
  'Pool curation': {
    pool: { r: 0, c: 0, span: 2 },
    browser: { r: 0, c: 2, span: 1 },
    sequencer: { r: 1, c: 0, span: 1 },
    explorer: { r: 1, c: 1, span: 1 },
    matches: { r: 1, c: 2, span: 1 },
  },
  'Explorer sandbox': {
    explorer: { r: 0, c: 0, span: 2 },
    browser: { r: 0, c: 2, span: 1 },
    sequencer: { r: 1, c: 0, span: 1 },
    pool: { r: 1, c: 1, span: 1 },
    matches: { r: 1, c: 2, span: 1 },
  },
  'Sequencer run': {
    browser: { r: 0, c: 0, span: 1 },
    pool: { r: 0, c: 1, span: 1 },
    explorer: { r: 0, c: 2, span: 1 },
    sequencer: { r: 1, c: 0, span: 2 },
    matches: { r: 1, c: 2, span: 1 },
  },
}

export const DEFAULT_PRESET = 'Explorer sandbox'
export const CUSTOM_PRESET = 'Custom'
export const MIN_COL_FR = 0.3
export const MIN_ROW_FR = 0.35

// The server row is the source of truth; localStorage only avoids a layout
// flash on the next cold start of the same device.
const CACHE_KEY = 'xeremia:workspace-layout:v1'
const SAVE_DEBOUNCE_MS = 400

function defaultState(): WorkspaceLayoutState {
  return {
    preset: DEFAULT_PRESET,
    place: LAYOUT_PRESETS[DEFAULT_PRESET],
    cols: [1, 1, 1],
    rows: [1, 1],
    custom: {},
    shell: 'workspace',
  }
}

function isPlacement(value: unknown): value is Placement {
  if (!value || typeof value !== 'object') {
    return false
  }
  const p = value as Record<string, unknown>
  return (
    (p.r === 0 || p.r === 1) &&
    (p.c === 0 || p.c === 1 || p.c === 2) &&
    (p.span === 1 || p.span === 2)
  )
}

function normalizePlace(raw: unknown): LayoutPlace {
  const place: LayoutPlace = {}
  if (!raw || typeof raw !== 'object') {
    return place
  }
  for (const id of WIDGET_IDS) {
    const candidate = (raw as Record<string, unknown>)[id]
    if (isPlacement(candidate)) {
      place[id] = { r: candidate.r, c: candidate.c, span: candidate.span }
    }
  }
  return place
}

function cellsOf(p: Placement): string[] {
  const cells: string[] = []
  for (let i = 0; i < p.span; i++) {
    cells.push(`${p.r}:${p.c + i}`)
  }
  return cells
}

/** First run of `span` free columns, scanning rows then columns. */
function firstFree(taken: Set<string>, span: 1 | 2): Placement | null {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c + span <= GRID_COLS; c++) {
      const candidate = { r, c, span } as Placement
      if (cellsOf(candidate).every((cell) => !taken.has(cell))) {
        return candidate
      }
    }
  }
  return null
}

/**
 * Place one widget and re-seat anything it now covers. A displaced widget takes
 * the first free run, shrinks to one column when its span no longer fits, and
 * leaves the grid for the tray only when no cell is free at all.
 */
export function withPlacement(
  place: LayoutPlace,
  id: WidgetId,
  target: Placement,
): LayoutPlace {
  const next: LayoutPlace = { [id]: target }
  const taken = new Set(cellsOf(target))
  const displaced: WidgetId[] = []
  for (const other of WIDGET_IDS) {
    const current = other === id ? undefined : place[other]
    if (!current) {
      continue
    }
    if (cellsOf(current).some((cell) => taken.has(cell))) {
      displaced.push(other)
      continue
    }
    next[other] = current
    for (const cell of cellsOf(current)) {
      taken.add(cell)
    }
  }
  for (const other of displaced) {
    const span = place[other]?.span ?? 1
    const spot = firstFree(taken, span) ?? firstFree(taken, 1)
    if (!spot) {
      continue
    }
    next[other] = spot
    for (const cell of cellsOf(spot)) {
      taken.add(cell)
    }
  }
  return next
}

function frTriple(raw: unknown, fallback: number[], min: number): number[] {
  if (!Array.isArray(raw) || raw.length !== fallback.length) {
    return fallback.slice()
  }
  const values = raw.map((v) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : 1,
  )
  return values
}

/** Accept only the shape this hook wrote, so a stale row can never break the grid. */
export function normalizeLayout(raw: unknown): WorkspaceLayoutState {
  const defaults = defaultState()
  if (!raw || typeof raw !== 'object') {
    return defaults
  }
  const source = raw as Record<string, unknown>
  const custom: Record<string, SavedLayout> = {}
  if (source.custom && typeof source.custom === 'object') {
    for (const [name, entry] of Object.entries(
      source.custom as Record<string, unknown>,
    )) {
      // A row written before saved presets carried allocations holds the
      // placement on its own.
      const record = (entry ?? {}) as Record<string, unknown>
      const nested = 'place' in record ? record.place : entry
      const place = normalizePlace(nested)
      if (Object.keys(place).length === 0) {
        continue
      }
      custom[name] = {
        place,
        cols: frTriple(record.cols, defaults.cols, MIN_COL_FR) as [
          number,
          number,
          number,
        ],
        rows: frTriple(record.rows, defaults.rows, MIN_ROW_FR) as [
          number,
          number,
        ],
      }
    }
  }
  const place = normalizePlace(source.place)
  return {
    preset: typeof source.preset === 'string' ? source.preset : defaults.preset,
    place: Object.keys(place).length > 0 ? place : defaults.place,
    cols: frTriple(source.cols, defaults.cols, MIN_COL_FR) as [
      number,
      number,
      number,
    ],
    rows: frTriple(source.rows, defaults.rows, MIN_ROW_FR) as [number, number],
    custom,
    shell: source.shell === 'legacy' ? 'legacy' : 'workspace',
  }
}

function readCache(): WorkspaceLayoutState {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      return normalizeLayout(JSON.parse(raw))
    }
  } catch {
    /* a corrupt cache is no worse than a cold start */
  }
  return defaultState()
}

function writeCache(state: WorkspaceLayoutState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state))
  } catch {
    /* quota errors are non-critical */
  }
}

export interface WorkspaceLayout {
  preset: string
  presets: Record<string, LayoutPlace>
  place: LayoutPlace
  cols: [number, number, number]
  rows: [number, number]
  shell: ShellId
  editing: boolean
  hydrated: boolean
  saveError: string | null
  /** Widgets that no preset cell currently holds. */
  missing: WidgetId[]
  selectPreset: (name: string) => void
  setPlace: (fn: (place: LayoutPlace) => LayoutPlace) => void
  saveCustomPreset: () => void
  setEditing: (editing: boolean) => void
  setShell: (shell: ShellId) => void
  swapWidgets: (a: WidgetId, b: WidgetId) => void
  setSpan: (id: WidgetId, span: 1 | 2) => void
  removeWidget: (id: WidgetId) => void
  addWidget: (id: WidgetId, at: { r: 0 | 1; c: 0 | 1 | 2 }) => void
  resize: (
    axis: 'col' | 'row',
    k: number,
    fr0: number[],
    deltaFrac: number,
  ) => void
}

export function useWorkspaceLayout(): WorkspaceLayout {
  const [state, setState] = useState<WorkspaceLayoutState>(readCache)
  const [editing, setEditing] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Skip the save that the hydration itself triggers.
  const skipNextSaveRef = useRef(true)

  useEffect(() => {
    let cancelled = false
    fetchWorkspaceLayout()
      .then((layout) => {
        if (cancelled) {
          return
        }
        if (layout) {
          skipNextSaveRef.current = true
          setState(normalizeLayout(layout))
        }
      })
      .catch(() => {
        /* the cached layout stays usable offline */
      })
      .finally(() => {
        if (!cancelled) {
          setHydrated(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    writeCache(state)
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      saveWorkspaceLayout(state)
        .then(() => setSaveError(null))
        .catch((err: unknown) =>
          setSaveError(
            err instanceof Error ? err.message : 'Failed to save layout',
          ),
        )
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state])

  const presets: Record<string, LayoutPlace> = { ...LAYOUT_PRESETS }
  for (const [name, saved] of Object.entries(state.custom)) {
    presets[name] = saved.place
  }

  const selectPreset = useCallback((name: string) => {
    setState((s) => {
      const saved = s.custom[name]
      if (saved) {
        // A saved preset restores the exact layout it captured.
        return {
          ...s,
          preset: name,
          place: saved.place,
          cols: saved.cols,
          rows: saved.rows,
        }
      }
      const builtin = LAYOUT_PRESETS[name]
      if (!builtin) {
        return s
      }
      // A built-in preset also resets fr allocations.
      return {
        ...s,
        preset: name,
        place: builtin,
        cols: [1, 1, 1],
        rows: [1, 1],
      }
    })
  }, [])

  const setPlace = useCallback((fn: (place: LayoutPlace) => LayoutPlace) => {
    setState((s) => ({ ...s, preset: CUSTOM_PRESET, place: fn(s.place) }))
  }, [])

  const saveCustomPreset = useCallback(() => {
    setState((s) => {
      const name = `Custom ${Object.keys(s.custom).length + 1}`
      const saved: SavedLayout = { place: s.place, cols: s.cols, rows: s.rows }
      return { ...s, preset: name, custom: { ...s.custom, [name]: saved } }
    })
  }, [])

  const setShell = useCallback((shell: ShellId) => {
    setState((s) => (s.shell === shell ? s : { ...s, shell }))
  }, [])

  const swapWidgets = useCallback(
    (a: WidgetId, b: WidgetId) => {
      if (a === b) {
        return
      }
      setPlace((place) => {
        const next = { ...place }
        const held = next[a]
        if (next[b]) {
          next[a] = next[b]
        } else {
          delete next[a]
        }
        if (held) {
          next[b] = held
        } else {
          delete next[b]
        }
        return next
      })
    },
    [setPlace],
  )

  const setSpan = useCallback(
    (id: WidgetId, span: 1 | 2) => {
      setPlace((place) => {
        const current = place[id]
        if (!current) {
          return place
        }
        // A span of 2 has to fit inside the three columns.
        const c = span === 2 && current.c === 2 ? 1 : current.c
        return withPlacement(place, id, { ...current, c, span })
      })
    },
    [setPlace],
  )

  const removeWidget = useCallback(
    (id: WidgetId) => {
      setPlace((place) => {
        const next = { ...place }
        delete next[id]
        return next
      })
    },
    [setPlace],
  )

  const addWidget = useCallback(
    (id: WidgetId, at: { r: 0 | 1; c: 0 | 1 | 2 }) => {
      setPlace((place) => withPlacement(place, id, { ...at, span: 1 }))
    },
    [setPlace],
  )

  /** Move the divider between grid tracks; fr values clamp at the axis minimum. */
  const resize = useCallback(
    (axis: 'col' | 'row', k: number, fr0: number[], deltaFrac: number) => {
      setState((s) => {
        const min = axis === 'col' ? MIN_COL_FR : MIN_ROW_FR
        const d = Math.max(min - fr0[k - 1], Math.min(fr0[k] - min, deltaFrac))
        const next = fr0.slice()
        next[k - 1] += d
        next[k] -= d
        // A resize is a layout edit, so the header stops claiming the preset.
        return axis === 'col'
          ? {
              ...s,
              preset: CUSTOM_PRESET,
              cols: next as [number, number, number],
            }
          : { ...s, preset: CUSTOM_PRESET, rows: next as [number, number] }
      })
    },
    [],
  )

  const missing = WIDGET_IDS.filter((id) => !state.place[id])

  return {
    preset: state.preset,
    presets,
    place: state.place,
    cols: state.cols,
    rows: state.rows,
    shell: state.shell,
    editing,
    hydrated,
    saveError,
    missing,
    selectPreset,
    setPlace,
    saveCustomPreset,
    setEditing,
    setShell,
    swapWidgets,
    setSpan,
    removeWidget,
    addWidget,
    resize,
  }
}
