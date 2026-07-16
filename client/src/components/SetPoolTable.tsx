import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import type {
  PoolEntry,
  PoolSubgroup,
  PoolSubgroupMembership,
  SearchSuggestion,
} from '../types'
import { cleanTitle } from '../utils/trackTitle'
import { searchTracks } from '../api/http'
import { PlayButton } from './PlayButton'
import { SortTierBar } from './SortTierBar'
import type { SortDescriptor, SortColumn } from './SortTierBar'

type PoolTab = 'all' | 'groups' | number

const POOL_SORT_COLUMNS: SortColumn[] = [
  { id: 'insertion_order', label: '#' },
  { id: 'title', label: 'Title' },
  { id: 'camelot_code', label: 'Key' },
  { id: 'bpm', label: 'BPM' },
]

interface Props {
  pool: PoolEntry[]
  subgroups: PoolSubgroup[]
  subgroupMemberships: PoolSubgroupMembership[]
  onRemove: (trackId: number) => void
  onMoveToTracklist: (trackId: number) => void
  onAddTrack: (trackId: number, title?: string) => void
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>
  onRenameSubgroup: (subgroupId: number, name: string) => Promise<boolean>
  onDeleteSubgroup: (subgroupId: number) => Promise<boolean>
  onReorderSubgroups: (subgroupIds: number[]) => Promise<boolean>
  onAddSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
  onRemoveSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
}

function compareByColumn(a: PoolEntry, b: PoolEntry, col: string): number {
  if (col === 'title') {
    return (a.track?.title ?? '').localeCompare(b.track?.title ?? '')
  }
  if (col === 'bpm') {
    return (a.track?.bpm ?? 0) - (b.track?.bpm ?? 0)
  }
  if (col === 'camelot_code') {
    return (a.track?.camelot_code ?? '').localeCompare(
      b.track?.camelot_code ?? '',
    )
  }
  return a.insertion_order - b.insertion_order
}

function sortEntries(
  entries: PoolEntry[],
  sorting: SortDescriptor[],
): PoolEntry[] {
  return [...entries].sort((a, b) => {
    for (const s of sorting) {
      const cmp = compareByColumn(a, b, s.id)
      if (cmp !== 0) {
        return s.desc ? -cmp : cmp
      }
    }
    return 0
  })
}

function SubgroupChips({
  entry,
  subgroups,
  memberSubgroupIds,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
}: {
  entry: PoolEntry
  subgroups: PoolSubgroup[]
  memberSubgroupIds: Set<number>
  onAddSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
  onRemoveSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
}) {
  const handleToggle = useCallback(
    (sgId: number) => {
      if (memberSubgroupIds.has(sgId)) {
        onRemoveSubgroupMember(sgId, entry.id)
      } else {
        onAddSubgroupMember(sgId, entry.id)
      }
    },
    [memberSubgroupIds, entry.id, onAddSubgroupMember, onRemoveSubgroupMember],
  )

  return (
    <div className="subgroup-chips">
      {subgroups.map((sg) => (
        <button
          key={sg.id}
          className={`subgroup-chip${memberSubgroupIds.has(sg.id) ? ' active' : ''}`}
          onClick={() => handleToggle(sg.id)}
          title={
            memberSubgroupIds.has(sg.id)
              ? `Remove from ${sg.name}`
              : `Add to ${sg.name}`
          }
        >
          {sg.name}
        </button>
      ))}
    </div>
  )
}

function PoolRow({
  entry,
  onRemove,
  onMoveToTracklist,
  subgroups,
  memberSubgroupIds,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
}: {
  entry: PoolEntry
  onRemove: (trackId: number) => void
  onMoveToTracklist: (trackId: number) => void
  subgroups: PoolSubgroup[]
  memberSubgroupIds: Set<number>
  onAddSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
  onRemoveSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
}) {
  const title = cleanTitle(entry.track, entry.track_id)

  return (
    <tr
      draggable
      onDragStart={(e) =>
        e.dataTransfer.setData('text/plain', String(entry.track_id))
      }
    >
      <td className="set-ws-cell-play">
        <PlayButton trackId={entry.track_id} title={entry.track?.title ?? ''} />
      </td>
      <td className="mono set-ws-cell-num">{entry.insertion_order + 1}</td>
      <td className="set-ws-cell-title">{title}</td>
      <td className="mono set-ws-cell-key">
        {entry.track?.camelot_code ?? '—'}
      </td>
      <td className="mono set-ws-cell-bpm">
        {entry.track?.bpm != null ? Math.round(entry.track.bpm) : '—'}
      </td>
      {subgroups.length > 0 && (
        <td className="set-ws-cell-subgroups">
          <SubgroupChips
            entry={entry}
            subgroups={subgroups}
            memberSubgroupIds={memberSubgroupIds}
            onAddSubgroupMember={onAddSubgroupMember}
            onRemoveSubgroupMember={onRemoveSubgroupMember}
          />
        </td>
      )}
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
  )
}

