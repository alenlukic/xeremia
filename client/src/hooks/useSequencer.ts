import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { tracklistSetOverrides } from '../api/http'
import { DUR_MAX, DUR_MIN } from '../utils/harmonic'
import type {
  PoolEntry,
  PoolSubgroup,
  PoolSubgroupMembership,
  Track,
  TracklistEntry,
} from '../types'
import { TRACK_DRAG_MIME } from '../utils'

// Sequencer state: the committed lane IS the server tracklist in position
// order, and alternative lanes are pool subgroups holding benched candidates.
// Per-track overrides live on the tracklist row, so a plan survives a reload.

/**
 * Share of a track that actually plays. Developer constant — the mock calls it
 * playFraction and ships no user-facing control for it.
 */
export const PLAY_FRACTION = 0.7

/** Assumed length when a track has no measured duration yet. */
export const FALLBACK_LEN_MIN = 5

/** Lane drags land on a half-minute grid. */
export const SNAP_MIN = 0.5

/** The bench lane that exists before any subgroup does. */
export const DEFAULT_LANE_NAME = 'Alt 1'

/**
 * Ruler spacing follows the zoom: the coarsest tick that still leaves a
 * readable gap between labels wins, so there is nothing to pick by hand.
 */
const TICK_CHOICES = [1, 2, 5, 10, 15, 30, 60]
const MIN_TICK_PX = 56

export function tickForZoom(pxPerMin: number): number {
  return (
    TICK_CHOICES.find((t) => t * pxPerMin >= MIN_TICK_PX) ??
    TICK_CHOICES[TICK_CHOICES.length - 1]
  )
}
export interface BlockOverride {
  durOv: number | null
  endPin: number | null
  bpmOv: number | null
}

export type OverrideMap = Record<number, Partial<BlockOverride>>

export interface LaidBlock {
  entry: TracklistEntry
  /** Start time in minutes since midnight. */
  t: number
  /** Laid-out play length in minutes. */
  dur: number
  /** Auto-scale factor applied by a pinned end (1 when untouched). */
  scale: number
  pinned: boolean
  /** True when the length rests on the fallback rather than a measured duration. */
  fallback: boolean
}

/** A benched candidate at its own free time on an alternative lane. */
export interface BenchBlock {
  entry: PoolEntry
  t: number
  dur: number
  fallback: boolean
}

export interface SequencerLane {
  /**
   * Null only on the virtual default lane, which exists while the set has no
   * pool subgroup. The first drop on it creates the backing subgroup.
   */
  group: PoolSubgroup | null
  name: string
  entries: PoolEntry[]
}

/** Lane identity as the drag contract carries it. */
export type LaneKey = number | 'default'

export function hasMeasuredDuration(track: Track | null | undefined): boolean {
  const seconds = track?.duration_seconds
  return seconds != null && Number.isFinite(seconds) && seconds > 0
}

/** Track length in minutes, from the audio header when the backfill has run. */
export function trackLengthMinutes(track: Track | null | undefined): number {
  const seconds = track?.duration_seconds
  if (!hasMeasuredDuration(track) || seconds == null) {
    return FALLBACK_LEN_MIN
  }
  return seconds / 60
}

/** Default play length before any override, rounded to a tenth of a minute. */
export function defaultPlayMinutes(track: Track | null | undefined): number {
  return Math.round(PLAY_FRACTION * trackLengthMinutes(track) * 10) / 10
}

export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN
}

/** Server-stored overrides for one entry, with any unsaved edit layered on top. */
export function entryOverride(
  entry: TracklistEntry,
  pending?: Partial<BlockOverride>,
): BlockOverride {
  return {
    durOv:
      pending && 'durOv' in pending
        ? (pending.durOv ?? null)
        : (entry.play_minutes ?? null),
    endPin:
      pending && 'endPin' in pending
        ? (pending.endPin ?? null)
        : (entry.pinned_end_minutes ?? null),
    bpmOv:
      pending && 'bpmOv' in pending
        ? (pending.bpmOv ?? null)
        : (entry.bpm_override ?? null),
  }
}

export function buildOverrideMap(
  entries: TracklistEntry[],
  pending: OverrideMap = {},
): OverrideMap {
  const map: OverrideMap = {}
  for (const entry of entries) {
    map[entry.track_id] = entryOverride(entry, pending[entry.track_id])
  }
  return map
}

/**
 * Committed lane packs end-to-end from startMin. A pinned end proportionally
 * scales the run before it, but every block's length is clamped to
 * [base·(1−0.083), base·(1+0.0905)] — the BPM pitch window always wins. When
 * the clamp makes a pin unreachable, the next run continues from the length the
 * clamp allowed, so the lane never gains a gap or an overlap.
 */
