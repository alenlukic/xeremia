import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  effectivePlayedBpm,
  type LaidBlock,
  type OverrideMap,
} from '../hooks/useSequencer'
import { BPM_OVERRIDE_MAX, BPM_OVERRIDE_MIN } from '../constants/sequencer'
import { useExternalTrackDrop } from '../hooks/useExternalTrackDrop'
import type { TrackDropTarget } from '../hooks/useExternalTrackDrop'
import { keyDotColor } from '../utils/harmonic'
import { displayTitle } from '../utils/trackTitle'
import { formatDuration, formatHM } from '../utils/time'
import { POOL_ROW_MIME, TRACK_DRAG_MIME, TRACKLIST_ROW_MIME } from '../utils'

// Tracklist view of the committed lane. The BPM cell is the only editable one;
// timing mechanics stay under the hood. Rows reorder and accept browse/pool
// drops the same way the lanes view places committed blocks.

interface Props {
  blocks: LaidBlock[]
  overrides: OverrideMap
  selectedTrackId: number | null
  onSelect: (trackId: number) => void
  onBpmChange: (trackId: number, bpm: number | null) => void
  onNoteChange: (trackId: number, note: string) => void
  onReorder: (trackId: number, position: number) => void
  onAddCommitted: (trackId: number, position: number) => void
  onPromote: (trackId: number, position: number) => void
}

