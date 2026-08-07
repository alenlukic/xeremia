import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SequencerLanes } from './SequencerLanes'
import { SequencerTracklist } from './SequencerTracklist'
import { SequencerFooter } from './SequencerFooter'
import {
  EMPTY_SELECTION,
  benchPlacementKey,
  committedReorderMoves,
  laneKeyOf,
  tickForZoom,
  useSequencer,
} from '../hooks/useSequencer'
import type {
  BenchBlock,
  BenchPlacement,
  BlockOverride,
  ClipboardMode,
  ClipboardTrack,
  LaidBlock,
  LaneKey,
  LaneScope,
  LaneSelection,
  SequencerClipboard,
  SequencerCursor,
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
  onPromote: (trackId: number, position: number) => MutationResult
  onReorder: (trackId: number, position: number) => MutationResult
  onBenchToLane: (
    trackId: number,
    lane: LaneKey,
    source: 'browse' | 'pool' | 'tracklist',
  ) => MutationResult
  onMoveBench: (poolEntryId: number, from: number, to: number) => MutationResult
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
  const [cursor, setCursor] = useState<SequencerCursor | null>(null)
  const [clipboardError, setClipboardError] = useState<string | null>(null)
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
        times: Record<string, number>
        overrides: Record<string, Partial<BlockOverride>>
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

  const placeCursor = useCallback((lane: LaneScope, minutes: number) => {
    setCursor({ lane, minutes })
    setSelection(EMPTY_SELECTION)
    setClipboardError(null)
  }, [])

  const toggleStar = useCallback(
    (tileKey: string) => {
      const starredTiles = { ...settings.starredTiles }
      if (starredTiles[tileKey]) {
        delete starredTiles[tileKey]
      } else {
        starredTiles[tileKey] = true
      }
      patch({ starredTiles })
    },
    [patch, settings.starredTiles],
  )

  const togglePin = useCallback(
    (tileKey: string) => {
      const pinnedTiles = { ...settings.pinnedTiles }
      if (pinnedTiles[tileKey]) {
        delete pinnedTiles[tileKey]
      } else {
        pinnedTiles[tileKey] = true
      }
      patch({ pinnedTiles })
    },
    [patch, settings.pinnedTiles],
  )

  useEffect(() => {
    setSelection(EMPTY_SELECTION)
    setClipboard(null)
    setCursor(null)
    setClipboardError(null)
  }, [activeSet?.set.id])

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
    selection.ids.length === 1
      ? (selectedBlock?.entry.track ?? benchedSelection?.entry.track ?? null)
      : null
  useEffect(() => {
    onFocusTrack?.(focusTrack ?? null)
  }, [focusTrack, onFocusTrack])

  /** Where the footer's Bench action sends a committed block. */
  const firstLane: LaneKey = sequencer.lanes.length
    ? laneKeyOf(sequencer.lanes[0])
    : 'default'

  const timelineEnd = useMemo(
    () =>
      Math.max(
        targetEndMin,
        sequencer.endMinutes,
        ...sequencer.benchLanes.flatMap((lane) =>
          lane.blocks.map((block) => block.t + block.dur),
        ),
      ),
    [sequencer.benchLanes, sequencer.endMinutes, targetEndMin],
  )

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

  const captureSelection = useCallback(
    (mode: ClipboardMode) => {
      if (pasteInFlightRef.current) {
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
          poolEntryId: committed ? null : block.entry.id,
          playMinutes: block.dur,
          override:
            (committed
              ? sequencer.overrides[trackId]
              : (sequencer.benchOverrides[
                  benchPlacementKey(lane as LaneKey, trackId)
                ] ?? sequencer.benchOverrides[String(trackId)])) ?? null,
          note: committed
            ? (activeSet?.tracklist.find((e) => e.track_id === trackId)?.note ??
              null)
            : null,
        })
      }
      if (tracks.length === 0) {
        return
      }
      setClipboard({ mode, source: lane, tracks })
      setClipboardError(null)
      setCursor({
        lane,
        minutes: tracks.reduce((start, track) => {
          const block = source.find(
            (item) => item.entry.track_id === track.trackId,
          )
          return block ? Math.min(start, block.t) : start
        }, Number.POSITIVE_INFINITY),
      })
      setSelection(EMPTY_SELECTION)
    },
    [
      activeSet,
      blocksInLane,
      selection,
      sequencer.benchOverrides,
      sequencer.overrides,
    ],
  )

  // A cut is intentionally non-destructive. The old implementation deleted
  // every selected row before paste and could strand tracks after a partial
  // failure. We keep the source rows in place until paste moves them.
  const cutSelection = useCallback(
    () => captureSelection('cut'),
    [captureSelection],
  )

  const copySelection = useCallback(
    () => captureSelection('copy'),
    [captureSelection],
  )

  /** Committed insert point under the visible cursor, excluding held tracks. */
  const committedPasteIndex = useCallback(() => {
    const heldIds = new Set(
      clipboard?.mode === 'cut' && clipboard.source === 'committed'
        ? clipboard.tracks.map((track) => track.trackId)
        : [],
    )
    const available = sequencer.blocks.filter(
      (block) => !heldIds.has(block.entry.track_id),
    )
    if (!cursor) {
      return available.length
    }
    return available.filter(
      (block) => block.t + block.dur / 2 <= cursor.minutes,
    ).length
  }, [clipboard, cursor, sequencer.blocks])

  const pasteClipboard = useCallback(async () => {
    if (!clipboard || !activeSet || pasteInFlightRef.current) {
      return
    }
    pasteInFlightRef.current = true
    let completed = 0
    const placements: BenchPlacement[] = []
    try {
      const run = async (mutation: () => MutationResult) => {
        const succeeded = await mutation()
        if (succeeded === false) {
          throw new Error('Could not paste the selection.')
        }
      }
      const setId = activeSet.set.id
      const { mode, source, tracks } = clipboard
      const target = cursor ?? {
        lane: source,
        minutes: blocksInLane(source).reduce(
          (end, block) => Math.max(end, block.t + block.dur),
          startMin,
        ),
      }

      if (target.lane === 'committed') {
        const at = committedPasteIndex()
        if (source === 'committed') {
          if (mode === 'copy') {
            throw new Error(
              'Committed copies are only supported into alternative lanes.',
            )
          }
          const moves = committedReorderMoves(
            sequencer.blocks.map((block) => block.entry.track_id),
            tracks.map((track) => track.trackId),
            at,
          )
          for (const move of moves) {
            await run(() => onReorder(move.trackId, move.position))
          }
          completed = tracks.length
        } else {
          for (const [offset, track] of tracks.entries()) {
            await run(() =>
              mode === 'cut'
                ? onPromote(track.trackId, at + offset)
                : onAddCommitted(track.trackId, at + offset),
            )
            completed++
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
        }
      } else {
        const targetLane: LaneKey = target.lane
        if (mode === 'copy' && source === targetLane) {
          throw new Error(
            'Copy to a different lane to keep duplicates decoupled.',
          )
        }
        let at = target.minutes
        for (const track of tracks) {
          if (source === 'committed') {
            await run(() =>
              onBenchToLane(
                track.trackId,
                targetLane,
                mode === 'cut' ? 'tracklist' : 'browse',
              ),
            )
          } else if (source !== target.lane) {
            const poolEntryId = track.poolEntryId
            if (mode === 'copy') {
              await run(() => onBenchToLane(track.trackId, targetLane, 'pool'))
            } else {
              if (
                typeof source !== 'number' ||
                typeof targetLane !== 'number' ||
                poolEntryId == null
              ) {
                throw new Error('Could not move the selection between lanes.')
              }
              await run(() => onMoveBench(poolEntryId, source, targetLane))
            }
          }
          completed++
          placements.push({
            placementKey: benchPlacementKey(targetLane, track.trackId),
            minutes: at,
            override: track.override,
          })
          at += track.playMinutes
        }
        sequencer.applyBenchPlacements(placements)
      }
      if (mode === 'cut') {
        setClipboard(null)
      }
      setClipboardError(null)
    } catch (err: unknown) {
      if (placements.length > 0) {
        sequencer.applyBenchPlacements(placements)
      }
      if (
        clipboard.mode === 'cut' &&
        completed > 0 &&
        completed < clipboard.tracks.length
      ) {
        const remaining = clipboard.tracks.slice(completed)
        setClipboard({ ...clipboard, tracks: remaining })
        setCursor((current) =>
          current
            ? {
                ...current,
                minutes:
                  current.minutes +
                  clipboard.tracks
                    .slice(0, completed)
                    .reduce((sum, track) => sum + track.playMinutes, 0),
              }
            : current,
        )
      }
      setClipboardError(
        err instanceof Error ? err.message : 'Could not paste the selection.',
      )
    } finally {
      pasteInFlightRef.current = false
    }
  }, [
    activeSet,
    blocksInLane,
    clipboard,
    committedPasteIndex,
    cursor,
    onAddCommitted,
    onBenchToLane,
    onMoveBench,
    onPromote,
    onReorder,
    onSaved,
    sequencer,
    startMin,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape' && !isEditableTarget(e.target)) {
        e.preventDefault()
        setSelection(EMPTY_SELECTION)
        return
      }
      if (!e.metaKey && !e.ctrlKey) {
        return
      }
      const key = e.key.toLowerCase()
      if (
        (key !== 'x' && key !== 'c' && key !== 'v') ||
        isEditableTarget(e.target)
      ) {
        return
      }
      e.preventDefault()
      if (key === 'x') {
        cutSelection()
      } else if (key === 'c') {
        copySelection()
      } else {
        void pasteClipboard()
      }
    },
    [copySelection, cutSelection, pasteClipboard],
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
            endMin={timelineEnd}
            tickMin={tickMin}
            pxPerMin={pxPerMin}
            selection={selection}
            cursor={cursor}
            benchTimes={settings.benchTimes}
            starredTiles={settings.starredTiles}
            pinnedTiles={settings.pinnedTiles}
            onSelect={selectBlock}
            onSelectRange={selectRange}
            onSetCursor={placeCursor}
            onToggleStar={toggleStar}
            onTogglePin={togglePin}
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
            onNoteChange={(trackId, note) => {
              if (!activeSet) {
                return
              }
              void updateTracklistNote(activeSet.set.id, trackId, note).then(
                () => onSaved?.(),
              )
            }}
          />
        )}
      </div>
      <SequencerFooter
        block={selectedBlock}
        benched={benchedSelection}
        overrides={sequencer.overrides}
        onPatch={(patch) => {
          if (selection.focus == null) {
            return
          }
          if (selectedBlock) {
            sequencer.patchOverride(selection.focus, patch)
          } else if (selection.lane !== 'committed') {
            sequencer.patchBenchOverride(selection.lane, selection.focus, patch)
          }
        }}
        onReset={() => {
          if (selection.focus == null) {
            return
          }
          if (selectedBlock) {
            sequencer.resetOverrides(selection.focus)
          } else if (selection.lane !== 'committed') {
            sequencer.resetBenchOverride(selection.lane, selection.focus)
          }
        }}
        onSetBenchTime={(minutes) => {
          if (selection.focus != null && selection.lane !== 'committed') {
            sequencer.setBenchTime(selection.lane, selection.focus, minutes)
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
