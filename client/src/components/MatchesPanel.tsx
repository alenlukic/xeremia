import {
  memo,
  useState,
  useMemo,
  useRef,
  useLayoutEffect,
  useCallback,
} from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type ColumnSizingState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import type { Track, SearchSuggestion, TransitionMatch } from '../types'
import { formatScore, formatOverallScore, TRACK_DRAG_MIME } from '../utils'
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

type BucketKey = 'same_key' | 'higher_key' | 'lower_key'

const BUCKET_TABS: { key: BucketKey; label: string }[] = [
  { key: 'same_key', label: 'Same' },
  { key: 'higher_key', label: 'Higher' },
  { key: 'lower_key', label: 'Lower' },
]

const COL_SIZES: Record<string, number> = {
  overall_score: 70,
  similarity_score: 60,
  camelot_score: 60,
  bpm_score: 60,
  genre_similarity_score: 60,
  freshness_score: 60,
  energy_score: 73,
  mood_continuity_score: 60,
  instrument_similarity_score: 73,
  vocal_clash_score: 60,
}

// Sized for the half-width matches quadrant beside the track browser.
const TRACK_SIZE = 260

const SCORE_COLUMN_IDS = Object.keys(COL_SIZES)
const TOTAL_BASE = Object.values(COL_SIZES).reduce((a, b) => a + b, 0)

const col = createColumnHelper<TransitionMatch>()

const scoreColumns = [
  col.accessor('overall_score', {
    header: 'SCORE',
    size: COL_SIZES.overall_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatOverallScore(info.getValue())}</span>
    ),
  }),
  col.accessor('similarity_score', {
    header: 'Spectral',
    size: COL_SIZES.similarity_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatScore(info.getValue())}</span>
    ),
  }),
  col.accessor('camelot_score', {
    header: 'Key',
    size: COL_SIZES.camelot_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatScore(info.getValue())}</span>
    ),
  }),
  col.accessor('bpm_score', {
    header: 'BPM',
    size: COL_SIZES.bpm_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatScore(info.getValue())}</span>
    ),
  }),
  col.accessor('genre_similarity_score', {
    header: 'Genre',
    size: COL_SIZES.genre_similarity_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatScore(info.getValue())}</span>
    ),
  }),
  col.accessor('freshness_score', {
    header: 'Recency',
    size: COL_SIZES.freshness_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatScore(info.getValue())}</span>
    ),
  }),
  col.accessor('energy_score', {
    header: 'Energy (MIK)',
    size: COL_SIZES.energy_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatScore(info.getValue())}</span>
    ),
  }),
  col.accessor('mood_continuity_score', {
    header: 'Mood',
    size: COL_SIZES.mood_continuity_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatScore(info.getValue())}</span>
    ),
  }),
  col.accessor('instrument_similarity_score', {
    header: 'Instruments',
    size: COL_SIZES.instrument_similarity_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatScore(info.getValue())}</span>
    ),
  }),
  col.accessor('vocal_clash_score', {
    header: 'Vocals',
    size: COL_SIZES.vocal_clash_score,
    minSize: 50,
    cell: (info) => (
      <span className="mono">{formatScore(info.getValue())}</span>
    ),
  }),
]

interface Props {
  matchSource: Track | SearchSuggestion | null
  matches: TransitionMatch[]
  loading: boolean
  matchesError?: string | null
  tableConfig: NormalizedTableConfig
  onClearMatchSource: () => void
  onToggleColumnVisibility: (columnId: string) => void
  onReorderColumn: (draggedId: string, targetId: string) => void
  onInsertColumnAfter: (afterColumnId: string, columnId: string) => void
  onColumnWidthChange: (columnId: string, width: number) => void
  onColumnWidthFlush: (columnId: string, width: number) => void
  onViewDetail?: (match: TransitionMatch) => void
  onUseAsSource?: (candidateId: number) => void
  onAddToSet?: (candidateId: number) => void
  onAddToPool?: (candidateId: number) => void
  onAddToTracklist?: (candidateId: number) => void
}

