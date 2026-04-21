import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { DndContext, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import type { PoolEntry, PoolSubgroup, PoolSubgroupMembership, EmptyRow, PoolDisplayRow, PersistedEmptyRow } from '../types';
import { isEmptyRow } from '../types';
import { cleanTitle } from '../utils/trackTitle';
import { searchTracks } from '../api/http';
import type { SearchSuggestion } from '../types';
import type { DragPayload } from '../dnd';
import { PlayButton } from './PlayButton';
import { SortTierBar } from './SortTierBar';
import type { SortDescriptor, SortColumn } from './SortTierBar';

type PoolTab = 'all' | 'groups' | number;

const POOL_SORT_COLUMNS: SortColumn[] = [
  { id: 'insertion_order', label: '#' },
  { id: 'title', label: 'Title' },
  { id: 'camelot_code', label: 'Key' },
  { id: 'bpm', label: 'BPM' },
];

interface Props {
  pool: PoolEntry[];
  emptyRows: PersistedEmptyRow[];
  subgroups: PoolSubgroup[];
  subgroupMemberships: PoolSubgroupMembership[];
  onRemove: (trackId: number) => void;
  onMoveToTracklist: (trackId: number) => void;
  onReorder: (trackId: number, newPosition: number) => void;
  onAddTrack: (trackId: number, title?: string) => void;
  onClearAll?: () => void;
  onInsertEmptyRows: (count: number, position: number) => void;
  onDeleteEmptyRow: (emptyRowId: number) => void;
  onReorderEmptyRow: (emptyRowId: number, newPosition: number) => void;
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>;
  onRenameSubgroup: (subgroupId: number, name: string) => Promise<boolean>;
  onDeleteSubgroup: (subgroupId: number) => Promise<boolean>;
  onReorderSubgroups: (subgroupIds: number[]) => Promise<boolean>;
  onAddSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  onRemoveSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  dndDisabled?: boolean;
  dndIdPrefix?: string;
  onFillEmptyRow?: (emptyId: string, trackId: number, title?: string) => void;
}

function PoolInsertEmptyRowsControl({ onInsert }: { onInsert: (count: number, position: number) => void }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);

  const handleInsert = useCallback((position: 'start' | 'end') => {
    if (count < 1) return;
    const pos = position === 'start' ? 0 : -1;
    onInsert(count, pos);
    setOpen(false);
    setCount(1);
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
          if (e.key === 'Escape') { setOpen(false); setCount(1); }
          if (e.key === 'Enter') handleInsert('end');
        }}
        aria-label="Number of empty rows"
        autoFocus
      />
      <button className="set-action-btn empty-row-insert-action" onClick={() => handleInsert('start')} title="Insert at start">Top</button>
      <button className="set-action-btn empty-row-insert-action" onClick={() => handleInsert('end')} title="Insert at end">Bottom</button>
      <button className="set-action-btn empty-row-insert-cancel" onClick={() => { setOpen(false); setCount(1); }}>×</button>
    </span>
  );
}

