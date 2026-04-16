import { useState, useCallback, useRef, useEffect, useMemo, useContext } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { TracklistEntry, SearchSuggestion, EmptyRow, TracklistDisplayRow } from '../types';
import { isEmptyRow } from '../types';
import { cleanTitle } from '../utils/trackTitle';
import { searchTracks } from '../api/http';
import type { DragPayload } from '../dnd';
import { DragFillContext } from '../dnd';
import { PlayButton } from './PlayButton';
import { SortTierBar } from './SortTierBar';
import type { SortDescriptor, SortColumn } from './SortTierBar';

let emptyRowCounter = 0;
function makeEmptyRowId(): string {
  return `empty-tl-${++emptyRowCounter}-${Date.now()}`;
}

const TRACKLIST_SORT_COLUMNS: SortColumn[] = [
  { id: 'position', label: '#' },
  { id: 'title', label: 'Title' },
  { id: 'camelot_code', label: 'Key' },
  { id: 'bpm', label: 'BPM' },
];

function compareTracklistByColumn(a: TracklistEntry, b: TracklistEntry, col: string): number {
  if (col === 'title') return (a.track?.title ?? '').localeCompare(b.track?.title ?? '');
  if (col === 'bpm') return (a.track?.bpm ?? 0) - (b.track?.bpm ?? 0);
  if (col === 'camelot_code') return (a.track?.camelot_code ?? '').localeCompare(b.track?.camelot_code ?? '');
  return a.position - b.position;
}

interface Props {
  tracklist: TracklistEntry[];
  onRemove: (trackId: number) => void;
  onMoveToPool: (trackId: number) => void;
  onReorder: (trackId: number, newPosition: number) => void;
  onUpdateNote: (trackId: number, note: string) => void;
  onToggleStar: (trackId: number, starred: boolean) => void;
  onAddTrack: (trackId: number, title?: string) => void;
  onClearAll?: () => void;
  dndDisabled?: boolean;
  dndIdPrefix?: string;
  onFillEmptyRow?: (emptyId: string, trackId: number, title?: string) => void;
}

function InsertEmptyRowsControl({ onInsert, totalRows }: { onInsert: (count: number, position: number) => void; totalRows: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [positionInput, setPositionInput] = useState('');

  const handleInsert = useCallback((position: 'start' | 'end' | 'at') => {
    if (count < 1) return;
    let pos: number;
    if (position === 'start') {
      pos = 0;
    } else if (position === 'end') {
      pos = -1;
    } else {
      const parsed = parseInt(positionInput, 10);
      if (isNaN(parsed) || parsed < 1) return;
      pos = Math.min(parsed - 1, totalRows);
    }
    onInsert(count, pos);
    setOpen(false);
    setCount(1);
    setPositionInput('');
  }, [count, positionInput, totalRows, onInsert]);

  if (!open) {
    return (
      <button
        className="set-action-btn insert-empty-btn"
        onClick={() => setOpen(true)}
        title="Insert empty placeholder rows"
        aria-label="Insert empty rows"
      >
        + Empty Rows
      </button>
    );
  }

  return (
    <span className="insert-empty-inline">
      <input
        className="insert-empty-count"
        type="number"
        min={1}
        max={50}
        value={count}
        onChange={e => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setCount(1); setPositionInput(''); }
        }}
        aria-label="Number of empty rows"
        autoFocus
      />
      <button className="set-action-btn" onClick={() => handleInsert('start')} title="Insert at start">At Start</button>
      <button className="set-action-btn" onClick={() => handleInsert('end')} title="Insert at end">At End</button>
      <input
        className="insert-empty-position"
        type="number"
        min={1}
        max={totalRows + 1}
        placeholder="Row #"
        value={positionInput}
        onChange={e => setPositionInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleInsert('at');
          if (e.key === 'Escape') { setOpen(false); setCount(1); setPositionInput(''); }
        }}
        aria-label="Insert position"
      />
      <button className="set-action-btn" onClick={() => handleInsert('at')} title="Insert at position" disabled={!positionInput || parseInt(positionInput, 10) < 1}>At Position</button>
      <button className="set-action-btn" onClick={() => { setOpen(false); setCount(1); setPositionInput(''); }}>Cancel</button>
    </span>
  );
}

