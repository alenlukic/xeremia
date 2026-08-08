import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchWorkspaceLayout, saveWorkspaceLayout } from '../api/http'
import {
  CUSTOM_PRESET,
  DEFAULT_PRESET,
  FALLBACK_BOUNDS,
  MIN_H,
  MIN_W,
  PRESET_NAMES,
  UNIT_PX,
  WIDGET_IDS,
  WIDGET_LABELS,
  clampRect,
  firstFree,
  hasDuplicatePresetName,
  isReservedPresetName,
  moveRect,
  overlaps,
  presetPlace,
  resizeRect,
  scaleRect,
  type Bounds,
  type Edge,
} from '../utils/workspaceGeometry'
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

export {
  CUSTOM_PRESET,
  DEFAULT_PRESET,
  FALLBACK_BOUNDS,
  MIN_H,
  MIN_W,
  PRESET_NAMES,
  UNIT_PX,
  WIDGET_IDS,
  WIDGET_LABELS,
  clampRect,
  firstFree,
  moveRect,
  overlaps,
  presetPlace,
  resizeRect,
  scaleRect,
}
export type { Bounds, Edge }

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
    shell: 'workspace',
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
  clearSaveError: () => void
  /** Widgets that are not on the canvas. */
  missing: WidgetId[]
  locked: LockedWidgets
  /** Report the canvas size so placements clamp to what is on screen. */
  setBounds: (bounds: Bounds) => void
  selectPreset: (name: string) => void
  saveCustomPreset: (name: string) => void
  renamePreset: (name: string) => void
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
  const localMutationRef = useRef(false)
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
          if (localMutationRef.current) {
            return
          }
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
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    const skipSave = skipNextSaveRef.current
    skipNextSaveRef.current = false
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      writeCache(state)
      if (skipSave) {
        return
      }
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

  const mutateState = useCallback(
    (updater: (current: WorkspaceLayoutState) => WorkspaceLayoutState) => {
      localMutationRef.current = true
      setState(updater)
    },
    [],
  )

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
    mutateState((s) => {
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
  }, [mutateState])

  const setPlace = useCallback((fn: (place: LayoutPlace) => LayoutPlace) => {
    mutateState((s) => ({ ...s, preset: CUSTOM_PRESET, place: fn(s.place) }))
  }, [mutateState])

  const saveCustomPreset = useCallback((requestedName: string) => {
    mutateState((s) => {
      const name = requestedName.trim()
      const duplicate = hasDuplicatePresetName(Object.keys(s.custom), name)
      const reserved = isReservedPresetName(name)
      if (!name || reserved || duplicate) {
        return s
      }
      const saved: SavedLayout = { place: s.place, locked: s.locked }
      return { ...s, preset: name, custom: { ...s.custom, [name]: saved } }
    })
  }, [mutateState])

  const renamePreset = useCallback((requestedName: string) => {
    mutateState((s) => {
      const name = requestedName.trim()
      const duplicate = hasDuplicatePresetName(
        Object.keys(s.custom),
        name,
        s.preset,
      )
      const reserved = isReservedPresetName(name)
      if (!name || name === s.preset || reserved || duplicate) {
        return s
      }
      const custom = { ...s.custom }
      if (custom[s.preset]) {
        delete custom[s.preset]
      }
      custom[name] = { place: s.place, locked: s.locked }
      return { ...s, preset: name, custom }
    })
  }, [mutateState])

  const setShell = useCallback((shell: ShellId) => {
    mutateState((s) => (s.shell === shell ? s : { ...s, shell }))
  }, [mutateState])

  const toggleLock = useCallback((id: WidgetId) => {
    mutateState((s) => {
      const locked = { ...s.locked }
      if (locked[id]) {
        delete locked[id]
      } else {
        locked[id] = true
      }
      return { ...s, locked }
    })
  }, [mutateState])

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

  const clearSaveError = useCallback(() => {
    setSaveError(null)
  }, [])

  return {
    preset: state.preset,
    presets,
    place: state.place,
    bounds,
    unitPx: UNIT_PX,
    shell: state.shell,
    hydrated,
    saveError,
    clearSaveError,
    missing,
    locked: state.locked ?? {},
    setBounds,
    selectPreset,
    saveCustomPreset,
    renamePreset,
    setShell,
    toggleLock,
    removeWidget,
    addWidget,
    resizeWidget,
    moveWidget,
  }
}
