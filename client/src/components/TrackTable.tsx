import {
  memo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
} from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type ColumnSizingState,
  type OnChangeFn,
  type SortingFn,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Track, SearchSuggestion } from '../types'
import {
  formatFloat,
  formatBpm,
  displayGenre,
  dateAddedTimestamp,
  formatDateAdded,
  TRACK_DRAG_MIME,
} from '../utils'
import { PlayButton } from './PlayButton'
import {
  TableColumnControls,
  TableColumnEmptyRecovery,
} from './TableColumnControls'
import {
  TABLE_REGISTRIES,
  inactiveColumns,
  visibleColumnIds,
  type NormalizedTableConfig,
} from '../tablePreferences'
import { ColumnInsertRail } from './table/ColumnInsertRail'

const col = createColumnHelper<Track>()

// Sized for the half-width browser quadrant, matching the compact
// tracklist/pool tables it now sits beside.
const FIXED_PX = 62
const DATE_ADDED_PX = 80
const FIXED_IDS = ['camelot_code', 'key', 'bpm', 'energy', 'date_added']
const FIXED_WIDTHS: Record<string, number> = {
  camelot_code: FIXED_PX,
  key: FIXED_PX,
  bpm: FIXED_PX,
  energy: FIXED_PX,
  date_added: DATE_ADDED_PX,
}
const PLAY_COL_PX = 32
const ACTION_COL_PX = 92
const ALWAYS_VISIBLE_FIXED_PX = PLAY_COL_PX + ACTION_COL_PX
const FLEX_MINS = [220, 90, 90]
const TOTAL_FLEX = FLEX_MINS.reduce((a, b) => a + b, 0)

/**
 * Fixed-width reservation must reflect only the currently visible fixed data
 * columns (key/energy can be hidden) plus the always-present play/action
 * columns — reserving space for hidden columns, or omitting the play/action
 * columns, would leave the table narrower or wider than its container,
 * producing a stray gap or an unwanted horizontal scrollbar.
 */
function computeColWidths(
  container: number,
  visibleFixedIds: readonly string[],
): number[] {
  if (container <= 0) {
    return FIXED_IDS.map((id) => FIXED_WIDTHS[id]).concat(FLEX_MINS)
  }
  const totalVisibleFixed =
    visibleFixedIds.reduce((sum, id) => sum + FIXED_WIDTHS[id], 0) +
    ALWAYS_VISIBLE_FIXED_PX
  const flexBudget = Math.max(container - totalVisibleFixed, TOTAL_FLEX)
  return [
    ...FIXED_IDS.map((id) => FIXED_WIDTHS[id]),
    ...FLEX_MINS.map((m) => (m / TOTAL_FLEX) * flexBudget),
  ]
}

/** Fixed row height (px) assumed by the virtualizer; matches td padding+line. */
const ROW_HEIGHT = 33

const COLUMN_IDS = [...FIXED_IDS, 'title', 'label', 'genre']

// Missing/unparseable dates sort after real dates regardless of direction,
// so `desc` still surfaces relevant dates.
const sortDateAdded: SortingFn<Track> = (rowA, rowB) => {
  const a = dateAddedTimestamp(rowA.original.date_added)
  const b = dateAddedTimestamp(rowB.original.date_added)
  if (a === null && b === null) {
    return 0
  }
  if (a === null) {
    return 1
  }
  if (b === null) {
    return -1
  }
  return a - b
}

const dataColumns = [
  col.accessor('camelot_code', {
    header: 'Camelot',
    size: FIXED_PX,
    minSize: 50,
    cell: (info) => <span className="mono">{info.getValue()}</span>,
  }),
  col.accessor('key', {
    header: 'Key',
    size: FIXED_PX,
    minSize: 50,
    cell: (info) => <span className="mono">{info.getValue()}</span>,
  }),
  col.accessor('bpm', {
    header: 'BPM',
    size: FIXED_PX,
    minSize: 50,
    cell: (info) => <span className="mono">{formatBpm(info.getValue())}</span>,
  }),
  col.accessor('energy', {
    header: 'Energy',
    size: FIXED_PX,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatFloat(info.getValue())}</span>
    ),
  }),
  col.accessor('date_added', {
    header: 'Date Added',
    size: DATE_ADDED_PX,
    minSize: 70,
    sortingFn: sortDateAdded,
    cell: (info) => (
      <span className="mono">{formatDateAdded(info.getValue())}</span>
    ),
  }),
  col.accessor('title', {
    header: 'Title',
    size: FLEX_MINS[0],
    minSize: 120,
  }),
  col.accessor('label', {
    header: 'Label',
    size: FLEX_MINS[1],
    minSize: 50,
  }),
  col.accessor('genre', {
    header: 'Genre',
    size: FLEX_MINS[2],
    minSize: 50,
    cell: (info) => displayGenre(info.getValue()),
  }),
]