export function layoutCommitted(
  entries: TracklistEntry[],
  ov: OverrideMap,
  startMin: number,
  durationOf: (e: TracklistEntry) => number = (e) =>
    trackLengthMinutes(e.track),
): LaidBlock[] {
  const base = (e: TracklistEntry) =>
    ov[e.track_id]?.durOv ?? Math.round(PLAY_FRACTION * durationOf(e) * 10) / 10
  const playedRatio = (e: TracklistEntry) => {
    const bpm = e.track?.bpm
    const set = ov[e.track_id]?.bpmOv
    if (!bpm || set == null) {
      return 1
    }
    const clamped = Math.max(bpm * DUR_MIN, Math.min(bpm * DUR_MAX, set))
    return bpm / clamped
  }
  const natural = (e: TracklistEntry) => base(e) * playedRatio(e)
  const list = entries.slice().sort((a, b) => a.position - b.position)
  const out: LaidBlock[] = []
  let cursor = startMin
  let i = 0
  while (i < list.length) {
    let j = i
    while (j < list.length && ov[list[j].track_id]?.endPin == null) {
      j++
    }
    if (j < list.length) {
      const seg = list.slice(i, j + 1)
      const nat = seg.reduce((s, e) => s + natural(e), 0)
      // The scan above stops on the first entry that carries a pin.
      const pin = ov[list[j].track_id]?.endPin ?? cursor
      const f = nat > 0 ? Math.max(0.05, (pin - cursor) / nat) : 1
      for (const e of seg) {
        const n = natural(e)
        const b = base(e)
        const d = Math.max(b * DUR_MIN, Math.min(b * DUR_MAX, n * f))
        out.push({
          entry: e,
          t: cursor,
          dur: d,
          scale: n > 0 ? d / n : 1,
          pinned: e === list[j],
          fallback: !hasMeasuredDuration(e.track),
        })
        cursor += d
      }
      i = j + 1
    } else {
      for (const e of list.slice(i)) {
        const d = natural(e)
        out.push({
          entry: e,
          t: cursor,
          dur: d,
          scale: 1,
          pinned: false,
          fallback: !hasMeasuredDuration(e.track),
        })
        cursor += d
      }
      i = list.length
    }
  }
  return out
}

/** Effective played BPM after overrides and auto-scale (original when unset). */
export function effectivePlayedBpm(
  block: LaidBlock,
  ov: OverrideMap,
  durationOf: (e: TracklistEntry) => number = (e) =>
    trackLengthMinutes(e.track),
): number | null {
  const bpm = block.entry.track?.bpm
  if (!bpm) {
    return null
  }
  const base =
    ov[block.entry.track_id]?.durOv ??
    Math.round(PLAY_FRACTION * durationOf(block.entry) * 10) / 10
  return (bpm * base) / block.dur
}

/**
 * Alternative lanes map one to one onto the set's pool subgroups. A set with no
 * subgroup shows one virtual default lane instead, and the first drop on that
 * lane creates the backing subgroup, which then replaces it.
 */
