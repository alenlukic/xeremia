import { useCallback, useEffect, useRef, useState } from 'react'
import { updateSetSequencer } from '../api/http'
import type { SequencerSettings } from '../types'

// Sequencer view state lives on the set, not in the component: start and end
// times are a property of the gig, so nothing here may be ephemeral. Edits
// apply instantly and are written back on a short debounce.

export const DEFAULT_START_MIN = 6 * 60
export const DEFAULT_END_MIN = 8 * 60
export const DEFAULT_PX_PER_MIN = 6

const SAVE_DEBOUNCE_MS = 400

export interface SequencerView {
  startMin: number
  endMin: number
  /**
   * True once the set carries an end time of its own. Only then does the end
   * act as a marker the tracks are scaled to reach — a default nobody chose
   * would otherwise stretch the first track of a new set across hours.
   */
  endIsSet: boolean
  pxPerMin: number
  view: 'lanes' | 'list'
  benchTimes: Record<string, number>
  benchOverrides: Record<string, Record<string, number | null>>
  starredTiles: Record<string, boolean>
  pinnedTiles: Record<string, boolean>
}

export function defaultView(): SequencerView {
  return {
    startMin: DEFAULT_START_MIN,
    endMin: DEFAULT_END_MIN,
    endIsSet: false,
    pxPerMin: DEFAULT_PX_PER_MIN,
    view: 'lanes',
    benchTimes: {},
    benchOverrides: {},
    starredTiles: {},
    pinnedTiles: {},
  }
}

/** Preserve lane-scoped keys while accepting legacy numeric keys as strings. */
function storedKeys<V>(raw: Record<string, V> | undefined): Record<string, V> {
  const out: Record<string, V> = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (k) {
      out[k] = v
    }
  }
  return out
}

/** Read the stored blob, falling back per field so a partial row still works. */
export function fromSettings(raw: SequencerSettings | null | undefined) {
  const d = defaultView()
  if (!raw) {
    return d
  }
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return {
    startMin: num(raw.start_minutes, d.startMin),
    endMin: num(raw.end_minutes, d.endMin),
    endIsSet: typeof raw.end_minutes === 'number' &&
      Number.isFinite(raw.end_minutes),
    pxPerMin: num(raw.px_per_min, d.pxPerMin),
    view: raw.view === 'list' ? ('list' as const) : ('lanes' as const),
    benchTimes: storedKeys(raw.bench_times),
    benchOverrides: storedKeys(raw.bench_overrides),
    starredTiles: storedKeys(raw.starred_tiles),
    pinnedTiles: storedKeys(raw.pinned_tiles),
  }
}

function toSettings(v: SequencerView): SequencerSettings {
  return {
    start_minutes: v.startMin,
    end_minutes: v.endMin,
    px_per_min: v.pxPerMin,
    view: v.view,
    bench_times: v.benchTimes,
    bench_overrides: v.benchOverrides,
    starred_tiles: v.starredTiles,
    pinned_tiles: v.pinnedTiles,
  }
}

export function useSequencerSettings(
  setId: number | null,
  stored: SequencerSettings | null | undefined,
) {
  const [state, setState] = useState<SequencerView>(() => fromSettings(stored))
  const [saveError, setSaveError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Adopting a set's stored state must not immediately write it back.
  // A set switch causes two effect passes (setId change, then state adoption).
  const skipSavesRef = useRef(1)
  const setIdRef = useRef(setId)

  // Switching sets adopts that set's stored view.
  useEffect(() => {
    if (setIdRef.current === setId) {
      return
    }
    setIdRef.current = setId
    skipSavesRef.current = 2
    setState(fromSettings(stored))
  }, [setId, stored])

  useEffect(() => {
    if (skipSavesRef.current > 0) {
      skipSavesRef.current -= 1
      return
    }
    if (setId === null) {
      return
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      updateSetSequencer(setId, toSettings(state))
        .then(() => setSaveError(null))
        .catch((err: unknown) =>
          setSaveError(
            err instanceof Error ? err.message : 'Failed to save sequencer',
          ),
        )
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state, setId])

  const patch = useCallback((next: Partial<SequencerView>) => {
    setState((s) => ({ ...s, ...next }))
  }, [])

  return { ...state, patch, saveError }
}
