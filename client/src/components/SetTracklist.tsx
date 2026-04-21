import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { TracklistEntry, SearchSuggestion, EmptyRow, TracklistDisplayRow, PersistedEmptyRow } from '../types';
import { isEmptyRow } from '../types';
import { cleanTitle } from '../utils/trackTitle';
import { searchTracks } from '../api/http';
import type { DragPayload } from '../dnd';
import { PlayButton } from './PlayButton';
import { SortTierBar } from './SortTierBar';
import type { SortDescriptor, SortColumn } from './SortTierBar';

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
  emptyRows: PersistedEmptyRow[];
  onRemove: (trackId: number) => void;
  onMoveToPool: (trackId: number) => void;
  onReorder: (trackId: number, newPosition: number) => void;
  onUpdateNote: (trackId: number, note: string) => void;
  onAddTrack: (trackId: number, title?: string) => void;
  onClearAll?: () => void;
  onInsertEmptyRows: (count: number, position: number) => void;
  onDeleteEmptyRow: (emptyRowId: number) => void;
  onReorderEmptyRow: (emptyRowId: number, newPosition: number) => void;
  dndDisabled?: boolean;
  dndIdPrefix?: string;
  onFillEmptyRow?: (emptyId: string, trackId: number, title?: string, position?: number) => void;
}

function InsertEmptyRowsControl({ onInsert, totalRows }: { onInsert: (count: number, position: number) => void; totalRows: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [insertIndex, setInsertIndex] = useState('');

  const handleInsert = useCallback((position: 'start' | 'end' | number) => {
    if (count < 1) return;
    const pos = position === 'start' ? 0 : position === 'end' ? -1 : position;
    onInsert(count, pos);
    setOpen(false);
    setCount(1);
    setInsertIndex('');
  }, [count, onInsert]);

  if (!open) {
    return (
      <button
        className="set-action-btn empty-row-insert-btn"
        onClick={() => setOpen(true)}
        title="Insert empty placeholder rows"
        aria-label="Insert empty rows"
      >
        + Slots
      </button>
    );
  }

  const parsedIndex = parseInt(insertIndex, 10);
  const indexValid = !isNaN(parsedIndex) && parsedIndex >= 1 && parsedIndex <= totalRows + 1;

  return (
    <span className="empty-row-insert-control">
      <input
        className="empty-row-insert-count"
        type="number"
        min={1}
        max={50}
        value={count}
        onChange={e => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setCount(1); setInsertIndex(''); }
          if (e.key === 'Enter') handleInsert('end');
        }}
        aria-label="Number of empty rows"
        autoFocus
      />
      <button className="set-action-btn empty-row-insert-action" onClick={() => handleInsert('start')} title="Insert at start">Top</button>
      <button className="set-action-btn empty-row-insert-action" onClick={() => handleInsert('end')} title="Insert at end">Bottom</button>
      <input
        className="empty-row-insert-index"
        type="number"
        min={1}
        max={totalRows + 1}
        placeholder="idx"
        value={insertIndex}
        onChange={e => setInsertIndex(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setCount(1); setInsertIndex(''); }
          if (e.key === 'Enter' && indexValid) handleInsert(parsedIndex - 1);
        }}
        aria-label="Insertion index"
      />
      <button
        className="set-action-btn empty-row-insert-action"
        onClick={() => { if (indexValid) handleInsert(parsedIndex - 1); }}
        disabled={!indexValid}
        title="Insert at index"
      >At</button>
      <button className="set-action-btn empty-row-insert-cancel" onClick={() => { setOpen(false); setCount(1); setInsertIndex(''); }}>×</button>
    </span>
  );
}

