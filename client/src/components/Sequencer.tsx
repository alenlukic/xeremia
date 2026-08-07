import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SequencerLanes } from './SequencerLanes'
import { SequencerTracklist } from './SequencerTracklist'
import { SequencerFooter } from './SequencerFooter'
import { laneKeyOf, tickForZoom, useSequencer } from '../hooks/useSequencer'
import type { BlockOverride } from '../hooks/useSequencer'
import type { LaneKey } from '../hooks/useSequencer'
import { exportSetM3u8 } from '../api/http'
import {
  useSequencerSettings,
  DEFAULT_START_MIN,
  DEFAULT_END_MIN,
} from '../hooks/useSequencerSettings'
import { formatHM, parseTimeInput } from '../utils/time'
import type { HydratedSet, Track } from '../types'

// The Sequencer widget. It absorbs the tracklist: the committed lane is the
// server tracklist, and the Tracklist view is the same data as a list.

type View = 'lanes' | 'list'

const MIN_PX_PER_MIN = 2
const MAX_PX_PER_MIN = 40

interface Props {
  activeSet: HydratedSet | null
  onAddCommitted: (trackId: number, position: number) => void
  onPromote: (trackId: number, position: number) => void
  onReorder: (trackId: number, position: number) => void
  onBenchToLane: (
    trackId: number,
    lane: LaneKey,
    source: 'browse' | 'pool' | 'tracklist',
  ) => void
  onMoveBench: (poolEntryId: number, from: number, to: number) => void
  onRemove: (trackId: number) => void
  onRemoveBenched: (trackId: number) => void
  onAddLane: () => void
  onDeleteLane: (subgroupId: number) => void
  onRenameLane: (subgroupId: number, name: string) => void
  onReorderLanes: (subgroupIds: number[]) => void
  onSaved?: () => void
  /** Reports the selected block's track so other widgets can follow it. */
  onFocusTrack?: (track: Track | null) => void
}

