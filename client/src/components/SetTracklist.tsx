import { useState, useCallback, useMemo, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { TracklistEntry, Track } from '../types'
import { TRACK_DRAG_MIME, TRACKLIST_ROW_MIME, POOL_ROW_MIME } from '../utils'
import { displayTitle } from '../utils/trackTitle'
import { useExternalTrackDrop } from '../hooks/useExternalTrackDrop'
import type { TrackDropTarget } from '../hooks/useExternalTrackDrop'
import {
  TABLE_REGISTRIES,
  visibleColumnIds,
  type NormalizedTableConfig,
} from '../tablePreferences'
import {
  TableColumnControls,
  TableColumnEmptyRecovery,
} from './TableColumnControls'
import { TableHeader } from './table/TableHeader'
import { PlayButton } from './PlayButton'

const TRACKLIST_COL_CLASS: Record<string, string> = {
  play: 'set-ws-col-play',
  num: 'set-ws-col-num',
  title: 'set-ws-col-title',
  key: 'set-ws-col-key',
  bpm: 'set-ws-col-bpm',
  note: 'set-ws-col-note',
  actions: 'set-ws-col-actions-tracklist',
}

const TRACKLIST_HEADER_LABEL: Record<string, string> = {
  num: '#',
  title: 'Title',
  key: 'Key',
  bpm: 'BPM',
  note: 'Note',
  actions: 'Actions',
}

interface Props {
  allTracks: Track[]
  tracklist: TracklistEntry[]
  tableConfig: NormalizedTableConfig
  onToggleColumn: (columnId: string) => void
  onReorderColumn: (draggedId: string, targetId: string) => void
  onInsertColumnAfter: (afterColumnId: string, columnId: string) => void
  onColumnWidthChange: (columnId: string, width: number) => void
  onColumnWidthFlush: (columnId: string, width: number) => void
  /** Extra controls (e.g. the set picker) rendered in the header row. */
  headerControls?: ReactNode
  /** When provided, the header menu offers switching to the Explorer view. */
  onOpenExplorer?: () => void
  onRemove: (trackId: number) => void
  onMoveToPool: (trackId: number) => void
  onReorder: (trackId: number, newPosition: number) => void
  onUpdateNote: (trackId: number, note: string) => void
  onAddTrack: (trackId: number, title?: string) => void
  onDropFromPool: (trackId: number) => void
  onExportM3u8: () => void
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
  tableConfig,
  onToggleColumn,
  onReorderColumn,
  onColumnWidthFlush,
  headerControls,
  onOpenExplorer,
  onRemove,
  onMoveToPool,
  onReorder,
  onUpdateNote,
  onAddTrack,
  onDropFromPool,
  onExportM3u8,
}: Props) {
  // Track-id based (not index): survives list refresh mid-drag and never
  // leaves a stale "dragging" class stuck on whatever sits at index 0.
  const [dragTrackId, setDragTrackId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)
  // Live width for the column being resized. Kept local so a drag re-renders
  // only this table, not the whole App (which re-rendered every quadrant on
  // each mousemove and made resizing crawl). Flushed to App on mouse-up.
  const [liveResize, setLiveResize] = useState<{
    id: string
    width: number
  } | null>(null)

  const colWidths = tableConfig.columnWidths
  const visibleIds = useMemo(() => visibleColumnIds(tableConfig), [tableConfig])
  const registryById = useMemo(
    () => new Map(TABLE_REGISTRIES.tracklist.map((entry) => [entry.id, entry])),
    [],
  )
  const tracklistIdsKey = useMemo(
    () => tracklist.map((entry) => entry.id).join(','),
    [tracklist],
  )

  const clearRowDragState = useCallback(() => {
    setDragTrackId(null)
    setDropIndex(null)
  }, [])

  const dataTransferHasType = useCallback(
    (e: React.DragEvent, mime: string) => {
      const types = e.dataTransfer?.types
      if (!types) {
        return false
      }
      return Array.from(types as ArrayLike<string>).includes(mime)
    },
    [],
  )

  // Dropping an external track onto a row must not be stolen by a stale
  // internal reorder session (e.g. dragEnd skipped after a list refresh).
  const isExternalTrackDrag = useCallback(
    (e: React.DragEvent) =>
      dataTransferHasType(e, TRACK_DRAG_MIME) ||
      dataTransferHasType(e, POOL_ROW_MIME),
    [dataTransferHasType],
  )

  // Clear ghost-drag styling if the row set changes or the browser cancels
  // the drag without delivering dragEnd to the original element.
  useEffect(() => {
    clearRowDragState()
  }, [tracklistIdsKey, clearRowDragState])

  useEffect(() => {
    const onDragEnd = () => clearRowDragState()
    window.addEventListener('dragend', onDragEnd, true)
    return () => window.removeEventListener('dragend', onDragEnd, true)
  }, [clearRowDragState])

  const beginResize = useCallback(
    (colId: string, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const th = (e.target as HTMLElement).closest('th')
      if (!th) {
        return
      }
      const startWidth = th.getBoundingClientRect().width
      const startX = e.clientX

      let latestWidth = startWidth
      function handleMove(ev: MouseEvent) {
        latestWidth = Math.max(40, Math.round(startWidth + ev.clientX - startX))
        setLiveResize({ id: colId, width: latestWidth })
      }

      function handleUp() {
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
        setLiveResize(null)
        onColumnWidthFlush(colId, latestWidth)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [onColumnWidthFlush],
  )

  const handleExternalDrop = useCallback(
    (trackId: number) => {
      const track = allTracks.find((t) => t.id === trackId)
      onAddTrack(trackId, track?.title)
    },
    [allTracks, onAddTrack],
  )
  const dropTargets = useMemo<TrackDropTarget[]>(
    () => [
      { mime: TRACK_DRAG_MIME, onDropTrack: handleExternalDrop },
      { mime: POOL_ROW_MIME, onDropTrack: onDropFromPool, dropEffect: 'move' },
    ],
    [handleExternalDrop, onDropFromPool],
  )
  const { dropActive, dropHandlers } = useExternalTrackDrop(dropTargets)

  const colStyle = (id: string) => {
    if (liveResize?.id === id) {
      return { width: liveResize.width }
    }
    return colWidths[id] != null ? { width: colWidths[id] } : undefined
  }

  const resizer = (id: string) => (
    <div
      className="col-resizer"
      onMouseDown={(e) => beginResize(id, e)}
      onClick={(e) => e.stopPropagation()}
    />
  )

  const handleColumnDragStart = useCallback(
    (e: React.DragEvent, columnId: string) => {
      setDraggedColumn(columnId)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', columnId)
    },
    [],
  )

  const handleColumnDragOver = useCallback(
    (e: React.DragEvent) => {
      if (
        dataTransferHasType(e, TRACK_DRAG_MIME) ||
        dataTransferHasType(e, TRACKLIST_ROW_MIME) ||
        dataTransferHasType(e, POOL_ROW_MIME)
      ) {
        return
      }
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    [dataTransferHasType],
  )

  const handleColumnDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      // Track drops belong to the panel container, not column reorder.
      if (
        dataTransferHasType(e, TRACK_DRAG_MIME) ||
        dataTransferHasType(e, TRACKLIST_ROW_MIME) ||
        dataTransferHasType(e, POOL_ROW_MIME)
      ) {
        return
      }
      e.preventDefault()
      const draggedId = e.dataTransfer.getData('text/plain')
      if (!draggedId || draggedId === targetId) {
        setDraggedColumn(null)
        return
      }
      onReorderColumn(draggedId, targetId)
      setDraggedColumn(null)
    },
    [dataTransferHasType, onReorderColumn],
  )

  const handleColumnDragEnd = useCallback(() => {
    setDraggedColumn(null)
  }, [])

  const renderHeaderCell = (colId: string) => {
    const label = TRACKLIST_HEADER_LABEL[colId] ?? colId
    const registry = registryById.get(colId)
    const resizable = registry?.resizable !== false
    const thClass =
      colId === 'actions' ? 'set-ws-th set-ws-th-actions' : 'set-ws-th'

    if (colId === 'play') {
      return (
        <th key={colId} className={thClass}>
          <div className="th-content th-content--play">Pre.</div>
        </th>
      )
    }

    return (
      <th
        key={colId}
        className={`${thClass}${draggedColumn === colId ? ' th-dragging' : ''}`}
        onDragOver={handleColumnDragOver}
        onDrop={(e) => handleColumnDrop(e, colId)}
      >
        <div
          className="th-content"
          draggable
          onDragStart={(e) => handleColumnDragStart(e, colId)}
          onDragEnd={handleColumnDragEnd}
        >
          <TableColumnControls
            label={registry?.label ?? label}
            onRemove={() => onToggleColumn(colId)}
          >
            {label}
          </TableColumnControls>
        </div>
        {resizable ? resizer(colId) : null}
      </th>
    )
  }

  const renderBodyCell = (
    colId: string,
    entry: TracklistEntry,
    rowIndex: number,
  ) => {
    switch (colId) {
      case 'play':
        return (
          <td key={colId} className="set-ws-cell-play">
            <PlayButton
              trackId={entry.track_id}
              title={entry.track?.title ?? ''}
            />
          </td>
        )
      case 'num':
        return (
          <td key={colId} className="mono set-ws-cell-num">
            {rowIndex + 1}
          </td>
        )
      case 'title':
        return (
          <td key={colId} className="set-ws-cell-title">
            {displayTitle(entry.track, entry.track_id)}
          </td>
        )
      case 'key':
        return (
          <td key={colId} className="mono set-ws-cell-key">
            {entry.track?.camelot_code ?? '—'}
          </td>
        )
      case 'bpm':
        return (
          <td key={colId} className="mono set-ws-cell-bpm">
            {entry.track?.bpm != null ? Math.round(entry.track.bpm) : '—'}
          </td>
        )
      case 'note':
        return (
          <td key={colId} className="set-ws-cell-note">
            <NoteInput
              key={`note-${entry.track_id}`}
              trackId={entry.track_id}
              initialNote={entry.note ?? ''}
              onSave={onUpdateNote}
            />
          </td>
        )
      case 'actions':
        return (
          <td key={colId} className="set-ws-cell-actions">
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
        )
      default:
        return null
    }
  }

  return (
    <div
      className={`set-tracklist${dropActive ? ' set-drop-active' : ''}`}
      {...dropHandlers}
    >
      <TableHeader
        title={
          <div className="ds-header-titlegroup">
            <span className="ds-header-titletext">
              Tracklist ({tracklist.length})
            </span>
            {headerControls && (
              <span className="ds-header-setcontrols">{headerControls}</span>
            )}
          </div>
        }
        primary={
          <div className="set-header-actions">
            {onOpenExplorer && (
              <button
                type="button"
                className="set-explorer-btn"
                onClick={onOpenExplorer}
              >
                Explorer
              </button>
            )}
            {tracklist.length > 0 && (
              <button
                type="button"
                className="set-export-btn"
                onClick={onExportM3u8}
              >
                Export
              </button>
            )}
          </div>
        }
      />
      {tracklist.length === 0 ? (
        <p className="set-empty-tracks">
          Tracklist is empty. Drag tracks from the Search table above.
        </p>
      ) : visibleIds.length === 0 ? (
        <TableColumnEmptyRecovery />
      ) : (
        <div className="track-table-outer">
          <div className="track-table-wrapper">
            <table className="set-tracklist-table">
              <colgroup>
                {visibleIds.map((colId) => (
                  <col
                    key={colId}
                    className={TRACKLIST_COL_CLASS[colId]}
                    style={colStyle(colId)}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>{visibleIds.map((colId) => renderHeaderCell(colId))}</tr>
              </thead>
              <tbody>
                {tracklist.map((entry, i) => (
                  <tr
                    key={entry.id}
                    draggable
                    className={
                      (dragTrackId === entry.track_id
                        ? 'set-row-dragging'
                        : '') +
                      (dropIndex === i &&
                      dragTrackId !== null &&
                      dragTrackId !== entry.track_id
                        ? ' set-row-drop-target'
                        : '')
                    }
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'text/plain',
                        String(entry.track_id),
                      )
                      e.dataTransfer.setData(
                        TRACKLIST_ROW_MIME,
                        String(entry.track_id),
                      )
                      e.dataTransfer.effectAllowed = 'move'
                      setDragTrackId(entry.track_id)
                    }}
                    onDragOver={(e) => {
                      if (isExternalTrackDrag(e)) {
                        // Stale internal drag must not block panel-level drops.
                        if (dragTrackId !== null) {
                          clearRowDragState()
                        }
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
                        clearRowDragState()
                        return
                      }
                      if (dragTrackId === null) {
                        return
                      }
                      e.preventDefault()
                      e.stopPropagation()
                      const fromIndex = tracklist.findIndex(
                        (row) => row.track_id === dragTrackId,
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
                    {visibleIds.map((colId) => renderBodyCell(colId, entry, i))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