export function deriveLanes(
  pool: PoolEntry[],
  subgroups: PoolSubgroup[],
  memberships: PoolSubgroupMembership[],
): SequencerLane[] {
  if (subgroups.length === 0) {
    return [{ group: null, name: DEFAULT_LANE_NAME, entries: pool.slice() }]
  }
  const byEntry = new Map(pool.map((e) => [e.id, e]))
  return subgroups
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((group) => ({
      group,
      name: group.name,
      entries: memberships
        .filter((m) => m.subgroup_id === group.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map((m) => byEntry.get(m.pool_entry_id))
        .filter((e): e is PoolEntry => !!e),
    }))
}

export function laneKeyOf(lane: SequencerLane): LaneKey {
  return lane.group?.id ?? 'default'
}

/**
 * One drag contract for every Sequencer block. The payload names the source
 * lane so a drop can tell a reorder, a promotion, a bench move and a free-time
 * move apart. The standard track MIME rides along for other workspace drop
 * surfaces; pool and tracklist rows retain their own source-specific MIME.
 */
export const BLOCK_DRAG_MIME = 'text/sq-block'

export interface BlockDragPayload {
  trackId: number
  /** Set when the block sits on an alternative lane. */
  poolEntryId?: number
  from: 'committed' | LaneKey
}

interface DragData {
  getData(format: string): string
  setData(format: string, data: string): void
}

export function writeBlockDrag(dt: DragData, payload: BlockDragPayload): void {
  // Keep blocks interoperable with the other track drop surfaces. The block
  // payload remains authoritative for moves within the sequencer.
  dt.setData(TRACK_DRAG_MIME, String(payload.trackId))
  dt.setData(BLOCK_DRAG_MIME, JSON.stringify(payload))
}

export function readBlockDrag(dt: DragData): BlockDragPayload | null {
  const raw = dt.getData(BLOCK_DRAG_MIME)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as BlockDragPayload
    return typeof parsed?.trackId === 'number' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Benched candidates keep free times. An entry the DJ never dragged falls back
 * to the next slot after the entries before it, so a fresh lane still reads
 * left to right.
 */
export function layoutBench(
  entries: PoolEntry[],
  times: Record<number, number>,
  ov: OverrideMap,
  startMin: number,
): BenchBlock[] {
  let cursor = startMin
  return entries.map((entry) => {
    const dur = ov[entry.track_id]?.durOv ?? defaultPlayMinutes(entry.track)
    const t = times[entry.track_id] ?? cursor
    cursor = Math.max(cursor, t) + dur
    return { entry, t, dur, fallback: !hasMeasuredDuration(entry.track) }
  })
}

export interface UseSequencerArgs {
  setId: number | null
  tracklist: TracklistEntry[]
  pool: PoolEntry[]
  subgroups: PoolSubgroup[]
  memberships: PoolSubgroupMembership[]
  startMin: number
  /** Rehydrates the set after a saved override. */
  onSaved?: () => void
}

export function useSequencer({
  setId,
  tracklist,
  pool,
  subgroups,
  memberships,
  startMin,
  onSaved,
}: UseSequencerArgs) {
  // Unsaved edits are stamped with the set they belong to, so a different set
  // never inherits them and no reset effect is needed.
  const [pendingState, setPendingState] = useState<{
    setId: number | null
    map: OverrideMap
  }>({ setId, map: {} })
  const pending = useMemo(
    () => (pendingState.setId === setId ? pendingState.map : {}),
    [pendingState, setId],
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  // Benched candidates have no tracklist row, so their free times and their
  // preview lengths stay view state until the DJ commits them.
  const [benchState, setBenchState] = useState<{
    setId: number | null
    times: Record<number, number>
    overrides: OverrideMap
  }>({ setId, times: {}, overrides: {} })
  const bench = useMemo(
    () =>
      benchState.setId === setId
        ? benchState
        : { setId, times: {}, overrides: {} },
    [benchState, setId],
  )
  const savedRef = useRef(onSaved)
  useEffect(() => {
    savedRef.current = onSaved
  })

  const overrides = useMemo(
    () => buildOverrideMap(tracklist, pending),
    [tracklist, pending],
  )

  const blocks = useMemo(
    () => layoutCommitted(tracklist, overrides, startMin),
    [tracklist, overrides, startMin],
  )

  const lanes = useMemo(
    () => deriveLanes(pool, subgroups, memberships),
    [pool, subgroups, memberships],
  )

  const benchLanes = useMemo(
    () =>
      lanes.map((lane) => ({
        lane,
        blocks: layoutBench(
          lane.entries,
          bench.times,
          bench.overrides,
          startMin,
        ),
      })),
    [lanes, bench.times, bench.overrides, startMin],
  )

  const setBenchTime = useCallback(
    (trackId: number, minutes: number) => {
      setBenchState((prev) => {
        const base =
          prev.setId === setId ? prev : { setId, times: {}, overrides: {} }
        return {
          ...base,
          setId,
          times: { ...base.times, [trackId]: snapMinutes(minutes) },
        }
      })
    },
    [setId],
  )

  const patchBenchOverride = useCallback(
    (trackId: number, patch: Partial<BlockOverride>) => {
      setBenchState((prev) => {
        const base =
          prev.setId === setId ? prev : { setId, times: {}, overrides: {} }
        const current = base.overrides[trackId] ?? {}
        return {
          ...base,
          setId,
          overrides: { ...base.overrides, [trackId]: { ...current, ...patch } },
        }
      })
    },
    [setId],
  )

  const resetBenchOverride = useCallback(
    (trackId: number) => {
      patchBenchOverride(trackId, { durOv: null, endPin: null, bpmOv: null })
    },
    [patchBenchOverride],
  )

  const persist = useCallback(
    async (trackId: number, next: BlockOverride) => {
      if (setId === null) {
        return
      }
      try {
        await tracklistSetOverrides(setId, trackId, {
          play_minutes: next.durOv,
          pinned_end_minutes: next.endPin,
          bpm_override: next.bpmOv,
        })
        setSaveError(null)
        savedRef.current?.()
      } catch (err: unknown) {
        setSaveError(
          err instanceof Error ? err.message : 'Could not save overrides.',
        )
      }
    },
    [setId],
  )

  /** Apply an override patch optimistically, then write it through. */
  const patchOverride = useCallback(
    (trackId: number, patch: Partial<BlockOverride>) => {
      const entry = tracklist.find((e) => e.track_id === trackId)
      if (!entry) {
        return
      }
      const merged = {
        ...entryOverride(entry, pending[trackId]),
        ...patch,
      }
      setPendingState((prev) => ({
        setId,
        map:
          prev.setId === setId
            ? { ...prev.map, [trackId]: merged }
            : { [trackId]: merged },
      }))
      void persist(trackId, merged)
    },
    [tracklist, pending, persist, setId],
  )

  const resetOverrides = useCallback(
    (trackId: number) => {
      patchOverride(trackId, { durOv: null, endPin: null, bpmOv: null })
    },
    [patchOverride],
  )

  const endMinutes = blocks.length
    ? blocks[blocks.length - 1].t + blocks[blocks.length - 1].dur
    : startMin

  return {
    blocks,
    lanes,
    benchLanes,
    benchOverrides: bench.overrides,
    overrides,
    endMinutes,
    saveError,
    patchOverride,
    resetOverrides,
    setBenchTime,
    patchBenchOverride,
    resetBenchOverride,
  }
}
