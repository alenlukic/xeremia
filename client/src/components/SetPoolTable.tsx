import { useState, useCallback, useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { PoolEntry, PoolSubgroup, PoolSubgroupMembership } from '../types';
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
  subgroups: PoolSubgroup[];
  subgroupMemberships: PoolSubgroupMembership[];
  onRemove: (trackId: number) => void;
  onMoveToTracklist: (trackId: number) => void;
  onToggleStar: (trackId: number, starred: boolean) => void;
  onAddTrack: (trackId: number, title?: string) => void;
  onClearAll?: () => void;
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>;
  onRenameSubgroup: (subgroupId: number, name: string) => Promise<boolean>;
  onDeleteSubgroup: (subgroupId: number) => Promise<boolean>;
  onReorderSubgroups: (subgroupIds: number[]) => Promise<boolean>;
  onAddSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  onRemoveSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  dndDisabled?: boolean;
}

function compareByColumn(a: PoolEntry, b: PoolEntry, col: string): number {
  if (col === 'title') return (a.track?.title ?? '').localeCompare(b.track?.title ?? '');
  if (col === 'bpm') return (a.track?.bpm ?? 0) - (b.track?.bpm ?? 0);
  if (col === 'camelot_code') return (a.track?.camelot_code ?? '').localeCompare(b.track?.camelot_code ?? '');
  return a.insertion_order - b.insertion_order;
}

