import { useState, useCallback, useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { PoolEntry } from '../types';
import { cleanTitle } from '../utils/trackTitle';
import { searchTracks } from '../api/http';
import type { SearchSuggestion } from '../types';
import type { DragPayload } from '../dnd';
import { PlayButton } from './PlayButton';

interface SortDescriptor {
  id: string;
  desc: boolean;
}

interface Props {
  pool: PoolEntry[];
  onRemove: (trackId: number) => void;
  onMoveToTracklist: (trackId: number) => void;
  onToggleStar: (trackId: number, starred: boolean) => void;
  onAddTrack: (trackId: number, title?: string) => void;
  onClearAll?: () => void;
}

function compareByColumn(a: PoolEntry, b: PoolEntry, col: string): number {
  if (col === 'title') return (a.track?.title ?? '').localeCompare(b.track?.title ?? '');
  if (col === 'bpm') return (a.track?.bpm ?? 0) - (b.track?.bpm ?? 0);
  if (col === 'camelot_code') return (a.track?.camelot_code ?? '').localeCompare(b.track?.camelot_code ?? '');
  return a.insertion_order - b.insertion_order;
}

function DraggablePoolRow({ entry, onRemove, onMoveToTracklist, onToggleStar }: {
  entry: PoolEntry;
  onRemove: (trackId: number) => void;
  onMoveToTracklist: (trackId: number) => void;
  onToggleStar: (trackId: number, starred: boolean) => void;
}) {
  const title = cleanTitle(entry.track, entry.track_id);
  const payload: DragPayload = { trackId: entry.track_id, title, source: 'pool' };
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-track-${entry.track_id}`,
    data: payload,
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
  });

  const rowListeners = useMemo(() => {
    if (!listeners) return {};
    const { onPointerDown, ...rest } = listeners as Record<string, unknown>;
    return {
      ...rest,
      onPointerDown: (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
        (onPointerDown as (e: React.PointerEvent) => void)?.(e);
      },
    };
  }, [listeners]);

  return (
    <tr
      ref={setNodeRef}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      className={isDragging ? 'row-dragging' : undefined}
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
      <td className="mono set-ws-cell-num">{entry.insertion_order + 1}</td>
      <td className="set-ws-cell-title">{title}</td>
      <td className="mono set-ws-cell-key">{entry.track?.camelot_code ?? '—'}</td>
      <td className="mono set-ws-cell-bpm">{entry.track?.bpm != null ? Math.round(entry.track.bpm) : '—'}</td>
      <td className="set-ws-cell-actions">
        <div className="set-ws-actions-group">
          <button className="set-action-btn" onClick={() => onMoveToTracklist(entry.track_id)} title="Move to tracklist">To Tracklist</button>
          <button className="set-action-btn set-action-btn--danger" onClick={() => onRemove(entry.track_id)} title="Remove from pool">×</button>
        </div>
      </td>
    </tr>
  );
}

export function SetPoolTable({ pool, onRemove, onMoveToTracklist, onToggleStar, onAddTrack, onClearAll }: Props) {
  const { setNodeRef: setPoolDropRef, isOver: isPoolOver } = useDroppable({ id: 'drop-pool' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [sorting, setSorting] = useState<SortDescriptor[]>([{ id: 'insertion_order', desc: false }]);

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

  const handleSort = useCallback((col: string, e: React.MouseEvent) => {
    setSorting(prev => {
      const existingIdx = prev.findIndex(s => s.id === col);
      if (e.shiftKey) {
        const next = [...prev];
        if (existingIdx >= 0) {
          next[existingIdx] = { id: col, desc: !next[existingIdx].desc };
        } else {
          next.push({ id: col, desc: false });
        }
        return next;
      }
      if (existingIdx >= 0 && prev.length === 1) {
        return [{ id: col, desc: !prev[existingIdx].desc }];
      }
      return [{ id: col, desc: false }];
    });
  }, []);

  const sorted = useMemo(() => [...pool].sort((a, b) => {
    for (const s of sorting) {
      const cmp = compareByColumn(a, b, s.id);
      if (cmp !== 0) return s.desc ? -cmp : cmp;
    }
    return 0;
  }), [pool, sorting]);

  const sortIndicator = (col: string) => {
    const idx = sorting.findIndex(s => s.id === col);
    if (idx < 0) return null;
    const arrow = sorting[idx].desc ? ' ▼' : ' ▲';
    if (sorting.length > 1) {
      return <span className="sort-indicator"><span className="sort-precedence">{idx + 1}</span>{arrow}</span>;
    }
    return <span className="sort-indicator">{arrow}</span>;
  };

  return (
    <div ref={setPoolDropRef} className={`set-pool${isPoolOver ? ' drop-zone--active' : ''}`}>
      <div className="set-pool-header">
        <h3 className="set-section-title">Pool ({pool.length})</h3>
        {pool.length > 0 && onClearAll && (
          <button
            className="set-action-btn set-action-btn--danger set-clear-all-btn"
            onClick={() => {
              if (window.confirm(`Clear all ${pool.length} track${pool.length === 1 ? '' : 's'} from Pool?`)) {
                onClearAll();
              }
            }}
          >
            Clear All
          </button>
        )}
        <div className="set-pool-search-wrapper">
          <input
            className="set-pool-search"
            placeholder="Search to add…"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
          />
          {showSearch && (
            <ul className="set-pool-search-dropdown">
              {searchResults.map(s => (
                <li
                  key={s.id}
                  className="set-pool-search-item"
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
      {pool.length === 0 ? (
        <p className="set-empty-tracks">Pool is empty. Search above or add tracks from other tabs.</p>
      ) : (
        <table className="set-pool-table">
          <colgroup>
            <col className="set-ws-col-star" />
            <col className="set-ws-col-play" />
            <col className="set-ws-col-num" />
            <col className="set-ws-col-title" />
            <col className="set-ws-col-key" />
            <col className="set-ws-col-bpm" />
            <col className="set-ws-col-actions-pool" />
          </colgroup>
          <thead>
            <tr>
              <th className="set-ws-th set-ws-th-star" aria-label="Starred" />
              <th className="set-ws-th" style={{ width: 32 }} />
              <th className="set-ws-th set-ws-th-sortable" onClick={(e) => handleSort('insertion_order', e)}>
                #{sortIndicator('insertion_order')}
              </th>
              <th className="set-ws-th set-ws-th-sortable" onClick={(e) => handleSort('title', e)}>
                Title{sortIndicator('title')}
              </th>
              <th className="set-ws-th set-ws-th-sortable" onClick={(e) => handleSort('camelot_code', e)}>
                Key{sortIndicator('camelot_code')}
              </th>
              <th className="set-ws-th set-ws-th-sortable" onClick={(e) => handleSort('bpm', e)}>
                BPM{sortIndicator('bpm')}
              </th>
              <th className="set-ws-th set-ws-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <DraggablePoolRow
                key={entry.id}
                entry={entry}
                onRemove={onRemove}
                onMoveToTracklist={onMoveToTracklist}
                onToggleStar={onToggleStar}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