interface Props {
  tracks: Track[]
  loading: boolean
  selectedTrack: Track | SearchSuggestion | null
  selectTrack: (track: Track) => void
  error?: string | null
  tableConfig: NormalizedTableConfig
  onToggleColumnVisibility: (columnId: string) => void
  onReorderColumn: (draggedId: string, targetId: string) => void
  onInsertColumnAfter: (afterColumnId: string, columnId: string) => void
  onColumnWidthChange: (columnId: string, width: number) => void
  onColumnWidthFlush: (columnId: string, width: number) => void
  /** Controlled multi-tier sort. Falls back to internal state when omitted. */
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  scrollRestorationKey?: string
  onAddToSet?: (trackId: number) => void
  onAddToPool?: (trackId: number) => void
  onAddToTracklist?: (trackId: number) => void
}

export const TrackTable = memo(function TrackTable({
  tracks,
  loading,
  selectedTrack,
  selectTrack,
  error,
  tableConfig,
  onToggleColumnVisibility,
  onReorderColumn,
  onInsertColumnAfter,
  onColumnWidthFlush,
  sorting: sortingProp,
  onSortingChange: onSortingChangeProp,
  scrollRestorationKey,
  onAddToSet,
  onAddToPool,
  onAddToTracklist,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const topScrollRef = useRef<HTMLDivElement>(null)

  const [containerWidth, setContainerWidth] = useState(0)
  // Sorting is controlled by the parent when provided (design-system header +
  // control panel); otherwise TrackTable manages its own single/multi-tier sort.
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const sorting = sortingProp ?? internalSorting
  const onSortingChange = onSortingChangeProp ?? setInternalSorting
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)
  // Column widths are held locally during an active resize so the drag doesn't
  // round-trip through App state on every mousemove — which re-rendered all four
  // quadrants and made resizing crawl. The final width is flushed on mouse-up.
  const [resizingSizing, setResizingSizing] = useState<ColumnSizingState | null>(
    null,
  )

  const columnVisibility = tableConfig.columnVisibility
  const columnOrder = tableConfig.columnOrder
  const columnSizing = tableConfig.columnWidths

  const ignoreNextScroll = useRef<'top' | 'wrapper' | null>(null)
  const savedScrollTop = useRef(0)

  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) {
      return
    }
    const parent = el.parentElement
    if (!parent) {
      return
    }
    const measure = (p: Element) =>
      setContainerWidth(Math.max(0, p.clientWidth))
    measure(parent)
    const ro = new ResizeObserver(() => measure(parent))
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  const visibleFixedIds = useMemo(
    () => FIXED_IDS.filter((id) => columnVisibility?.[id] !== false),
    [columnVisibility],
  )

  const responsiveSizing = useMemo(() => {
    if (containerWidth <= 0) {
      return {}
    }
    const widths = computeColWidths(containerWidth, visibleFixedIds)
    const sizing: ColumnSizingState = {}
    COLUMN_IDS.forEach((id, i) => {
      sizing[id] = widths[i]
    })
    return sizing
  }, [containerWidth, visibleFixedIds])

  const persistedSizing = useMemo(() => {
    if (Object.keys(columnSizing).length > 0) {
      return columnSizing
    }
    return responsiveSizing
  }, [columnSizing, responsiveSizing])

  // During an active resize the live width lives in local state; otherwise the
  // persisted (App) widths drive the table.
  const effectiveSizing = resizingSizing ?? persistedSizing
  const effectiveSizingRef = useRef(effectiveSizing)
  effectiveSizingRef.current = effectiveSizing

  const hiddenInactive = inactiveColumns('search', tableConfig)
  const visibleIds = visibleColumnIds(tableConfig)
  const registryById = useMemo(
    () => new Map(TABLE_REGISTRIES.search.map((entry) => [entry.id, entry])),
    [],
  )

  const handleColumnSizingChange = useCallback(
    (updater: Updater<ColumnSizingState>) => {
      setResizingSizing((prev) => {
        const base = prev ?? effectiveSizingRef.current
        return typeof updater === 'function' ? updater(base) : updater
      })
    },
    [],
  )

  const addToSetColumn = useMemo(
    () =>
      col.display({
        id: 'add_to_set',
        header: 'Actions',
        size: ACTION_COL_PX,
        minSize: 60,
        enableSorting: false,
        cell: ({ row }) =>
          onAddToPool || onAddToTracklist ? (
            <div className="set-dual-actions">
              {onAddToPool && (
                <button
                  className="match-action-btn match-action-btn--small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddToPool(row.original.id)
                  }}
                  title="Add to Pool"
                >
                  + Pool
                </button>
              )}
              {onAddToTracklist && (
                <button
                  className="match-action-btn match-action-btn--small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddToTracklist(row.original.id)
                  }}
                  title="Add to Tracklist"
                >
                  + TL
                </button>
              )}
            </div>
          ) : onAddToSet ? (
            <button
              className="match-action-btn"
              onClick={(e) => {
                e.stopPropagation()
                onAddToSet(row.original.id)
              }}
              title="Add to set"
            >
              + Set
            </button>
          ) : null,
      }),
    [onAddToSet, onAddToPool, onAddToTracklist],
  )

  const playColumn = useMemo(
    () =>
      col.display({
        id: 'play',
        header: '',
        size: PLAY_COL_PX,
        minSize: 28,
        enableSorting: false,
        cell: ({ row }) => (
          <PlayButton trackId={row.original.id} title={row.original.title} />
        ),
      }),
    [],
  )

  const allColumns = useMemo(
    () => [playColumn, ...dataColumns, addToSetColumn],
    [playColumn, addToSetColumn],
  )

  const fullColumnOrder = columnOrder

  // @tanstack/react-table is not yet annotated for the React Compiler, so the
  // compiler skips optimization here (informational; not a code defect).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: tracks,
    columns: allColumns,
    state: {
      columnSizing: effectiveSizing,
      columnOrder: fullColumnOrder,
      columnVisibility: columnVisibility ?? {},
      sorting,
    },
    columnResizeMode: 'onChange',
    enableMultiSort: true,
    onColumnSizingChange: handleColumnSizingChange,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // When a resize ends (TanStack clears its resizing marker), persist the final
  // widths to App and release the local override. Keying off the table's own
  // resize state — rather than the resizer's onMouseUp — flushes reliably even
  // when the pointer is released away from the 4px handle.
  const isResizing = table.getState().columnSizingInfo.isResizingColumn
  useEffect(() => {
    if (isResizing || !resizingSizing) {
      return
    }
    for (const [id, width] of Object.entries(resizingSizing)) {
      if (persistedSizing[id] !== width) {
        onColumnWidthFlush(id, width)
      }
    }
    setResizingSizing(null)
  }, [isResizing, resizingSizing, persistedSizing, onColumnWidthFlush])

  const totalWidth = table.getTotalSize()
  const isOverflowing = containerWidth > 0 && totalWidth > containerWidth
  const isUnderflowing = containerWidth > 0 && totalWidth < containerWidth

  const rows = table.getRowModel().rows

  // Row virtualization: only the visible window of rows is mounted. With the
  // full collection loaded (thousands of rows), rendering every row made any
  // re-render of this table (column resize, selection changes) block the main
  // thread for seconds.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => wrapperRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const virtualTotal = rowVirtualizer.getTotalSize()
  const padTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const padBottom =
    virtualRows.length > 0
      ? virtualTotal - virtualRows[virtualRows.length - 1].end
      : 0

  useLayoutEffect(() => {
    if (!selectedTrack && wrapperRef.current) {
      wrapperRef.current.scrollTop = savedScrollTop.current
    }
  }, [selectedTrack, tracks, sorting, scrollRestorationKey])

  const handleTopScroll = useCallback(() => {
    if (ignoreNextScroll.current === 'top') {
      ignoreNextScroll.current = null
      return
    }
    if (wrapperRef.current && topScrollRef.current) {
      ignoreNextScroll.current = 'wrapper'
      wrapperRef.current.scrollLeft = topScrollRef.current.scrollLeft
    }
  }, [])

  const handleWrapperScroll = useCallback(() => {
    const wrapper = wrapperRef.current
    if (wrapper && !selectedTrack) {
      const maxScrollTop = Math.max(
        0,
        wrapper.scrollHeight - wrapper.clientHeight,
      )
      const wasClamped =
        wrapper.scrollTop < savedScrollTop.current &&
        wrapper.scrollTop >= maxScrollTop &&
        savedScrollTop.current > maxScrollTop
      if (!wasClamped) {
        savedScrollTop.current = wrapper.scrollTop
      }
    }
    if (ignoreNextScroll.current === 'wrapper') {
      ignoreNextScroll.current = null
      return
    }
    if (topScrollRef.current && wrapper) {
      ignoreNextScroll.current = 'top'
      topScrollRef.current.scrollLeft = wrapper.scrollLeft
    }
  }, [selectedTrack])

  const handleDragStart = useCallback(
    (e: React.DragEvent, columnId: string) => {
      setDraggedColumn(columnId)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', columnId)
    },
    [],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Track-row drags are not droppable on column headers.
    if (e.dataTransfer?.types?.includes(TRACK_DRAG_MIME)) {
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
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

  const handleDragEnd = useCallback(() => {
    setDraggedColumn(null)
  }, [])

  if (visibleIds.length === 0) {
    return (
      <div className="track-table-outer">
        <TableColumnEmptyRecovery
          inactiveColumns={hiddenInactive}
          onInsert={(columnId) => onInsertColumnAfter('add_to_set', columnId)}
        />
      </div>
    )
  }

  return (
    <div className="track-table-outer" ref={outerRef}>
      <ColumnInsertRail
        inactiveColumns={hiddenInactive}
        onInsert={(columnId) => onInsertColumnAfter('add_to_set', columnId)}
      />
      {isOverflowing && (
        <div
          className="track-table-top-scrollbar"
          ref={topScrollRef}
          onScroll={handleTopScroll}
        >
          <div style={{ width: totalWidth, height: 1 }} />
        </div>
      )}
      <div
        className="track-table-wrapper"
        ref={wrapperRef}
        onScroll={handleWrapperScroll}
      >
        <table
          className="track-table"
          style={
            containerWidth > 0
              ? {
                  width: totalWidth,
                  margin: isUnderflowing ? '0 auto' : undefined,
                }
              : undefined
          }
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const sortIndex = header.column.getSortIndex()
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={
                        draggedColumn === header.column.id ? 'th-dragging' : ''
                      }
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, header.column.id)}
                    >
                      <div
                        className={`th-content${canSort ? ' th-sortable' : ''}`}
                        draggable
                        onDragStart={(e) =>
                          handleDragStart(e, header.column.id)
                        }
                        onDragEnd={handleDragEnd}
                        onClick={
                          canSort
                            ? header.column.getToggleSortingHandler()
                            : undefined
                        }
                      >
                        {header.column.id === 'play' ? (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        ) : (
                          <TableColumnControls
                            label={
                              registryById.get(header.column.id)?.label ??
                              String(header.column.columnDef.header ?? '')
                            }
                            inactiveColumns={hiddenInactive}
                            onRemove={() =>
                              onToggleColumnVisibility(header.column.id)
                            }
                            onInsertAfter={(columnId) =>
                              onInsertColumnAfter(header.column.id, columnId)
                            }
                            hideInsert
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </TableColumnControls>
                        )}
                        {sorted && (
                          <span className="sort-indicator">
                            {sorted === 'asc' ? ' ▲' : ' ▼'}
                            {sorting.length > 1 && (
                              <span className="sort-tier-index">
                                {sortIndex + 1}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {header.column.getCanResize() && (
                        <div
                          className={`col-resizer${header.column.getIsResizing() ? ' col-resizer--active' : ''}`}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                        />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="table-status"
                >
                  Loading tracks…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="table-status table-status--error"
                >
                  Failed to load tracks — {error}
                </td>
              </tr>
            ) : tracks.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="table-status"
                >
                  No tracks found
                </td>
              </tr>
            ) : (
              <>
                {padTop > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      style={{ height: padTop, padding: 0, border: 'none' }}
                    />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index]
                  const isSelected = selectedTrack?.id === row.original.id
                  const rowClass = [
                    virtualRow.index % 2 === 1 ? 'row-alt' : '',
                    isSelected ? 'row-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <tr
                      key={row.id}
                      className={rowClass}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          TRACK_DRAG_MIME,
                          String(row.original.id),
                        )
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => selectTrack(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {padBottom > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      style={{ height: padBottom, padding: 0, border: 'none' }}
                    />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
})