export function Sequencer({
  activeSet,
  onAddCommitted,
  onPromote,
  onReorder,
  onBenchToLane,
  onMoveBench,
  onRemove,
  onRemoveBenched,
  onAddLane,
  onDeleteLane,
  onRenameLane,
  onReorderLanes,
  onSaved,
  onFocusTrack,
}: Props) {
  // Every one of these is persisted on the set, so a reload restores them.
  const settings = useSequencerSettings(
    activeSet?.set.id ?? null,
    activeSet?.set.sequencer,
  )
  const { startMin, endMin: targetEndMin, view, patch } = settings
  const setView = useCallback((v: View) => patch({ view: v }), [patch])
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null)
  const [startDraft, setStartDraft] = useState(formatHM(DEFAULT_START_MIN))
  const [endDraft, setEndDraft] = useState(formatHM(DEFAULT_END_MIN))

  // Keep the text inputs in step with the stored values.
  useEffect(() => {
    setStartDraft(formatHM(startMin))
  }, [startMin])
  useEffect(() => {
    setEndDraft(formatHM(targetEndMin))
  }, [targetEndMin])

  const sequencer = useSequencer({
    setId: activeSet?.set.id ?? null,
    tracklist: activeSet?.tracklist ?? [],
    pool: activeSet?.pool ?? [],
    subgroups: activeSet?.pool_subgroups ?? [],
    memberships: activeSet?.pool_subgroup_memberships ?? [],
    startMin,
    endMin: targetEndMin,
    onSaved,
    benchTimes: settings.benchTimes,
    benchOverrides: settings.benchOverrides,
    onBenchChange: useCallback(
      (next: {
        times: Record<number, number>
        overrides: Record<number, Partial<BlockOverride>>
      }) => patch({ benchTimes: next.times, benchOverrides: next.overrides }),
      [patch],
    ),
  })

  // Clamp on read as well as on write: a value persisted before these limits
  // existed must not survive as an unusable zoom.
  const pxPerMin = Math.min(
    MAX_PX_PER_MIN,
    Math.max(MIN_PX_PER_MIN, settings.pxPerMin),
  )
  const tickMin = tickForZoom(pxPerMin)

  const selectedBlock = useMemo(
    () =>
      sequencer.blocks.find((b) => b.entry.track_id === selectedTrackId) ??
      null,
    [sequencer.blocks, selectedTrackId],
  )

  const benchedSelection = useMemo(() => {
    if (selectedBlock || selectedTrackId == null) {
      return null
    }
    for (const { blocks } of sequencer.benchLanes) {
      const hit = blocks.find((b) => b.entry.track_id === selectedTrackId)
      if (hit) {
        return hit
      }
    }
    return null
  }, [selectedBlock, selectedTrackId, sequencer.benchLanes])

  const focusTrack =
    selectedBlock?.entry.track ?? benchedSelection?.entry.track ?? null
  useEffect(() => {
    onFocusTrack?.(focusTrack ?? null)
  }, [focusTrack, onFocusTrack])

  /** Where the footer's Bench action sends a committed block. */
  const firstLane: LaneKey = sequencer.lanes.length
    ? laneKeyOf(sequencer.lanes[0])
    : 'default'

  // Ctrl/Cmd + wheel zooms the timeline. Without the modifier the event is
  // left alone so the lanes still scroll normally.
  const mainRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = mainRef.current
    if (!el) {
      return
    }
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) {
        return
      }
      // Must be a non-passive listener, or this is ignored and the browser
      // zooms the whole page instead of the timeline.
      e.preventDefault()
      const factor = Math.exp(-e.deltaY / 300)
      patch({
        pxPerMin: Math.min(
          MAX_PX_PER_MIN,
          Math.max(MIN_PX_PER_MIN, pxPerMin * factor),
        ),
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [patch, pxPerMin])

  const handleExport = useCallback(async () => {
    if (!activeSet || sequencer.blocks.length === 0) {
      return
    }
    try {
      const ids = sequencer.blocks.map((b) => b.entry.track_id)
      const result = await exportSetM3u8(ids, activeSet.set.name)
      const blob = new Blob([result.content], { type: 'audio/x-mpegurl' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      /* export failure is non-critical */
    }
  }, [activeSet, sequencer.blocks])

  if (!activeSet) {
    return (
      <p className="table-status">
        No active set — create or select one to sequence.
      </p>
    )
  }

  return (
    <div className="sq-body">
      {/* One thin row: the view switch and the run window. The tick follows
          the zoom, and the zoom follows ctrl/cmd + wheel. */}
      <div className="sq-toolbar">
        <div className="sq-view-pills">
          <button
            className={`ws-pill${view === 'lanes' ? ' ws-pill--on' : ''}`}
            aria-pressed={view === 'lanes'}
            onClick={() => setView('lanes')}
          >
            Lanes
          </button>
          <button
            className={`ws-pill${view === 'list' ? ' ws-pill--on' : ''}`}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            Tracklist
          </button>
        </div>
        <label className="sq-time-field">
          start
          <input
            aria-label="Set start time"
            value={startDraft}
            onChange={(e) => setStartDraft(e.target.value)}
            onBlur={() => {
              const parsed = parseTimeInput(startDraft)
              if (parsed != null) {
                patch({ startMin: parsed })
                setStartDraft(formatHM(parsed))
              } else {
                setStartDraft(formatHM(startMin))
              }
            }}
          />
        </label>
        <label className="sq-time-field">
          end
          <input
            aria-label="Set end time"
            value={endDraft}
            onChange={(e) => setEndDraft(e.target.value)}
            onBlur={() => {
              const parsed = parseTimeInput(endDraft)
              if (parsed != null) {
                patch({ endMin: parsed })
                setEndDraft(formatHM(parsed))
              } else {
                setEndDraft(formatHM(targetEndMin))
              }
            }}
          />
        </label>
        {view === 'list' && (
          <button className="ws-pill" onClick={handleExport}>
            Export
          </button>
        )}
      </div>
      <div className="sq-main" ref={mainRef}>
        {sequencer.saveError && (
          <p className="table-status table-status--error">
            {sequencer.saveError}
          </p>
        )}
        {view === 'lanes' ? (
          <SequencerLanes
            scrollRef={mainRef}
            blocks={sequencer.blocks}
            benchLanes={sequencer.benchLanes}
            startMin={startMin}
            endMin={Math.max(targetEndMin, sequencer.endMinutes)}
            tickMin={tickMin}
            pxPerMin={pxPerMin}
            selectedTrackId={selectedTrackId}
            onSelect={setSelectedTrackId}
            onAddCommitted={onAddCommitted}
            onPromote={onPromote}
            onReorder={onReorder}
            onBenchToLane={onBenchToLane}
            onMoveBench={onMoveBench}
            onSetBenchTime={sequencer.setBenchTime}
            onSetBenchTimes={sequencer.setBenchTimes}
            onAddLane={onAddLane}
            onDeleteLane={onDeleteLane}
            onRenameLane={onRenameLane}
            onReorderLanes={onReorderLanes}
          />
        ) : (
          <SequencerTracklist
            blocks={sequencer.blocks}
            overrides={sequencer.overrides}
            selectedTrackId={selectedTrackId}
            onSelect={setSelectedTrackId}
            onBpmChange={(trackId, bpm) =>
              sequencer.patchOverride(trackId, { bpmOv: bpm })
            }
          />
        )}
      </div>
      <SequencerFooter
        block={selectedBlock}
        benched={benchedSelection}
        overrides={sequencer.overrides}
        benchOverrides={sequencer.benchOverrides}
        onPatch={(patch) => {
          if (selectedTrackId == null) {
            return
          }
          if (selectedBlock) {
            sequencer.patchOverride(selectedTrackId, patch)
          } else {
            sequencer.patchBenchOverride(selectedTrackId, patch)
          }
        }}
        onReset={() => {
          if (selectedTrackId == null) {
            return
          }
          if (selectedBlock) {
            sequencer.resetOverrides(selectedTrackId)
          } else {
            sequencer.resetBenchOverride(selectedTrackId)
          }
        }}
        onBench={() => {
          if (selectedTrackId != null) {
            onBenchToLane(selectedTrackId, firstLane, 'tracklist')
            setSelectedTrackId(null)
          }
        }}
        onCommit={() => {
          if (selectedTrackId != null) {
            onPromote(selectedTrackId, sequencer.blocks.length)
            setSelectedTrackId(null)
          }
        }}
        onRemove={() => {
          if (selectedTrackId == null) {
            return
          }
          if (selectedBlock) {
            onRemove(selectedTrackId)
          } else {
            onRemoveBenched(selectedTrackId)
          }
          setSelectedTrackId(null)
        }}
      />
    </div>
  )
}
