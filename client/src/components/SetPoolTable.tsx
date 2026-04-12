import { useState, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { PoolEntry } from '../types';
import { cleanTitle } from '../utils/trackTitle';
import { searchTracks } from '../api/http';
import type { SearchSuggestion } from '../types';

interface Props {
  pool: PoolEntry[];
  onRemove: (trackId: number) => void;
  onMoveToTracklist: (trackId: number) => void;
  onAddTrack: (trackId: number, title?: string) => void;
}

export function SetPoolTable({ pool, onRemove, onMoveToTracklist, onAddTrack }: Props) {
  const { setNodeRef: setPoolDropRef, isOver: isPoolOver } = useDroppable({ id: 'drop-pool' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [sortCol, setSortCol] = useState<string>('insertion_order');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }, [sortCol]);

  const sorted = [...pool].sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'title') {
      cmp = (a.track?.title ?? '').localeCompare(b.track?.title ?? '');
    } else if (sortCol === 'bpm') {
      cmp = (a.track?.bpm ?? 0) - (b.track?.bpm ?? 0);
    } else if (sortCol === 'camelot_code') {
      cmp = (a.track?.camelot_code ?? '').localeCompare(b.track?.camelot_code ?? '');
    } else {
      cmp = a.insertion_order - b.insertion_order;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const sortIndicator = (col: string) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div ref={setPoolDropRef} className={`set-pool${isPoolOver ? ' drop-zone--active' : ''}`}>
      <div className="set-pool-header">
        <h3 className="set-section-title">Pool ({pool.length})</h3>
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
            <col className="set-ws-col-num" />
            <col className="set-ws-col-title" />
            <col className="set-ws-col-key" />
            <col className="set-ws-col-bpm" />
            <col className="set-ws-col-actions-pool" />
          </colgroup>
          <thead>
            <tr>
              <th className="set-ws-th set-ws-th-sortable" onClick={() => handleSort('insertion_order')}>
                #{sortIndicator('insertion_order')}
              </th>
              <th className="set-ws-th set-ws-th-sortable" onClick={() => handleSort('title')}>
                Title{sortIndicator('title')}
              </th>
              <th className="set-ws-th set-ws-th-sortable" onClick={() => handleSort('camelot_code')}>
                Key{sortIndicator('camelot_code')}
              </th>
              <th className="set-ws-th set-ws-th-sortable" onClick={() => handleSort('bpm')}>
                BPM{sortIndicator('bpm')}
              </th>
              <th className="set-ws-th set-ws-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <tr
                key={entry.id}
                draggable
                onDragStart={e => e.dataTransfer.setData('text/plain', String(entry.track_id))}
              >
                <td className="mono set-ws-cell-num">{entry.insertion_order + 1}</td>
                <td className="set-ws-cell-title">{cleanTitle(entry.track, entry.track_id)}</td>
                <td className="mono set-ws-cell-key">{entry.track?.camelot_code ?? '—'}</td>
                <td className="mono set-ws-cell-bpm">{entry.track?.bpm != null ? Math.round(entry.track.bpm) : '—'}</td>
                <td className="set-ws-cell-actions">
                  <div className="set-ws-actions-group">
                    <button
                      className="set-action-btn"
                      onClick={() => onMoveToTracklist(entry.track_id)}
                      title="Move to tracklist"
                    >
                      To Tracklist
                    </button>
                    <button
                      className="set-action-btn set-action-btn--danger"
                      onClick={() => onRemove(entry.track_id)}
                      title="Remove from pool"
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
  );
}
