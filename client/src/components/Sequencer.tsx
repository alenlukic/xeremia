import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SequencerLanes } from './SequencerLanes'
import { SequencerTracklist } from './SequencerTracklist'
import { SequencerFooter } from './SequencerFooter'
import {
  EMPTY_SELECTION,
  laneKeyOf,
  tickForZoom,
  useSequencer,
} from '../hooks/useSequencer'
import type {
  BenchBlock,
  BenchPlacement,
  BlockOverride,
  ClipboardTrack,
  LaidBlock,
  LaneKey,
  LaneScope,
  LaneSelection,
  SequencerClipboard,
} from '../hooks/useSequencer'
import {
  exportSetM3u8,
  tracklistSetOverrides,
  updateTracklistNote,
} from '../api/http'
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

type MutationResult = void | boolean | Promise<void | boolean>

/** Cut and paste must never fire while the DJ is typing in a field. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

interface Props {
  activeSet: HydratedSet | null
  onAddCommitted: (trackId: number, position: number) => MutationResult
  onPromote: (trackId: number, position: number) => void
  onReorder: (trackId: number, position: number) => void
  onBenchToLane: (
    trackId: number,
    lane: LaneKey,
    source: 'browse' | 'pool' | 'tracklist',
  ) => MutationResult
  onMoveBench: (poolEntryId: number, from: number, to: number) => void
  onRemove: (trackId: number) => MutationResult
  onRemoveBenched: (trackId: number) => MutationResult
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
  const [selection, setSelection] = useState<LaneSelection>(EMPTY_SELECTION)
  const [clipboard, setClipboard] = useState<SequencerClipboard | null>(null)
  const [clipboardError, setClipboardError] = useState<string | null>(null)
  const cutPromiseRef = useRef<Promise<boolean> | null>(null)
  const pasteInFlightRef = useRef(false)
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

  /** Blocks of one lane, whichever kind that lane holds. */
  const blocksInLane = useCallback(
    (lane: LaneScope): Array<LaidBlock | BenchBlock> => {
      if (lane === 'committed') {
        return sequencer.blocks
      }
      return (
        sequencer.benchLanes.find((l) => laneKeyOf(l.lane) === lane)?.blocks ??
        []
      )
    },
    [sequencer.blocks, sequencer.benchLanes],
  )

  const selectBlock = useCallback((lane: LaneScope, trackId: number | null) => {
    setSelection(
      trackId == null
        ? EMPTY_SELECTION
        : { lane, ids: [trackId], focus: trackId },
    )
  }, [])

  const selectRange = useCallback((lane: LaneScope, trackIds: number[]) => {
    setSelection(
      trackIds.length === 0
        ? EMPTY_SELECTION
        : { lane, ids: trackIds, focus: trackIds[0] },
    )
  }, [])

  const selectedBlock = useMemo(
    () =>
      selection.lane === 'committed'
        ? (sequencer.blocks.find((b) => b.entry.track_id === selection.focus) ??
          null)
        : null,
    [sequencer.blocks, selection],
  )

  const benchedSelection = useMemo(() => {
    if (selection.lane === 'committed' || selection.focus == null) {
      return null
    }
    const hit = sequencer.benchLanes
      .find((l) => laneKeyOf(l.lane) === selection.lane)
      ?.blocks.find((b) => b.entry.track_id === selection.focus)
    return hit ?? null
  }, [selection, sequencer.benchLanes])

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

  // Cut writes straight through to the server and keeps the removed values in
  // memory, so a reload between a cut and a paste drops the clipboard while
  // the tracks themselves stay in the library.
  const cutSelection = useCallback(() => {
    if (cutPromiseRef.current || pasteInFlightRef.current) {
      return
    }
    const { lane, ids } = selection
    if (ids.length === 0) {
      return
    }
    const committed = lane === 'committed'
    const source = blocksInLane(lane)
    const tracks: ClipboardTrack[] = []
    for (const trackId of ids) {
      const block = source.find((b) => b.entry.track_id === trackId)
      if (!block) {
        continue
      }
      tracks.push({
        trackId,
        playMinutes: block.dur,
        override:
          (committed
            ? sequencer.overrides[trackId]
            : sequencer.benchOverrides[trackId]) ?? null,
        note: committed
          ? (activeSet?.tracklist.find((e) => e.track_id === trackId)?.note ??
            null)
          : null,
      })
    }
    if (tracks.length === 0) {
      return
    }
    setClipboard({ source: lane, tracks })
    setClipboardError(null)
    setSelection(EMPTY_SELECTION)
    const removals = tracks.map((track) => {
      let result: MutationResult
      try {
        result = committed
          ? onRemove(track.trackId)
          : onRemoveBenched(track.trackId)
      } catch (err: unknown) {
        return Promise.reject(err)
      }
      return Promise.resolve(result).then((succeeded) => {
        if (succeeded === false) {
          throw new Error('Could not cut the selection.')
        }
      })
    })
    const cutPromise = Promise.all(removals).then(
      () => true,
      (err: unknown) => {
        setClipboard(null)
        setClipboardError(
          err instanceof Error ? err.message : 'Could not cut the selection.',
        )
        return false
      },
    )
    cutPromiseRef.current = cutPromise
    void cutPromise.finally(() => {
      if (cutPromiseRef.current === cutPromise) {
        cutPromiseRef.current = null
      }
    })
  }, [
    activeSet,
    blocksInLane,
    onRemove,
    onRemoveBenched,
    selection,
    sequencer.benchOverrides,
    sequencer.overrides,
  ])

  /** Committed insert point: after the selection, otherwise the lane end. */
  const committedPasteIndex = useCallback(() => {
    const heldIds = new Set(
      clipboard?.source === 'committed'
        ? clipboard.tracks.map((track) => track.trackId)
        : [],
    )
    const available = sequencer.blocks.filter(
      (block) => !heldIds.has(block.entry.track_id),
    )
    if (selection.lane !== 'committed' || selection.ids.length === 0) {
      return available.length
    }
    const last = available.reduce(
      (at, block, index) =>
        selection.ids.includes(block.entry.track_id) ? index : at,
      -1,
    )
    return last < 0 ? available.length : last + 1
  }, [clipboard, selection, sequencer.blocks])

  /** Bench insert time: after the selection, otherwise the lane end. */
  const benchPasteStart = useCallback(
    (lane: LaneScope) => {
      const heldIds = new Set(
        clipboard?.source === lane
          ? clipboard.tracks.map((track) => track.trackId)
          : [],
      )
      const source = blocksInLane(lane).filter(
        (block) => !heldIds.has(block.entry.track_id),
      )
      const anchored =
        selection.lane === lane && selection.ids.length > 0
          ? source.filter((b) => selection.ids.includes(b.entry.track_id))
          : source
      return anchored.reduce(
        (end, block) => Math.max(end, block.t + block.dur),
        sequencer.endMinutes,
      )
    },
    [blocksInLane, clipboard, selection, sequencer.endMinutes],
  )

  const pasteClipboard = useCallback(async () => {
    if (!clipboard || !activeSet || pasteInFlightRef.current) {
      return
    }
    pasteInFlightRef.current = true
    try {
      const cutSucceeded = await (cutPromiseRef.current ??
        Promise.resolve(true))
      if (!cutSucceeded) {
        return
      }
      const setId = activeSet.set.id
      const { source, tracks } = clipboard
      if (source === 'committed') {
        const at = committedPasteIndex()
        for (const [offset, track] of tracks.entries()) {
          const inserted = await onAddCommitted(track.trackId, at + offset)
          if (inserted === false) {
            throw new Error('Could not paste the selection.')
          }
        }
        // The inserts above only carry position, so the captured values are
        // written back once every track has a tracklist row again.
        for (const track of tracks) {
          if (track.override) {
            await tracklistSetOverrides(setId, track.trackId, {
              play_minutes: track.override.durOv ?? null,
              pinned_end_minutes: track.override.endPin ?? null,
              bpm_override: track.override.bpmOv ?? null,
            })
          }
          if (track.note !== null) {
            await updateTracklistNote(setId, track.trackId, track.note)
          }
        }
        onSaved?.()
      } else {
        let at = benchPasteStart(source)
        const placements: BenchPlacement[] = []
        for (const track of tracks) {
          const inserted = await onBenchToLane(track.trackId, source, 'browse')
          if (inserted === false) {
            throw new Error('Could not paste the selection.')
          }
          placements.push({
            trackId: track.trackId,
            minutes: at,
            override: track.override,
          })
          at += track.playMinutes
        }
        sequencer.applyBenchPlacements(placements)
      }
      setClipboard(null)
      setClipboardError(null)
    } catch (err: unknown) {
      setClipboardError(
        err instanceof Error ? err.message : 'Could not paste the selection.',
      )
    } finally {
      pasteInFlightRef.current = false
    }
  }, [
    activeSet,
    benchPasteStart,
    clipboard,
    committedPasteIndex,
    onAddCommitted,
    onBenchToLane,
    onSaved,
    sequencer,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!e.metaKey && !e.ctrlKey) {
        return
      }
      const key = e.key.toLowerCase()
      if ((key !== 'x' && key !== 'v') || isEditableTarget(e.target)) {
        return
      }
      e.preventDefault()
      if (key === 'x') {
        cutSelection()
      } else {
        void pasteClipboard()
      }
    },
    [cutSelection, pasteClipboard],
  )

  if (!activeSet) {
    return (
      <p className="table-status">
        No active set — create or select one to sequence.
      </p>
    )
  }

  return (
    <div className="sq-body" tabIndex={0} onKeyDown={handleKeyDown}>
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
        {(clipboardError || sequencer.saveError) && (
          <p className="table-status table-status--error">
            {clipboardError ?? sequencer.saveError}
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
            selection={selection}
            onSelect={selectBlock}
            onSelectRange={selectRange}
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
            selectedTrackId={
              selection.lane === 'committed' ? selection.focus : null
            }
            onSelect={(trackId) => selectBlock('committed', trackId)}
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
          if (selection.focus == null) {
            return
          }
          if (selectedBlock) {
            sequencer.patchOverride(selection.focus, patch)
          } else {
            sequencer.patchBenchOverride(selection.focus, patch)
          }
        }}
        onReset={() => {
          if (selection.focus == null) {
            return
          }
          if (selectedBlock) {
            sequencer.resetOverrides(selection.focus)
          } else {
            sequencer.resetBenchOverride(selection.focus)
          }
        }}
        onBench={() => {
          if (selection.focus != null) {
            void onBenchToLane(selection.focus, firstLane, 'tracklist')
            setSelection(EMPTY_SELECTION)
          }
        }}
        onCommit={() => {
          if (selection.focus != null) {
            onPromote(selection.focus, sequencer.blocks.length)
            setSelection(EMPTY_SELECTION)
          }
        }}
        onRemove={() => {
          if (selection.focus == null) {
            return
          }
          if (selectedBlock) {
            onRemove(selection.focus)
          } else {
            onRemoveBenched(selection.focus)
          }
          setSelection(EMPTY_SELECTION)
        }}
      />
    </div>
  )
}
