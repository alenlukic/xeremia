import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { tracklistSetOverrides } from '../api/http'
import { DUR_MAX, DUR_MIN, colForBpm } from '../utils/harmonic'
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
export type BenchOverrideMap = Record<string, Partial<BlockOverride>>

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
  /** Lane-scoped identity; the same track in another lane must remain independent. */
  placementKey: string
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
 *
 * `targetEndMin` scales the final unpinned run the same way, so changing the
 * set's end time stretches or squeezes the tracks to fit it — within the pitch
 * window, which still wins.
 */
export function layoutCommitted(
  entries: TracklistEntry[],
  ov: OverrideMap,
  startMin: number,
  durationOf: (e: TracklistEntry) => number = (e) =>
    trackLengthMinutes(e.track),
  targetEndMin?: number | null,
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
      const seg = list.slice(i)
      const nat = seg.reduce((s, e) => s + natural(e), 0)
      // The set's end time behaves as a pin on the last run, so the tracks
      // re-scale to fill the window rather than ignoring it.
      const f =
        targetEndMin != null && nat > 0
          ? Math.max(0.05, (targetEndMin - cursor) / nat)
          : 1
      for (const e of seg) {
        const n = natural(e)
        const b = base(e)
        const d =
          f === 1 ? n : Math.max(b * DUR_MIN, Math.min(b * DUR_MAX, n * f))
        out.push({
          entry: e,
          t: cursor,
          dur: d,
          scale: n > 0 ? d / n : 1,
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

/** Stable lane-scoped key for persisted bench timing and preview state. */
export function benchPlacementKey(lane: LaneKey, trackId: number): string {
  return `${lane}:${trackId}`
}

export function sequencerTileKey(lane: LaneScope, trackId: number): string {
  return lane === 'committed'
    ? `committed:${trackId}`
    : benchPlacementKey(lane, trackId)
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
  times: Record<string, number>,
  ov: BenchOverrideMap,
  startMin: number,
  lane: LaneKey = 'default',
): BenchBlock[] {
  let cursor = startMin
  return entries.map((entry) => {
    const placementKey = benchPlacementKey(lane, entry.track_id)
    // Numeric keys are the pre-lane-scope format. Keep reading them so existing
    // sets migrate naturally as soon as one placement is edited.
    const legacyKey = String(entry.track_id)
    const override = ov[placementKey] ?? ov[legacyKey]
    const dur = override?.durOv ?? defaultPlayMinutes(entry.track)
    const t = times[placementKey] ?? times[legacyKey] ?? cursor
    cursor = Math.max(cursor, t) + dur
    return {
      entry,
      placementKey,
      t,
      dur,
      fallback: !hasMeasuredDuration(entry.track),
    }
  })
}

/** Lane a selection, a clipboard or a paste belongs to. */
export type LaneScope = 'committed' | LaneKey

/**
 * Blocks picked in one lane. Selection never spans lanes, so a cut always has
 * one source lane and a paste always has one target lane.
 */
export interface LaneSelection {
  lane: LaneScope
  ids: number[]
  /** The block the footer, the tracklist and the Explorer follow. */
  focus: number | null
}

export const EMPTY_SELECTION: LaneSelection = {
  lane: 'committed',
  ids: [],
  focus: null,
}

/** One track held between a cut and a paste. */
export interface ClipboardTrack {
  trackId: number
  /** Pool row identity, present while the source is an alternative lane. */
  poolEntryId: number | null
  /** Laid-out play length at cut time, used to pack a bench paste. */
  playMinutes: number
  /** Committed overrides or bench preview values captured at cut time. */
  override: Partial<BlockOverride> | null
  /** Committed note captured at cut time; a benched block carries none. */
  note: string | null
}

export interface SequencerClipboard {
  source: LaneScope
  tracks: ClipboardTrack[]
}

/** The visible insertion point used by paste. */
export interface SequencerCursor {
  lane: LaneScope
  minutes: number
}

interface TimedBlock {
  t: number
  dur: number
}

/**
 * Every block whose played span meets the dragged range. The range is
 * direction-free, so a right-to-left drag selects the same blocks.
 */
export function blocksInMinuteRange<T extends TimedBlock>(
  blocks: readonly T[],
  from: number,
  to: number,
): T[] {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  return blocks.filter((block) => block.t <= hi && block.t + block.dur >= lo)
}

/** Sorts after every Explorer bucket, so a track without a BPM lands last. */
const NO_BPM_BUCKET = Number.MAX_SAFE_INTEGER
/** Breathing room between adjacent tiles inside one BPM cohort. */
export const BENCH_BLOCK_GAP_MIN = 0.5
/** Additional visual break between adjacent Explorer BPM cohorts. */
export const BPM_CLUSTER_GAP_MIN = 1.5

function bpmBucketOf(block: BenchBlock): number {
  const bpm = block.entry.track?.bpm
  return bpm != null && Number.isFinite(bpm) ? colForBpm(bpm) : NO_BPM_BUCKET
}

function compareByTitle(a: BenchBlock, b: BenchBlock): number {
  return (a.entry.track?.title ?? '').localeCompare(
    b.entry.track?.title ?? '',
    undefined,
    { numeric: true, sensitivity: 'base' },
  )
}

/**
 * Lane free times that group the lane into the Explorer grid's BPM clusters
 * from low to high, alphabetical by title inside each cluster, packed end to
 * end from the committed end.
 */
export function arrangeLaneBlocks(
  blocks: BenchBlock[],
  committedEnd: number,
  pinnedTiles: Record<string, boolean> = {},
): Record<string, number> {
  const arranged = blocks
    .filter((block) => !pinnedTiles[block.placementKey])
    .sort((a, b) => bpmBucketOf(a) - bpmBucketOf(b) || compareByTitle(a, b))
  const reserved = blocks
    .filter((block) => pinnedTiles[block.placementKey])
    .map((block) => ({ start: block.t, end: block.t + block.dur }))
    .sort((a, b) => a.start - b.start)
  const times: Record<string, number> = {}
  let at = committedEnd
  let previousBucket: number | null = null
  for (const block of arranged) {
    const bucket = bpmBucketOf(block)
    if (previousBucket !== null && bucket !== previousBucket) {
      at += BPM_CLUSTER_GAP_MIN
    }
    for (const span of reserved) {
      if (at + block.dur + BENCH_BLOCK_GAP_MIN <= span.start) {
        break
      }
      if (at < span.end + BENCH_BLOCK_GAP_MIN) {
        at = span.end + BENCH_BLOCK_GAP_MIN
      }
    }
    times[block.placementKey] = at
    at += block.dur + BENCH_BLOCK_GAP_MIN
    previousBucket = bucket
  }
  return times
}

export interface ReorderMove {
  trackId: number
  position: number
}

/**
 * Minimal moves that insert the held tracks at an index among the tracks that
 * remain. The simulation is important: moving each held id directly can
 * displace an earlier move and silently scramble a multi-track paste.
 */
export function committedReorderMoves(
  currentIds: number[],
  heldIds: number[],
  insertIndex: number,
): ReorderMove[] {
  const held = new Set(heldIds)
  const available = currentIds.filter((id) => !held.has(id))
  const at = Math.max(0, Math.min(insertIndex, available.length))
  const finalOrder = [
    ...available.slice(0, at),
    ...heldIds,
    ...available.slice(at),
  ]
  const working = [...currentIds]
  const moves: ReorderMove[] = []
  for (let position = 0; position < finalOrder.length; position++) {
    const trackId = finalOrder[position]
    if (working[position] === trackId) {
      continue
    }
    const from = working.indexOf(trackId)
    if (from < 0) {
      continue
    }
    working.splice(from, 1)
    working.splice(position, 0, trackId)
    moves.push({ trackId, position })
  }
  return moves
}

/** Where a pasted track lands on a bench lane, with its preview length. */
export interface BenchPlacement {
  placementKey: string
  minutes: number
  override?: Partial<BlockOverride> | null
}

export interface UseSequencerArgs {
  setId: number | null
  tracklist: TracklistEntry[]
  pool: PoolEntry[]
  subgroups: PoolSubgroup[]
  memberships: PoolSubgroupMembership[]
  startMin: number
  /** Target end of the set; scales the closing run to fit the window. */
  endMin?: number | null
  /** Rehydrates the set after a saved override. */
  onSaved?: () => void
  /** Bench lane positions and preview lengths, persisted on the set. */
  benchTimes?: Record<string, number>
  benchOverrides?: BenchOverrideMap
  onBenchChange?: (next: {
    times: Record<string, number>
    overrides: BenchOverrideMap
  }) => void
}

export function useSequencer({
  setId,
  tracklist,
  pool,
  subgroups,
  memberships,
  startMin,
  endMin,
  onSaved,
  benchTimes,
  benchOverrides,
  onBenchChange,
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
  // Benched candidates have no tracklist row, so their free times and preview
  // lengths are stored on the set alongside the other sequencer settings —
  // a lane position is part of the plan and has to survive a reload.
  const bench = useMemo(
    () => ({ setId, times: benchTimes ?? {}, overrides: benchOverrides ?? {} }),
    [setId, benchTimes, benchOverrides],
  )
  const setBenchState = useCallback(
    (
      fn: (prev: {
        times: Record<string, number>
        overrides: BenchOverrideMap
      }) => {
        times: Record<string, number>
        overrides: BenchOverrideMap
      },
    ) => {
      onBenchChange?.(fn({ times: bench.times, overrides: bench.overrides }))
    },
    [bench.times, bench.overrides, onBenchChange],
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
    () => layoutCommitted(tracklist, overrides, startMin, undefined, endMin),
    [tracklist, overrides, startMin, endMin],
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
          laneKeyOf(lane),
        ),
      })),
    [lanes, bench.times, bench.overrides, startMin],
  )

  const setBenchTime = useCallback(
    (
      lane: LaneKey,
      trackId: number,
      minutes: number,
      preserveExact = false,
    ) => {
      const key = benchPlacementKey(lane, trackId)
      setBenchState((prev) => ({
        ...prev,
        times: {
          ...prev.times,
          [key]: preserveExact ? minutes : snapMinutes(minutes),
        },
      }))
    },
    [setBenchState],
  )

  /** Set exact bench times at once, so an arranged lane stays end to end. */
  const setBenchTimes = useCallback(
    (entries: Record<string, number>) => {
      setBenchState((prev) => ({
        ...prev,
        times: { ...prev.times, ...entries },
      }))
    },
    [setBenchState],
  )

  /**
   * A paste writes lane times and preview lengths together. Two separate
   * writes in one tick would both read the same stored bench state, so the
   * second one would drop the first.
   */
  const applyBenchPlacements = useCallback(
    (placements: BenchPlacement[]) => {
      setBenchState((prev) => {
        const times = { ...prev.times }
        const overrides = { ...prev.overrides }
        for (const placement of placements) {
          times[placement.placementKey] = snapMinutes(placement.minutes)
          if (placement.override) {
            overrides[placement.placementKey] = { ...placement.override }
          }
        }
        return { times, overrides }
      })
    },
    [setBenchState],
  )

  const patchBenchOverride = useCallback(
    (lane: LaneKey, trackId: number, patch: Partial<BlockOverride>) => {
      const key = benchPlacementKey(lane, trackId)
      setBenchState((prev) => ({
        ...prev,
        overrides: {
          ...prev.overrides,
          [key]: { ...(prev.overrides[key] ?? {}), ...patch },
        },
      }))
    },
    [setBenchState],
  )

  const resetBenchOverride = useCallback(
    (lane: LaneKey, trackId: number) => {
      patchBenchOverride(lane, trackId, {
        durOv: null,
        endPin: null,
        bpmOv: null,
      })
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
    setBenchTimes,
    applyBenchPlacements,
    patchBenchOverride,
    resetBenchOverride,
  }
}