function DraggableEmptyRow({ emptyRow, index, total, onDelete, onArrowMove, onFillSearch, onInsertBelow, dndDisabled, reorderDisabled, dndIdPrefix, realPosition }: {
  emptyRow: EmptyRow;
  index: number;
  total: number;
  onDelete: (persistedId: number) => void;
  onArrowMove: (displayIndex: number, direction: 'up' | 'down') => void;
  onFillSearch: (emptyId: string) => void;
  onInsertBelow: (displayIndex: number) => void;
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
    data: { ...payload, __emptyId: emptyRow.emptyId, __persistedId: emptyRow.persistedId },
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
    disabled: effectiveDndDisabled,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${prefix}drop-tracklist-empty-${emptyRow.emptyId}`,
    data: { index, __emptyId: emptyRow.emptyId, __persistedId: emptyRow.persistedId, realPosition },
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
  const pid = emptyRow.persistedId;

  return (
    <tr
      ref={mergedRef}
      style={{ cursor: rowCursor }}
      className={className}
      data-empty-id={emptyRow.emptyId}
      data-persisted-id={pid}
      data-real-position={realPosition}
      {...rowListeners}
    >
      <td className="play-cell" />
      <td className="mono set-ws-cell-num">{index + 1}</td>
      <td className="set-ws-cell-title empty-row-placeholder" colSpan={1}>
        <span className="empty-row-label">—</span>
      </td>
      <td className="mono set-ws-cell-key">—</td>
      <td className="mono set-ws-cell-bpm">—</td>
      <td className="set-ws-cell-note" />
      <td className="set-ws-cell-actions">
        <div className="set-ws-actions-group">
          <button className="set-move-btn" disabled={reorderDisabled || index === 0} onClick={() => onArrowMove(index, 'up')} title="Move up">↑</button>
          <button className="set-move-btn" disabled={reorderDisabled || index === total - 1} onClick={() => onArrowMove(index, 'down')} title="Move down">↓</button>
          <button className="set-action-btn" onClick={() => onFillSearch(emptyRow.emptyId)} title="Fill with track">Fill</button>
          <button className="set-action-btn set-action-btn--danger" onClick={() => pid != null && onDelete(pid)} title="Delete empty row">×</button>
          <button className="set-action-btn" onClick={() => onInsertBelow(index)} title="Insert empty row below">+</button>
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

function DraggableTracklistRow({ entry, index, total, onRemove, onMoveToPool, onArrowMove, onUpdateNote, onInsertBelow, dndDisabled, reorderDisabled, isSelected, onToggleSelect, selectedIds, dndIdPrefix }: {
  entry: TracklistEntry;
  index: number;
  total: number;
  onRemove: (trackId: number) => void;
  onMoveToPool: (trackId: number) => void;
  onArrowMove: (displayIndex: number, direction: 'up' | 'down') => void;
  onUpdateNote: (trackId: number, note: string) => void;
  onInsertBelow: (displayIndex: number) => void;
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
          <button className="set-move-btn" disabled={reorderDisabled || index === 0} onClick={() => onArrowMove(index, 'up')} title="Move up">↑</button>
          <button className="set-move-btn" disabled={reorderDisabled || index === total - 1} onClick={() => onArrowMove(index, 'down')} title="Move down">↓</button>
          <button className="set-action-btn" onClick={() => onMoveToPool(entry.track_id)} title="Move to pool">To Pool</button>
          <button className="set-action-btn set-action-btn--danger" onClick={() => onRemove(entry.track_id)} title="Delete from tracklist">×</button>
          <button className="set-action-btn" onClick={() => onInsertBelow(index)} title="Insert empty row below">+</button>
        </div>
      </td>
    </tr>
  );
}

export function SetTracklist({ tracklist, emptyRows: persistedEmptyRows, onRemove, onMoveToPool, onReorder, onUpdateNote, onAddTrack, onClearAll, onInsertEmptyRows, onDeleteEmptyRow, onReorderEmptyRow, dndDisabled, dndIdPrefix, onFillEmptyRow }: Props) {
  const prefix = dndIdPrefix ?? '';
  const { setNodeRef: setTracklistDropRef, isOver: isTracklistOver } = useDroppable({ id: `${prefix}drop-tracklist`, disabled: dndDisabled });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [sorting, setSorting] = useState<SortDescriptor[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    if (persistedEmptyRows.length === 0) return sortedTracklist;
    const totalLength = sortedTracklist.length + persistedEmptyRows.length;
    const result: (TracklistDisplayRow | null)[] = new Array(totalLength).fill(null);
    const sorted = [...persistedEmptyRows].sort((a, b) => a.position - b.position);
    const claimed = new Set<number>();
    for (const er of sorted) {
      let pos = Math.max(0, Math.min(er.position, totalLength - 1));
      while (claimed.has(pos) && pos < totalLength - 1) pos++;
      if (claimed.has(pos)) {
        pos = Math.max(0, Math.min(er.position, totalLength - 1));
        while (claimed.has(pos) && pos > 0) pos--;
      }
      claimed.add(pos);
      result[pos] = { __empty: true, emptyId: `er-${er.id}`, persistedId: er.id } as EmptyRow;
    }
    let trackIdx = 0;
    for (let i = 0; i < totalLength; i++) {
      if (result[i] === null && trackIdx < sortedTracklist.length) {
        result[i] = sortedTracklist[trackIdx++];
      }
    }
    return result.filter(Boolean) as TracklistDisplayRow[];
  }, [sortedTracklist, persistedEmptyRows]);

  const handleDeleteEmptyRow = useCallback((persistedId: number) => {
    onDeleteEmptyRow(persistedId);
  }, [onDeleteEmptyRow]);

  const handleArrowMove = useCallback((displayIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? displayIndex - 1 : displayIndex + 1;
    if (targetIndex < 0 || targetIndex >= displayRows.length) return;
    const currentRow = displayRows[displayIndex];
    const targetRow = displayRows[targetIndex];
    if (isEmptyRow(currentRow)) {
      if (currentRow.persistedId != null) {
        onReorderEmptyRow(currentRow.persistedId, targetIndex);
      }
    } else if (isEmptyRow(targetRow)) {
      if (targetRow.persistedId != null) {
        onReorderEmptyRow(targetRow.persistedId, displayIndex);
      }
    } else {
      onReorder(currentRow.track_id, targetRow.position);
    }
  }, [displayRows, onReorder, onReorderEmptyRow]);

  const handleInsertBelow = useCallback((displayIndex: number) => {
    onInsertEmptyRows(1, displayIndex + 1);
  }, [onInsertEmptyRows]);

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
      const persistedId = parseInt(fillTargetId.replace('er-', ''), 10);
      const emptyRow = persistedEmptyRows.find(r => r.id === persistedId);
      const targetPosition = emptyRow?.position ?? sortedTracklist.length;
      if (onFillEmptyRow) {
        onFillEmptyRow(fillTargetId, s.id, s.title, targetPosition);
      } else {
        onAddTrack(s.id, s.title);
      }
      if (!isNaN(persistedId)) onDeleteEmptyRow(persistedId);
      setFillTargetId(null);
    } else {
      onAddTrack(s.id, s.title);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  }, [onAddTrack, onFillEmptyRow, onDeleteEmptyRow, fillTargetId, persistedEmptyRows, sortedTracklist.length]);

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
        <InsertEmptyRowsControl onInsert={onInsertEmptyRows} totalRows={totalDisplayRows} />
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
                    onArrowMove={handleArrowMove}
                    onFillSearch={handleFillSearch}
                    onInsertBelow={handleInsertBelow}
                    dndDisabled={dndDisabled}
                    reorderDisabled={sorting.length > 0}
                    dndIdPrefix={dndIdPrefix}
                    realPosition={persistedEmptyRows.find(r => r.id === row.persistedId)?.position ?? i}
                  />
                ) : (
                  <DraggableTracklistRow
                    key={row.id}
                    entry={row}
                    index={i}
                    total={totalDisplayRows}
                    onRemove={handleRowDelete}
                    onMoveToPool={onMoveToPool}
                    onArrowMove={handleArrowMove}
                    onUpdateNote={onUpdateNote}
                    onInsertBelow={handleInsertBelow}
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
