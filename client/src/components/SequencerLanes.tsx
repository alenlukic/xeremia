import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { SequencerBlock } from './SequencerBlock'
import { SortIcon } from './table/icons'
import { SequencerScrollbar } from './SequencerScrollbar'
import {
  BLOCK_DRAG_MIME,
  arrangeLaneBlocks,
  blocksInMinuteRange,
  laneKeyOf,
  readBlockDrag,
  sequencerTileKey,
  snapMinutes,
  writeBlockDrag,
} from '../hooks/useSequencer'
import type {
  BenchBlock,
  LaidBlock,
  LaneKey,
  LaneScope,
  LaneSelection,
  SequencerCursor,
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

export const LANE_LABEL_PX = 110

const LANE_DRAG_MIME = 'text/sq-lane'
const ALT_LANE_HUES = [174, 221, 268, 315, 2, 125, 195, 290]

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
  selection: LaneSelection
  cursor: SequencerCursor | null
  starredTiles: Record<string, boolean>
  pinnedTiles: Record<string, boolean>
  onSelect: (lane: LaneScope, trackId: number | null) => void
  /** Reports the blocks a lane drag covered, in lane order. */
  onSelectRange: (lane: LaneScope, trackIds: number[]) => void
  onSetCursor: (lane: LaneScope, minutes: number) => void
  onToggleStar: (tileKey: string) => void
  onTogglePin: (tileKey: string) => void
  onAddCommitted: (trackId: number, position: number) => void
  onPromote: (trackId: number, position: number) => void
  onReorder: (trackId: number, position: number) => void
  onBenchToLane: (
    trackId: number,
    lane: LaneKey,
    source: ExternalDropSource,
  ) => void
  onMoveBench: (poolEntryId: number, from: number, to: number) => void
  onSetBenchTime: (
    lane: LaneKey,
    trackId: number,
    minutes: number,
    preserveExact?: boolean,
  ) => void
  onSetBenchTimes: (entries: Record<string, number>) => void
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
  selection,
  cursor,
  starredTiles,
  pinnedTiles,
  onSelect,
  onSelectRange,
  onSetCursor,
  onToggleStar,
  onTogglePin,
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

  /** Blocks of one lane, whichever kind that lane holds. */
  const blocksInLane = useCallback(
    (lane: LaneScope): Array<LaidBlock | BenchBlock> => {
      if (lane === 'committed') {
        return blocks
      }
      return benchLanes.find((l) => laneKeyOf(l.lane) === lane)?.blocks ?? []
    },
    [blocks, benchLanes],
  )

  const isSelected = useCallback(
    (lane: LaneScope, trackId: number) =>
      selection.lane === lane && selection.ids.includes(trackId),
    [selection],
  )

  const selectedTrack = useMemo<Track | null>(() => {
    if (selection.ids.length !== 1 || selection.focus == null) {
      return null
    }
    // Either block type can be the relation source, but only in its own lane.
    const hit = blocksInLane(selection.lane).find(
      (b) => b.entry.track_id === selection.focus,
    )
    return hit?.entry.track ?? null
  }, [blocksInLane, selection])

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
  const minuteFromClientX = useCallback(
    (lane: Element, clientX: number) =>
      startMin +
      (clientX - lane.getBoundingClientRect().left - LANE_LABEL_PX) / pxPerMin,
    [pxPerMin, startMin],
  )

  const minuteAt = useCallback(
    (e: React.DragEvent): number | null => {
      const minute = minuteFromClientX(e.currentTarget, e.clientX)
      return Number.isFinite(minute) ? snapMinutes(minute) : null
    },
    [minuteFromClientX],
  )

  const centerMinute = useCallback(
    (minutes: number) => {
      const viewport = scrollRef.current
      if (!viewport) {
        return
      }
      const x = LANE_LABEL_PX + (minutes - startMin) * pxPerMin
      viewport.scrollLeft = Math.max(
        0,
        Math.min(
          viewport.scrollWidth - viewport.clientWidth,
          x - viewport.clientWidth / 2,
        ),
      )
    },
    [pxPerMin, scrollRef, startMin],
  )

  // Selection drag. It starts on the lane background only, so a pointer-down
  // on a block still begins the native HTML5 block drag.
  const [marquee, setMarquee] = useState<{
    lane: LaneScope
    from: number
    to: number
  } | null>(null)
  const marqueeRef = useRef<{
    lane: LaneScope
    element: Element
    from: number
    clientX: number
  } | null>(null)

  const beginMarquee = useCallback(
    (lane: LaneScope) => (e: React.PointerEvent) => {
      if (e.button !== 0 || e.target !== e.currentTarget) {
        return
      }
      const element = e.currentTarget
      const from = minuteFromClientX(element, e.clientX)
      marqueeRef.current = { lane, element, from, clientX: e.clientX }
      setMarquee({ lane, from, to: from })
    },
    [minuteFromClientX],
  )

  const dragging = marquee !== null
  useEffect(() => {
    if (!dragging) {
      return
    }
    function onMove(e: PointerEvent) {
      const drag = marqueeRef.current
      if (drag) {
        setMarquee({
          lane: drag.lane,
          from: drag.from,
          to: minuteFromClientX(drag.element, e.clientX),
        })
      }
    }
    function onUp(e: PointerEvent) {
      const drag = marqueeRef.current
      marqueeRef.current = null
      setMarquee(null)
      if (!drag) {
        return
      }
      const to = minuteFromClientX(drag.element, e.clientX)
      if (Math.abs(e.clientX - drag.clientX) < 4) {
        onSetCursor(drag.lane, snapMinutes(to))
        return
      }
      const covered = blocksInMinuteRange(
        blocksInLane(drag.lane),
        drag.from,
        to,
      )
      onSelectRange(
        drag.lane,
        covered.map((block) => block.entry.track_id),
      )
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, blocksInLane, minuteFromClientX, onSelectRange, onSetCursor])

  /** End of the committed spine: where a fresh bench drop lands by default. */
  const committedEnd = useMemo(
    () => blocks.reduce((end, b) => Math.max(end, b.t + b.dur), startMin),
    [blocks, startMin],
  )

  /**
   * Group the lane into the same BPM clusters the Explorer grid uses, then
   * order each cluster by title and pack it from the committed end.
   */
  const handleArrangeLane = useCallback(
    (laneBlocks: BenchBlock[]) => {
      // One write, so the lane cannot overwrite itself block by block.
      onSetBenchTimes(arrangeLaneBlocks(laneBlocks, committedEnd, pinnedTiles))
    },
    [committedEnd, onSetBenchTimes, pinnedTiles],
  )

  const renderPostEndBorder = () =>
    committedEnd < endMin ? (
      <span
        className="sq-lane-post-end"
        aria-hidden="true"
        style={{
          left: LANE_LABEL_PX + (committedEnd - startMin) * pxPerMin,
          width: (endMin - committedEnd) * pxPerMin,
        }}
      />
    ) : null

  const renderMarquee = (lane: LaneScope) =>
    marquee && marquee.lane === lane ? (
      <span
        className="sq-marquee"
        aria-hidden="true"
        style={{
          left:
            LANE_LABEL_PX +
            (Math.min(marquee.from, marquee.to) - startMin) * pxPerMin,
          width: Math.abs(marquee.to - marquee.from) * pxPerMin,
        }}
      />
    ) : null

  const renderCursor = (lane: LaneScope) =>
    cursor?.lane === lane ? (
      <span
        className="sq-paste-cursor"
        aria-label={`Paste cursor at ${formatHM(cursor.minutes)}`}
        style={{
          left: LANE_LABEL_PX + (cursor.minutes - startMin) * pxPerMin,
        }}
      />
    ) : null

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
        onSetBenchTime(target, external.trackId, committedEnd)
        onBenchToLane(external.trackId, target, external.source)
        return
      }
      if (!payload) {
        return
      }
      const trackId = payload.trackId
      if (minute != null) {
        onSetBenchTime(target, trackId, minute)
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
    <div
      className="sq-lanes"
      data-px-per-min={pxPerMin}
      style={
        { '--sq-lane-label-px': `${LANE_LABEL_PX}px` } as React.CSSProperties
      }
    >
      <div
        className="sq-ruler"
        style={{ width: width + LANE_LABEL_PX }}
        aria-label="Timeline ruler"
        onPointerDown={(e) => {
          if (e.button !== 0) {
            return
          }
          const minutes = snapMinutes(
            minuteFromClientX(e.currentTarget, e.clientX),
          )
          onSetCursor(cursor?.lane ?? 'committed', minutes)
          centerMinute(minutes)
        }}
      >
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
      <SequencerScrollbar
        scrollRef={scrollRef}
        endOffset={LANE_LABEL_PX + (committedEnd - startMin) * pxPerMin}
      />
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
        onPointerDown={beginMarquee('committed')}
      >
        {renderPostEndBorder()}
        <span className="sq-lane-label">Committed</span>
        {renderMarquee('committed')}
        {renderCursor('committed')}
        {blocks.map((block) => {
          const picked = isSelected('committed', block.entry.track_id)
          const tileKey = sequencerTileKey('committed', block.entry.track_id)
          return (
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
              selected={picked}
              starred={!!starredTiles[tileKey]}
              relation={picked ? null : relationFor(block.entry.track)}
              onSelect={() =>
                onSelect('committed', picked ? null : block.entry.track_id)
              }
              onToggleStar={() => onToggleStar(tileKey)}
              onDragStart={(e) =>
                writeBlockDrag(e.dataTransfer, {
                  trackId: block.entry.track_id,
                  from: 'committed',
                })
              }
            />
          )
        })}
      </div>
      {benchLanes.map(({ lane, blocks: benched }, laneIndex) => {
        const key = laneKeyOf(lane)
        const groupId = lane.group?.id ?? 0
        const laneHue = ALT_LANE_HUES[laneIndex % ALT_LANE_HUES.length]
        return (
          <div
            key={key}
            className="sq-lane sq-lane--alt"
            style={
              {
                width: width + LANE_LABEL_PX,
                '--sq-alt-hue': laneHue,
              } as React.CSSProperties
            }
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
            onPointerDown={beginMarquee(key)}
          >
            {renderPostEndBorder()}
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
                aria-label={`Auto-arrange lane ${lane.name}`}
                title="Group this lane into BPM clusters"
                onClick={() => handleArrangeLane(benched)}
              >
                <SortIcon size={11} />
              </button>
            </span>
            {renderMarquee(key)}
            {renderCursor(key)}
            {lane.group != null && (
              <button
                className="sq-lane-delete"
                aria-label={`Delete lane ${lane.name}`}
                onClick={() => onDeleteLane(groupId)}
              >
                ×
              </button>
            )}
            {benched.map((block) => {
              const picked = isSelected(key, block.entry.track_id)
              const tileKey = sequencerTileKey(key, block.entry.track_id)
              return (
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
                  selected={picked}
                  starred={!!starredTiles[tileKey]}
                  locationPinned={!!pinnedTiles[tileKey]}
                  relation={picked ? null : relationFor(block.entry.track)}
                  bpm={block.entry.track?.bpm ?? null}
                  onSelect={() =>
                    onSelect(key, picked ? null : block.entry.track_id)
                  }
                  onToggleStar={() => onToggleStar(tileKey)}
                  onTogglePin={() => {
                    onSetBenchTime(key, block.entry.track_id, block.t, true)
                    onTogglePin(tileKey)
                  }}
                  onDragStart={(e) =>
                    writeBlockDrag(e.dataTransfer, {
                      trackId: block.entry.track_id,
                      poolEntryId: block.entry.id,
                      from: key,
                    })
                  }
                  onPromote={() =>
                    onPromote(block.entry.track_id, blocks.length)
                  }
                />
              )
            })}
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
