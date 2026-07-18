import { useState, useCallback } from 'react'
import type { TracklistEntry, SearchSuggestion, Track } from '../types'
import { cleanTitle } from '../utils/trackTitle'
import { useTrackSearch } from '../hooks/useTrackSearch'
import { useExternalTrackDrop } from '../hooks/useExternalTrackDrop'
import { useResizableColumns } from '../hooks/useResizableColumns'
import { PlayButton } from './PlayButton'

interface Props {
  allTracks: Track[]
  tracklist: TracklistEntry[]
  onRemove: (trackId: number) => void
  onMoveToPool: (trackId: number) => void
  onReorder: (trackId: number, newPosition: number) => void
  onUpdateNote: (trackId: number, note: string) => void
  onAddTrack: (trackId: number, title?: string) => void
}

function NoteInput({
  trackId,
  initialNote,
  onSave,
}: {
  trackId: number
  initialNote: string
  onSave: (trackId: number, note: string) => void
}) {
  const [value, setValue] = useState(initialNote)
  // `savedValue` is the last-persisted baseline used for the blur dirty-check.
  // It is updated on blur (to avoid duplicate saves) and cannot double as the
  // prop-change tracker: an async save updates the parent's `initialNote` only
  // after a round-trip, so a blur-driven `savedValue` change would otherwise
  // make the reset below fire and revert the input to the stale note.
  const [savedValue, setSavedValue] = useState(initialNote)
  // Dedicated tracker for the `initialNote` prop. When the parent rebinds it, we
  // reset the input during render (see react.dev "adjusting state when a prop
  // changes") without needing an effect.
  const [prevInitialNote, setPrevInitialNote] = useState(initialNote)
  if (initialNote !== prevInitialNote) {
    setPrevInitialNote(initialNote)
    setSavedValue(initialNote)
    setValue(initialNote)
  }

  const handleBlur = useCallback(() => {
    if (value !== savedValue) {
      setSavedValue(value)
      onSave(trackId, value)
    }
  }, [value, savedValue, trackId, onSave])

  return (
    <input
      className="set-tracklist-note"
      type="text"
      placeholder="Add note…"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export function SetTracklist({
  allTracks,
  tracklist,
  onRemove,
  onMoveToPool,
  onReorder,
  onUpdateNote,
  onAddTrack,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const { suggestions, search, clear } = useTrackSearch(allTracks)
  const { widths: colWidths, beginResize } = useResizableColumns(
    'xeremia-set-tracklist-col-widths',
  )

  const handleExternalDrop = useCallback(
    (trackId: number) => {
      const track = allTracks.find((t) => t.id === trackId)
      onAddTrack(trackId, track?.title)
    },
    [allTracks, onAddTrack],
  )
  const { dropActive, dropHandlers } = useExternalTrackDrop(handleExternalDrop)

  const colStyle = (id: string) =>
    colWidths[id] != null ? { width: colWidths[id] } : undefined

  const resizer = (id: string) => (
    <div
      className="col-resizer"
      onMouseDown={(e) => beginResize(id, e)}
      onClick={(e) => e.stopPropagation()}
    />
  )

  const handleSearch = useCallback(
    (q: string) => {
      setSearchQuery(q)
      if (!q.trim()) {
        clear()
        setShowSearch(false)
        return
      }
      search(q)
      setShowSearch(true)
    },
    [search, clear],
  )

  const handleSearchSelect = useCallback(
    (s: SearchSuggestion) => {
      onAddTrack(s.id, s.title)
      setSearchQuery('')
      clear()
      setShowSearch(false)
    },
    [onAddTrack, clear],
  )

  return (
    <div
      className={`set-tracklist${dropActive ? ' set-drop-active' : ''}`}
      {...dropHandlers}
    >
      <div className="set-tracklist-header">
        <h3 className="set-section-title">Tracklist ({tracklist.length})</h3>
        <div className="set-tracklist-search-wrapper">
          <input
            className="set-tracklist-search"
            placeholder="Search to add…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {showSearch && suggestions.length > 0 && (
            <ul className="set-tracklist-search-dropdown">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="set-tracklist-search-item"
                  onMouseDown={() => handleSearchSelect(s)}
                >
                  <span>{s.title}</span>
                  <span className="text-muted">
                    {s.camelot_code && (
                      <span className="mono"> {s.camelot_code}</span>
                    )}
                    {s.bpm != null && <span className="mono"> · {s.bpm}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {tracklist.length === 0 ? (
        <p className="set-empty-tracks">
          Tracklist is empty. Move tracks from the pool or search above.
        </p>
      ) : (
        <table className="set-tracklist-table">
          <colgroup>
            <col className="set-ws-col-play" />
            <col className="set-ws-col-num" style={colStyle('num')} />
            <col className="set-ws-col-title" style={colStyle('title')} />
            <col className="set-ws-col-key" style={colStyle('key')} />
            <col className="set-ws-col-bpm" style={colStyle('bpm')} />
            <col className="set-ws-col-note" style={colStyle('note')} />
            <col className="set-ws-col-actions-tracklist" />
          </colgroup>
          <thead>
            <tr>
              <th className="set-ws-th"></th>
              <th className="set-ws-th">#{resizer('num')}</th>
              <th className="set-ws-th">Title{resizer('title')}</th>
              <th className="set-ws-th">Key{resizer('key')}</th>
              <th className="set-ws-th">BPM{resizer('bpm')}</th>
              <th className="set-ws-th">Note{resizer('note')}</th>
              <th className="set-ws-th set-ws-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tracklist.map((entry, i) => (
              <tr
                key={entry.id}
                draggable
                className={
                  (dragIndex === i ? 'set-row-dragging' : '') +
                  (dropIndex === i && dragIndex !== null && dragIndex !== i
                    ? ' set-row-drop-target'
                    : '')
                }
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(entry.track_id))
                  e.dataTransfer.effectAllowed = 'move'
                  setDragIndex(i)
                }}
                onDragOver={(e) => {
                  if (dragIndex === null) {
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
                  if (dragIndex === null) {
                    return
                  }
                  e.preventDefault()
                  if (dragIndex !== i) {
                    onReorder(tracklist[dragIndex].track_id, i)
                  }
                  setDragIndex(null)
                  setDropIndex(null)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setDropIndex(null)
                }}
              >
                <td className="set-ws-cell-play">
                  <PlayButton
                    trackId={entry.track_id}
                    title={entry.track?.title ?? ''}
                  />
                </td>
                <td className="mono set-ws-cell-num">{i + 1}</td>
                <td className="set-ws-cell-title">
                  {cleanTitle(entry.track, entry.track_id)}
                </td>
                <td className="mono set-ws-cell-key">
                  {entry.track?.camelot_code ?? '—'}
                </td>
                <td className="mono set-ws-cell-bpm">
                  {entry.track?.bpm != null ? Math.round(entry.track.bpm) : '—'}
                </td>
                <td className="set-ws-cell-note">
                  <NoteInput
                    key={`note-${entry.track_id}`}
                    trackId={entry.track_id}
                    initialNote={entry.note ?? ''}
                    onSave={onUpdateNote}
                  />
                </td>
                <td className="set-ws-cell-actions">
                  <div className="set-ws-actions-group">
                    <button
                      className="set-action-btn"
                      onClick={() => onMoveToPool(entry.track_id)}
                      title="Move to pool"
                    >
                      To Pool
                    </button>
                    <button
                      className="set-action-btn set-action-btn--danger"
                      onClick={() => onRemove(entry.track_id)}
                      title="Delete from tracklist"
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