function DraggableEmptyRow({ emptyRow, index, total, onDelete, onReorder, onFillSearch, dndDisabled, reorderDisabled, dndIdPrefix, realPosition }: {
  emptyRow: EmptyRow;
  index: number;
  total: number;
  onDelete: (emptyId: string) => void;
  onReorder: (emptyId: string, direction: 'up' | 'down') => void;
  onFillSearch: (emptyId: string) => void;
  dndDisabled?: boolean;
  reorderDisabled?: boolean;
  dndIdPrefix?: string;
  realPosition: number;
}) {
  const prefix = dndIdPrefix ?? '';
  const effectiveDndDisabled = dndDisabled || reorderDisabled;
  const payload: DragPayload = { trackId: -1, title: '', source: 'tracklist' };
  const { listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `${prefix}tracklist-empty-${emptyRow.emptyId}`,
    data: { ...payload, __emptyId: emptyRow.emptyId },
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
    disabled: effectiveDndDisabled,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${prefix}drop-tracklist-empty-${emptyRow.emptyId}`,
    data: { index, __emptyId: emptyRow.emptyId, realPosition },
    disabled: effectiveDndDisabled,
  });

  const mergedRef = useCallback((node: HTMLTableRowElement | null) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  const rowListeners = useMemo(() => {
    if (!listeners) return {};
    const { onPointerDown, ...rest } = listeners as Record<string, unknown>;
    return {
      ...rest,
      onPointerDown: (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
        if (e.metaKey || e.ctrlKey) return;
        e.stopPropagation();
        (onPointerDown as (e: React.PointerEvent) => void)?.(e);
      },
    };
  }, [listeners]);

  const className = [
    'empty-row',
    isDragging && 'row-dragging',
    isOver && !isDragging && 'row-drop-target',
  ].filter(Boolean).join(' ');

  const rowCursor = effectiveDndDisabled ? 'default' : isDragging ? 'grabbing' : 'grab';

  return (
    <tr
      ref={mergedRef}
      style={{ cursor: rowCursor }}
      className={className}
      data-empty-id={emptyRow.emptyId}
      {...rowListeners}
    >
      <td className="set-ws-cell-star" />
      <td className="play-cell" />
      <td className="mono set-ws-cell-num">{index + 1}</td>
      <td className="set-ws-cell-title empty-row-placeholder" colSpan={1}>
        <span className="empty-row-label">Empty slot</span>
      </td>
      <td className="mono set-ws-cell-key">—</td>
      <td className="mono set-ws-cell-bpm">—</td>
      <td className="set-ws-cell-note" />
      <td className="set-ws-cell-actions">
        <div className="set-ws-actions-group">
          <button className="set-move-btn" disabled={reorderDisabled || index === 0} onClick={() => onReorder(emptyRow.emptyId, 'up')} title="Move up">↑</button>
          <button className="set-move-btn" disabled={reorderDisabled || index === total - 1} onClick={() => onReorder(emptyRow.emptyId, 'down')} title="Move down">↓</button>
          <button className="set-action-btn" onClick={() => onFillSearch(emptyRow.emptyId)} title="Fill with track">Fill</button>
          <button className="set-action-btn set-action-btn--danger" onClick={() => onDelete(emptyRow.emptyId)} title="Delete empty row">×</button>
        </div>
      </td>
    </tr>
  );
}

function NoteInput({ trackId, initialNote, onSave }: {
  trackId: number;
  initialNote: string;
  onSave: (trackId: number, note: string) => void;
}) {
  const [value, setValue] = useState(initialNote);
  const savedRef = useRef(initialNote);

  useEffect(() => {
    setValue(initialNote);
    savedRef.current = initialNote;
  }, [initialNote]);

  const handleBlur = useCallback(() => {
    const trimmed = value;
    if (trimmed !== savedRef.current) {
      savedRef.current = trimmed;
      onSave(trackId, trimmed);
    }
  }, [value, trackId, onSave]);

  return (
    <input
      className="set-tracklist-note"
      type="text"
      placeholder="Add note…"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function ConfirmDeleteModal({ count, onConfirm, onCancel }: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="tracklist-confirm-overlay" onClick={onCancel}>
      <div className="tracklist-confirm-modal" onClick={e => e.stopPropagation()}>
        <p>Delete {count} selected track{count === 1 ? '' : 's'} from the tracklist?</p>
        <div className="tracklist-confirm-actions">
          <button className="set-action-btn" onClick={onCancel}>Cancel</button>
          <button className="set-action-btn set-action-btn--danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function DraggableTracklistRow({ entry, index, total, onRemove, onMoveToPool, onReorder, onUpdateNote, onToggleStar, dndDisabled, reorderDisabled, isSelected, onToggleSelect, selectedIds, dndIdPrefix }: {
  entry: TracklistEntry;
  index: number;
  total: number;
  onRemove: (trackId: number) => void;
  onMoveToPool: (trackId: number) => void;
  onReorder: (trackId: number, newPosition: number) => void;
  onUpdateNote: (trackId: number, note: string) => void;
  onToggleStar: (trackId: number, starred: boolean) => void;
  dndDisabled?: boolean;
  reorderDisabled?: boolean;
  isSelected: boolean;
  onToggleSelect: (trackId: number) => void;
  selectedIds: Set<number>;
  dndIdPrefix?: string;
}) {
  const prefix = dndIdPrefix ?? '';
  const effectiveDndDisabled = dndDisabled || reorderDisabled;
  const title = cleanTitle(entry.track, entry.track_id);
  const multiIds = isSelected && selectedIds.size > 1 ? Array.from(selectedIds) : undefined;
  const payload: DragPayload = { trackId: entry.track_id, title, source: 'tracklist', selectedTrackIds: multiIds };
  const { listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `${prefix}tracklist-track-${entry.track_id}`,
    data: payload,
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
    disabled: effectiveDndDisabled,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${prefix}drop-tracklist-row-${index}`,
    data: { index, trackId: entry.track_id },
    disabled: effectiveDndDisabled,
  });

  const mergedRef = useCallback((node: HTMLTableRowElement | null) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  const rowListeners = useMemo(() => {
    if (!listeners) return {};
    const { onPointerDown, ...rest } = listeners as Record<string, unknown>;
    return {
      ...rest,
      onPointerDown: (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
        if (e.metaKey || e.ctrlKey) return;
        e.stopPropagation();
        (onPointerDown as (e: React.PointerEvent) => void)?.(e);
      },
    };
  }, [listeners]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onToggleSelect(entry.track_id);
    }
  }, [entry.track_id, onToggleSelect]);

  const className = [
    isDragging && 'row-dragging',
    isOver && !isDragging && 'row-drop-target',
    isSelected && 'row-multiselected',
  ].filter(Boolean).join(' ') || undefined;

  const rowCursor = effectiveDndDisabled ? 'default' : isDragging ? 'grabbing' : 'grab';

  return (
    <tr
      ref={mergedRef}
      style={{ cursor: rowCursor }}
      className={className}
      onClick={handleClick}
      {...rowListeners}
    >
      <td className="set-ws-cell-star">
        <button
          className={`star-toggle${entry.starred ? ' starred' : ''}`}
          onClick={() => onToggleStar(entry.track_id, !entry.starred)}
          title={entry.starred ? 'Unstar' : 'Star'}
          aria-label={entry.starred ? 'Unstar track' : 'Star track'}
        >
          {entry.starred ? '★' : '☆'}
        </button>
      </td>
      <td className="play-cell">
        <PlayButton trackId={entry.track_id} title={title} />
      </td>
      <td className="mono set-ws-cell-num">{index + 1}</td>
      <td className="set-ws-cell-title">{title}</td>
      <td className="mono set-ws-cell-key">{entry.track?.camelot_code ?? '—'}</td>
      <td className="mono set-ws-cell-bpm">{entry.track?.bpm != null ? Math.round(entry.track.bpm) : '—'}</td>
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
          <button className="set-move-btn" disabled={reorderDisabled || index === 0} onClick={() => onReorder(entry.track_id, index - 1)} title="Move up">↑</button>
          <button className="set-move-btn" disabled={reorderDisabled || index === total - 1} onClick={() => onReorder(entry.track_id, index + 1)} title="Move down">↓</button>
          <button className="set-action-btn" onClick={() => onMoveToPool(entry.track_id)} title="Move to pool">To Pool</button>
          <button className="set-action-btn set-action-btn--danger" onClick={() => onRemove(entry.track_id)} title="Delete from tracklist">×</button>
        </div>
      </td>
    </tr>
  );
}

