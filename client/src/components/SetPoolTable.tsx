import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  createContext,
  useContext,
} from 'react'
import {
  DndContext,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { createPortal } from 'react-dom'
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
import { TableFilterAddButton, TableFilterPills } from './table/TableFilterBar'
import {
  isActiveFilter,
  passesColumnFilter,
  type ColumnFilter,
  type FilterableColumn,
  type FilterMap,
} from './table/tableFilter'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import { useColumnResizeGuard } from '../hooks/useColumnResizeGuard'

const POOL_COL_CLASS: Record<string, string> = {
  play: 'set-ws-col-play',
  num: 'set-ws-col-num',
  title: 'set-ws-col-title',
  key: 'set-ws-col-key',
  bpm: 'set-ws-col-bpm',
  subgroups: 'set-ws-col-subgroups',
}

const POOL_HEADER_LABEL: Record<string, string> = {
  num: '#',
  title: 'Title',
  key: 'Key',
  bpm: 'BPM',
  subgroups: 'Groups',
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

/** Camelot codes present in the pool, ascending — the Key filter's choices. */
function poolKeyOptions(pool: PoolEntry[]): string[] {
  const seen = new Set<string>()
  for (const e of pool) {
    if (e.track?.camelot_code) {
      seen.add(e.track.camelot_code)
    }
  }
  return [...seen].sort()
}

type SubgroupDropSource = 'browse' | 'tracklist' | 'pool'

function trackDropSource(types: readonly string[]): SubgroupDropSource | null {
  if (types.includes(TRACK_DRAG_MIME)) {
    return 'browse'
  }
  if (types.includes(TRACKLIST_ROW_MIME)) {
    return 'tracklist'
  }
  if (types.includes(POOL_ROW_MIME)) {
    return 'pool'
  }
  return null
}

function trackDropMime(source: SubgroupDropSource): string {
  switch (source) {
    case 'browse':
      return TRACK_DRAG_MIME
    case 'tracklist':
      return TRACKLIST_ROW_MIME
    case 'pool':
      return POOL_ROW_MIME
  }
}

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
  onReorder: (trackId: number, newPosition: number) => void
  onSetHighlight: (trackId: number, color: string | null) => void
  onAddTrack: (trackId: number, title?: string) => void
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>
  onRenameSubgroup: (subgroupId: number, name: string) => Promise<boolean>
  onDeleteSubgroup: (subgroupId: number) => Promise<boolean>
  onReorderSubgroups: (subgroupIds: number[]) => Promise<boolean>
  onAddSubgroupMember: SubgroupMemberAction
  onRemoveSubgroupMember: SubgroupMemberAction
  onDropFromTracklist: (trackId: number) => void
  onDropTrackToSubgroup: (
    subgroupId: number,
    trackId: number,
    source: SubgroupDropSource,
  ) => void
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

function namesMatchExact(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}

/**
 * Notion-style multi-select cell for pool groups.
 *
 * Closed: blank when empty, selected pills when filled. Clicking the cell
 * (empty or filled) opens the same popup — filter input, checklist, and
 * conditional "Create new group". The filter lives in the popup only; it is
 * never shown side-by-side with the selected values in the cell.
 */
function SubgroupCell({
  entry,
  subgroups,
  colorByIndex,
  memberSubgroupIds,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
  onCreateSubgroup,
}: {
  entry: PoolEntry
  subgroups: PoolSubgroup[]
  colorByIndex: Map<number, string>
  memberSubgroupIds: Set<number>
  onAddSubgroupMember: SubgroupMemberAction
  onRemoveSubgroupMember: SubgroupMemberAction
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const openMenu = useCallback(() => {
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useDismissOnOutsideClick(ref, open, close)
  useEffect(() => {
    if (!open) {
      return
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, close])

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

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    if (!q) {
      return subgroups
    }
    return subgroups.filter((sg) => sg.name.toLocaleLowerCase().includes(q))
  }, [subgroups, query])

  const hasExactMatch = useMemo(
    () =>
      query.trim().length > 0 &&
      subgroups.some((sg) => namesMatchExact(sg.name, query)),
    [subgroups, query],
  )

  // Create is offered when the filter is empty, or when the typed name is not
  // an exact match for an existing group (even if partial matches remain).
  const showCreate = open && (query.trim().length === 0 || !hasExactMatch)

  const handleCreate = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed || creating) {
      return
    }
    setCreating(true)
    try {
      const created = await onCreateSubgroup(trimmed)
      if (created) {
        await onAddSubgroupMember(created.id, entry.id)
      }
      setQuery('')
      inputRef.current?.focus()
    } finally {
      setCreating(false)
    }
  }, [query, creating, onCreateSubgroup, onAddSubgroupMember, entry.id])

  const members = subgroups.filter((sg) => memberSubgroupIds.has(sg.id))
  const trackLabel = entry.track?.title ?? 'track'

  return (
    <div className="subgroup-cell" ref={ref}>
      <button
        type="button"
        className={`subgroup-cell-trigger${members.length === 0 ? ' subgroup-cell-trigger--empty' : ''}`}
        aria-label={`Assign groups for ${trackLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close()
          } else {
            openMenu()
          }
        }}
      >
        {members.length > 0 && (
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
        )}
      </button>
      {open && (
        <div
          className="subgroup-modal"
          role="listbox"
          aria-label={`Assign groups for ${trackLabel}`}
        >
          <input
            ref={inputRef}
            className="subgroup-assign-input"
            type="text"
            value={query}
            aria-label={`Filter or create groups for ${trackLabel}`}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && showCreate && query.trim()) {
                e.preventDefault()
                void handleCreate()
              }
              e.stopPropagation()
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {subgroups.length > 0 &&
            filtered.map((sg) => {
              const active = memberSubgroupIds.has(sg.id)
              return (
                <button
                  key={sg.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`subgroup-modal-item${active ? ' active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
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
          {subgroups.length > 0 && filtered.length === 0 && (
            <div className="subgroup-modal-empty">No matching groups</div>
          )}
          {showCreate && (
            <button
              type="button"
              className="subgroup-modal-create"
              disabled={creating || query.trim().length === 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void handleCreate()}
            >
              {query.trim()
                ? `Create new group “${query.trim()}”`
                : 'Create new group'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Default custom color offered before any highlight exists (terracotta). */
const DEFAULT_HIGHLIGHT = '#e2725b'

/**
 * Preset highlight swatches — the same 8-color palette the group dots cycle
 * (`--dot-1..8`), kept in sync here as concrete hex so the stored value and the
 * quick-pick swatches share one vocabulary.
 */
const PRESET_HIGHLIGHTS = [
  '#6c8cff',
  '#43a047',
  '#e0a53a',
  '#d9534f',
  '#b06cff',
  '#38b2ac',
  '#ec6ea8',
  '#7f8c99',
]

interface PoolHighlightContextValue {
  /** Distinct highlight colors already used in this set's pool. */
  usedColors: string[]
  onSetHighlight: (trackId: number, color: string | null) => void
}

const PoolHighlightContext = createContext<PoolHighlightContextValue | null>(
  null,
)

/**
 * Right-click highlight palette for a pool row — a single-step swatch grid (like
 * Notion / Docs highlight pickers): a "None" tile to clear, the preset palette
 * plus any colors already used in this set, and a rainbow "custom" tile that
 * opens the native OS color picker directly. Rendered fixed at the cursor;
 * dismisses on outside click / Escape.
 */
function HighlightPalette({
  x,
  y,
  current,
  usedColors,
  onPick,
  onClear,
  onClose,
}: {
  x: number
  y: number
  current: string | null
  usedColors: string[]
  onPick: (color: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDismissOnOutsideClick(ref, true, onClose)
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  // Preset palette first, then any set-used colors not already covered.
  const swatches = [
    ...PRESET_HIGHLIGHTS,
    ...usedColors.filter((c) => !PRESET_HIGHLIGHTS.includes(c)),
  ]
  const isCustom = current != null && !swatches.includes(current)

  return (
    <div
      ref={ref}
      className="pool-highlight-palette"
      style={{ top: y, left: x }}
      role="menu"
      aria-label="Highlight track"
    >
      <div className="pool-highlight-grid">
        <button
          type="button"
          role="menuitemradio"
          aria-checked={current == null}
          className={`pool-highlight-tile pool-highlight-tile--none${current == null ? ' selected' : ''}`}
          title="No highlight"
          aria-label="No highlight"
          onClick={onClear}
        />
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            role="menuitemradio"
            aria-checked={c === current}
            className={`pool-highlight-tile${c === current ? ' selected' : ''}`}
            style={{ background: c }}
            title={c}
            aria-label={`Highlight ${c}`}
            onClick={() => onPick(c)}
          />
        ))}
        <label
          className={`pool-highlight-tile pool-highlight-tile--custom${isCustom ? ' selected' : ''}`}
          title="Custom color"
          style={isCustom ? { background: current } : undefined}
        >
          <input
            type="color"
            aria-label="Custom highlight color"
            value={current ?? DEFAULT_HIGHLIGHT}
            onChange={(e) => onPick(e.target.value)}
          />
        </label>
      </div>
    </div>
  )
}

function PoolRow({
  entry,
  visibleColumnIds: columnIds,
  onRemove,
  subgroups,
  colorByIndex,
  memberSubgroupIds,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
  onCreateSubgroup,
  reorder,
}: {
  entry: PoolEntry
  visibleColumnIds: string[]
  onRemove: (trackId: number) => void
  subgroups: PoolSubgroup[]
  colorByIndex: Map<number, string>
  memberSubgroupIds: Set<number>
  onAddSubgroupMember: SubgroupMemberAction
  onRemoveSubgroupMember: SubgroupMemberAction
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>
  reorder?: RowReorderProps
}) {
  const title = displayTitle(entry.track, entry.track_id)
  const highlight = useContext(PoolHighlightContext)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

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
            {entry.highlight_color && (
              <span
                className="pool-highlight-bar"
                style={{ background: entry.highlight_color }}
                aria-hidden="true"
              />
            )}
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
              onCreateSubgroup={onCreateSubgroup}
            />
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
      onContextMenu={
        highlight
          ? (e) => {
              e.preventDefault()
              setMenuPos({ x: e.clientX, y: e.clientY })
            }
          : undefined
      }
    >
      <td className="set-ws-cell-remove">
        <button
          type="button"
          className="set-row-remove-btn"
          aria-label="Remove from pool"
          title="Remove from pool"
          onClick={() => onRemove(entry.track_id)}
        >
          ×
        </button>
      </td>
      {columnIds.map((colId) => renderCell(colId))}
      {highlight &&
        menuPos &&
        createPortal(
          <HighlightPalette
            x={menuPos.x}
            y={menuPos.y}
            current={entry.highlight_color}
            usedColors={highlight.usedColors}
            onPick={(color) => {
              highlight.onSetHighlight(entry.track_id, color)
              setMenuPos(null)
            }}
            onClear={() => {
              highlight.onSetHighlight(entry.track_id, null)
              setMenuPos(null)
            }}
            onClose={() => setMenuPos(null)}
          />,
          document.body,
        )}
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
  const { onResizeStart, shouldIgnoreSortClick } = useColumnResizeGuard()
  const colStyle = (id: string) =>
    colWidths?.[id] != null ? { width: colWidths[id] } : undefined

  const resizer = (id: string) =>
    beginResize ? (
      <div
        className="col-resizer"
        onMouseDown={(e) => {
          onResizeStart()
          beginResize(id, e)
        }}
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
    const thClass = sortable ? 'set-ws-th set-ws-th-sortable' : 'set-ws-th'

    if (colId === 'play') {
      return (
        <th key={colId} className={thClass}>
          <div className="th-content th-content--play">Pre.</div>
        </th>
      )
    }

    return (
      <th
        key={colId}
        aria-label={registry?.label ?? label}
        className={`${thClass}${draggedColumn === colId ? ' th-dragging' : ''}`}
        onDragOver={onColumnDragOver}
        onDrop={(e) => onColumnDrop(e, colId)}
        onClick={
          sortable
            ? (e: React.MouseEvent) => {
                if (shouldIgnoreSortClick()) {
                  return
                }
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
          </TableColumnControls>
          {sortCol ? sortIndicator(sortCol) : null}
        </div>
        {resizable ? resizer(colId) : null}
      </th>
    )
  }

  return (
    <>
      <colgroup>
        <col className="set-ws-col-remove" />
        {columnIds.map((colId) => (
          <col
            key={colId}
            className={POOL_COL_CLASS[colId]}
            style={colStyle(colId)}
          />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="set-ws-th set-ws-th-remove" aria-label="Remove" />
          {columnIds.map((colId) => renderHeaderCell(colId))}
        </tr>
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
  onDropTrackToSubgroup,
  trackDropSubgroupId,
  onTrackDropSubgroupChange,
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
  onDropTrackToSubgroup: (
    subgroupId: number,
    trackId: number,
    source: SubgroupDropSource,
  ) => void
  trackDropSubgroupId: number | null
  onTrackDropSubgroupChange: (subgroupId: number | null) => void
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
    <div
      className="pool-tab-bar"
      role="tablist"
      aria-orientation="vertical"
      aria-label="Pool view"
    >
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
              : '') +
            (trackDropSubgroupId === sg.id
              ? ' pool-tab-wrapper--track-drop-target'
              : '')
          }
          draggable={editingId !== sg.id}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', sg.name)
            e.dataTransfer.effectAllowed = 'move'
            setTabDragIndex(idx)
          }}
          onDragOver={(e) => {
            const source = trackDropSource(e.dataTransfer?.types ?? [])
            if (source) {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = source === 'browse' ? 'copy' : 'move'
              onTrackDropSubgroupChange(sg.id)
              return
            }
            if (tabDragIndex === null) {
              return
            }
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setTabDropIndex(idx)
          }}
          onDragLeave={(e) => {
            if (trackDropSource(e.dataTransfer?.types ?? [])) {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                onTrackDropSubgroupChange(null)
              }
              return
            }
            setTabDropIndex((prev) => (prev === idx ? null : prev))
          }}
          onDrop={(e) => {
            const source = trackDropSource(e.dataTransfer?.types ?? [])
            if (source) {
              e.preventDefault()
              e.stopPropagation()
              onTrackDropSubgroupChange(null)
              const raw = e.dataTransfer.getData(trackDropMime(source))
              const trackId = Number(raw)
              if (raw && Number.isInteger(trackId)) {
                onDropTrackToSubgroup(sg.id, trackId, source)
              }
              return
            }
            handleTabDrop(idx, e)
          }}
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
          className="pool-tab-create"
          onClick={() => setShowNewInput(true)}
          title="Create group"
          aria-label="Create group"
        >
          Create new group
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
  onAddSubgroupMember,
  onRemoveSubgroupMember,
  onCreateSubgroup,
  visibleColumnIds: columnIds,
  poolHeadProps,
  onDropTrackToSubgroup,
  trackDropSubgroupId,
  onTrackDropSubgroupChange,
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
  onAddSubgroupMember: SubgroupMemberAction
  onRemoveSubgroupMember: SubgroupMemberAction
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>
  visibleColumnIds: string[]
  poolHeadProps: Omit<
    React.ComponentProps<typeof PoolTableHead>,
    'sorting' | 'onHeaderSort'
  >
  onDropTrackToSubgroup: (
    subgroupId: number,
    trackId: number,
    source: SubgroupDropSource,
  ) => void
  trackDropSubgroupId: number | null
  onTrackDropSubgroupChange: (subgroupId: number | null) => void
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
      className={`subgroup-section${index % 2 === 1 ? ' subgroup-section--alt' : ''}${isOver && !isDragging ? ' subgroup-section--drop-target' : ''}${trackDropSubgroupId === subgroup.id ? ' subgroup-section--track-drop-target' : ''}`}
      data-subgroup-id={subgroup.id}
      onDragOver={(e) => {
        const source = trackDropSource(e.dataTransfer?.types ?? [])
        if (!source) {
          return
        }
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = source === 'browse' ? 'copy' : 'move'
        onTrackDropSubgroupChange(subgroup.id)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onTrackDropSubgroupChange(null)
        }
      }}
      onDrop={(e) => {
        const source = trackDropSource(e.dataTransfer?.types ?? [])
        if (!source) {
          return
        }
        e.preventDefault()
        e.stopPropagation()
        onTrackDropSubgroupChange(null)
        const raw = e.dataTransfer.getData(trackDropMime(source))
        const trackId = Number(raw)
        if (raw && Number.isInteger(trackId)) {
          onDropTrackToSubgroup(subgroup.id, trackId, source)
        }
      }}
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
                  subgroups={subgroups}
                  colorByIndex={colorByIndex}
                  memberSubgroupIds={
                    membershipByEntry.get(entry.id) ?? new Set()
                  }
                  onAddSubgroupMember={onAddSubgroupMember}
                  onRemoveSubgroupMember={onRemoveSubgroupMember}
                  onCreateSubgroup={onCreateSubgroup}
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
  onReorder,
  onSetHighlight,
  onAddTrack,
  onCreateSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onReorderSubgroups,
  onAddSubgroupMember,
  onRemoveSubgroupMember,
  onDropFromTracklist,
  onDropTrackToSubgroup,
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
  const setPoolFilter = useCallback(
    (columnId: string, filter: ColumnFilter) => {
      setPoolFilters((prev) => ({ ...prev, [columnId]: filter }))
    },
    [],
  )
  const removePoolFilter = useCallback((columnId: string) => {
    setPoolFilters((prev) => {
      const next = { ...prev }
      delete next[columnId]
      return next
    })
  }, [])
  const poolFilterColumns = useMemo<FilterableColumn[]>(
    () => [
      { id: 'bpm', label: 'BPM' },
      {
        id: 'key',
        label: 'Key',
        kind: 'select',
        options: poolKeyOptions(pool),
      },
    ],
    [pool],
  )
  const bpmFilter = poolFilters.bpm
  const keyFilter = poolFilters.key
  const filterEntries = useCallback(
    (entries: PoolEntry[]) => {
      const bpmActive = isActiveFilter(bpmFilter)
      const keyActive = isActiveFilter(keyFilter)
      if (!bpmActive && !keyActive) {
        return entries
      }
      return entries.filter((e) => {
        if (bpmActive && !passesColumnFilter(e.track?.bpm ?? null, bpmFilter)) {
          return false
        }
        if (
          keyActive &&
          !passesColumnFilter(e.track?.camelot_code ?? null, keyFilter)
        ) {
          return false
        }
        return true
      })
    },
    [bpmFilter, keyFilter],
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
  // The group navigation lives in a rail pinned to the right of the table; it
  // collapses to a slim spine so the table can reclaim the width, and its
  // expanded width is drag-resizable.
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [railWidth, setRailWidth] = useState(160)
  const railResizeRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  )
  const startRailResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      railResizeRef.current = { startX: e.clientX, startWidth: railWidth }
      const onMove = (ev: MouseEvent) => {
        const s = railResizeRef.current
        if (!s) {
          return
        }
        // The rail sits on the right edge, so dragging the handle left widens it.
        const next = Math.min(
          420,
          Math.max(120, s.startWidth + (s.startX - ev.clientX)),
        )
        setRailWidth(next)
      }
      const onUp = () => {
        railResizeRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [railWidth],
  )
  const [trackDropSubgroupId, setTrackDropSubgroupId] = useState<number | null>(
    null,
  )

  // The selected subgroup tab can go stale when its group is deleted;
  // fall back to All without extra state.
  const activeTab: PoolTab =
    typeof selectedTab === 'number' &&
    !subgroups.some((sg) => sg.id === selectedTab)
      ? 'all'
      : selectedTab

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

  // Distinct highlight colors already used in this set's pool, offered as
  // quick-pick swatches in the row Highlighter menu.
  const usedHighlightColors = useMemo(() => {
    const seen = new Set<string>()
    for (const e of pool) {
      if (e.highlight_color) {
        seen.add(e.highlight_color)
      }
    }
    return [...seen]
  }, [pool])

  const highlightContext = useMemo<PoolHighlightContextValue>(
    () => ({ usedColors: usedHighlightColors, onSetHighlight }),
    [usedHighlightColors, onSetHighlight],
  )

  return (
    <PoolHighlightContext.Provider value={highlightContext}>
      <div
        className={`set-pool${dropActive ? ' set-drop-active' : ''}`}
        {...dropHandlers}
      >
        {/* Groups moved to the right rail, so the pool's active sort tiers and
          filter pills share the title row rather than a separate control-panel
          row — reclaiming the vertical space. */}
        <TableHeader
          title={`Pool (${pool.length})`}
          primary={
            <div className="set-pool-header-controls">
              {activeSortScope !== null && activeSorting.length > 0 && (
                <SortTierBar
                  sorting={activeSorting}
                  columns={POOL_SORT_COLUMNS}
                  onSortingChange={(next) =>
                    setSortingForScope(activeSortScope, next)
                  }
                  hideAddButton
                />
              )}
              {(isActiveFilter(poolFilters.bpm) ||
                isActiveFilter(poolFilters.key)) && (
                <TableFilterPills
                  columns={poolFilterColumns}
                  filters={poolFilters}
                  onFilterChange={setPoolFilter}
                  onRemove={removePoolFilter}
                />
              )}
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
                columns={poolFilterColumns}
                filters={poolFilters}
                onFilterChange={setPoolFilter}
                label="Add filter"
              />
            </div>
          }
        />
        <div className="set-pool-body">
          <div className="set-pool-content">
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
                            sortingByScope[String(sg.id)] ??
                            DEFAULT_POOL_SORTING
                          }
                          onSortingChange={(next) =>
                            setSortingForScope(String(sg.id), next)
                          }
                          index={idx}
                          onRemove={onRemove}
                          onAddSubgroupMember={onAddSubgroupMember}
                          onRemoveSubgroupMember={onRemoveSubgroupMember}
                          onCreateSubgroup={onCreateSubgroup}
                          visibleColumnIds={displayColumns}
                          poolHeadProps={poolHeadBaseProps}
                          onDropTrackToSubgroup={onDropTrackToSubgroup}
                          trackDropSubgroupId={trackDropSubgroupId}
                          onTrackDropSubgroupChange={setTrackDropSubgroupId}
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
                No tracks in this group yet. Search above to add one, or assign
                the group from the Groups column on the All tab.
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
                          subgroups={subgroups}
                          colorByIndex={subgroupColorById}
                          memberSubgroupIds={
                            membershipByEntry.get(entry.id) ?? new Set()
                          }
                          onAddSubgroupMember={onAddSubgroupMember}
                          onRemoveSubgroupMember={onRemoveSubgroupMember}
                          onCreateSubgroup={onCreateSubgroup}
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
          {railCollapsed ? (
            // Collapsed: the whole spine is the expand affordance (no chevron);
            // a hover "wibble" signals it is interactive.
            <button
              type="button"
              className="pool-group-rail pool-group-rail--collapsed"
              aria-expanded={false}
              aria-label="Expand groups"
              title="Expand groups"
              onClick={() => setRailCollapsed(false)}
            >
              <span className="pool-group-rail-spine-label">Groups</span>
            </button>
          ) : (
            <aside
              className="pool-group-rail"
              style={{ width: railWidth }}
              aria-label="Pool groups"
            >
              <div
                className="pool-group-rail-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize groups"
                onMouseDown={startRailResize}
              />
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
                onDropTrackToSubgroup={onDropTrackToSubgroup}
                trackDropSubgroupId={trackDropSubgroupId}
                onTrackDropSubgroupChange={setTrackDropSubgroupId}
              />
              <button
                type="button"
                className="pool-group-rail-toggle"
                aria-expanded
                aria-label="Collapse groups"
                title="Collapse groups"
                onClick={() => setRailCollapsed(true)}
              >
                <span className="pool-group-rail-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            </aside>
          )}
        </div>
      </div>
    </PoolHighlightContext.Provider>
  )
}
