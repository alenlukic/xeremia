import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PoolEntry, PoolSubgroup, PoolSubgroupMembership, TracklistEntry } from '../types'
import { DUR_MIN, DUR_MAX, harmonyPaint, pairTracks } from '../utils/harmonic'

// Sequencer: the committed lane IS the server tracklist (position order);
// alternative lanes are pool subgroups (benched candidates). Promote =
// pool/move-to-tracklist + tracklist/reorder; bench = tracklist/move-to-pool
// (+ subgroup membership). Durations/BPM/pins are client-side overrides.

const PLAY_FRACTION = 0.7
// TODO(server): Track has no duration column; wire a real source (track traits
// or a new column) and delete this fallback.
const FALLBACK_LEN_MIN = 6.5

export interface BlockOverride {
  durOv: number | null
  endPin: number | null
  bpmOv: number | null
}
export type OverrideMap = Record<number, Partial<BlockOverride>>

export interface LaidBlock {
  entry: TracklistEntry
  t: number
  dur: number
  scale: number
  pinned: boolean
}

/**
 * Committed lane packs end-to-end from startMin. A pinned end proportionally
 * scales the run before it, but every block's length is clamped to
 * [base·(1−0.083), base·(1+0.0905)] — the BPM pitch window always wins.
 */
export function layoutCommitted(
  entries: TracklistEntry[],
  ov: OverrideMap,
  startMin: number,
  durationOf: (e: TracklistEntry) => number,
): LaidBlock[] {
  const base = (e: TracklistEntry) => ov[e.track_id]?.durOv ?? Math.round(PLAY_FRACTION * durationOf(e) * 10) / 10
  const playedRatio = (e: TracklistEntry) => {
    const bpm = e.track?.bpm
    const set = ov[e.track_id]?.bpmOv
    if (!bpm || set == null) return 1
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
    while (j < list.length && ov[list[j].track_id]?.endPin == null) j++
    if (j < list.length) {
      const seg = list.slice(i, j + 1)
      const nat = seg.reduce((s, e) => s + natural(e), 0)
      const pin = ov[list[j].track_id]!.endPin!
      const f = nat > 0 ? Math.max(0.05, (pin - cursor) / nat) : 1
      for (const e of seg) {
        const n = natural(e)
        const b = base(e)
        const d = Math.max(b * DUR_MIN, Math.min(b * DUR_MAX, n * f))
        out.push({ entry: e, t: cursor, dur: d, scale: n > 0 ? d / n : 1, pinned: e === list[j] })
        cursor += d
      }
      cursor = pin
      i = j + 1
    } else {
      for (const e of list.slice(i)) {
        const d = natural(e)
        out.push({ entry: e, t: cursor, dur: d, scale: 1, pinned: false })
        cursor += d
      }
      i = list.length
    }
  }
  return out
}

/** Effective played BPM after overrides and auto-scale (original assumed when unset). */
export function effectivePlayedBpm(block: LaidBlock, ov: OverrideMap, durationOf: (e: TracklistEntry) => number): number | null {
  const bpm = block.entry.track?.bpm
  if (!bpm) return null
  const base = ov[block.entry.track_id]?.durOv ?? Math.round(PLAY_FRACTION * durationOf(block.entry) * 10) / 10
  return (bpm * base) / block.dur
}

interface Props {
  setId: number
  tracklist: TracklistEntry[]
  pool: PoolEntry[]
  subgroups: PoolSubgroup[]
  memberships: PoolSubgroupMembership[]
  /** startMin/endMin of the planned set window, minutes since midnight. */
  startMin: number
  endMin: number
  onPromote: (trackId: number, position: number) => void
  onBench: (trackId: number, subgroupId: number | null) => void
  onReorder: (trackId: number, position: number) => void
  onRemove: (trackId: number) => void
  onExport: () => void
  durationOf?: (e: TracklistEntry) => number
}

