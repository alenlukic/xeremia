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
  Track,
} from '../types'
import { TRACK_DRAG_MIME, TRACKLIST_ROW_MIME, POOL_ROW_MIME } from '../utils'
import { displayTitle } from '../utils/trackTitle'
import { useExternalTrackDrop } from '../hooks/useExternalTrackDrop'
import type { TrackDropTarget } from '../hooks/useExternalTrackDrop'
import { PlayButton } from './PlayButton'
import { SortTierBar, SortAddButton } from './SortTierBar'
import type { SortDescriptor, SortColumn } from './SortTierBar'
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
import { TableControlPanel } from './table/TableControlPanel'
import {
  TableFilterAddButton,
  TableFilterPills,
} from './table/TableFilterBar'
import {
  isActiveFilter,
  passesFilter,
  type FilterMap,
  type NumericFilter,
} from './table/tableFilter'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'

const POOL_COL_CLASS: Record<string, string> = {
  play: 'set-ws-col-play',
  num: 'set-ws-col-num',
  title: 'set-ws-col-title',
  key: 'set-ws-col-key',
  bpm: 'set-ws-col-bpm',
  subgroups: 'set-ws-col-subgroups',
  actions: 'set-ws-col-actions-pool',
}

const POOL_HEADER_LABEL: Record<string, string> = {
  num: '#',
  title: 'Title',
  key: 'Key',
  bpm: 'BPM',
  subgroups: 'Groups',
  actions: 'Actions',
}

const POOL_SORT_ID: Record<string, string> = {
  num: 'insertion_order',
  title: 'title',
  key: 'camelot_code',
  bpm: 'bpm',
}

function effectivePoolColumns(
  visibleIds: string[],
  hasSubgroups: boolean,
): string[] {
  return visibleIds.filter((id) => id !== 'subgroups' || hasSubgroups)
}

type PoolTab = 'all' | 'groups' | number

type SubgroupMemberAction = (
  subgroupId: number,
  poolEntryId: number,
) => Promise<boolean>

const POOL_SORT_COLUMNS: SortColumn[] = [
  { id: 'insertion_order', label: '#' },
  { id: 'title', label: 'Title' },
  { id: 'camelot_code', label: 'Key' },
  { id: 'bpm', label: 'BPM' },
]

const DEFAULT_POOL_SORTING: SortDescriptor[] = [
  { id: 'insertion_order', desc: false },
]

/** Filterable pool columns for the design-system Add-filter control. */
const POOL_FILTER_COLUMNS = [{ id: 'bpm', label: 'BPM' }]

/** Group-dot color for a subgroup by its stable index; cycles the 8 tokens. */
function subgroupColorVar(index: number): string {
  return `var(--dot-${(index % 8) + 1})`
}

