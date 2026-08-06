import { useCallback, useEffect, useRef, useState } from 'react'
import { updateSetSequencer } from '../api/http'
import type { SequencerSettings } from '../types'

// Sequencer view state lives on the set, not in the component: start and end
// times are a property of the gig, so nothing here may be ephemeral. Edits
// apply instantly and are written back on a short debounce.

export const DEFAULT_START_MIN = 6 * 60
export const DEFAULT_END_MIN = 8 * 60
export const DEFAULT_TICK_MIN = 15
export const DEFAULT_PX_PER_MIN = 6

const SAVE_DEBOUNCE_MS = 400

export interface SequencerView {
  startMin: number
  endMin: number
  tickMin: number
  pxPerMin: number
  view: 'lanes' | 'list'
}

export function defaultView(): SequencerView {
  return {
    startMin: DEFAULT_START_MIN,
    endMin: DEFAULT_END_MIN,
    tickMin: DEFAULT_TICK_MIN,
    pxPerMin: DEFAULT_PX_PER_MIN,
    view: 'lanes',
  }
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
    tickMin: num(raw.tick_minutes, d.tickMin),
    pxPerMin: num(raw.px_per_min, d.pxPerMin),
    view: raw.view === 'list' ? ('list' as const) : ('lanes' as const),
  }
}

function toSettings(v: SequencerView): SequencerSettings {
  return {
    start_minutes: v.startMin,
    end_minutes: v.endMin,
    tick_minutes: v.tickMin,
    px_per_min: v.pxPerMin,
    view: v.view,
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
  const skipNextSaveRef = useRef(true)
  const setIdRef = useRef(setId)

  // Switching sets adopts that set's stored view.
  useEffect(() => {
    if (setIdRef.current === setId) {
      return
    }
    setIdRef.current = setId
    skipNextSaveRef.current = true
    setState(fromSettings(stored))
  }, [setId, stored])

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
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
