import { useCallback, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { SequencerBlock } from './SequencerBlock'
import { SortIcon } from './table/icons'
import { SequencerScrollbar } from './SequencerScrollbar'
import {
  BLOCK_DRAG_MIME,
  laneKeyOf,
  readBlockDrag,
  snapMinutes,
  writeBlockDrag,
} from '../hooks/useSequencer'
import type {
  BenchBlock,
  LaidBlock,
  LaneKey,
  SequencerLane,
} from '../hooks/useSequencer'
import { pairTracks } from '../utils/harmonic'
import type { PairResult } from '../utils/harmonic'
import { formatHM } from '../utils/time'
import type { Track } from '../types'
import { POOL_ROW_MIME, TRACKLIST_ROW_MIME, TRACK_DRAG_MIME } from '../utils'

// Lanes view: a sticky ruler, the committed spine that packs end to end, and
// one lane per pool subgroup. A set without a subgroup shows the virtual
// default lane instead, and the first drop on it creates the subgroup.

const LANE_LABEL_PX = 88

const LANE_DRAG_MIME = 'text/sq-lane'

type ExternalDropSource = 'browse' | 'pool' | 'tracklist'

const EXTERNAL_TRACK_MIMES: Array<[string, ExternalDropSource]> = [
  [TRACK_DRAG_MIME, 'browse'],
  [POOL_ROW_MIME, 'pool'],
  [TRACKLIST_ROW_MIME, 'tracklist'],
]

function readExternalTrackDrag(
  dataTransfer: DataTransfer,
): { trackId: number; source: ExternalDropSource } | null {
  for (const [mime, source] of EXTERNAL_TRACK_MIMES) {
    const raw = dataTransfer.getData(mime)
    const trackId = Number(raw)
    if (raw && Number.isInteger(trackId)) {
      return { trackId, source }
    }
  }
  return null
}

function hasSupportedTrackDrag(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types ?? [])
  return [BLOCK_DRAG_MIME, ...EXTERNAL_TRACK_MIMES.map(([mime]) => mime)].some(
    (mime) => types.includes(mime),
  )
}

/**
 * A lane being dragged over another lane. The payload itself is unreadable
 * until the drop, so the accept check goes by MIME alone.
 */
function hasLaneDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes(LANE_DRAG_MIME)
}

export interface BenchLane {
  lane: SequencerLane
  blocks: BenchBlock[]
}

interface Props {
  /** The horizontally scrolling viewport, for the custom scrollbar. */
  scrollRef: RefObject<HTMLElement | null>
  blocks: LaidBlock[]
  benchLanes: BenchLane[]
  startMin: number
  endMin: number
  tickMin: number
  pxPerMin: number
  selectedTrackId: number | null
  onSelect: (trackId: number | null) => void
  onAddCommitted: (trackId: number, position: number) => void
  onPromote: (trackId: number, position: number) => void
  onReorder: (trackId: number, position: number) => void
  onBenchToLane: (
    trackId: number,
    lane: LaneKey,
    source: ExternalDropSource,
  ) => void
  onMoveBench: (poolEntryId: number, from: number, to: number) => void
  onSetBenchTime: (trackId: number, minutes: number) => void
  onSetBenchTimes: (entries: Record<number, number>) => void
  onAddLane: () => void
  onRenameLane: (subgroupId: number, name: string) => void
  onReorderLanes: (subgroupIds: number[]) => void
  onDeleteLane: (subgroupId: number) => void
}