export function SequencerLanes({
  setId,
  tracklist,
  pool,
  subgroups,
  memberships,
  startMin,
  endMin,
  onPromote,
  onBench,
  onReorder,
  onRemove,
  onExport,
  durationOf = () => FALLBACK_LEN_MIN,
}: Props) {
  const storageKey = `xeremia:seq-overrides:${setId}`
  const [ov, setOv] = useState<OverrideMap>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as OverrideMap
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(ov))
    } catch { /* non-critical */ }
  }, [ov, storageKey])
  // TODO(server): persist durOv/endPin/bpmOv as tracklist_entry columns so
  // sequencer plans survive across devices.

  const [selected, setSelected] = useState<number | null>(null)
  const [pxPerMin, setPxPerMin] = useState(6)

  const lay = useMemo(
    () => layoutCommitted(tracklist, ov, startMin, durationOf),
    [tracklist, ov, startMin, durationOf],
  )

  const patch = useCallback((trackId: number, p: Partial<BlockOverride>) => {
    setOv((prev) => ({ ...prev, [trackId]: { ...prev[trackId], ...p } }))
  }, [])

  // Alt lanes: one per subgroup, members resolved membership → pool entry → track.
  const altLanes = useMemo(() => {
    const byEntry = new Map(pool.map((e) => [e.id, e]))
    return subgroups.map((g) => ({
      group: g,
      entries: memberships
        .filter((m) => m.subgroup_id === g.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map((m) => byEntry.get(m.pool_entry_id))
        .filter((e): e is PoolEntry => !!e),
    }))
  }, [subgroups, memberships, pool])

  const selTrack = useMemo(
    () => lay.find((x) => x.entry.track_id === selected)?.entry.track ?? null,
    [lay, selected],
  )

  return (
    <div className="sq-body">
      <div className="sq-toolbar">
        <span className="sq-total">
          {lay.length} tracks · ends {fmt(lay.length ? lay[lay.length - 1].t + lay[lay.length - 1].dur : startMin)} of {fmt(endMin)}
        </span>
        <button className="ws-pill" onClick={onExport}>Export</button>
        <button className="ws-pill" onClick={() => setPxPerMin((v) => Math.max(2, v / 1.4))}>−</button>
        <button className="ws-pill" onClick={() => setPxPerMin((v) => Math.min(40, v * 1.4))}>+</button>
      </div>
      <div className="sq-lanes" style={{ ['--pxm' as string]: pxPerMin }}>
        <div className="sq-lane sq-lane--committed">
          {lay.map((x) => {
            const tr = x.entry.track
            const harm =
              selTrack && tr && selected !== x.entry.track_id && selTrack.bpm && tr.bpm && selTrack.camelot_code && tr.camelot_code
                ? pairTracks(selTrack.bpm, selTrack.camelot_code, tr.bpm, tr.camelot_code)
                : null
            const g = harm && harm.p >= 0 ? harmonyPaint(harm.p) : null
            return (
              <button
                key={x.entry.id}
                className={`sq-block${selected === x.entry.track_id ? ' sq-block--sel' : ''}${x.pinned ? ' sq-block--pinned' : ''}`}
                style={{
                  left: (x.t - startMin) * pxPerMin,
                  width: Math.max(6, x.dur * pxPerMin),
                  ...(g
                    ? {
                        backgroundColor: `hsla(${g.hue},${g.sat}%,${g.light}%,${g.a})`,
                        borderStyle: (['solid', 'dashed', 'dotted'] as const)[harm!.effort],
                      }
                    : harm
                      ? { opacity: 0.35 }
                      : {}),
                }}
                onClick={() => setSelected(x.entry.track_id)}
              >
                {tr?.camelot_code} {tr?.title}
              </button>
            )
          })}
        </div>
        {altLanes.map(({ group, entries }) => (
          <div key={group.id} className="sq-lane sq-lane--alt" data-lane={group.id}>
            <span className="sq-lane-label">{group.name}</span>
            {entries.map((e, i) => (
              <button
                key={e.id}
                className="sq-block sq-block--benched"
                style={{ left: 88 + i * 120, width: 110 }}
                onClick={() => onPromote(e.track_id, lay.length)}
                title="Promote into the committed tracklist"
              >
                {e.track?.camelot_code} {e.track?.title}
              </button>
            ))}
          </div>
        ))}
      </div>
      {selected != null && (
        <SequencerInspector
          block={lay.find((x) => x.entry.track_id === selected) ?? null}
          ov={ov}
          durationOf={durationOf}
          onPatch={(p) => patch(selected, p)}
          onReset={() => patch(selected, { durOv: null, endPin: null, bpmOv: null })}
          onBench={() => { onBench(selected, null); setSelected(null) }}
          onRemove={() => { onRemove(selected); setSelected(null) }}
        />
      )}
    </div>
  )
}

function SequencerInspector({
  block,
  ov,
  durationOf,
  onPatch,
  onReset,
  onBench,
  onRemove,
}: {
  block: LaidBlock | null
  ov: OverrideMap
  durationOf: (e: TracklistEntry) => number
  onPatch: (p: Partial<BlockOverride>) => void
  onReset: () => void
  onBench: () => void
  onRemove: () => void
}) {
  if (!block) return null
  const bpmEff = effectivePlayedBpm(block, ov, durationOf)
  return (
    <div className="sq-inspector">
      <span className="sq-inspector-label">{block.entry.track?.title}</span>
      <label>bpm <input defaultValue={bpmEff?.toFixed(1) ?? ''} onChange={(e) => {
        const v = parseFloat(e.target.value)
        onPatch({ bpmOv: Number.isNaN(v) || v < 40 ? null : v })
      }} /></label>
      <label>plays <input defaultValue={block.dur.toFixed(1)} onChange={(e) => {
        const v = parseFloat(e.target.value)
        onPatch({ durOv: Number.isNaN(v) || v <= 0 ? null : Math.round(v * 10) / 10 })
      }} /> m</label>
      <label>ends <input defaultValue={block.pinned ? fmt(block.t + block.dur) : ''} onChange={(e) => {
        onPatch({ endPin: parseTime(e.target.value) })
      }} /></label>
      <button className="ws-pill" onClick={onReset}>Reset</button>
      <button className="ws-pill" onClick={onBench}>Bench</button>
      <button className="ws-pill" onClick={onRemove}>Remove</button>
    </div>
  )
}

function fmt(m: number): string {
  const h = Math.floor(m / 60)
  return `${h}:${String(Math.round(m % 60)).padStart(2, '0')}`
}

function parseTime(v: string): number | null {
  const m = v.trim().match(/^(\d+)[:h]?(\d{0,2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0)
}