function nextHeaderSorting(
  prev: SortDescriptor[],
  col: string,
  shiftKey: boolean,
): SortDescriptor[] {
  const existingIdx = prev.findIndex((s) => s.id === col)
  if (shiftKey) {
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
}

interface RowReorderProps {
  index: number
  isDragging: boolean
  isDropTarget: boolean
  onDragStart: (index: number) => void
  onDragOver: (index: number, e: React.DragEvent) => void
  onDragLeave: (index: number) => void
  onDrop: (index: number, e: React.DragEvent) => void
  onDragEnd: () => void
}

interface Props {
  allTracks: Track[]
  pool: PoolEntry[]
  subgroups: PoolSubgroup[]
  subgroupMemberships: PoolSubgroupMembership[]
  tableConfig: NormalizedTableConfig
  onToggleColumn: (columnId: string) => void
  onReorderColumn: (draggedId: string, targetId: string) => void
  onInsertColumnAfter: (afterColumnId: string, columnId: string) => void
  onColumnWidthChange: (columnId: string, width: number) => void
  onColumnWidthFlush: (columnId: string, width: number) => void
  onRemove: (trackId: number) => void
  onMoveToTracklist: (trackId: number) => void
  onReorder: (trackId: number, newPosition: number) => void
  onAddTrack: (trackId: number, title?: string) => void
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>
  onRenameSubgroup: (subgroupId: number, name: string) => Promise<boolean>
  onDeleteSubgroup: (subgroupId: number) => Promise<boolean>
  onReorderSubgroups: (subgroupIds: number[]) => Promise<boolean>
  onAddSubgroupMember: SubgroupMemberAction
  onRemoveSubgroupMember: SubgroupMemberAction
  onDropFromTracklist: (trackId: number) => void
}

function compareByColumn(a: PoolEntry, b: PoolEntry, col: string): number {
  switch (col) {
    case 'title':
      return (a.track?.title ?? '').localeCompare(b.track?.title ?? '')
    case 'bpm':
      return (a.track?.bpm ?? 0) - (b.track?.bpm ?? 0)
    case 'camelot_code':
      return (a.track?.camelot_code ?? '').localeCompare(
        b.track?.camelot_code ?? '',
      )
    default:
      return a.insertion_order - b.insertion_order
  }
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

function groupMembershipIds(
  memberships: PoolSubgroupMembership[],
  key: (m: PoolSubgroupMembership) => number,
  value: (m: PoolSubgroupMembership) => number,
): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>()

  for (const m of memberships) {
    let ids = map.get(key(m))
    if (!ids) {
      ids = new Set()
      map.set(key(m), ids)
    }
    ids.add(value(m))
  }

  return map
}

/**
 * Groups cell: shows only the groups the track is actually in, each with a
 * colored dot, plus a "+" that opens a multi-select modal to toggle membership
 * across all groups (replacing the old always-expanded chip list).
 */
function SubgroupCell({
  entry,
  subgroups,
  colorByIndex,
  memberSubgroupIds,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
}: {
  entry: PoolEntry
  subgroups: PoolSubgroup[]
  colorByIndex: Map<number, string>
  memberSubgroupIds: Set<number>
  onAddSubgroupMember: SubgroupMemberAction
  onRemoveSubgroupMember: SubgroupMemberAction
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismissOnOutsideClick(ref, open, () => setOpen(false))
  useEffect(() => {
    if (!open) {
      return
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open])

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

  const members = subgroups.filter((sg) => memberSubgroupIds.has(sg.id))

  return (
    <div className="subgroup-cell" ref={ref}>
      <div className="subgroup-dots">
        {members.map((sg) => (
          <span key={sg.id} className="subgroup-dot-pill" title={sg.name}>
            <span
              className="subgroup-dot"
              style={{ background: colorByIndex.get(sg.id) }}
              aria-hidden="true"
            />
            <span className="subgroup-dot-name">{sg.name}</span>
          </span>
        ))}
      </div>
      {subgroups.length > 0 && (
        <button
          className="subgroup-add-inline"
          aria-label="Edit groups"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          +
        </button>
      )}
      {open && (
        <div
          className="subgroup-modal"
          role="menu"
          aria-label={`Assign groups for ${entry.track?.title ?? 'track'}`}
        >
          {subgroups.map((sg) => {
            const active = memberSubgroupIds.has(sg.id)
            return (
              <button
                key={sg.id}
                role="menuitemcheckbox"
                aria-checked={active}
                className={`subgroup-modal-item${active ? ' active' : ''}`}
                onClick={() => handleToggle(sg.id)}
              >
                <span
                  className="subgroup-dot"
                  style={{ background: colorByIndex.get(sg.id) }}
                  aria-hidden="true"
                />
                <span className="subgroup-modal-name">{sg.name}</span>
                {active && (
                  <span className="subgroup-modal-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PoolRow({
  entry,
  visibleColumnIds: columnIds,
  onRemove,
  onMoveToTracklist,
  subgroups,
  colorByIndex,
  memberSubgroupIds,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
  reorder,
}: {
  entry: PoolEntry
  visibleColumnIds: string[]
  onRemove: (trackId: number) => void
  onMoveToTracklist: (trackId: number) => void
  subgroups: PoolSubgroup[]
  colorByIndex: Map<number, string>
  memberSubgroupIds: Set<number>
  onAddSubgroupMember: SubgroupMemberAction
  onRemoveSubgroupMember: SubgroupMemberAction
  reorder?: RowReorderProps
}) {
  const title = displayTitle(entry.track, entry.track_id)

  const renderCell = (colId: string) => {
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
            {entry.insertion_order + 1}
          </td>
        )
      case 'title':
        return (
          <td key={colId} className="set-ws-cell-title">
            {title}
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
      case 'subgroups':
        return (
          <td key={colId} className="set-ws-cell-subgroups">
            <SubgroupCell
              entry={entry}
              subgroups={subgroups}
              colorByIndex={colorByIndex}
              memberSubgroupIds={memberSubgroupIds}
              onAddSubgroupMember={onAddSubgroupMember}
              onRemoveSubgroupMember={onRemoveSubgroupMember}
            />
          </td>
        )
      case 'actions':
        return (
          <td key={colId} className="set-ws-cell-actions">
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
        )
      default:
        return null
    }
  }

  return (
    <tr
      draggable
      className={
        reorder
          ? (reorder.isDragging ? 'set-row-dragging' : '') +
            (reorder.isDropTarget ? ' set-row-drop-target' : '')
          : undefined
      }
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(entry.track_id))
        e.dataTransfer.setData(POOL_ROW_MIME, String(entry.track_id))
        e.dataTransfer.effectAllowed = 'move'
        if (reorder) {
          reorder.onDragStart(reorder.index)
        }
      }}
      onDragOver={
        reorder ? (e) => reorder.onDragOver(reorder.index, e) : undefined
      }
      onDragLeave={
        reorder ? () => reorder.onDragLeave(reorder.index) : undefined
      }
      onDrop={reorder ? (e) => reorder.onDrop(reorder.index, e) : undefined}
      onDragEnd={reorder ? () => reorder.onDragEnd() : undefined}
    >
      {columnIds.map((colId) => renderCell(colId))}
    </tr>
  )
}

function PoolTableHead({
  visibleColumnIds: columnIds,
  sorting,
  onHeaderSort,
  colWidths,
  beginResize,
  registryById,
  draggedColumn,
  onToggleColumn,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
  onColumnDragEnd,
}: {
  visibleColumnIds: string[]
  sorting?: SortDescriptor[]
  onHeaderSort?: (col: string, e: React.MouseEvent) => void
  colWidths?: Record<string, number>
  beginResize?: (colId: string, e: React.MouseEvent) => void
  registryById: Map<string, import('../tablePreferences').ColumnRegistryEntry>
  draggedColumn: string | null
  onToggleColumn: (columnId: string) => void
  onColumnDragStart: (e: React.DragEvent, columnId: string) => void
  onColumnDragOver: (e: React.DragEvent) => void
  onColumnDrop: (e: React.DragEvent, targetId: string) => void
  onColumnDragEnd: () => void
}) {
  const colStyle = (id: string) =>
    colWidths?.[id] != null ? { width: colWidths[id] } : undefined

  const resizer = (id: string) =>
    beginResize ? (
      <div
        className="col-resizer"
        onMouseDown={(e) => beginResize(id, e)}
        onClick={(e) => e.stopPropagation()}
      />
    ) : null
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

  const renderHeaderCell = (colId: string) => {
    const label = POOL_HEADER_LABEL[colId] ?? colId
    const registry = registryById.get(colId)
    const resizable = registry?.resizable !== false
    const sortCol = POOL_SORT_ID[colId]
    const sortable = sortCol != null && onHeaderSort != null
    const thClass =
      colId === 'actions'
        ? 'set-ws-th set-ws-th-actions'
        : sortable
          ? 'set-ws-th set-ws-th-sortable'
          : 'set-ws-th'

    if (colId === 'play') {
      return <th key={colId} className={thClass} />
    }

    return (
      <th
        key={colId}
        className={`${thClass}${draggedColumn === colId ? ' th-dragging' : ''}`}
        onDragOver={onColumnDragOver}
        onDrop={(e) => onColumnDrop(e, colId)}
        onClick={
          sortable
            ? (e: React.MouseEvent) => {
                const target = e.target as HTMLElement
                if (
                  target.closest('.table-col-remove') ||
                  target.closest('.table-col-insert-btn') ||
                  target.closest('.table-col-insert-menu')
                ) {
                  return
                }
                onHeaderSort(sortCol, e)
              }
            : undefined
        }
      >
        <div
          className={`th-content${sortable ? ' th-sortable' : ''}`}
          draggable
          onDragStart={(e) => onColumnDragStart(e, colId)}
          onDragEnd={onColumnDragEnd}
        >
          <TableColumnControls
            label={registry?.label ?? label}
            onRemove={() => onToggleColumn(colId)}
          >
            {label}
            {sortCol ? sortIndicator(sortCol) : null}
          </TableColumnControls>
        </div>
        {resizable ? resizer(colId) : null}
      </th>
    )
  }

  return (
    <>
      <colgroup>
        {columnIds.map((colId) => (
          <col
            key={colId}
            className={POOL_COL_CLASS[colId]}
            style={colStyle(colId)}
          />
        ))}
      </colgroup>
      <thead>
        <tr>{columnIds.map((colId) => renderHeaderCell(colId))}</tr>
      </thead>
    </>
  )
}

function PoolTabBar({
  subgroups,
  colorByIndex,
  memberCounts,
  onCreateSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onReorderSubgroups,
  activeTab,
  onTabChange,
}: {
  subgroups: PoolSubgroup[]
  colorByIndex: Map<number, string>
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
  const [tabDragIndex, setTabDragIndex] = useState<number | null>(null)
  const [tabDropIndex, setTabDropIndex] = useState<number | null>(null)

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

  const handleTabDrop = useCallback(
    (index: number, e: React.DragEvent) => {
      if (tabDragIndex === null) {
        return
      }
      e.preventDefault()
      if (tabDragIndex !== index) {
        const ids = subgroups.map((sg) => sg.id)
        const [moved] = ids.splice(tabDragIndex, 1)
        ids.splice(index, 0, moved)
        onReorderSubgroups(ids)
      }
      setTabDragIndex(null)
      setTabDropIndex(null)
    },
    [tabDragIndex, subgroups, onReorderSubgroups],
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
        <div
          key={sg.id}
          className={
            'pool-tab-wrapper' +
            (tabDragIndex === idx ? ' pool-tab-wrapper--dragging' : '') +
            (tabDropIndex === idx &&
            tabDragIndex !== null &&
            tabDragIndex !== idx
              ? ' pool-tab-wrapper--drop-target'
              : '')
          }
          draggable={editingId !== sg.id}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', sg.name)
            e.dataTransfer.effectAllowed = 'move'
            setTabDragIndex(idx)
          }}
          onDragOver={(e) => {
            if (tabDragIndex === null) {
              return
            }
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setTabDropIndex(idx)
          }}
          onDragLeave={() => {
            setTabDropIndex((prev) => (prev === idx ? null : prev))
          }}
          onDrop={(e) => handleTabDrop(idx, e)}
          onDragEnd={() => {
            setTabDragIndex(null)
            setTabDropIndex(null)
          }}
        >
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
              <span
                className="subgroup-dot pool-tab-dot"
                style={{ background: colorByIndex.get(sg.id) }}
                aria-hidden="true"
              />
              {sg.name}
              <span className="pool-tab-count">
                {memberCounts.get(sg.id) ?? 0}
              </span>
            </button>
          )}
          <div className="pool-tab-controls">
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
  colorByIndex,
  membershipByEntry,
  sorting,
  onSortingChange,
  index,
  onRemove,
  onMoveToTracklist,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
  visibleColumnIds: columnIds,
  poolHeadProps,
}: {
  subgroup: PoolSubgroup
  entries: PoolEntry[]
  subgroups: PoolSubgroup[]
  colorByIndex: Map<number, string>
  membershipByEntry: Map<number, Set<number>>
  sorting: SortDescriptor[]
  onSortingChange: (next: SortDescriptor[]) => void
  index: number
  onRemove: (trackId: number) => void
  onMoveToTracklist: (trackId: number) => void
  onAddSubgroupMember: SubgroupMemberAction
  onRemoveSubgroupMember: SubgroupMemberAction
  visibleColumnIds: string[]
  poolHeadProps: Omit<
    React.ComponentProps<typeof PoolTableHead>,
    'sorting' | 'onHeaderSort'
  >
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `section-${subgroup.id}`,
    // dnd-kit's types don't admit undefined here, but passing it is the only
    // way to suppress the default role="button"/tabIndex on the header, which
    // would otherwise hijack keyboard focus for a mouse-only drag affordance.
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
        <>
          <SortTierBar
            sorting={sorting}
            columns={POOL_SORT_COLUMNS}
            onSortingChange={onSortingChange}
          />
          <table className="set-pool-table">
            <PoolTableHead
              {...poolHeadProps}
              sorting={sorting}
              onHeaderSort={(col, e) =>
                onSortingChange(nextHeaderSorting(sorting, col, e.shiftKey))
              }
            />
            <tbody>
              {sorted.map((entry) => (
                <PoolRow
                  key={entry.id}
                  entry={entry}
                  visibleColumnIds={columnIds}
                  onRemove={onRemove}
                  onMoveToTracklist={onMoveToTracklist}
                  subgroups={subgroups}
                  colorByIndex={colorByIndex}
                  memberSubgroupIds={
                    membershipByEntry.get(entry.id) ?? new Set()
                  }
                  onAddSubgroupMember={onAddSubgroupMember}
                  onRemoveSubgroupMember={onRemoveSubgroupMember}
                />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

export function SetPoolTable({
  allTracks,
  pool,
  subgroups,
  subgroupMemberships,
  tableConfig,
  onToggleColumn,
  onReorderColumn,
  onColumnWidthFlush,
  onRemove,
  onMoveToTracklist,
  onReorder,
  onAddTrack,
  onCreateSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onReorderSubgroups,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
  onDropFromTracklist,
}: Props) {
  const poolColWidths = tableConfig.columnWidths
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)
  // Live width for the column being resized. Kept local so a drag re-renders
  // only the pool table, not the whole App (which re-rendered every quadrant on
  // each mousemove). Flushed to App on mouse-up.
  const [liveResize, setLiveResize] = useState<{
    id: string
    width: number
  } | null>(null)
  const effectivePoolColWidths = useMemo(
    () =>
      liveResize
        ? { ...poolColWidths, [liveResize.id]: liveResize.width }
        : poolColWidths,
    [poolColWidths, liveResize],
  )
  const visibleIds = useMemo(() => visibleColumnIds(tableConfig), [tableConfig])
  const registryById = useMemo(
    () => new Map(TABLE_REGISTRIES.pool.map((entry) => [entry.id, entry])),
    [],
  )
  const displayColumns = useMemo(
    () => effectivePoolColumns(visibleIds, subgroups.length > 0),
    [visibleIds, subgroups.length],
  )
  // Stable dot color per subgroup (shared by the tabs and the Groups cell).
  const subgroupColorById = useMemo(() => {
    const m = new Map<number, string>()
    subgroups.forEach((sg, i) => m.set(sg.id, subgroupColorVar(i)))
    return m
  }, [subgroups])

  // Numeric column filters (design-system Add filter), applied on top of the
  // active tab/scope. Keyed by column id (currently BPM).
  const [poolFilters, setPoolFilters] = useState<FilterMap>({})
  const setPoolFilter = useCallback((columnId: string, filter: NumericFilter) => {
    setPoolFilters((prev) => ({ ...prev, [columnId]: filter }))
  }, [])
  const removePoolFilter = useCallback((columnId: string) => {
    setPoolFilters((prev) => {
      const next = { ...prev }
      delete next[columnId]
      return next
    })
  }, [])
  const bpmFilter = poolFilters.bpm
  const filterEntries = useCallback(
    (entries: PoolEntry[]) => {
      if (!isActiveFilter(bpmFilter)) {
        return entries
      }
      return entries.filter((e) =>
        passesFilter(e.track?.bpm ?? null, bpmFilter),
      )
    },
    [bpmFilter],
  )

  const handleColumnDragStart = useCallback(
    (e: React.DragEvent, columnId: string) => {
      setDraggedColumn(columnId)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', columnId)
    },
    [],
  )

  const handleColumnDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer?.types ?? []
    if (
      types.includes(TRACK_DRAG_MIME) ||
      types.includes(TRACKLIST_ROW_MIME) ||
      types.includes(POOL_ROW_MIME)
    ) {
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleColumnDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault()
      const draggedId = e.dataTransfer.getData('text/plain')
      if (!draggedId || draggedId === targetId) {
        setDraggedColumn(null)
        return
      }
      onReorderColumn(draggedId, targetId)
      setDraggedColumn(null)
    },
    [onReorderColumn],
  )

  const handleColumnDragEnd = useCallback(() => {
    setDraggedColumn(null)
  }, [])

  const beginPoolColResize = useCallback(
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

  const poolHeadBaseProps = useMemo(
    () => ({
      visibleColumnIds: displayColumns,
      colWidths: effectivePoolColWidths,
      beginResize: beginPoolColResize,
      registryById,
      draggedColumn,
      onToggleColumn,
      onColumnDragStart: handleColumnDragStart,
      onColumnDragOver: handleColumnDragOver,
      onColumnDrop: handleColumnDrop,
      onColumnDragEnd: handleColumnDragEnd,
    }),
    [
      displayColumns,
      effectivePoolColWidths,
      registryById,
      draggedColumn,
      onToggleColumn,
      handleColumnDragStart,
      handleColumnDragOver,
      handleColumnDrop,
      handleColumnDragEnd,
      beginPoolColResize,
    ],
  )
  // Sort tiers are scoped per view: the All tab has its own, and each
  // subgroup's tab and Groups-view section share one. Keyed by 'all' or the
  // subgroup id; unset scopes fall back to the persisted pool order.
  const [sortingByScope, setSortingByScope] = useState<
    Record<string, SortDescriptor[]>
  >({})
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

  const membershipByEntry = useMemo(
    () =>
      groupMembershipIds(
        subgroupMemberships,
        (m) => m.pool_entry_id,
        (m) => m.subgroup_id,
      ),
    [subgroupMemberships],
  )

  const memberEntriesBySubgroup = useMemo(
    () =>
      groupMembershipIds(
        subgroupMemberships,
        (m) => m.subgroup_id,
        (m) => m.pool_entry_id,
      ),
    [subgroupMemberships],
  )

  const memberCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const [sgId, entries] of memberEntriesBySubgroup) {
      map.set(sgId, entries.size)
    }
    return map
  }, [memberEntriesBySubgroup])

  // The Groups view has no single sort scope of its own — each section
  // manages its subgroup's scope directly.
  const activeSortScope = activeTab === 'groups' ? null : String(activeTab)
  const activeSorting =
    activeSortScope === null
      ? DEFAULT_POOL_SORTING
      : (sortingByScope[activeSortScope] ?? DEFAULT_POOL_SORTING)

  const setSortingForScope = useCallback(
    (scope: string, next: SortDescriptor[]) => {
      setSortingByScope((prev) => ({ ...prev, [scope]: next }))
    },
    [],
  )

  const handleHeaderSort = useCallback(
    (col: string, e: React.MouseEvent) => {
      if (activeSortScope === null) {
        return
      }
      setSortingByScope((prev) => ({
        ...prev,
        [activeSortScope]: nextHeaderSorting(
          prev[activeSortScope] ?? DEFAULT_POOL_SORTING,
          col,
          e.shiftKey,
        ),
      }))
    },
    [activeSortScope],
  )

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
    const base =
      activeTab === 'all' || activeTab === 'groups'
        ? pool
        : (() => {
            const entryIds = memberEntriesBySubgroup.get(activeTab)
            return entryIds ? pool.filter((e) => entryIds.has(e.id)) : []
          })()
    return filterEntries(base)
  }, [pool, activeTab, memberEntriesBySubgroup, filterEntries])

  const sorted = useMemo(
    () => sortEntries(filteredPool, activeSorting),
    [filteredPool, activeSorting],
  )

  // Row drag reordering only makes sense when rows follow the persisted pool
  // order (# ascending). Subgroup tabs show a filtered subset in that same
  // order, so drops there map to the target row's position in the full pool.
  const rowReorderEnabled =
    activeTab !== 'groups' &&
    activeSorting.length === 1 &&
    activeSorting[0].id === 'insertion_order' &&
    !activeSorting[0].desc
  const poolByOrder = useMemo(
    () => [...pool].sort((a, b) => a.insertion_order - b.insertion_order),
    [pool],
  )
  const [rowDragIndex, setRowDragIndex] = useState<number | null>(null)
  const [rowDropIndex, setRowDropIndex] = useState<number | null>(null)

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
      {
        mime: TRACKLIST_ROW_MIME,
        onDropTrack: onDropFromTracklist,
        dropEffect: 'move',
      },
    ],
    [handleExternalDrop, onDropFromTracklist],
  )
  const { dropActive, dropHandlers } = useExternalTrackDrop(dropTargets)

  const handleRowDragStart = useCallback((index: number) => {
    setRowDragIndex(index)
  }, [])

  const handleRowDragOver = useCallback(
    (index: number, e: React.DragEvent) => {
      if (rowDragIndex === null) {
        return
      }
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setRowDropIndex(index)
    },
    [rowDragIndex],
  )

  const handleRowDragLeave = useCallback((index: number) => {
    setRowDropIndex((prev) => (prev === index ? null : prev))
  }, [])

  const handleRowDrop = useCallback(
    (index: number, e: React.DragEvent) => {
      if (rowDragIndex === null) {
        return
      }
      e.preventDefault()
      if (rowDragIndex !== index) {
        // The backend takes the target's dense rank in the full pool; on a
        // filtered subgroup tab the row index is not that rank.
        const target = sorted[index]
        const newPosition = poolByOrder.findIndex((p) => p.id === target.id)
        onReorder(sorted[rowDragIndex].track_id, newPosition)
      }
      setRowDragIndex(null)
      setRowDropIndex(null)
    },
    [rowDragIndex, sorted, poolByOrder, onReorder],
  )

  const handleRowDragEnd = useCallback(() => {
    setRowDragIndex(null)
    setRowDropIndex(null)
  }, [])

  return (
    <div
      className={`set-pool${dropActive ? ' set-drop-active' : ''}`}
      {...dropHandlers}
    >
      <TableHeader
        title={`Pool (${pool.length})`}
        primary={
          <>
            <div className="set-pool-header-tabs">
              <PoolTabBar
                subgroups={subgroups}
                colorByIndex={subgroupColorById}
                memberCounts={memberCounts}
                onCreateSubgroup={onCreateSubgroup}
                onRenameSubgroup={onRenameSubgroup}
                onDeleteSubgroup={onDeleteSubgroup}
                onReorderSubgroups={onReorderSubgroups}
                activeTab={activeTab}
                onTabChange={setSelectedTab}
              />
            </div>
            {activeSortScope !== null && (
              <SortAddButton
                sorting={activeSorting}
                columns={POOL_SORT_COLUMNS}
                onSortingChange={(next) =>
                  setSortingForScope(activeSortScope, next)
                }
                label="Add sort"
                className="ds-header-btn"
              />
            )}
            <TableFilterAddButton
              columns={POOL_FILTER_COLUMNS}
              filters={poolFilters}
              onFilterChange={setPoolFilter}
              label="Add filter"
            />
          </>
        }
      />
      <TableControlPanel>
        {activeSortScope !== null && (
          <SortTierBar
            sorting={activeSorting}
            columns={POOL_SORT_COLUMNS}
            onSortingChange={(next) => setSortingForScope(activeSortScope, next)}
            hideAddButton
          />
        )}
        {isActiveFilter(poolFilters.bpm) && (
          <TableFilterPills
            columns={POOL_FILTER_COLUMNS}
            filters={poolFilters}
            onFilterChange={setPoolFilter}
            onRemove={removePoolFilter}
          />
        )}
      </TableControlPanel>
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
                const entries = filterEntries(
                  entryIds ? pool.filter((e) => entryIds.has(e.id)) : [],
                )
                return (
                  <SubgroupSection
                    key={sg.id}
                    subgroup={sg}
                    entries={entries}
                    subgroups={subgroups}
                    colorByIndex={subgroupColorById}
                    membershipByEntry={membershipByEntry}
                    sorting={
                      sortingByScope[String(sg.id)] ?? DEFAULT_POOL_SORTING
                    }
                    onSortingChange={(next) =>
                      setSortingForScope(String(sg.id), next)
                    }
                    index={idx}
                    onRemove={onRemove}
                    onMoveToTracklist={onMoveToTracklist}
                    onAddSubgroupMember={onAddSubgroupMember}
                    onRemoveSubgroupMember={onRemoveSubgroupMember}
                    visibleColumnIds={displayColumns}
                    poolHeadProps={poolHeadBaseProps}
                  />
                )
              })}
            </div>
          </DndContext>
        )
      ) : pool.length === 0 ? (
        <p className="set-empty-tracks">
          Pool is empty. Drag tracks from the Search table above.
        </p>
      ) : sorted.length === 0 && typeof activeTab === 'number' ? (
        <p className="set-empty-tracks">
          No tracks in this group yet. Search above to add one, or use the + in
          the Groups column on the All tab.
        </p>
      ) : displayColumns.length === 0 ? (
        <TableColumnEmptyRecovery />
      ) : (
        <div className="track-table-outer">
          <div className="track-table-wrapper">
            <table className="set-pool-table">
              <PoolTableHead
                {...poolHeadBaseProps}
                sorting={activeSorting}
                onHeaderSort={handleHeaderSort}
              />
              <tbody>
                {sorted.map((entry, i) => (
                  <PoolRow
                    key={entry.id}
                    entry={entry}
                    visibleColumnIds={displayColumns}
                    onRemove={onRemove}
                    onMoveToTracklist={onMoveToTracklist}
                    subgroups={subgroups}
                    colorByIndex={subgroupColorById}
                    memberSubgroupIds={
                      membershipByEntry.get(entry.id) ?? new Set()
                    }
                    onAddSubgroupMember={onAddSubgroupMember}
                    onRemoveSubgroupMember={onRemoveSubgroupMember}
                    reorder={
                  rowReorderEnabled
                    ? {
                        index: i,
                        isDragging: rowDragIndex === i,
                        isDropTarget:
                          rowDropIndex === i &&
                          rowDragIndex !== null &&
                          rowDragIndex !== i,
                        onDragStart: handleRowDragStart,
                        onDragOver: handleRowDragOver,
                        onDragLeave: handleRowDragLeave,
                        onDrop: handleRowDrop,
                        onDragEnd: handleRowDragEnd,
                      }
                    : undefined
                }
              />
            ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