export function SetTracklist({ tracklist, onRemove, onMoveToPool, onReorder, onUpdateNote, onToggleStar, onAddTrack, onClearAll, dndDisabled, dndIdPrefix, onFillEmptyRow }: Props) {
  const prefix = dndIdPrefix ?? '';
  const { setNodeRef: setTracklistDropRef, isOver: isTracklistOver } = useDroppable({ id: `${prefix}drop-tracklist`, disabled: dndDisabled });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [sorting, setSorting] = useState<SortDescriptor[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [emptyRows, setEmptyRows] = useState<{ id: string; position: number }[]>([]);
  const [fillTargetId, setFillTargetId] = useState<string | null>(null);

  const tracklistIdsRef = useRef<string>('');
  useEffect(() => {
    const key = tracklist.map(e => e.track_id).join(',');
    if (key !== tracklistIdsRef.current) {
      tracklistIdsRef.current = key;
      setSelectedIds(prev => {
        const validIds = new Set(tracklist.map(e => e.track_id));
        const pruned = new Set([...prev].filter(id => validIds.has(id)));
        return pruned.size === prev.size ? prev : pruned;
      });
    }
  }, [tracklist]);

  const sortedTracklist = useMemo(() => {
    if (sorting.length === 0) return tracklist;
    return [...tracklist].sort((a, b) => {
      for (const s of sorting) {
        const cmp = compareTracklistByColumn(a, b, s.id);
        if (cmp !== 0) return s.desc ? -cmp : cmp;
      }
      return 0;
    });
  }, [tracklist, sorting]);

  const displayRows = useMemo((): TracklistDisplayRow[] => {
    if (emptyRows.length === 0) return sortedTracklist;
    const result: TracklistDisplayRow[] = [...sortedTracklist];
    const sorted = [...emptyRows].sort((a, b) => a.position - b.position);
    for (let i = 0; i < sorted.length; i++) {
      const pos = Math.min(sorted[i].position + i, result.length);
      result.splice(pos, 0, { __empty: true, emptyId: sorted[i].id } as EmptyRow);
    }
    return result;
  }, [sortedTracklist, emptyRows]);

  const handleInsertEmptyRows = useCallback((count: number, position: number) => {
    setEmptyRows(prev => {
      const basePos = position === -1 ? sortedTracklist.length + prev.length : position;
      const newRows = Array.from({ length: count }, () => ({
        id: makeEmptyRowId(),
        position: basePos,
      }));
      return [...prev, ...newRows];
    });
  }, [sortedTracklist.length]);

  const handleDeleteEmptyRow = useCallback((emptyId: string) => {
    setEmptyRows(prev => prev.filter(r => r.id !== emptyId));
  }, []);

  const handleReorderEmptyRow = useCallback((emptyId: string, direction: 'up' | 'down') => {
    setEmptyRows(prev => {
      const idx = displayRows.findIndex(r => isEmptyRow(r) && r.emptyId === emptyId);
      if (idx < 0) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= displayRows.length) return prev;
      const row = prev.find(r => r.id === emptyId);
      if (!row) return prev;
      const delta = direction === 'up' ? -1 : 1;
      return prev.map(r => r.id === emptyId ? { ...r, position: Math.max(0, r.position + delta) } : r);
    });
  }, [displayRows]);

  const dragFillNotification = useContext(DragFillContext);
  useEffect(() => {
    if (!dragFillNotification) return;
    setEmptyRows(prev => {
      const filtered = prev.filter(r => r.id !== dragFillNotification.emptyId);
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [dragFillNotification]);

  const handleFillSearch = useCallback((emptyId: string) => {
    setFillTargetId(emptyId);
    setShowSearch(true);
  }, []);

  const handleToggleSelect = useCallback((trackId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  }, []);

  const handleRowDelete = useCallback((trackId: number) => {
    if (selectedIds.has(trackId) && selectedIds.size > 1) {
      setConfirmDelete(true);
    } else {
      onRemove(trackId);
      setSelectedIds(prev => {
        if (!prev.has(trackId)) return prev;
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });
    }
  }, [selectedIds, onRemove]);

  const handleConfirmDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    ids.forEach(id => onRemove(id));
    setSelectedIds(new Set());
    setConfirmDelete(false);
  }, [selectedIds, onRemove]);

  const handleCancelDelete = useCallback(() => {
    setConfirmDelete(false);
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setShowSearch(false);
      setFillTargetId(null);
      return;
    }
    try {
      const results = await searchTracks(q);
      setSearchResults(results);
      setShowSearch(results.length > 0);
    } catch { /* ignore */ }
  }, []);

  const handleSearchSelect = useCallback((s: SearchSuggestion) => {
    if (fillTargetId) {
      const emptyRow = emptyRows.find(r => r.id === fillTargetId);
      const targetPosition = emptyRow?.position ?? sortedTracklist.length;
      if (onFillEmptyRow) {
        onFillEmptyRow(fillTargetId, s.id, s.title);
      } else {
        onAddTrack(s.id, s.title);
      }
      onReorder(s.id, targetPosition);
      setEmptyRows(prev => prev.filter(r => r.id !== fillTargetId));
      setFillTargetId(null);
    } else {
      onAddTrack(s.id, s.title);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  }, [onAddTrack, onFillEmptyRow, fillTargetId, emptyRows, sortedTracklist.length, onReorder]);

  const totalDisplayRows = displayRows.length;

  return (
    <div ref={setTracklistDropRef} className={`set-tracklist${isTracklistOver ? ' drop-zone--active' : ''}`}>
      <div className="set-tracklist-header">
        <h3 className="set-section-title">Tracklist ({tracklist.length})</h3>
        {selectedIds.size > 0 && (
          <span className="tracklist-selection-count">{selectedIds.size} selected</span>
        )}
        {selectedIds.size > 1 && (
          <button
            className="set-action-btn set-action-btn--danger"
            onClick={() => setConfirmDelete(true)}
          >
            Delete Selected
          </button>
        )}
        <InsertEmptyRowsControl onInsert={handleInsertEmptyRows} totalRows={totalDisplayRows} />
        {tracklist.length > 0 && onClearAll && (
          <button
            className="set-action-btn set-action-btn--danger set-clear-all-btn"
            onClick={() => {
              if (window.confirm(`Clear all ${tracklist.length} track${tracklist.length === 1 ? '' : 's'} from Tracklist?`)) {
                onClearAll();
              }
            }}
          >
            Clear All
          </button>
        )}
        <div className="set-tracklist-search-wrapper">
          <input
            className="set-tracklist-search"
            placeholder={fillTargetId ? 'Search to fill empty row…' : 'Search to add…'}
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
          />
          {fillTargetId && (
            <button className="set-action-btn fill-cancel-btn" onClick={() => { setFillTargetId(null); setSearchQuery(''); setSearchResults([]); setShowSearch(false); }}>
              Cancel Fill
            </button>
          )}
          {showSearch && (
            <ul className="set-tracklist-search-dropdown">
              {searchResults.map(s => (
                <li
                  key={s.id}
                  className="set-tracklist-search-item"
                  onMouseDown={() => handleSearchSelect(s)}
                >
                  <span>{s.title}</span>
                  <span className="text-muted">
                    {s.camelot_code && <span className="mono"> {s.camelot_code}</span>}
                    {s.bpm != null && <span className="mono"> · {s.bpm}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <SortTierBar
        sorting={sorting}
        columns={TRACKLIST_SORT_COLUMNS}
        onSortingChange={setSorting}
      />
      <div className="set-table-scroll-shell">
        {totalDisplayRows === 0 ? (
          <p className="set-empty-tracks">Tracklist is empty. Move tracks from the pool or search above.</p>
        ) : (
          <table className="set-tracklist-table">
            <colgroup>
              <col className="set-ws-col-star" />
              <col className="set-ws-col-play" />
              <col className="set-ws-col-num" />
              <col className="set-ws-col-title" />
              <col className="set-ws-col-key" />
              <col className="set-ws-col-bpm" />
              <col className="set-ws-col-note" />
              <col className="set-ws-col-actions-tracklist" />
            </colgroup>
            <thead>
              <tr>
                <th className="set-ws-th set-ws-th-star" aria-label="Starred" />
                <th className="set-ws-th" style={{ width: 32 }} />
                <th className="set-ws-th">#</th>
                <th className="set-ws-th">Title</th>
                <th className="set-ws-th">Key</th>
                <th className="set-ws-th">BPM</th>
                <th className="set-ws-th">Note</th>
                <th className="set-ws-th set-ws-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) =>
                isEmptyRow(row) ? (
                  <DraggableEmptyRow
                    key={row.emptyId}
                    emptyRow={row}
                    index={i}
                    total={totalDisplayRows}
                    onDelete={handleDeleteEmptyRow}
                    onReorder={handleReorderEmptyRow}
                    onFillSearch={handleFillSearch}
                    dndDisabled={dndDisabled}
                    reorderDisabled={sorting.length > 0}
                    dndIdPrefix={dndIdPrefix}
                    realPosition={emptyRows.find(r => r.id === row.emptyId)?.position ?? i}
                  />
                ) : (
                  <DraggableTracklistRow
                    key={row.id}
                    entry={row}
                    index={i}
                    total={totalDisplayRows}
                    onRemove={handleRowDelete}
                    onMoveToPool={onMoveToPool}
                    onReorder={onReorder}
                    onUpdateNote={onUpdateNote}
                    onToggleStar={onToggleStar}
                    dndDisabled={dndDisabled}
                    reorderDisabled={sorting.length > 0}
                    isSelected={selectedIds.has(row.track_id)}
                    onToggleSelect={handleToggleSelect}
                    selectedIds={selectedIds}
                    dndIdPrefix={dndIdPrefix}
                  />
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          count={selectedIds.size}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
  );
}

export { isEmptyRow } from '../types';
export type { EmptyRow } from '../types';
