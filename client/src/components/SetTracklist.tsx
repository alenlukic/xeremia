import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { TracklistEntry, SearchSuggestion } from '../types';
import { cleanTitle } from '../utils/trackTitle';
import { searchTracks } from '../api/http';
import type { DragPayload } from '../dnd';
import { PlayButton } from './PlayButton';

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

function DraggableTracklistRow({ entry, index, total, onRemove, onMoveToPool, onReorder, onUpdateNote, onToggleStar, dndDisabled }: {
  entry: TracklistEntry;
  index: number;
  total: number;
  onRemove: (trackId: number) => void;
  onMoveToPool: (trackId: number) => void;
  onReorder: (trackId: number, newPosition: number) => void;
  onUpdateNote: (trackId: number, note: string) => void;
  onToggleStar: (trackId: number, starred: boolean) => void;
  dndDisabled?: boolean;
}) {
  const title = cleanTitle(entry.track, entry.track_id);
  const payload: DragPayload = { trackId: entry.track_id, title, source: 'tracklist' };
  const { listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `tracklist-track-${entry.track_id}`,
    data: payload,
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
    disabled: dndDisabled,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-tracklist-row-${index}`,
    data: { index, trackId: entry.track_id },
    disabled: dndDisabled,
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
        e.stopPropagation();
        (onPointerDown as (e: React.PointerEvent) => void)?.(e);
      },
    };
  }, [listeners]);

  const className = [
    isDragging && 'row-dragging',
    isOver && !isDragging && 'row-drop-target',
  ].filter(Boolean).join(' ') || undefined;

  return (
    <tr
      ref={mergedRef}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      className={className}
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
          <button className="set-move-btn" disabled={index === 0} onClick={() => onReorder(entry.track_id, index - 1)} title="Move up">↑</button>
          <button className="set-move-btn" disabled={index === total - 1} onClick={() => onReorder(entry.track_id, index + 1)} title="Move down">↓</button>
          <button className="set-action-btn" onClick={() => onMoveToPool(entry.track_id)} title="Move to pool">To Pool</button>
          <button className="set-action-btn set-action-btn--danger" onClick={() => onRemove(entry.track_id)} title="Delete from tracklist">×</button>
        </div>
      </td>
    </tr>
  );
}

export function SetTracklist({ tracklist, onRemove, onMoveToPool, onReorder, onUpdateNote, onToggleStar, onAddTrack, onClearAll, dndDisabled }: Props) {
  const { setNodeRef: setTracklistDropRef, isOver: isTracklistOver } = useDroppable({ id: 'drop-tracklist', disabled: dndDisabled });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }
    try {
      const results = await searchTracks(q);
      setSearchResults(results);
      setShowSearch(results.length > 0);
    } catch { /* ignore */ }
  }, []);

  const handleSearchSelect = useCallback((s: SearchSuggestion) => {
    onAddTrack(s.id, s.title);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  }, [onAddTrack]);

  return (
    <div ref={setTracklistDropRef} className={`set-tracklist${isTracklistOver ? ' drop-zone--active' : ''}`}>
      <div className="set-tracklist-header">
        <h3 className="set-section-title">Tracklist ({tracklist.length})</h3>
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
            placeholder="Search to add…"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
          />
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
      <div className="set-table-scroll-shell">
        {tracklist.length === 0 ? (
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
              {tracklist.map((entry, i) => (
                <DraggableTracklistRow
                  key={entry.id}
                  entry={entry}
                  index={i}
                  total={tracklist.length}
                  onRemove={onRemove}
                  onMoveToPool={onMoveToPool}
                  onReorder={onReorder}
                  onUpdateNote={onUpdateNote}
                  onToggleStar={onToggleStar}
                  dndDisabled={dndDisabled}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
