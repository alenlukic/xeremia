import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { TracklistEntry, Track } from '../types'
import {
  dropTracksInOrder,
  TRACK_DRAG_MIME,
  TRACKLIST_ROW_MIME,
  POOL_ROW_MIME,
  writeTrackDrag,
} from '../utils'
import { useMultiSelect } from '../hooks/useMultiSelect'
import { useBulkAction } from '../hooks/useBulkAction'
import { useSelectAllShortcut } from '../hooks/useSelectAllShortcut'
import {
  SelectionAction,
  SelectionBar,
  SelectionToggle,
} from './SelectionControls'
import { displayTitle } from '../utils/trackTitle'
import { useExternalTrackDrop } from '../hooks/useExternalTrackDrop'
import type { TrackDropTarget } from '../hooks/useExternalTrackDrop'
import { useDragAutoScroll } from '../hooks/useDragAutoScroll'
import { useColumnResize } from '../hooks/useColumnResize'
import { TrackSearchModal } from './TrackSearchModal'
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
}

const TRACKLIST_HEADER_LABEL: Record<string, string> = {
  num: '#',
  title: 'Title',
  key: 'Key',
  bpm: 'BPM',
  note: 'Note',
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
  onReorder: (trackId: number, newPosition: number) => void
  onUpdateNote: (trackId: number, note: string) => void
  // A multi-track drop applies these one at a time, so the promise has to
  // survive the prop signature for the next track to wait on it — appending
  // concurrently would land them in arbitrary order.
  onAddTrack: (trackId: number, title?: string) => void | Promise<unknown>
  /** Add `trackId` and place it at `position` (0-based) in one step. */
  onInsertTrack: (trackId: number, position: number) => void
  onDropFromPool: (trackId: number) => void | Promise<unknown>
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
  onReorder,
  onUpdateNote,
  onAddTrack,
  onInsertTrack,
  onDropFromPool,
  onExportM3u8,
}: Props) {
  // Track-id based (not index): survives list refresh mid-drag and never
  // leaves a stale "dragging" class stuck on whatever sits at index 0.
  const [dragTrackId, setDragTrackId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)
  // Track the "+" was clicked on; the picked track lands right after it. Held
  // by id, not index, so a list refresh while the modal is open can't reanchor
  // the insert onto whatever row slid into that slot.
  const [insertAfterTrackId, setInsertAfterTrackId] = useState<number | null>(
    null,
  )
  const { widths: colWidths, beginResize } = useColumnResize(
    tableConfig.columnWidths,
    onColumnWidthFlush,
  )
  const listRef = useRef<HTMLDivElement | null>(null)
  const selection = useMultiSelect(
    useMemo(() => tracklist.map((entry) => entry.track_id), [tracklist]),
  )
  useSelectAllShortcut(listRef, selection.selectAll)
  const bulk = useBulkAction()
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

  const handleExternalDrop = useCallback(
    (trackId: number) => {
      const track = allTracks.find((t) => t.id === trackId)
      return onAddTrack(trackId, track?.title)
    },
    [allTracks, onAddTrack],
  )
  const dropTargets = useMemo<TrackDropTarget[]>(
    () => [
      {
        mime: TRACK_DRAG_MIME,
        onDropTrack: handleExternalDrop,
        onDropTracks: (trackIds) =>
          void dropTracksInOrder(trackIds, handleExternalDrop),
      },
      {
        mime: POOL_ROW_MIME,
        onDropTrack: onDropFromPool,
        onDropTracks: (trackIds) =>
          void dropTracksInOrder(trackIds, onDropFromPool),
        dropEffect: 'move',
      },
    ],
    [handleExternalDrop, onDropFromPool],
  )
  const { dropActive, dropHandlers } = useExternalTrackDrop(dropTargets)
  const {
    scrollRef: tableScrollRef,
    onDragOver: autoScrollOnDragOver,
    onDragLeave: autoScrollOnDragLeave,
  } = useDragAutoScroll<HTMLDivElement>()

  const insertAfterEntry = useMemo(
    () =>
      insertAfterTrackId === null
        ? null
        : (tracklist.find((e) => e.track_id === insertAfterTrackId) ?? null),
    [insertAfterTrackId, tracklist],
  )

  const handleInsertSelect = useCallback(
    (trackId: number) => {
      const anchorIndex = tracklist.findIndex(
        (e) => e.track_id === insertAfterTrackId,
      )
      if (anchorIndex !== -1) {
        onInsertTrack(trackId, anchorIndex + 1)
      }
      setInsertAfterTrackId(null)
    },
    [insertAfterTrackId, tracklist, onInsertTrack],
  )

  // `colWidths` already carries the in-flight drag, so there is no separate
  // live-resize branch to keep in step.
  const colStyle = (id: string) =>
    colWidths[id] != null ? { width: colWidths[id] } : undefined

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

    if (colId === 'play') {
      return (
        <th key={colId} className="set-ws-th">
          <div className="th-content th-content--play">Pre.</div>
        </th>
      )
    }

    return (
      <th
        key={colId}
        aria-label={registry?.label ?? label}
        className={`set-ws-th${draggedColumn === colId ? ' th-dragging' : ''}`}
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
      default:
        return null
    }
  }

  return (
    <div
      ref={listRef}
      tabIndex={-1}
      // Claiming focus on click is what scopes Cmd/Ctrl+A to this list rather
      // than whichever other track list happens to be on screen.
      onMouseDown={() => listRef.current?.focus({ preventScroll: true })}
      className={`set-tracklist${dropActive ? ' set-drop-active' : ''}`}
      {...dropHandlers}
    >
      <TableHeader
        title={
          <div className="ds-header-titlegroup">
            <SelectionToggle selection={selection} label="tracklist" />
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
      <SelectionBar selection={selection} progress={bulk.progress}>
        <SelectionAction
          label="Remove from tracklist"
          danger
          disabled={bulk.running}
          onClick={() =>
            void bulk.run('Removing', selection.orderedIds, onRemove, selection.clear)
          }
        />
      </SelectionBar>
      {tracklist.length === 0 ? (
        <p className="set-empty-tracks">
          Tracklist is empty. Drag tracks from the Search table above.
        </p>
      ) : visibleIds.length === 0 ? (
        <TableColumnEmptyRecovery />
      ) : (
        <div className="track-table-outer">
          <div
            className="track-table-wrapper"
            ref={tableScrollRef}
            onDragOver={autoScrollOnDragOver}
            onDragLeave={autoScrollOnDragLeave}
          >
            <table className="set-tracklist-table">
              <colgroup>
                <col className="set-ws-col-remove set-ws-col-rowactions" />
                {visibleIds.map((colId) => (
                  <col
                    key={colId}
                    className={TRACKLIST_COL_CLASS[colId]}
                    style={colStyle(colId)}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th
                    className="set-ws-th set-ws-th-remove set-ws-th-rowactions"
                    aria-label="Row actions"
                  />
                  {visibleIds.map((colId) => renderHeaderCell(colId))}
                </tr>
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
                        : '') +
                      (selection.isSelected(entry.track_id)
                        ? ' is-multi-selected'
                        : '')
                    }
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('button, input')) {
                        return
                      }
                      selection.select(entry.track_id, event)
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'text/plain',
                        String(entry.track_id),
                      )
                      // A row inside the selection drags the whole selection.
                      const ids = selection.isSelected(entry.track_id)
                        ? selection.orderedIds
                        : [entry.track_id]
                      writeTrackDrag(
                        e.dataTransfer,
                        entry.track_id,
                        ids,
                        TRACKLIST_ROW_MIME,
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
                    <td className="set-ws-cell-remove set-ws-cell-rowactions">
                      <button
                        type="button"
                        className="set-row-remove-btn"
                        aria-label="Remove from tracklist"
                        title="Remove from tracklist"
                        onClick={() => onRemove(entry.track_id)}
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        className="set-row-remove-btn set-row-insert-btn"
                        aria-label={`Insert track after ${displayTitle(entry.track, entry.track_id)}`}
                        title="Insert track after this row"
                        onClick={() => setInsertAfterTrackId(entry.track_id)}
                      >
                        +
                      </button>
                    </td>
                    {visibleIds.map((colId) => renderBodyCell(colId, entry, i))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {insertAfterEntry && (
        <TrackSearchModal
          allTracks={allTracks}
          title="Insert Track"
          subtitle={
            <>
              Inserting after{' '}
              <strong>
                {displayTitle(
                  insertAfterEntry.track,
                  insertAfterEntry.track_id,
                )}
              </strong>
            </>
          }
          onSelect={(suggestion) => handleInsertSelect(suggestion.id)}
          onClose={() => setInsertAfterTrackId(null)}
        />
      )}
    </div>
  )
}