function NoteInput({
  trackId,
  title,
  initialNote,
  onSave,
}: {
  trackId: number
  title: string
  initialNote: string
  onSave: (trackId: number, note: string) => void
}) {
  const [value, setValue] = useState(initialNote)
  const [savedValue, setSavedValue] = useState(initialNote)
  const [previousInitialNote, setPreviousInitialNote] = useState(initialNote)

  if (initialNote !== previousInitialNote) {
    setPreviousInitialNote(initialNote)
    setSavedValue(initialNote)
    setValue(initialNote)
  }

  return (
    <input
      className="sq-note-input"
      aria-label={`Notes for ${title}`}
      placeholder="Add note…"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== savedValue) {
          setSavedValue(value)
          onSave(trackId, value)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function dataTransferHasType(e: React.DragEvent, mime: string): boolean {
  const types = e.dataTransfer?.types
  if (!types) {
    return false
  }
  return Array.from(types as ArrayLike<string>).includes(mime)
}

function readExternalTrackId(
  e: React.DragEvent,
): { trackId: number; source: 'browse' | 'pool' } | null {
  const browse = e.dataTransfer.getData(TRACK_DRAG_MIME)
  if (browse) {
    const trackId = Number(browse)
    if (Number.isInteger(trackId)) {
      return { trackId, source: 'browse' }
    }
  }
  const pool = e.dataTransfer.getData(POOL_ROW_MIME)
  if (pool) {
    const trackId = Number(pool)
    if (Number.isInteger(trackId)) {
      return { trackId, source: 'pool' }
    }
  }
  return null
}

export function SequencerTracklist({
  blocks,
  overrides,
  selectedTrackId,
  onSelect,
  onBpmChange,
  onNoteChange,
  onReorder,
  onAddCommitted,
  onPromote,
}: Props) {
  const [draft, setDraft] = useState<Record<number, string>>({})
  // Track-id based (not index): survives list refresh mid-drag and never
  // leaves a stale "dragging" class stuck on whatever sits at index 0.
  const [dragTrackId, setDragTrackId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const blockIdsKey = useMemo(
    () => blocks.map((block) => block.entry.id).join(','),
    [blocks],
  )

  const clearRowDragState = useCallback(() => {
    setDragTrackId(null)
    setDropIndex(null)
  }, [])

  // Reset mid-drag chrome when the row set changes (refresh, reorder response).
  const [prevBlockIdsKey, setPrevBlockIdsKey] = useState(blockIdsKey)
  if (blockIdsKey !== prevBlockIdsKey) {
    setPrevBlockIdsKey(blockIdsKey)
    setDragTrackId(null)
    setDropIndex(null)
  }

  const isExternalTrackDrag = useCallback(
    (e: React.DragEvent) =>
      dataTransferHasType(e, TRACK_DRAG_MIME) ||
      dataTransferHasType(e, POOL_ROW_MIME),
    [],
  )

  useEffect(() => {
    const onDragEnd = () => clearRowDragState()
    window.addEventListener('dragend', onDragEnd, true)
    return () => window.removeEventListener('dragend', onDragEnd, true)
  }, [clearRowDragState])

  const insertExternal = useCallback(
    (trackId: number, source: 'browse' | 'pool', position: number) => {
      if (source === 'browse') {
        onAddCommitted(trackId, position)
      } else {
        onPromote(trackId, position)
      }
    },
    [onAddCommitted, onPromote],
  )

  const handlePanelExternalDrop = useCallback(
    (trackId: number, source: 'browse' | 'pool') => {
      clearRowDragState()
      insertExternal(trackId, source, blocks.length)
    },
    [blocks.length, clearRowDragState, insertExternal],
  )

  const dropTargets = useMemo<TrackDropTarget[]>(
    () => [
      {
        mime: TRACK_DRAG_MIME,
        onDropTrack: (trackId) => handlePanelExternalDrop(trackId, 'browse'),
      },
      {
        mime: POOL_ROW_MIME,
        onDropTrack: (trackId) => handlePanelExternalDrop(trackId, 'pool'),
        dropEffect: 'move',
      },
    ],
    [handlePanelExternalDrop],
  )
  const { dropActive, dropHandlers } = useExternalTrackDrop(dropTargets)

  return (
    <div
      className={`sq-list${dropActive ? ' set-drop-active' : ''}`}
      {...dropHandlers}
    >
      <table className="sq-list-table">
        <thead>
          <tr>
            <th className="sq-col-num">#</th>
            <th className="sq-col-title">Title</th>
            <th className="sq-col-key">Key</th>
            <th className="sq-col-bpm">BPM</th>
            <th className="sq-col-time">In</th>
            <th className="sq-col-time">Out</th>
            <th className="sq-col-length">Length</th>
            <th className="sq-col-note">Notes</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block, i) => {
            const trackId = block.entry.track_id
            const ov = overrides[trackId] ?? {}
            const played = effectivePlayedBpm(block, overrides)
            const value =
              draft[trackId] ?? (played != null ? played.toFixed(1) : '')
            const title = displayTitle(block.entry.track, trackId)
            const isDragging = dragTrackId === trackId
            // Internal: highlight every row except the source. External: any
            // hovered row (dragTrackId stays null after clearing a stale drag).
            const isDropTarget = dropIndex === i && dragTrackId !== trackId
            return (
              <tr
                key={block.entry.id}
                draggable
                className={`sq-list-row${selectedTrackId === trackId ? ' sq-list-row--sel' : ''}${isDragging ? ' set-row-dragging' : ''}${isDropTarget ? ' set-row-drop-target' : ''}`}
                onClick={() => onSelect(trackId)}
                onDragStart={(e) => {
                  if (
                    (e.target as HTMLElement).closest(
                      'input, textarea, button, a',
                    )
                  ) {
                    e.preventDefault()
                    return
                  }
                  e.dataTransfer.setData('text/plain', String(trackId))
                  e.dataTransfer.setData(TRACKLIST_ROW_MIME, String(trackId))
                  e.dataTransfer.effectAllowed = 'move'
                  setDragTrackId(trackId)
                }}
                onDragOver={(e) => {
                  if (isExternalTrackDrag(e)) {
                    if (dragTrackId !== null) {
                      clearRowDragState()
                    }
                    e.preventDefault()
                    e.dataTransfer.dropEffect = dataTransferHasType(
                      e,
                      POOL_ROW_MIME,
                    )
                      ? 'move'
                      : 'copy'
                    setDropIndex(i)
                    return
                  }
                  if (dragTrackId === null) {
                    return
                  }
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDropIndex(i)
                }}
                onDragLeave={() => {
                  setDropIndex((prev) => (prev === i ? null : prev))
                }}
                onDrop={(e) => {
                  if (isExternalTrackDrag(e)) {
                    const external = readExternalTrackId(e)
                    clearRowDragState()
                    if (!external) {
                      return
                    }
                    e.preventDefault()
                    e.stopPropagation()
                    insertExternal(external.trackId, external.source, i)
                    return
                  }
                  if (dragTrackId === null) {
                    return
                  }
                  e.preventDefault()
                  e.stopPropagation()
                  const fromIndex = blocks.findIndex(
                    (row) => row.entry.track_id === dragTrackId,
                  )
                  if (fromIndex !== -1 && fromIndex !== i) {
                    onReorder(dragTrackId, i)
                  }
                  clearRowDragState()
                }}
                onDragEnd={() => {
                  clearRowDragState()
                }}
              >
                <td className="sq-col-num">{i + 1}</td>
                <td className="sq-col-title">
                  <span
                    className="key-dot"
                    aria-hidden="true"
                    style={{
                      background:
                        keyDotColor(block.entry.track?.camelot_code) ??
                        'transparent',
                    }}
                  />
                  {title}
                  {block.pinned && <span className="sq-flag">pinned</span>}
                  {ov.durOv != null && <span className="sq-flag">manual</span>}
                </td>
                <td className="sq-col-key mono">
                  {block.entry.track?.camelot_code}
                </td>
                <td className="sq-col-bpm">
                  <input
                    className={`sq-bpm-input${ov.bpmOv != null ? ' sq-bpm-input--ov' : ''}`}
                    aria-label={`Played BPM for ${title}`}
                    value={value}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [trackId]: e.target.value }))
                    }
                    onBlur={(e) => {
                      const parsed = Number.parseFloat(e.target.value)
                      onBpmChange(
                        trackId,
                        Number.isFinite(parsed) &&
                          parsed >= BPM_OVERRIDE_MIN &&
                          parsed <= BPM_OVERRIDE_MAX
                          ? parsed
                          : null,
                      )
                      setDraft((d) => {
                        const next = { ...d }
                        delete next[trackId]
                        return next
                      })
                    }}
                  />
                </td>
                <td className="sq-col-time mono">{formatHM(block.t)}</td>
                <td className="sq-col-time mono">
                  {formatHM(block.t + block.dur)}
                </td>
                <td className="sq-col-length mono">
                  {formatDuration(block.dur)}
                </td>
                <td className="sq-col-note">
                  <NoteInput
                    trackId={trackId}
                    title={title}
                    initialNote={block.entry.note ?? ''}
                    onSave={onNoteChange}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {blocks.length === 0 && (
        <p className="table-status">
          Nothing committed yet — promote a benched track to start the spine.
        </p>
      )}
    </div>
  )
}