function PoolTableHead({
  subgroups,
  sorting,
  onHeaderSort,
}: {
  subgroups: PoolSubgroup[]
  sorting?: SortDescriptor[]
  onHeaderSort?: (col: string, e: React.MouseEvent) => void
}) {
  const sortIndicator = (col: string) => {
    if (!sorting) {
      return null
    }
    const idx = sorting.findIndex((s) => s.id === col)
    if (idx < 0) {
      return null
    }
    const arrow = sorting[idx].desc ? ' ▼' : ' ▲'
    if (sorting.length > 1) {
      return (
        <span className="sort-indicator">
          <span className="sort-precedence">{idx + 1}</span>
          {arrow}
        </span>
      )
    }
    return <span className="sort-indicator">{arrow}</span>
  }

  const sortableProps = (col: string) =>
    onHeaderSort
      ? {
          className: 'set-ws-th set-ws-th-sortable',
          onClick: (e: React.MouseEvent) => onHeaderSort(col, e),
        }
      : { className: 'set-ws-th' }

  return (
    <>
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
          <th className="set-ws-th"></th>
          <th {...sortableProps('insertion_order')}>
            #{sortIndicator('insertion_order')}
          </th>
          <th {...sortableProps('title')}>Title{sortIndicator('title')}</th>
          <th {...sortableProps('camelot_code')}>
            Key{sortIndicator('camelot_code')}
          </th>
          <th {...sortableProps('bpm')}>BPM{sortIndicator('bpm')}</th>
          {subgroups.length > 0 && <th className="set-ws-th">Groups</th>}
          <th className="set-ws-th set-ws-th-actions">Actions</th>
        </tr>
      </thead>
    </>
  )
}

