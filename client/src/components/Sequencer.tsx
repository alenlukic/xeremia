import { useCallback, useMemo, useState } from 'react'
import { SequencerLanes } from './SequencerLanes'
import { SequencerTracklist } from './SequencerTracklist'
import { SequencerFooter } from './SequencerFooter'
import { laneKeyOf, useSequencer } from '../hooks/useSequencer'
import type { LaneKey } from '../hooks/useSequencer'
import { exportSetM3u8 } from '../api/http'
import { formatHM, parseTimeInput } from '../utils/time'
import type { HydratedSet } from '../types'

// The Sequencer widget. It absorbs the tracklist: the committed lane is the
// server tracklist, and the Tracklist view is the same data as a list.

type View = 'lanes' | 'list'

const TICKS = [5, 10, 15, 30]
const DEFAULT_START_MIN = 6 * 60
const DEFAULT_END_MIN = 8 * 60
const MIN_PX_PER_MIN = 2
const MAX_PX_PER_MIN = 40

interface Props {
  activeSet: HydratedSet | null
  onPromote: (trackId: number, position: number) => void
  onReorder: (trackId: number, position: number) => void
  onBenchToLane: (
    trackId: number,
    lane: LaneKey,
    source: 'browse' | 'tracklist',
  ) => void
  onMoveBench: (poolEntryId: number, from: number, to: number) => void
  onRemove: (trackId: number) => void
  onRemoveBenched: (trackId: number) => void
  onAddLane: () => void
  onDeleteLane: (subgroupId: number) => void
  onSaved?: () => void
}

export function Sequencer({
  activeSet,
  onPromote,
  onReorder,
  onBenchToLane,
  onMoveBench,
  onRemove,
  onRemoveBenched,
  onAddLane,
  onDeleteLane,
  onSaved,
}: Props) {
  const [view, setView] = useState<View>('lanes')
  const [startMin, setStartMin] = useState(DEFAULT_START_MIN)
  const [targetEndMin, setTargetEndMin] = useState(DEFAULT_END_MIN)
  const [tickMin, setTickMin] = useState(15)
  const [pxPerMin, setPxPerMin] = useState(6)
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null)
  const [startDraft, setStartDraft] = useState(formatHM(DEFAULT_START_MIN))
  const [endDraft, setEndDraft] = useState(formatHM(DEFAULT_END_MIN))

  const sequencer = useSequencer({
    setId: activeSet?.set.id ?? null,
    tracklist: activeSet?.tracklist ?? [],
    pool: activeSet?.pool ?? [],
    subgroups: activeSet?.pool_subgroups ?? [],
    memberships: activeSet?.pool_subgroup_memberships ?? [],
    startMin,
    onSaved,
  })

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

  /** Where the footer's Bench action sends a committed block. */
  const firstLane: LaneKey = sequencer.lanes.length
    ? laneKeyOf(sequencer.lanes[0])
    : 'default'

  const overflowing = sequencer.endMinutes > targetEndMin

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
        <span
          className={`sq-total${overflowing ? ' sq-total--over' : ''}`}
          role="status"
        >
          {sequencer.blocks.length} tracks · {formatHM(startMin)}→
          {formatHM(sequencer.endMinutes)} of {formatHM(targetEndMin)}
        </span>
        {view === 'list' && (
          <button className="ws-pill" onClick={handleExport}>
            Export
          </button>
        )}
        <label className="sq-time-field">
          start
          <input
            aria-label="Set start time"
            value={startDraft}
            onChange={(e) => setStartDraft(e.target.value)}
            onBlur={() => {
              const parsed = parseTimeInput(startDraft)
              if (parsed != null) {
                setStartMin(parsed)
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
                setTargetEndMin(parsed)
                setEndDraft(formatHM(parsed))
              } else {
                setEndDraft(formatHM(targetEndMin))
              }
            }}
          />
        </label>
        <div className="sq-tick-pills">
          {TICKS.map((t) => (
            <button
              key={t}
              className={`ws-pill${tickMin === t ? ' ws-pill--on' : ''}`}
              aria-pressed={tickMin === t}
              onClick={() => setTickMin(t)}
            >
              {t}m
            </button>
          ))}
        </div>
        <button
          className="ws-pill"
          aria-label="Zoom out"
          onClick={() => setPxPerMin((v) => Math.max(MIN_PX_PER_MIN, v / 1.4))}
        >
          −
        </button>
        <button
          className="ws-pill"
          aria-label="Zoom in"
          onClick={() => setPxPerMin((v) => Math.min(MAX_PX_PER_MIN, v * 1.4))}
        >
          +
        </button>
      </div>
      {sequencer.saveError && (
        <p className="table-status table-status--error">
          {sequencer.saveError}
        </p>
      )}
      {view === 'lanes' ? (
        <SequencerLanes
          blocks={sequencer.blocks}
          benchLanes={sequencer.benchLanes}
          startMin={startMin}
          endMin={Math.max(targetEndMin, sequencer.endMinutes)}
          tickMin={tickMin}
          pxPerMin={pxPerMin}
          selectedTrackId={selectedTrackId}
          onSelect={setSelectedTrackId}
          onPromote={onPromote}
          onReorder={onReorder}
          onBenchToLane={onBenchToLane}
          onMoveBench={onMoveBench}
          onSetBenchTime={sequencer.setBenchTime}
          onAddLane={onAddLane}
          onDeleteLane={onDeleteLane}
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