export const MatchesPanel = memo(function MatchesPanel({
  matchSource,
  matches,
  loading,
  matchesError,
  tableConfig,
  onClearMatchSource,
  onToggleColumnVisibility,
  onReorderColumn,
  onInsertColumnAfter,
  onColumnWidthChange,
  onColumnWidthFlush,
  onViewDetail,
  onUseAsSource,
  onAddToSet,
  onAddToPool,
  onAddToTracklist,
}: Props) {
  const [bucketTab, setBucketTab] = useState<BucketKey>('same_key')
  const outerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const topScrollRef = useRef<HTMLDivElement>(null)

  const [containerWidth, setContainerWidth] = useState(0)
  const columnSizing = tableConfig.columnWidths
  const columnOrder = tableConfig.columnOrder
  const columnVisibility = tableConfig.columnVisibility
  const [sorting, setSorting] = useState<SortingState>([])
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)

  const ignoreNextScroll = useRef<'top' | 'wrapper' | null>(null)
  const hasTrack = matchSource != null
  const hiddenInactive = inactiveColumns('matches', tableConfig)
  const visibleIds = visibleColumnIds(tableConfig)
  const registryById = useMemo(
    () => new Map(TABLE_REGISTRIES.matches.map((entry) => [entry.id, entry])),
    [],
  )

  const allColumns = useMemo(() => {
    const cols = [
      col.display({
        id: 'add_to_set',
        header: 'Actions',
        size: 92,
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
                    onAddToPool(row.original.candidate_id)
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
                    onAddToTracklist(row.original.candidate_id)
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
                onAddToSet(row.original.candidate_id)
              }}
              title="Add to set"
            >
              + Set
            </button>
          ) : null,
      }),
      col.accessor('title', {
        id: 'track_title',
        header: 'Track',
        size: TRACK_SIZE,
        minSize: 100,
        cell: (info) => (
          <div className="match-track-cell">
            <PlayButton
              trackId={info.row.original.candidate_id}
              title={info.getValue()}
            />
            <button
              className="match-track-link"
              onClick={() => onUseAsSource?.(info.row.original.candidate_id)}
              title="Use as source track"
            >
              {info.getValue()}
            </button>
          </div>
        ),
      }),
      ...scoreColumns,
      col.display({
        id: 'details',
        header: 'DETAILS',
        size: 70,
        minSize: 50,
        enableSorting: false,
        cell: (info) => (
          <div className="match-actions-cell">
            <button
              className="match-detail-btn"
              onClick={(e) => {
                e.stopPropagation()
                onViewDetail?.(info.row.original)
              }}
              title="View match detail"
              aria-label={`View match detail for ${info.row.original.title}`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 7v4M8 5h.01"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ),
      }),
    ]

    return cols
  }, [onViewDetail, onUseAsSource, onAddToSet, onAddToPool, onAddToTracklist])

  const fullColumnOrder = columnOrder

  const bucketCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const bt of BUCKET_TABS) {
      counts[bt.key] = 0
    }
    for (const m of matches) {
      if (m.bucket in counts) {
        counts[m.bucket]++
      }
    }
    return counts
  }, [matches])

  const bucketMatches = useMemo(
    () => matches.filter((m) => m.bucket === bucketTab),
    [matches, bucketTab],
  )

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
  }, [hasTrack])

  const responsiveSizing = useMemo(() => {
    if (containerWidth <= 0) {
      return {}
    }
    const scoreSpace = Math.max(TOTAL_BASE, containerWidth - (TRACK_SIZE + 160))
    const scale = Math.max(1, scoreSpace / TOTAL_BASE)
    const sizing: ColumnSizingState = {}
    SCORE_COLUMN_IDS.forEach((id) => {
      sizing[id] = COL_SIZES[id] * scale
    })
    return sizing
  }, [containerWidth])

  const effectiveSizing = useMemo(() => {
    if (Object.keys(columnSizing).length > 0) {
      return columnSizing
    }
    return responsiveSizing
  }, [columnSizing, responsiveSizing])

  const handleColumnSizingChange = useCallback(
    (updater: Updater<ColumnSizingState>) => {
      const base = columnSizing
      const next = typeof updater === 'function' ? updater(base) : updater
      for (const [id, width] of Object.entries(next)) {
        if (base[id] !== width) {
          onColumnWidthChange(id, width)
        }
      }
    },
    [columnSizing, onColumnWidthChange],
  )

  // @tanstack/react-table is not yet annotated for the React Compiler, so the
  // compiler skips optimization here (informational; not a code defect).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: bucketMatches,
    columns: allColumns,
    state: {
      columnSizing: effectiveSizing,
      columnOrder: fullColumnOrder,
      columnVisibility,
      sorting,
    },
    columnResizeMode: 'onChange',
    onColumnSizingChange: handleColumnSizingChange,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const totalWidth = table.getTotalSize()
  const isOverflowing = containerWidth > 0 && totalWidth > containerWidth

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
    if (ignoreNextScroll.current === 'wrapper') {
      ignoreNextScroll.current = null
      return
    }
    if (topScrollRef.current && wrapperRef.current) {
      ignoreNextScroll.current = 'top'
      topScrollRef.current.scrollLeft = wrapperRef.current.scrollLeft
    }
  }, [])

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

  if (!matchSource) {
    return (
      <div className="matches-panel">
        <p className="matches-empty">Select a track to see matches</p>
      </div>
    )
  }

  if (visibleIds.length === 0) {
    return (
      <div className="matches-panel">
        <div className="matches-header-compact">
          <div className="bucket-tabs">
            {BUCKET_TABS.map((bt) => (
              <button
                key={bt.key}
                className={`bucket-tab${bucketTab === bt.key ? ' active' : ''}`}
                onClick={() => setBucketTab(bt.key)}
              >
                {bt.label}
                <span className="bucket-count">{bucketCounts[bt.key]}</span>
              </button>
            ))}
            <span className="matches-source-title">{matchSource.title}</span>
            <button
              type="button"
              className="matches-clear-btn"
              aria-label="Clear matches"
              title="Clear matches"
              onClick={onClearMatchSource}
            >
              ×
            </button>
          </div>
        </div>
        <TableColumnEmptyRecovery
          inactiveColumns={hiddenInactive}
          onInsert={(columnId) => onInsertColumnAfter('add_to_set', columnId)}
        />
      </div>
    )
  }

  return (
    <div className="matches-panel">
      <div className="matches-header-compact">
        <div className="bucket-tabs">
          {BUCKET_TABS.map((bt) => (
            <button
              key={bt.key}
              className={`bucket-tab${bucketTab === bt.key ? ' active' : ''}`}
              onClick={() => setBucketTab(bt.key)}
            >
              {bt.label}
              <span className="bucket-count">{bucketCounts[bt.key]}</span>
            </button>
          ))}
          <span className="matches-source-title">{matchSource.title}</span>
          <button
            type="button"
            className="matches-clear-btn"
            aria-label="Clear matches"
            title="Clear matches"
            onClick={onClearMatchSource}
          >
            ×
          </button>
        </div>
      </div>
      <div className="track-table-outer" ref={outerRef}>
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
          onScroll={isOverflowing ? handleWrapperScroll : undefined}
        >
          <table
            className="matches-table"
            style={containerWidth > 0 ? { width: totalWidth } : undefined}
          >
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort()
                    const sorted = header.column.getIsSorted()
                    const isDetails = header.column.id === 'details'
                    return (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className={
                          draggedColumn === header.column.id
                            ? 'th-dragging'
                            : ''
                        }
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, header.column.id)}
                        title={
                          isDetails
                            ? 'Click the icon to view detailed match breakdown'
                            : undefined
                        }
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
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </TableColumnControls>
                          {sorted && (
                            <span className="sort-indicator">
                              {sorted === 'asc' ? ' ▲' : ' ▼'}
                            </span>
                          )}
                        </div>
                        {header.column.getCanResize() && (
                          <div
                            className={`col-resizer${header.column.getIsResizing() ? ' col-resizer--active' : ''}`}
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            onMouseUp={() => {
                              if (header.column.getIsResizing()) {
                                onColumnWidthFlush(
                                  header.column.id,
                                  header.getSize(),
                                )
                              }
                            }}
                          />
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading && bucketMatches.length === 0 ? (
                <tr>
                  <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className="table-status"
                  >
                    Loading matches…
                  </td>
                </tr>
              ) : matchesError ? (
                <tr>
                  <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className="table-status table-status--error"
                  >
                    Failed to load matches — {matchesError}
                  </td>
                </tr>
              ) : bucketMatches.length === 0 ? (
                <tr>
                  <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className="table-status"
                  >
                    No matches in this bucket
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        TRACK_DRAG_MIME,
                        String(row.original.candidate_id),
                      )
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    style={loading ? { opacity: 0.6 } : undefined}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
})