function DraggablePoolRow({ entry, onRemove, onMoveToTracklist, onToggleStar, dndDisabled, subgroups, memberSubgroupIds, onAddSubgroupMember, onRemoveSubgroupMember }: {
  entry: PoolEntry;
  onRemove: (trackId: number) => void;
  onMoveToTracklist: (trackId: number) => void;
  onToggleStar: (trackId: number, starred: boolean) => void;
  dndDisabled?: boolean;
  subgroups: PoolSubgroup[];
  memberSubgroupIds: Set<number>;
  onAddSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  onRemoveSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
}) {
  const title = cleanTitle(entry.track, entry.track_id);
  const payload: DragPayload = { trackId: entry.track_id, title, source: 'pool' };
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-track-${entry.track_id}`,
    data: payload,
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
    disabled: dndDisabled,
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

  const handleSubgroupToggle = useCallback((sgId: number) => {
    if (memberSubgroupIds.has(sgId)) {
      onRemoveSubgroupMember(sgId, entry.id);
    } else {
      onAddSubgroupMember(sgId, entry.id);
    }
  }, [memberSubgroupIds, entry.id, onAddSubgroupMember, onRemoveSubgroupMember]);

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
      {subgroups.length > 0 && (
        <td className="set-ws-cell-subgroups">
          <div className="subgroup-chips">
            {subgroups.map(sg => (
              <button
                key={sg.id}
                className={`subgroup-chip${memberSubgroupIds.has(sg.id) ? ' active' : ''}`}
                onClick={() => handleSubgroupToggle(sg.id)}
                title={memberSubgroupIds.has(sg.id) ? `Remove from ${sg.name}` : `Add to ${sg.name}`}
              >
                {sg.name}
              </button>
            ))}
          </div>
        </td>
      )}
      <td className="set-ws-cell-actions">
        <div className="set-ws-actions-group">
          <button className="set-action-btn" onClick={() => onMoveToTracklist(entry.track_id)} title="Move to tracklist">To Tracklist</button>
          <button className="set-action-btn set-action-btn--danger" onClick={() => onRemove(entry.track_id)} title="Remove from pool">×</button>
        </div>
      </td>
    </tr>
  );
}

function SubgroupBar({
  subgroups,
  onCreateSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onReorderSubgroups,
  activeFilter,
  onSetActiveFilter,
}: {
  subgroups: PoolSubgroup[];
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>;
  onRenameSubgroup: (subgroupId: number, name: string) => Promise<boolean>;
  onDeleteSubgroup: (subgroupId: number) => Promise<boolean>;
  onReorderSubgroups: (subgroupIds: number[]) => Promise<boolean>;
  activeFilter: number | null;
  onSetActiveFilter: (id: number | null) => void;
}) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await onCreateSubgroup(trimmed);
    setNewName('');
    setShowNewInput(false);
  }, [newName, onCreateSubgroup]);

  const handleRename = useCallback(async (id: number) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    await onRenameSubgroup(id, trimmed);
    setEditingId(null);
    setEditName('');
  }, [editName, onRenameSubgroup]);

  const handleMoveUp = useCallback((idx: number) => {
    if (idx <= 0) return;
    const ids = subgroups.map(sg => sg.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    onReorderSubgroups(ids);
  }, [subgroups, onReorderSubgroups]);

  const handleMoveDown = useCallback((idx: number) => {
    if (idx >= subgroups.length - 1) return;
    const ids = subgroups.map(sg => sg.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    onReorderSubgroups(ids);
  }, [subgroups, onReorderSubgroups]);

  return (
    <div className="subgroup-bar">
      <button
        className={`subgroup-filter-btn${activeFilter === null ? ' active' : ''}`}
        onClick={() => onSetActiveFilter(null)}
      >
        All
      </button>
      {subgroups.map((sg, idx) => (
        <div key={sg.id} className="subgroup-tag-wrapper">
          {editingId === sg.id ? (
            <input
              className="subgroup-rename-input"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={() => handleRename(sg.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRename(sg.id);
                if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
              }}
              autoFocus
            />
          ) : (
            <button
              className={`subgroup-filter-btn${activeFilter === sg.id ? ' active' : ''}`}
              onClick={() => onSetActiveFilter(activeFilter === sg.id ? null : sg.id)}
              onDoubleClick={() => { setEditingId(sg.id); setEditName(sg.name); }}
              title={`Filter by ${sg.name} (double-click to rename)`}
            >
              {sg.name}
            </button>
          )}
          <div className="subgroup-tag-controls">
            {idx > 0 && (
              <button className="subgroup-ctrl-btn" onClick={() => handleMoveUp(idx)} title="Move left" aria-label={`Move ${sg.name} left`}>‹</button>
            )}
            {idx < subgroups.length - 1 && (
              <button className="subgroup-ctrl-btn" onClick={() => handleMoveDown(idx)} title="Move right" aria-label={`Move ${sg.name} right`}>›</button>
            )}
            <button
              className="subgroup-ctrl-btn subgroup-ctrl-btn--danger"
              onClick={() => {
                if (window.confirm(`Delete subgroup "${sg.name}"? Tracks will remain in the pool.`)) {
                  onDeleteSubgroup(sg.id);
                  if (activeFilter === sg.id) onSetActiveFilter(null);
                }
              }}
              title={`Delete ${sg.name}`}
              aria-label={`Delete subgroup ${sg.name}`}
            >
              ×
            </button>
          </div>
        </div>
      ))}
      {showNewInput ? (
        <span className="subgroup-new-inline">
          <input
            className="subgroup-new-input"
            placeholder="Name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setShowNewInput(false); setNewName(''); }
            }}
            autoFocus
          />
          <button className="subgroup-ctrl-btn" onClick={handleCreate} title="Create subgroup">✓</button>
          <button className="subgroup-ctrl-btn" onClick={() => { setShowNewInput(false); setNewName(''); }}>✕</button>
        </span>
      ) : (
        <button
          className="subgroup-add-btn"
          onClick={() => setShowNewInput(true)}
          title="Create subgroup"
          aria-label="Create subgroup"
        >
          +
        </button>
      )}
    </div>
  );
}

export function SetPoolTable({
  pool, subgroups, subgroupMemberships,
  onRemove, onMoveToTracklist, onToggleStar, onAddTrack, onClearAll,
  onCreateSubgroup, onRenameSubgroup, onDeleteSubgroup, onReorderSubgroups,
  onAddSubgroupMember, onRemoveSubgroupMember,
  dndDisabled,
}: Props) {
  const { setNodeRef: setPoolDropRef, isOver: isPoolOver } = useDroppable({ id: 'drop-pool', disabled: dndDisabled });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [sorting, setSorting] = useState<SortDescriptor[]>([{ id: 'insertion_order', desc: false }]);
  const [subgroupFilter, setSubgroupFilter] = useState<number | null>(null);

  const membershipByEntry = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const m of subgroupMemberships) {
      let s = map.get(m.pool_entry_id);
      if (!s) { s = new Set(); map.set(m.pool_entry_id, s); }
      s.add(m.subgroup_id);
    }
    return map;
  }, [subgroupMemberships]);

  const memberEntriesBySubgroup = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const m of subgroupMemberships) {
      let s = map.get(m.subgroup_id);
      if (!s) { s = new Set(); map.set(m.subgroup_id, s); }
      s.add(m.pool_entry_id);
    }
    return map;
  }, [subgroupMemberships]);

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

  const filteredPool = useMemo(() => {
    if (subgroupFilter === null) return pool;
    const entryIds = memberEntriesBySubgroup.get(subgroupFilter);
    if (!entryIds) return [];
    return pool.filter(e => entryIds.has(e.id));
  }, [pool, subgroupFilter, memberEntriesBySubgroup]);

  const sorted = useMemo(() => [...filteredPool].sort((a, b) => {
    for (const s of sorting) {
      const cmp = compareByColumn(a, b, s.id);
      if (cmp !== 0) return s.desc ? -cmp : cmp;
    }
    return 0;
  }), [filteredPool, sorting]);

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
      <SubgroupBar
        subgroups={subgroups}
        onCreateSubgroup={onCreateSubgroup}
        onRenameSubgroup={onRenameSubgroup}
        onDeleteSubgroup={onDeleteSubgroup}
        onReorderSubgroups={onReorderSubgroups}
        activeFilter={subgroupFilter}
        onSetActiveFilter={setSubgroupFilter}
      />
      <div className="set-table-scroll-shell">
        {pool.length === 0 ? (
          <p className="set-empty-tracks">Pool is empty. Search above or add tracks from other tabs.</p>
        ) : sorted.length === 0 && subgroupFilter !== null ? (
          <p className="set-empty-tracks">No tracks in this subgroup yet.</p>
        ) : (
          <table className="set-pool-table">
            <colgroup>
              <col className="set-ws-col-star" />
              <col className="set-ws-col-play" />
              <col className="set-ws-col-num" />
              <col className="set-ws-col-title" />
              <col className="set-ws-col-key" />
              <col className="set-ws-col-bpm" />
              {subgroups.length > 0 && <col className="set-ws-col-subgroups" />}
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
                {subgroups.length > 0 && <th className="set-ws-th">Groups</th>}
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
                  dndDisabled={dndDisabled}
                  subgroups={subgroups}
                  memberSubgroupIds={membershipByEntry.get(entry.id) ?? new Set()}
                  onAddSubgroupMember={onAddSubgroupMember}
                  onRemoveSubgroupMember={onRemoveSubgroupMember}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