function PoolTabBar({
  subgroups,
  memberCounts,
  onCreateSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onReorderSubgroups,
  activeTab,
  onTabChange,
}: {
  subgroups: PoolSubgroup[]
  memberCounts: Map<number, number>
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>
  onRenameSubgroup: (subgroupId: number, name: string) => Promise<boolean>
  onDeleteSubgroup: (subgroupId: number) => Promise<boolean>
  onReorderSubgroups: (subgroupIds: number[]) => Promise<boolean>
  activeTab: PoolTab
  onTabChange: (tab: PoolTab) => void
}) {
  const [showNewInput, setShowNewInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      return
    }
    await onCreateSubgroup(trimmed)
    setNewName('')
    setShowNewInput(false)
  }, [newName, onCreateSubgroup])

  const handleRename = useCallback(
    async (id: number) => {
      const trimmed = editName.trim()
      if (!trimmed) {
        setEditingId(null)
        setEditName('')
        return
      }
      await onRenameSubgroup(id, trimmed)
      setEditingId(null)
      setEditName('')
    },
    [editName, onRenameSubgroup],
  )

  const handleMoveLeft = useCallback(
    (idx: number) => {
      if (idx <= 0) {
        return
      }
      const ids = subgroups.map((sg) => sg.id)
      ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
      onReorderSubgroups(ids)
    },
    [subgroups, onReorderSubgroups],
  )

  const handleMoveRight = useCallback(
    (idx: number) => {
      if (idx >= subgroups.length - 1) {
        return
      }
      const ids = subgroups.map((sg) => sg.id)
      ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
      onReorderSubgroups(ids)
    },
    [subgroups, onReorderSubgroups],
  )

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
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleRename(sg.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRename(sg.id)
                }
                if (e.key === 'Escape') {
                  setEditingId(null)
                  setEditName('')
                }
              }}
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
            />
          ) : (
            <button
              role="tab"
              className={`pool-tab${activeTab === sg.id ? ' pool-tab--active' : ''}`}
              aria-selected={activeTab === sg.id}
              onClick={() => onTabChange(sg.id)}
              onDoubleClick={() => {
                setEditingId(sg.id)
                setEditName(sg.name)
              }}
              title={`View ${sg.name} (double-click to rename)`}
            >
              {sg.name}
              <span className="pool-tab-count">
                {memberCounts.get(sg.id) ?? 0}
              </span>
            </button>
          )}
          <div className="pool-tab-controls">
            {idx > 0 && (
              <button
                className="subgroup-ctrl-btn"
                onClick={() => handleMoveLeft(idx)}
                title="Move left"
                aria-label={`Move ${sg.name} left`}
              >
                ‹
              </button>
            )}
            {idx < subgroups.length - 1 && (
              <button
                className="subgroup-ctrl-btn"
                onClick={() => handleMoveRight(idx)}
                title="Move right"
                aria-label={`Move ${sg.name} right`}
              >
                ›
              </button>
            )}
            <button
              className="subgroup-ctrl-btn subgroup-ctrl-btn--danger"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete group "${sg.name}"? Tracks will remain in the pool.`,
                  )
                ) {
                  onDeleteSubgroup(sg.id)
                  if (activeTab === sg.id) {
                    onTabChange('all')
                  }
                }
              }}
              title={`Delete ${sg.name}`}
              aria-label={`Delete group ${sg.name}`}
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
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreate()
              }
              if (e.key === 'Escape') {
                setShowNewInput(false)
                setNewName('')
              }
            }}
            autoFocus
          />
          <button
            className="subgroup-ctrl-btn"
            onClick={handleCreate}
            title="Create group"
          >
            ✓
          </button>
          <button
            className="subgroup-ctrl-btn"
            onClick={() => {
              setShowNewInput(false)
              setNewName('')
            }}
          >
            ✕
          </button>
        </span>
      ) : (
        <button
          className="subgroup-add-btn"
          onClick={() => setShowNewInput(true)}
          title="Create group"
          aria-label="Create group"
        >
          +
        </button>
      )}
    </div>
  )
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
  subgroup: PoolSubgroup
  entries: PoolEntry[]
  subgroups: PoolSubgroup[]
  membershipByEntry: Map<number, Set<number>>
  sorting: SortDescriptor[]
  index: number
  onRemove: (trackId: number) => void
  onMoveToTracklist: (trackId: number) => void
  onAddSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
  onRemoveSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `section-${subgroup.id}`,
    attributes: {
      role: undefined as unknown as string,
      tabIndex: undefined as unknown as number,
    },
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `section-${subgroup.id}`,
  })

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )

  const sorted = useMemo(
    () => sortEntries(entries, sorting),
    [entries, sorting],
  )

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={ref}
      style={style}
      className={`subgroup-section${index % 2 === 1 ? ' subgroup-section--alt' : ''}${isOver && !isDragging ? ' subgroup-section--drop-target' : ''}`}
      data-subgroup-id={subgroup.id}
    >
      <div className="subgroup-section-header" {...attributes} {...listeners}>
        <span className="subgroup-section-drag-handle" aria-hidden="true">
          ⠿
        </span>
        <h4 className="subgroup-section-title">{subgroup.name}</h4>
        <span className="subgroup-section-count">
          {entries.length} track{entries.length !== 1 ? 's' : ''}
        </span>
      </div>
      {sorted.length === 0 ? (
        <p className="set-empty-tracks">No tracks in {subgroup.name}.</p>
      ) : (
        <table className="set-pool-table">
          <PoolTableHead subgroups={subgroups} />
          <tbody>
            {sorted.map((entry) => (
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
  )
}

export function SetPoolTable({
  pool,
  subgroups,
  subgroupMemberships,
  onRemove,
  onMoveToTracklist,
  onAddTrack,
  onCreateSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onReorderSubgroups,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [sorting, setSorting] = useState<SortDescriptor[]>([
    { id: 'insertion_order', desc: false },
  ])
  const [selectedTab, setSelectedTab] = useState<PoolTab>('all')
  const pendingSubgroupAssign = useRef<{
    trackId: number
    subgroupId: number
  } | null>(null)

  // The selected subgroup tab can go stale when its group is deleted;
  // fall back to All without extra state.
  const activeTab: PoolTab =
    typeof selectedTab === 'number' &&
    !subgroups.some((sg) => sg.id === selectedTab)
      ? 'all'
      : selectedTab

  // When a track was added from a subgroup tab, assign it to that subgroup
  // as soon as its pool entry appears in the hydrated state.
  useEffect(() => {
    const pending = pendingSubgroupAssign.current
    if (!pending) {
      return
    }
    const entry = pool.find((e) => e.track_id === pending.trackId)
    if (entry) {
      pendingSubgroupAssign.current = null
      onAddSubgroupMember(pending.subgroupId, entry.id)
    }
  }, [pool, onAddSubgroupMember])

  const membershipByEntry = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const m of subgroupMemberships) {
      let s = map.get(m.pool_entry_id)
      if (!s) {
        s = new Set()
        map.set(m.pool_entry_id, s)
      }
      s.add(m.subgroup_id)
    }
    return map
  }, [subgroupMemberships])

  const memberEntriesBySubgroup = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const m of subgroupMemberships) {
      let s = map.get(m.subgroup_id)
      if (!s) {
        s = new Set()
        map.set(m.subgroup_id, s)
      }
      s.add(m.pool_entry_id)
    }
    return map
  }, [subgroupMemberships])

  const memberCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const [sgId, entries] of memberEntriesBySubgroup) {
      map.set(sgId, entries.size)
    }
    return map
  }, [memberEntriesBySubgroup])

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q)
    if (!q.trim()) {
      setSearchResults([])
      setShowSearch(false)
      return
    }
    try {
      const results = await searchTracks(q)
      setSearchResults(results)
      setShowSearch(results.length > 0)
    } catch {
      /* ignore */
    }
  }, [])

  const handleSearchSelect = useCallback(
    (s: SearchSuggestion) => {
      if (typeof activeTab === 'number') {
        pendingSubgroupAssign.current = {
          trackId: s.id,
          subgroupId: activeTab,
        }
      }
      onAddTrack(s.id, s.title)
      setSearchQuery('')
      setSearchResults([])
      setShowSearch(false)
    },
    [onAddTrack, activeTab],
  )

  const handleHeaderSort = useCallback((col: string, e: React.MouseEvent) => {
    setSorting((prev) => {
      const existingIdx = prev.findIndex((s) => s.id === col)
      if (e.shiftKey) {
        const next = [...prev]
        if (existingIdx >= 0) {
          next[existingIdx] = { id: col, desc: !next[existingIdx].desc }
        } else {
          next.push({ id: col, desc: false })
        }
        return next
      }
      if (existingIdx >= 0 && prev.length === 1) {
        return [{ id: col, desc: !prev[existingIdx].desc }]
      }
      return [{ id: col, desc: false }]
    })
  }, [])

  const handleSectionDragEnd = useCallback(
    (event: {
      active: { id: string | number }
      over: { id: string | number } | null
    }) => {
      const { active, over } = event
      if (!over || active.id === over.id) {
        return
      }
      const toNum = (v: string | number) =>
        typeof v === 'number' ? v : Number(v.replace('section-', ''))
      const activeId = toNum(active.id)
      const overId = toNum(over.id)
      const oldIndex = subgroups.findIndex((sg) => sg.id === activeId)
      const newIndex = subgroups.findIndex((sg) => sg.id === overId)
      if (oldIndex < 0 || newIndex < 0) {
        return
      }
      const ids = subgroups.map((sg) => sg.id)
      const [moved] = ids.splice(oldIndex, 1)
      ids.splice(newIndex, 0, moved)
      onReorderSubgroups(ids)
    },
    [subgroups, onReorderSubgroups],
  )

  const filteredPool = useMemo(() => {
    if (activeTab === 'all' || activeTab === 'groups') {
      return pool
    }
    const entryIds = memberEntriesBySubgroup.get(activeTab)
    if (!entryIds) {
      return []
    }
    return pool.filter((e) => entryIds.has(e.id))
  }, [pool, activeTab, memberEntriesBySubgroup])

  const sorted = useMemo(
    () => sortEntries(filteredPool, sorting),
    [filteredPool, sorting],
  )

  return (
    <div className="set-pool">
      <div className="set-pool-header">
        <h3 className="set-section-title">Pool ({pool.length})</h3>
        <div className="set-pool-search-wrapper">
          <input
            className="set-pool-search"
            placeholder={
              typeof activeTab === 'number'
                ? `Search to add to ${subgroups.find((sg) => sg.id === activeTab)?.name ?? 'group'}…`
                : 'Search to add…'
            }
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {showSearch && (
            <ul className="set-pool-search-dropdown">
              {searchResults.map((s) => (
                <li
                  key={s.id}
                  className="set-pool-search-item"
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
      <PoolTabBar
        subgroups={subgroups}
        memberCounts={memberCounts}
        onCreateSubgroup={onCreateSubgroup}
        onRenameSubgroup={onRenameSubgroup}
        onDeleteSubgroup={onDeleteSubgroup}
        onReorderSubgroups={onReorderSubgroups}
        activeTab={activeTab}
        onTabChange={setSelectedTab}
      />
      <SortTierBar
        sorting={sorting}
        columns={POOL_SORT_COLUMNS}
        onSortingChange={setSorting}
      />
      {activeTab === 'groups' ? (
        subgroups.length === 0 ? (
          <p className="set-empty-tracks">
            No groups yet. Create one using the + button above.
          </p>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <div className="subgroup-sections">
              {subgroups.map((sg, idx) => {
                const entryIds = memberEntriesBySubgroup.get(sg.id)
                const entries = entryIds
                  ? pool.filter((e) => entryIds.has(e.id))
                  : []
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
                )
              })}
            </div>
          </DndContext>
        )
      ) : pool.length === 0 ? (
        <p className="set-empty-tracks">
          Pool is empty. Search above or add tracks from other tabs.
        </p>
      ) : sorted.length === 0 && typeof activeTab === 'number' ? (
        <p className="set-empty-tracks">
          No tracks in this group yet. Search above to add one, or use the chips
          in the All tab.
        </p>
      ) : (
        <table className="set-pool-table">
          <PoolTableHead
            subgroups={subgroups}
            sorting={sorting}
            onHeaderSort={handleHeaderSort}
          />
          <tbody>
            {sorted.map((entry) => (
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
  )
}