function DraggablePoolEmptyRow({ emptyRow, onDelete, onFillSearch, dndDisabled, subgroups, dndIdPrefix, realPosition }: {
  emptyRow: EmptyRow;
  onDelete: (persistedId: number) => void;
  onFillSearch: (emptyId: string) => void;
  dndDisabled?: boolean;
  subgroups: PoolSubgroup[];
  dndIdPrefix?: string;
  realPosition: number;
}) {
  const prefix = dndIdPrefix ?? '';
  const payload: DragPayload = { trackId: -1, title: '', source: 'pool' };
  const { listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `${prefix}pool-empty-${emptyRow.emptyId}`,
    data: { ...payload, __emptyId: emptyRow.emptyId, __persistedId: emptyRow.persistedId },
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
    disabled: dndDisabled,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${prefix}drop-pool-empty-${emptyRow.emptyId}`,
    data: { __emptyId: emptyRow.emptyId, __persistedId: emptyRow.persistedId, realPosition },
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
        (onPointerDown as (e: React.PointerEvent) => void)?.(e);
      },
    };
  }, [listeners]);

  const pid = emptyRow.persistedId;

  return (
    <tr
      ref={mergedRef}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      className={`empty-row${isDragging ? ' row-dragging' : ''}${isOver && !isDragging ? ' row-drop-target' : ''}`}
      data-empty-id={emptyRow.emptyId}
      data-persisted-id={pid}
      data-real-position={realPosition}
      {...rowListeners}
    >
      <td className="play-cell" />
      <td className="mono set-ws-cell-num">—</td>
      <td className="set-ws-cell-title empty-row-placeholder">
        <span className="empty-row-label">—</span>
      </td>
      <td className="mono set-ws-cell-key">—</td>
      <td className="mono set-ws-cell-bpm">—</td>
      {subgroups.length > 0 && <td className="set-ws-cell-subgroups" />}
      <td className="set-ws-cell-actions">
        <div className="set-ws-actions-group">
          <button className="set-action-btn" onClick={() => onFillSearch(emptyRow.emptyId)} title="Fill with track">Fill</button>
          <button className="set-action-btn set-action-btn--danger" onClick={() => pid != null && onDelete(pid)} title="Delete empty row">×</button>
        </div>
      </td>
    </tr>
  );
}

function compareByColumn(a: PoolEntry, b: PoolEntry, col: string): number {
  if (col === 'title') return (a.track?.title ?? '').localeCompare(b.track?.title ?? '');
  if (col === 'bpm') return (a.track?.bpm ?? 0) - (b.track?.bpm ?? 0);
  if (col === 'camelot_code') return (a.track?.camelot_code ?? '').localeCompare(b.track?.camelot_code ?? '');
  return a.insertion_order - b.insertion_order;
}

function DraggablePoolRow({ entry, entryRank, totalEntries, onRemove, onMoveToTracklist, onReorder, dndDisabled, reorderDisabled, subgroups, memberSubgroupIds, onAddSubgroupMember, onRemoveSubgroupMember, dndIdPrefix }: {
  entry: PoolEntry;
  entryRank: number;
  totalEntries: number;
  onRemove: (trackId: number) => void;
  onMoveToTracklist: (trackId: number) => void;
  onReorder: (trackId: number, newPosition: number) => void;
  dndDisabled?: boolean;
  reorderDisabled?: boolean;
  subgroups: PoolSubgroup[];
  memberSubgroupIds: Set<number>;
  onAddSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  onRemoveSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  dndIdPrefix?: string;
}) {
  const prefix = dndIdPrefix ?? '';
  const effectiveDndDisabled = dndDisabled || reorderDisabled;
  const title = cleanTitle(entry.track, entry.track_id);
  const payload: DragPayload = { trackId: entry.track_id, title, source: 'pool' };
  const { listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `${prefix}pool-track-${entry.track_id}`,
    data: payload,
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
    disabled: effectiveDndDisabled,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${prefix}drop-pool-row-${entryRank}`,
    data: { entryRank, trackId: entry.track_id },
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

  const handleSubgroupToggle = useCallback((sgId: number) => {
    if (memberSubgroupIds.has(sgId)) {
      onRemoveSubgroupMember(sgId, entry.id);
    } else {
      onAddSubgroupMember(sgId, entry.id);
    }
  }, [memberSubgroupIds, entry.id, onAddSubgroupMember, onRemoveSubgroupMember]);

  const rowCursor = effectiveDndDisabled ? 'default' : isDragging ? 'grabbing' : 'grab';

  const className = [
    isDragging && 'row-dragging',
    isOver && !isDragging && 'row-drop-target',
  ].filter(Boolean).join(' ') || undefined;

  return (
    <tr
      ref={mergedRef}
      style={{ cursor: rowCursor }}
      className={className}
      {...rowListeners}
    >
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
          <button className="set-move-btn" disabled={reorderDisabled || entryRank === 0} onClick={() => onReorder(entry.track_id, entryRank - 1)} title="Move up" aria-label="Move up">↑</button>
          <button className="set-move-btn" disabled={reorderDisabled || entryRank >= totalEntries - 1} onClick={() => onReorder(entry.track_id, entryRank + 1)} title="Move down" aria-label="Move down">↓</button>
          <button className="set-action-btn" onClick={() => onMoveToTracklist(entry.track_id)} title="Move to tracklist">To Tracklist</button>
          <button className="set-action-btn set-action-btn--danger" onClick={() => onRemove(entry.track_id)} title="Remove from pool">×</button>
        </div>
      </td>
    </tr>
  );
}

function PoolRow({ entry, onRemove, onMoveToTracklist, subgroups, memberSubgroupIds, onAddSubgroupMember, onRemoveSubgroupMember }: {
  entry: PoolEntry;
  onRemove: (trackId: number) => void;
  onMoveToTracklist: (trackId: number) => void;
  subgroups: PoolSubgroup[];
  memberSubgroupIds: Set<number>;
  onAddSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  onRemoveSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
}) {
  const title = cleanTitle(entry.track, entry.track_id);

  const handleSubgroupToggle = useCallback((sgId: number) => {
    if (memberSubgroupIds.has(sgId)) {
      onRemoveSubgroupMember(sgId, entry.id);
    } else {
      onAddSubgroupMember(sgId, entry.id);
    }
  }, [memberSubgroupIds, entry.id, onAddSubgroupMember, onRemoveSubgroupMember]);

  return (
    <tr>
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

function PoolTabBar({
  subgroups,
  onCreateSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onReorderSubgroups,
  activeTab,
  onTabChange,
}: {
  subgroups: PoolSubgroup[];
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>;
  onRenameSubgroup: (subgroupId: number, name: string) => Promise<boolean>;
  onDeleteSubgroup: (subgroupId: number) => Promise<boolean>;
  onReorderSubgroups: (subgroupIds: number[]) => Promise<boolean>;
  activeTab: PoolTab;
  onTabChange: (tab: PoolTab) => void;
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
    <div className="pool-tab-bar" role="tablist" aria-label="Pool view">
      <button
        role="tab"
        className={`pool-tab pool-tab--default${activeTab === 'all' ? ' pool-tab--active' : ''}`}
        aria-selected={activeTab === 'all'}
        onClick={() => onTabChange('all')}
      >
        All
      </button>
      <button
        role="tab"
        className={`pool-tab pool-tab--default${activeTab === 'groups' ? ' pool-tab--active' : ''}`}
        aria-selected={activeTab === 'groups'}
        onClick={() => onTabChange('groups')}
      >
        Groups
      </button>
      {subgroups.map((sg, idx) => (
        <div key={sg.id} className="pool-tab-wrapper">
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
              role="tab"
              className={`pool-tab${activeTab === sg.id ? ' pool-tab--active' : ''}`}
              aria-selected={activeTab === sg.id}
              onClick={() => onTabChange(sg.id)}
              onDoubleClick={() => { setEditingId(sg.id); setEditName(sg.name); }}
              title={`View ${sg.name} (double-click to rename)`}
            >
              {sg.name}
            </button>
          )}
          <div className="pool-tab-controls">
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
                  if (activeTab === sg.id) onTabChange('all');
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

function SubgroupSection({
  subgroup,
  entries,
  subgroups,
  membershipByEntry,
  sorting,
  index,
  onRemove,
  onMoveToTracklist,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
}: {
  subgroup: PoolSubgroup;
  entries: PoolEntry[];
  subgroups: PoolSubgroup[];
  membershipByEntry: Map<number, Set<number>>;
  sorting: SortDescriptor[];
  index: number;
  onRemove: (trackId: number) => void;
  onMoveToTracklist: (trackId: number) => void;
  onAddSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  onRemoveSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `section-${subgroup.id}`,
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `section-${subgroup.id}` });

  const ref = useCallback((node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  const sorted = useMemo(() => [...entries].sort((a, b) => {
    for (const s of sorting) {
      const cmp = compareByColumn(a, b, s.id);
      if (cmp !== 0) return s.desc ? -cmp : cmp;
    }
    return 0;
  }), [entries, sorting]);

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={ref}
      style={style}
      className={`subgroup-section${index % 2 === 1 ? ' subgroup-section--alt' : ''}${isOver && !isDragging ? ' subgroup-section--drop-target' : ''}`}
      data-subgroup-id={subgroup.id}
    >
      <div className="subgroup-section-header" {...attributes} {...listeners}>
        <span className="subgroup-section-drag-handle" aria-hidden="true">⠿</span>
        <h4 className="subgroup-section-title">{subgroup.name}</h4>
        <span className="subgroup-section-count">{entries.length} track{entries.length !== 1 ? 's' : ''}</span>
      </div>
      {sorted.length === 0 ? (
        <p className="set-empty-tracks">No tracks in {subgroup.name}.</p>
      ) : (
        <table className="set-pool-table">
          <colgroup>
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
              <th className="set-ws-th" style={{ width: 32 }} />
              <th className="set-ws-th">#</th>
              <th className="set-ws-th">Title</th>
              <th className="set-ws-th">Key</th>
              <th className="set-ws-th">BPM</th>
              {subgroups.length > 0 && <th className="set-ws-th">Groups</th>}
              <th className="set-ws-th set-ws-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(entry => (
              <PoolRow
                key={entry.id}
                entry={entry}
                onRemove={onRemove}
                onMoveToTracklist={onMoveToTracklist}
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
  );
}

export function SetPoolTable({
  pool, emptyRows: persistedEmptyRows, subgroups, subgroupMemberships,
  onRemove, onMoveToTracklist, onReorder, onAddTrack, onClearAll,
  onInsertEmptyRows, onDeleteEmptyRow, onReorderEmptyRow: _onReorderEmptyRow,
  onCreateSubgroup, onRenameSubgroup, onDeleteSubgroup, onReorderSubgroups,
  onAddSubgroupMember, onRemoveSubgroupMember,
  dndDisabled, dndIdPrefix, onFillEmptyRow,
}: Props) {
  const prefix = dndIdPrefix ?? '';
  const { setNodeRef: setPoolDropRef, isOver: isPoolOver } = useDroppable({ id: `${prefix}drop-pool`, disabled: dndDisabled });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const defaultSort: SortDescriptor[] = [{ id: 'insertion_order', desc: false }];
  const [sortByView, setSortByView] = useState<Record<string, SortDescriptor[]>>({ all: defaultSort });
  const [activeTab, setActiveTab] = useState<PoolTab>('all');
  const pendingSubgroupAssign = useRef<{ trackId: number; subgroupId: number } | null>(null);
  const [fillTargetId, setFillTargetId] = useState<string | null>(null);

  const viewKey = String(activeTab);
  const sorting = sortByView[viewKey] ?? defaultSort;
  const setSorting = useCallback((next: SortDescriptor[] | ((prev: SortDescriptor[]) => SortDescriptor[])) => {
    setSortByView(prev => {
      const current = prev[viewKey] ?? defaultSort;
      const resolved = typeof next === 'function' ? next(current) : next;
      return { ...prev, [viewKey]: resolved };
    });
  }, [viewKey]);

  useEffect(() => {
    const pending = pendingSubgroupAssign.current;
    if (!pending) return;
    const entry = pool.find(e => e.track_id === pending.trackId);
    if (entry) {
      pendingSubgroupAssign.current = null;
      onAddSubgroupMember(pending.subgroupId, entry.id);
    }
  }, [pool, onAddSubgroupMember]);

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

  const poolRankByTrackId = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < pool.length; i++) {
      map.set(pool[i].track_id, i);
    }
    return map;
  }, [pool]);

  const isUserOrder = sorting.length === 0 ||
    (sorting.length === 1 && sorting[0].id === 'insertion_order' && !sorting[0].desc);
  const reorderDisabled = !isUserOrder;

  const handleDeleteEmptyRow = useCallback((persistedId: number) => {
    onDeleteEmptyRow(persistedId);
  }, [onDeleteEmptyRow]);

  const handleFillSearch = useCallback((emptyId: string) => {
    setFillTargetId(emptyId);
    setShowSearch(true);
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
      if (onFillEmptyRow) {
        onFillEmptyRow(fillTargetId, s.id, s.title);
      } else {
        onAddTrack(s.id, s.title);
      }
      const persistedId = parseInt(fillTargetId.replace('er-', ''), 10);
      if (!isNaN(persistedId)) onDeleteEmptyRow(persistedId);
      setFillTargetId(null);
    } else {
      if (typeof activeTab === 'number') {
        pendingSubgroupAssign.current = { trackId: s.id, subgroupId: activeTab };
      }
      onAddTrack(s.id, s.title);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  }, [onAddTrack, onFillEmptyRow, onDeleteEmptyRow, activeTab, fillTargetId]);

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
    if (activeTab === 'all' || activeTab === 'groups') return pool;
    const entryIds = memberEntriesBySubgroup.get(activeTab);
    if (!entryIds) return [];
    return pool.filter(e => entryIds.has(e.id));
  }, [pool, activeTab, memberEntriesBySubgroup]);

  const handleSectionDragEnd = useCallback((event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const toNum = (v: string | number) => typeof v === 'number' ? v : Number(v.replace('section-', ''));
    const activeId = toNum(active.id);
    const overId = toNum(over.id);
    const oldIndex = subgroups.findIndex(sg => sg.id === activeId);
    const newIndex = subgroups.findIndex(sg => sg.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;
    const ids = subgroups.map(sg => sg.id);
    const [moved] = ids.splice(oldIndex, 1);
    ids.splice(newIndex, 0, moved);
    onReorderSubgroups(ids);
  }, [subgroups, onReorderSubgroups]);

  const sorted = useMemo(() => [...filteredPool].sort((a, b) => {
    for (const s of sorting) {
      const cmp = compareByColumn(a, b, s.id);
      if (cmp !== 0) return s.desc ? -cmp : cmp;
    }
    return 0;
  }), [filteredPool, sorting]);

  const poolDisplayRows = useMemo((): PoolDisplayRow[] => {
    if (persistedEmptyRows.length === 0) return sorted;
    const result: PoolDisplayRow[] = [...sorted];
    const sortedEmpty = [...persistedEmptyRows].sort((a, b) => a.position - b.position);
    for (let i = 0; i < sortedEmpty.length; i++) {
      const pos = Math.min(sortedEmpty[i].position + i, result.length);
      result.splice(pos, 0, { __empty: true, emptyId: `er-${sortedEmpty[i].id}`, persistedId: sortedEmpty[i].id } as EmptyRow);
    }
    return result;
  }, [sorted, persistedEmptyRows]);

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
        <PoolInsertEmptyRowsControl onInsert={onInsertEmptyRows} />
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
        {fillTargetId && (
          <div className="set-pool-search-wrapper">
            <input
              className="set-pool-search"
              placeholder="Search to fill empty row…"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
            />
            <button className="set-action-btn fill-cancel-btn" onClick={() => { setFillTargetId(null); setSearchQuery(''); setSearchResults([]); setShowSearch(false); }}>
              Cancel Fill
            </button>
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
        )}
      </div>
      <PoolTabBar
        subgroups={subgroups}
        onCreateSubgroup={onCreateSubgroup}
        onRenameSubgroup={onRenameSubgroup}
        onDeleteSubgroup={onDeleteSubgroup}
        onReorderSubgroups={onReorderSubgroups}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <SortTierBar
        sorting={sorting}
        columns={POOL_SORT_COLUMNS}
        onSortingChange={setSorting}
      />
      <div className="set-table-scroll-shell">
        {activeTab === 'groups' ? (
          subgroups.length === 0 ? (
            <p className="set-empty-tracks">No subgroups yet. Create one using the + button above.</p>
          ) : (
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={handleSectionDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <div className="subgroup-sections">
                {subgroups.map((sg, idx) => {
                  const entryIds = memberEntriesBySubgroup.get(sg.id);
                  const entries = entryIds ? pool.filter(e => entryIds.has(e.id)) : [];
                  return (
                    <SubgroupSection
                      key={sg.id}
                      subgroup={sg}
                      entries={entries}
                      subgroups={subgroups}
                      membershipByEntry={membershipByEntry}
                      sorting={sorting}
                      index={idx}
                      onRemove={onRemove}
                      onMoveToTracklist={onMoveToTracklist}
                      onAddSubgroupMember={onAddSubgroupMember}
                      onRemoveSubgroupMember={onRemoveSubgroupMember}
                    />
                  );
                })}
              </div>
            </DndContext>
          )
        ) : pool.length === 0 && persistedEmptyRows.length === 0 ? (
          <p className="set-empty-tracks">Pool is empty. Search above or add tracks from other tabs.</p>
        ) : sorted.length === 0 && persistedEmptyRows.length === 0 && typeof activeTab === 'number' ? (
          <p className="set-empty-tracks">No tracks in this subgroup yet.</p>
        ) : (
          <table className="set-pool-table">
            <colgroup>
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
              {poolDisplayRows.map((row) =>
                isEmptyRow(row) ? (
                  <DraggablePoolEmptyRow
                    key={row.emptyId}
                    emptyRow={row}
                    onDelete={handleDeleteEmptyRow}
                    onFillSearch={handleFillSearch}
                    dndDisabled={dndDisabled}
                    subgroups={subgroups}
                    dndIdPrefix={dndIdPrefix}
                    realPosition={persistedEmptyRows.find(r => r.id === row.persistedId)?.position ?? 0}
                  />
                ) : (
                  <DraggablePoolRow
                    key={row.id}
                    entry={row}
                    entryRank={poolRankByTrackId.get(row.track_id) ?? 0}
                    totalEntries={pool.length}
                    onRemove={onRemove}
                    onMoveToTracklist={onMoveToTracklist}
                    onReorder={onReorder}
                    dndDisabled={dndDisabled}
                    reorderDisabled={reorderDisabled}
                    subgroups={subgroups}
                    memberSubgroupIds={membershipByEntry.get(row.id) ?? new Set()}
                    onAddSubgroupMember={onAddSubgroupMember}
                    onRemoveSubgroupMember={onRemoveSubgroupMember}
                    dndIdPrefix={dndIdPrefix}
                  />
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
