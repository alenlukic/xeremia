import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchWorkspaceLayout, saveWorkspaceLayout } from '../api/http'
import type {
  LayoutPlace,
  LockedWidgets,
  Placement,
  SavedLayout,
  ShellId,
  WidgetId,
  WorkspaceLayoutState,
} from '../types'

export type {
  LayoutPlace,
  LockedWidgets,
  Placement,
  SavedLayout,
  ShellId,
  WidgetId,
}

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

/**
 * Widgets are free-form rectangles measured in 8px units: an edge drag snaps to
 * the nearest unit, so sizes are arbitrary but always land on the same 8px
 * rhythm. Bounds come from the live canvas, so the grid is as large as the
 * window allows rather than a fixed number of panes.
 */
export const UNIT_PX = 8
export const MIN_W = 24
export const MIN_H = 12

/** The canvas size in units, measured from the rendered element. */
export interface Bounds {
  cols: number
  rows: number
}

export const FALLBACK_BOUNDS: Bounds = { cols: 158, rows: 117 }

/** A preset as fractions of the canvas, so it fits whatever the window is. */
type FractionRect = { fx: number; fy: number; fw: number; fh: number }

const PRESET_FRACTIONS: Record<string, Record<string, FractionRect>> = {
  'Track DND fanout': {
    browser: { fx: 0, fy: 0, fw: 2 / 3, fh: 1 / 2 },
    pool: { fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    matches: { fx: 0, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    explorer: { fx: 1 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    sequencer: { fx: 2 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
  },
  'Pool curation': {
    pool: { fx: 0, fy: 0, fw: 2 / 3, fh: 1 / 2 },
    browser: { fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    sequencer: { fx: 0, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    explorer: { fx: 1 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    matches: { fx: 2 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
  },
  'Explorer sandbox': {
    explorer: { fx: 0, fy: 0, fw: 2 / 3, fh: 1 / 2 },
    browser: { fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    sequencer: { fx: 0, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    pool: { fx: 1 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    matches: { fx: 2 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
  },
  'Sequencer run': {
    browser: { fx: 0, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    pool: { fx: 1 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    explorer: { fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    sequencer: { fx: 0, fy: 1 / 2, fw: 2 / 3, fh: 1 / 2 },
    matches: { fx: 2 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
  },
}

export const PRESET_NAMES = Object.keys(PRESET_FRACTIONS)

/** Materialise a preset at the current canvas size, snapped to whole units. */
export function presetPlace(name: string, bounds: Bounds): LayoutPlace {
  const spec = PRESET_FRACTIONS[name]
  if (!spec) {
    return {}
  }
  const place: LayoutPlace = {}
  for (const id of WIDGET_IDS) {
    const f = spec[id]
    if (!f) {
      continue
    }
    const x = Math.round(f.fx * bounds.cols)
    const y = Math.round(f.fy * bounds.rows)
    place[id] = {
      x,
      y,
      // Snap the far edge too, so adjacent widgets meet exactly.
      w: Math.max(MIN_W, Math.round((f.fx + f.fw) * bounds.cols) - x),
      h: Math.max(MIN_H, Math.round((f.fy + f.fh) * bounds.rows) - y),
    }
  }
  return place
}

export const DEFAULT_PRESET = 'Explorer sandbox'
export const CUSTOM_PRESET = 'Custom'

// The server row is the source of truth; localStorage only avoids a layout
// flash on the next cold start of the same device.
const CACHE_KEY = 'xeremia:workspace-layout:v2'
const SAVE_DEBOUNCE_MS = 400

function defaultState(): WorkspaceLayoutState {
  return {
    preset: DEFAULT_PRESET,
    place: presetPlace(DEFAULT_PRESET, FALLBACK_BOUNDS),
    custom: {},
    shell: 'workspace',
    locked: {},
  }
}

/** Rescale a rectangle from the canvas it was authored at onto a new one. */
export function scaleRect(p: Placement, from: Bounds, to: Bounds): Placement {
  const sx = to.cols / from.cols
  const sy = to.rows / from.rows
  return clampRect(
    {
      x: Math.round(p.x * sx),
      y: Math.round(p.y * sy),
      w: Math.round(p.w * sx),
      h: Math.round(p.h * sy),
    },
    to,
  )
}

export function clampRect(p: Placement, bounds: Bounds): Placement {
  const w = Math.min(Math.max(Math.round(p.w), MIN_W), bounds.cols)
  const h = Math.min(Math.max(Math.round(p.h), MIN_H), bounds.rows)
  return {
    w,
    h,
    x: Math.min(Math.max(Math.round(p.x), 0), bounds.cols - w),
    y: Math.min(Math.max(Math.round(p.y), 0), bounds.rows - h),
  }
}

function isRect(value: unknown): value is Placement {
  if (!value || typeof value !== 'object') {
    return false
  }
  const p = value as Record<string, unknown>
  return (
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    typeof p.w === 'number' &&
    typeof p.h === 'number' &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.w > 0 &&
    p.h > 0
  )
}

/** Read a stored rectangle, ignoring anything that is not one. */
function readPlacement(raw: unknown): Placement | null {
  return isRect(raw) ? { ...raw } : null
}

export function overlaps(a: Placement, b: Placement): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  )
}

/** First free spot that fits `w`×`h`, scanning top-left to bottom-right. */
export function firstFree(
  place: LayoutPlace,
  w: number,
  h: number,
  bounds: Bounds,
): Placement | null {
  // A gap can only start at the canvas edge or where another widget ends, so
  // those are the only positions worth testing.
  const seated = WIDGET_IDS.map((id) => place[id]).filter(
    (p): p is Placement => !!p,
  )
  const xs = [0, ...seated.map((p) => p.x + p.w)].sort((a, b) => a - b)
  const ys = [0, ...seated.map((p) => p.y + p.h)].sort((a, b) => a - b)
  for (const y of ys) {
    if (y + h > bounds.rows) {
      continue
    }
    for (const x of xs) {
      if (x + w > bounds.cols) {
        continue
      }
      const candidate = { x, y, w, h }
      const clash = WIDGET_IDS.some((id) => {
        const other = place[id]
        return !!other && overlaps(candidate, other)
      })
      if (!clash) {
        return candidate
      }
    }
  }
  return null
}

function normalizeLocked(raw: unknown): LockedWidgets {
  const locked: LockedWidgets = {}
  if (!raw || typeof raw !== 'object') {
    return locked
  }
  for (const id of WIDGET_IDS) {
    if ((raw as Record<string, unknown>)[id]) {
      locked[id] = true
    }
  }
  return locked
}

/** Keep only placements that fit and do not overlap one already accepted. */
function normalizePlace(raw: unknown, bounds: Bounds): LayoutPlace {
  const place: LayoutPlace = {}
  if (!raw || typeof raw !== 'object') {
    return place
  }
  for (const id of WIDGET_IDS) {
    const stored = readPlacement((raw as Record<string, unknown>)[id])
    if (!stored) {
      continue
    }
    const candidate = clampRect(stored, bounds)
    const clash = WIDGET_IDS.some((other) => {
      const seated = place[other]
      return !!seated && overlaps(candidate, seated)
    })
    place[id] = clash
      ? (firstFree(place, candidate.w, candidate.h, bounds) ?? candidate)
      : candidate
  }
  return place
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
      const record = (entry ?? {}) as Record<string, unknown>
      const nested = 'place' in record ? record.place : entry
      const place = normalizePlace(nested, FALLBACK_BOUNDS)
      if (Object.keys(place).length === 0) {
        continue
      }
      custom[name] = { place, locked: normalizeLocked(record.locked) }
    }
  }
  const authored =
    source.bounds &&
    typeof source.bounds === 'object' &&
    typeof (source.bounds as Bounds).cols === 'number' &&
    typeof (source.bounds as Bounds).rows === 'number'
      ? (source.bounds as Bounds)
      : undefined
  // Validate against the size the rectangles were written at, so nothing is
  // squeezed before the live canvas has reported in.
  const place = normalizePlace(source.place, authored ?? FALLBACK_BOUNDS)
  return {
    bounds: authored,
    preset: typeof source.preset === 'string' ? source.preset : defaults.preset,
    place: Object.keys(place).length > 0 ? place : defaults.place,
    custom,
    shell: source.shell === 'legacy' ? 'legacy' : 'workspace',
    locked: normalizeLocked(source.locked),
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

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * Apply an edge drag in grid units. The moving edges stop against whatever
 * blocks them — the canvas border or a neighbour — so a drag never overlaps
 * and never inverts the rectangle.
 */
export function resizeRect(
  place: LayoutPlace,
  id: WidgetId,
  edge: Edge,
  start: Placement,
  dx: number,
  dy: number,
  bounds: Bounds,
): Placement {
  const others = WIDGET_IDS.filter((other) => other !== id)
    .map((other) => place[other])
    .filter((p): p is Placement => !!p)

  let { x, y, w, h } = start
  if (edge.includes('w')) {
    const nx = Math.min(Math.max(start.x + dx, 0), start.x + start.w - MIN_W)
    w = start.x + start.w - nx
    x = nx
  }
  if (edge.includes('e')) {
    w = Math.min(Math.max(start.w + dx, MIN_W), bounds.cols - start.x)
  }
  if (edge.includes('n')) {
    const ny = Math.min(Math.max(start.y + dy, 0), start.y + start.h - MIN_H)
    h = start.y + start.h - ny
    y = ny
  }
  if (edge.includes('s')) {
    h = Math.min(Math.max(start.h + dy, MIN_H), bounds.rows - start.y)
  }

  // Back the moving edge off until it clears every neighbour.
  const blocked = (r: Placement) => others.some((o) => overlaps(r, o))
  while (blocked({ x, y, w, h })) {
    if (edge.includes('w') && x < start.x) {
      x++
      w--
    } else if (edge.includes('e') && w > MIN_W) {
      w--
    } else if (edge.includes('n') && y < start.y) {
      y++
      h--
    } else if (edge.includes('s') && h > MIN_H) {
      h--
    } else {
      return start
    }
    if (w < MIN_W || h < MIN_H) {
      return start
    }
  }
  return { x, y, w, h }
}

/** Move a widget to `x`,`y`; refuses a spot that would overlap a neighbour. */
export function moveRect(
  place: LayoutPlace,
  id: WidgetId,
  start: Placement,
  x: number,
  y: number,
  bounds: Bounds,
): Placement {
  const target = clampRect({ ...start, x, y }, bounds)
  const clash = WIDGET_IDS.some((other) => {
    if (other === id) {
      return false
    }
    const o = place[other]
    return !!o && overlaps(target, o)
  })
  return clash ? start : target
}

export interface WorkspaceLayout {
  preset: string
  presets: Record<string, LayoutPlace>
  place: LayoutPlace
  /** Canvas size in units, as last measured. */
  bounds: Bounds
  unitPx: number
  shell: ShellId
  hydrated: boolean
  saveError: string | null
  /** Widgets that are not on the canvas. */
  missing: WidgetId[]
  locked: LockedWidgets
  /** Report the canvas size so placements clamp to what is on screen. */
  setBounds: (bounds: Bounds) => void
  selectPreset: (name: string) => void
  saveCustomPreset: () => void
  setShell: (shell: ShellId) => void
  toggleLock: (id: WidgetId) => void
  removeWidget: (id: WidgetId) => void
  addWidget: (id: WidgetId) => void
  resizeWidget: (
    id: WidgetId,
    edge: Edge,
    start: Placement,
    dx: number,
    dy: number,
  ) => void
  moveWidget: (id: WidgetId, start: Placement, x: number, y: number) => void
}

export function useWorkspaceLayout(): WorkspaceLayout {
  const [state, setState] = useState<WorkspaceLayoutState>(readCache)
  const [bounds, setBoundsState] = useState<Bounds>(FALLBACK_BOUNDS)
  const boundsRef = useRef<Bounds>(FALLBACK_BOUNDS)
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

  const setBounds = useCallback((next: Bounds) => {
    const prev = boundsRef.current
    boundsRef.current = next
    if (prev.cols === next.cols && prev.rows === next.rows) {
      return
    }
    setBoundsState(next)
    setState((s) => {
      // A built-in preset is defined in fractions, so it reflows to fill the
      // new canvas exactly.
      if (PRESET_NAMES.includes(s.preset)) {
        return { ...s, bounds: next, place: presetPlace(s.preset, next) }
      }
      // A hand-made layout keeps its proportions. Rescaling from the size it
      // was authored at is what stops a narrower window from shoving the
      // right-hand widgets left and overlapping the ones beside them.
      const from = s.bounds ?? prev
      if (from.cols === next.cols && from.rows === next.rows) {
        return { ...s, bounds: next }
      }
      const place: LayoutPlace = {}
      for (const id of WIDGET_IDS) {
        const p = s.place[id]
        if (p) {
          place[id] = scaleRect(p, from, next)
        }
      }
      return { ...s, bounds: next, place }
    })
  }, [])

  const presets: Record<string, LayoutPlace> = {}
  for (const name of PRESET_NAMES) {
    presets[name] = presetPlace(name, bounds)
  }
  for (const [name, saved] of Object.entries(state.custom)) {
    presets[name] = saved.place
  }

  const selectPreset = useCallback((name: string) => {
    setState((s) => {
      const saved = s.custom[name]
      if (saved) {
        return {
          ...s,
          preset: name,
          place: saved.place,
          locked: saved.locked ?? {},
        }
      }
      // A built-in preset is a fresh start, so it clears any locks too. It is
      // built at the live canvas size rather than replayed from fixed cells.
      if (!PRESET_NAMES.includes(name)) {
        return s
      }
      return {
        ...s,
        preset: name,
        place: presetPlace(name, boundsRef.current),
        locked: {},
      }
    })
  }, [])

  const setPlace = useCallback((fn: (place: LayoutPlace) => LayoutPlace) => {
    setState((s) => ({ ...s, preset: CUSTOM_PRESET, place: fn(s.place) }))
  }, [])

  const saveCustomPreset = useCallback(() => {
    setState((s) => {
      const name = `Custom ${Object.keys(s.custom).length + 1}`
      const saved: SavedLayout = { place: s.place, locked: s.locked }
      return { ...s, preset: name, custom: { ...s.custom, [name]: saved } }
    })
  }, [])

  const setShell = useCallback((shell: ShellId) => {
    setState((s) => (s.shell === shell ? s : { ...s, shell }))
  }, [])

  const toggleLock = useCallback((id: WidgetId) => {
    setState((s) => {
      const locked = { ...s.locked }
      if (locked[id]) {
        delete locked[id]
      } else {
        locked[id] = true
      }
      return { ...s, locked }
    })
  }, [])

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
    (id: WidgetId) => {
      setPlace((place) => {
        const b = boundsRef.current
        const w = Math.max(MIN_W, Math.round(b.cols / 3))
        const h = Math.max(MIN_H, Math.round(b.rows / 2))
        const spot =
          firstFree(place, w, h, b) ?? firstFree(place, MIN_W, MIN_H, b)
        return spot ? { ...place, [id]: spot } : place
      })
    },
    [setPlace],
  )

  const resizeWidget = useCallback(
    (id: WidgetId, edge: Edge, start: Placement, dx: number, dy: number) => {
      setPlace((place) =>
        state.locked?.[id]
          ? place
          : {
              ...place,
              [id]: resizeRect(
                place,
                id,
                edge,
                start,
                dx,
                dy,
                boundsRef.current,
              ),
            },
      )
    },
    [setPlace, state.locked],
  )

  const moveWidget = useCallback(
    (id: WidgetId, start: Placement, x: number, y: number) => {
      setPlace((place) => ({
        ...place,
        [id]: moveRect(place, id, start, x, y, boundsRef.current),
      }))
    },
    [setPlace],
  )

  const missing = useMemo(
    () => WIDGET_IDS.filter((id) => !state.place[id]),
    [state.place],
  )

  return {
    preset: state.preset,
    presets,
    place: state.place,
    bounds,
    unitPx: UNIT_PX,
    shell: state.shell,
    hydrated,
    saveError,
    missing,
    locked: state.locked ?? {},
    setBounds,
    selectPreset,
    saveCustomPreset,
    setShell,
    toggleLock,
    removeWidget,
    addWidget,
    resizeWidget,
    moveWidget,
  }
}