export function SequencerLanes({
  scrollRef,
  blocks,
  benchLanes,
  startMin,
  endMin,
  tickMin,
  pxPerMin,
  selectedTrackId,
  onSelect,
  onAddCommitted,
  onPromote,
  onReorder,
  onBenchToLane,
  onMoveBench,
  onSetBenchTime,
  onSetBenchTimes,
  onAddLane,
  onRenameLane,
  onReorderLanes,
  onDeleteLane,
}: Props) {
  /** Subgroup whose name is being edited inline. */
  const [renaming, setRenaming] = useState<number | null>(null)

  const selectedTrack = useMemo<Track | null>(() => {
    if (selectedTrackId == null) {
      return null
    }
    // Either block type can be the relation source.
    const committed = blocks.find((b) => b.entry.track_id === selectedTrackId)
    if (committed) {
      return committed.entry.track
    }
    for (const { blocks: benched } of benchLanes) {
      const hit = benched.find((b) => b.entry.track_id === selectedTrackId)
      if (hit) {
        return hit.entry.track
      }
    }
    return null
  }, [blocks, benchLanes, selectedTrackId])

  const relationFor = useCallback(
    (track: Track | null): PairResult | null => {
      if (
        !selectedTrack ||
        !track ||
        track.id === selectedTrack.id ||
        selectedTrack.bpm == null ||
        track.bpm == null ||
        !selectedTrack.camelot_code ||
        !track.camelot_code
      ) {
        return null
      }
      return pairTracks(
        selectedTrack.bpm,
        selectedTrack.camelot_code,
        track.bpm,
        track.camelot_code,
      )
    },
    [selectedTrack],
  )

  const width = Math.max(1, endMin - startMin) * pxPerMin
  const ticks = useMemo(() => {
    const out: number[] = []
    for (let m = startMin; m <= endMin; m += tickMin) {
      out.push(m)
    }
    return out
  }, [startMin, endMin, tickMin])

  /**
   * The snapped minute the drop x maps to inside a lane, or null when the drop
   * carries no usable coordinate. A null minute means "no position information",
   * so the caller appends rather than guessing.
   */
  const minuteAt = useCallback(
    (e: React.DragEvent): number | null => {
      const rect = e.currentTarget.getBoundingClientRect()
      const minute =
        startMin + (e.clientX - rect.left - LANE_LABEL_PX) / pxPerMin
      return Number.isFinite(minute) ? snapMinutes(minute) : null
    },
    [pxPerMin, startMin],
  )

  /** End of the committed spine: where a fresh bench drop lands by default. */
  const committedEnd = useMemo(
    () => blocks.reduce((end, b) => Math.max(end, b.t + b.dur), startMin),
    [blocks, startMin],
  )

  /**
   * Alphabetical by the track's displayed title, which begins with its
   * metadata tag, then packed end to end from the committed end.
   */
  const handleSortLane = useCallback(
    (laneBlocks: BenchBlock[]) => {
      const sorted = [...laneBlocks].sort((a, b) =>
        (a.entry.track?.title ?? '').localeCompare(
          b.entry.track?.title ?? '',
          undefined,
          { numeric: true, sensitivity: 'base' },
        ),
      )
      let at = committedEnd
      const next: Record<number, number> = {}
      for (const block of sorted) {
        next[block.entry.track_id] = snapMinutes(at)
        at += block.dur
      }
      // One write, so the lane cannot overwrite itself block by block.
      onSetBenchTimes(next)
    },
    [committedEnd, onSetBenchTimes],
  )

  /** Committed position for a drop time: after every block that starts earlier. */
  const positionAt = useCallback(
    (minute: number | null, movingTrackId: number | null) => {
      const others = blocks.filter((b) => b.entry.track_id !== movingTrackId)
      if (minute == null) {
        return others.length
      }
      return others.filter((b) => b.t + b.dur / 2 <= minute).length
    },
    [blocks],
  )

  const handleCommittedDrop = useCallback(
    (e: React.DragEvent) => {
      const payload = readBlockDrag(e.dataTransfer)
      const external = payload ? null : readExternalTrackDrag(e.dataTransfer)
      if (!payload && !external) {
        return
      }
      e.preventDefault()
      const minute = minuteAt(e)
      if (external) {
        const position = positionAt(minute, null)
        if (external.source === 'browse') {
          onAddCommitted(external.trackId, position)
        } else if (external.source === 'pool') {
          onPromote(external.trackId, position)
        } else {
          onReorder(external.trackId, position)
        }
        return
      }
      if (!payload) {
        return
      }
      const position = positionAt(minute, payload.trackId)
      if (payload.from === 'committed') {
        const current = blocks.findIndex(
          (b) => b.entry.track_id === payload.trackId,
        )
        if (current !== position) {
          onReorder(payload.trackId, position)
        }
        return
      }
      onPromote(payload.trackId, position)
    },
    [blocks, minuteAt, onAddCommitted, onPromote, onReorder, positionAt],
  )

  const handleLaneDrop = useCallback(
    (target: LaneKey) => (e: React.DragEvent) => {
      // A lane dropped on a lane reorders; anything else is a track.
      const draggedLane = e.dataTransfer.getData(LANE_DRAG_MIME)
      if (draggedLane) {
        e.preventDefault()
        const from = Number(draggedLane)
        if (typeof target === 'number' && from !== target) {
          const order = benchLanes
            .map(({ lane }) => lane.group?.id)
            .filter((id): id is number => id != null)
          const next = order.filter((id) => id !== from)
          next.splice(order.indexOf(target), 0, from)
          onReorderLanes(next)
        }
        return
      }
      const payload = readBlockDrag(e.dataTransfer)
      const external = payload ? null : readExternalTrackDrag(e.dataTransfer)
      if (!payload && !external) {
        return
      }
      e.preventDefault()
      const minute = minuteAt(e)
      if (external) {
        // A new arrival queues after the committed spine; dragging it later
        // puts it anywhere.
        onSetBenchTime(external.trackId, committedEnd)
        onBenchToLane(external.trackId, target, external.source)
        return
      }
      if (!payload) {
        return
      }
      const trackId = payload.trackId
      if (minute != null) {
        onSetBenchTime(trackId, minute)
      }
      if (payload.from === 'committed') {
        onBenchToLane(payload.trackId, target, 'tracklist')
        return
      }
      if (
        payload.from !== target &&
        typeof payload.from === 'number' &&
        typeof target === 'number' &&
        payload.poolEntryId != null
      ) {
        onMoveBench(payload.poolEntryId, payload.from, target)
      }
    },
    [
      benchLanes,
      committedEnd,
      minuteAt,
      onBenchToLane,
      onMoveBench,
      onReorderLanes,
      onSetBenchTime,
    ],
  )

  return (
    <div className="sq-lanes" data-px-per-min={pxPerMin}>
      <div className="sq-ruler" style={{ width: width + LANE_LABEL_PX }}>
        {ticks.map((m) => (
          <span
            key={m}
            className="sq-tick"
            style={{ left: LANE_LABEL_PX + (m - startMin) * pxPerMin }}
          >
            {formatHM(m)}
          </span>
        ))}
      </div>
      <SequencerScrollbar scrollRef={scrollRef} />
      <div
        className="sq-lane sq-lane--committed"
        style={{ width: width + LANE_LABEL_PX }}
        aria-label="Committed lane"
        onDragOver={(e) => {
          if (hasSupportedTrackDrag(e.dataTransfer)) {
            e.preventDefault()
          }
        }}
        onDrop={handleCommittedDrop}
      >
        <span className="sq-lane-label">Committed</span>
        {blocks.map((block) => (
          <SequencerBlock
            key={block.entry.id}
            track={block.entry.track}
            left={LANE_LABEL_PX + (block.t - startMin) * pxPerMin}
            width={block.dur * pxPerMin}
            start={block.t}
            end={block.t + block.dur}
            playMinutes={block.dur}
            bpm={block.entry.track?.bpm ?? null}
            pinned={block.pinned}
            fallback={block.fallback}
            selected={selectedTrackId === block.entry.track_id}
            relation={relationFor(block.entry.track)}
            onSelect={() =>
              onSelect(
                selectedTrackId === block.entry.track_id
                  ? null
                  : block.entry.track_id,
              )
            }
            onDragStart={(e) =>
              writeBlockDrag(e.dataTransfer, {
                trackId: block.entry.track_id,
                from: 'committed',
              })
            }
          />
        ))}
      </div>
      {benchLanes.map(({ lane, blocks: benched }) => {
        const key = laneKeyOf(lane)
        const groupId = lane.group?.id ?? 0
        return (
          <div
            key={key}
            className="sq-lane sq-lane--alt"
            style={{ width: width + LANE_LABEL_PX }}
            data-lane={key}
            aria-label={`${lane.name} lane`}
            onDragOver={(e) => {
              if (
                hasSupportedTrackDrag(e.dataTransfer) ||
                hasLaneDrag(e.dataTransfer)
              ) {
                e.preventDefault()
              }
            }}
            onDrop={handleLaneDrop(key)}
          >
            <span className="sq-lane-label">
              {renaming === groupId && lane.group != null ? (
                <input
                  className="sq-lane-rename"
                  aria-label={`Rename lane ${lane.name}`}
                  autoFocus
                  defaultValue={lane.name}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== lane.name) {
                      onRenameLane(groupId, next)
                    }
                    setRenaming(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    } else if (e.key === 'Escape') {
                      setRenaming(null)
                    }
                  }}
                />
              ) : (
                <span
                  className="sq-lane-name"
                  draggable={lane.group != null}
                  title={
                    lane.group != null
                      ? 'Double-click to rename; drag to reorder'
                      : undefined
                  }
                  onDoubleClick={() =>
                    lane.group != null && setRenaming(groupId)
                  }
                  onDragStart={(e) => {
                    if (lane.group == null) {
                      return
                    }
                    e.dataTransfer.setData(
                      LANE_DRAG_MIME,
                      String(lane.group.id),
                    )
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  {lane.name}
                </span>
              )}
              <button
                className="sq-lane-sort"
                aria-label={`Sort lane ${lane.name}`}
                title="Sort this lane alphabetically"
                onClick={() => handleSortLane(benched)}
              >
                <SortIcon size={11} />
              </button>
            </span>
            {committedEnd < endMin && (
              <span
                className="sq-lane-tail"
                aria-hidden="true"
                style={{
                  left: LANE_LABEL_PX + (committedEnd - startMin) * pxPerMin,
                  width: (endMin - committedEnd) * pxPerMin,
                }}
              />
            )}
            {lane.group != null && (
              <button
                className="sq-lane-delete"
                aria-label={`Delete lane ${lane.name}`}
                onClick={() => onDeleteLane(groupId)}
              >
                ×
              </button>
            )}
            {benched.map((block) => (
              <SequencerBlock
                key={block.entry.id}
                track={block.entry.track}
                left={LANE_LABEL_PX + (block.t - startMin) * pxPerMin}
                width={block.dur * pxPerMin}
                start={block.t}
                end={block.t + block.dur}
                playMinutes={block.dur}
                benched
                fallback={block.fallback}
                selected={selectedTrackId === block.entry.track_id}
                relation={relationFor(block.entry.track)}
                bpm={block.entry.track?.bpm ?? null}
                onSelect={() =>
                  onSelect(
                    selectedTrackId === block.entry.track_id
                      ? null
                      : block.entry.track_id,
                  )
                }
                onDragStart={(e) =>
                  writeBlockDrag(e.dataTransfer, {
                    trackId: block.entry.track_id,
                    poolEntryId: block.entry.id,
                    from: key,
                  })
                }
                onPromote={() => onPromote(block.entry.track_id, blocks.length)}
              />
            ))}
          </div>
        )
      })}
      <div className="sq-lane-actions">
        <button
          className="sq-add-lane"
          aria-label="Add lane"
          title="Add an alternative lane"
          onClick={onAddLane}
        >
          +
        </button>
      </div>
    </div>
  )
}
