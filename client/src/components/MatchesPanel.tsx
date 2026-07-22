import {
  memo,
  useState,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
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
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Track, SearchSuggestion, TransitionMatch } from '../types'
import {
  formatScore,
  formatOverallScore,
  TRACK_DRAG_MIME,
  TRACKLIST_ROW_MIME,
  POOL_ROW_MIME,
} from '../utils'
import {
  useExternalTrackDrop,
  type TrackDropTarget,
} from '../hooks/useExternalTrackDrop'
import { PlayButton } from './PlayButton'
import {
  TableColumnControls,
  TableColumnEmptyRecovery,
} from './TableColumnControls'
import {
  TABLE_REGISTRIES,
  visibleColumnIds,
  type NormalizedTableConfig,
} from '../tablePreferences'
import { TableHeader } from './table/TableHeader'
import { TableControlPanel } from './table/TableControlPanel'
import { SortTierBar, SortAddButton } from './SortTierBar'
import { TableFilterAddButton, TableFilterPills } from './table/TableFilterBar'
import {
  isActiveFilter,
  passesColumnFilter,
  type ColumnFilter,
  type FilterableColumn,
  type FilterMap,
} from './table/tableFilter'
import { ToggleFilterGroup, type ToggleOption } from './table/ToggleFilterGroup'
import { normalizeScore, scoreCellStyle } from './table/scoreGradient'

type BucketKey = 'same_key' | 'higher_key' | 'lower_key'

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'same_key', label: 'Same' },
  { key: 'higher_key', label: 'Higher' },
  { key: 'lower_key', label: 'Lower' },
]

/** Columns whose cells get the red→green score background, with their scale. */
const SCORE_SCALE: Record<string, '0-1' | '0-100'> = {
  overall_score: '0-100',
  similarity_score: '0-1',
  camelot_score: '0-1',
  bpm_score: '0-1',
  genre_similarity_score: '0-1',
  freshness_score: '0-1',
  energy_score: '0-1',
  mood_continuity_score: '0-1',
  instrument_similarity_score: '0-1',
  vocal_clash_score: '0-1',
}

/** Columns that cannot be sorted (display/action columns). */
const NON_SORTABLE = new Set(['play', 'add_to_set', 'details'])

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

/** Matches share the track-table row height; drives row virtualization. */
const ROW_HEIGHT = 33

const SCORE_COLUMN_IDS = Object.keys(COL_SIZES)
const TOTAL_BASE = Object.values(COL_SIZES).reduce((a, b) => a + b, 0)

const col = createColumnHelper<TransitionMatch>()

/**
 * Filters on the candidate's own attributes rather than its compatibility
 * scores. `TransitionMatch` carries only scores, so these read through to the
 * cached collection track behind `candidate_id`.
 */
const TRACK_FILTERS = {
  track_key: { label: 'Key', kind: 'select' as const },
  track_bpm: { label: 'BPM', kind: 'numeric' as const },
  track_genre: { label: 'Genre', kind: 'select' as const },
}

type TrackFilterId = keyof typeof TRACK_FILTERS

function trackFilterValue(
  track: Track | undefined,
  id: TrackFilterId,
): string | number | null {
  if (!track) {
    return null
  }
  if (id === 'track_key') {
    return track.camelot_code ?? null
  }
  if (id === 'track_bpm') {
    return track.bpm ?? null
  }
  return track.genre ?? null
}

/** The value a numeric filter compares against — always in displayed (0–100) scale. */
function displayScore(m: TransitionMatch, id: string): number | null {
  const raw = (m as unknown as Record<string, number | null | undefined>)[id]
  if (raw == null || !Number.isFinite(raw)) {
    return null
  }
  return id === 'overall_score' ? raw : raw * 100
}

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
  /** Overrides the header title (e.g. the transition chain, which supplants the
   *  bare track name while following a chain). Falls back to the source title. */
  headerTitle?: ReactNode
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
  /** Loads the dropped track's matches (drag from browse, tracklist or pool). */
  onTrackDrop?: (trackId: number) => void
  /** Collection tracks by id — supplies the candidate attributes (key/BPM/genre)
   *  that `TransitionMatch` itself does not carry. */
  trackIndex?: Map<number, Track>
}

export const MatchesPanel = memo(function MatchesPanel({
  matchSource,
  matches,
  loading,
  matchesError,
  headerTitle,
  tableConfig,
  onClearMatchSource,
  onToggleColumnVisibility,
  onReorderColumn,
  onColumnWidthFlush,
  onViewDetail,
  onUseAsSource,
  onAddToSet,
  onAddToPool,
  onAddToTracklist,
  onTrackDrop,
  trackIndex,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const topScrollRef = useRef<HTMLDivElement>(null)

  const [containerWidth, setContainerWidth] = useState(0)
  const columnSizing = tableConfig.columnWidths
  const columnOrder = tableConfig.columnOrder
  const columnVisibility = tableConfig.columnVisibility
  const [sorting, setSorting] = useState<SortingState>([])
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)
  // Column widths live locally during an active resize so the drag doesn't
  // round-trip through App state on every mousemove (which re-rendered every
  // quadrant). The final width is flushed on mouse-up.
  const [resizingSizing, setResizingSizing] =
    useState<ColumnSizingState | null>(null)

  // Persistent Same/Higher/Lower key-relationship toggles (replace the old tabs;
  // all buckets on by default, all results live in one table).
  const [activeBuckets, setActiveBuckets] = useState<Set<string>>(
    () => new Set(BUCKETS.map((b) => b.key)),
  )
  // Active numeric column filters, keyed by column id, in displayed (0–100) scale.
  const [filters, setFilters] = useState<FilterMap>({})

  const ignoreNextScroll = useRef<'top' | 'wrapper' | null>(null)
  const hasTrack = matchSource != null
  const visibleIds = visibleColumnIds(tableConfig)
  const registryById = useMemo(
    () => new Map(TABLE_REGISTRIES.matches.map((entry) => [entry.id, entry])),
    [],
  )

  const allColumns = useMemo(() => {
    const cols = [
      col.display({
        id: 'play',
        header: 'Pre.',
        size: 40,
        minSize: 28,
        enableSorting: false,
        enableResizing: false,
        cell: ({ row }) => (
          <PlayButton
            trackId={row.original.candidate_id}
            title={row.original.title}
          />
        ),
      }),
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

  // The play ("Pre.") column is a fixed leading column (as in the other
  // quadrants), independent of the persisted/reorderable order of the rest.
  const fullColumnOrder = useMemo(
    () => ['play', ...columnOrder.filter((id) => id !== 'play')],
    [columnOrder],
  )

  const bucketCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const b of BUCKETS) {
      counts[b.key] = 0
    }
    for (const m of matches) {
      if (m.bucket in counts) {
        counts[m.bucket]++
      }
    }
    return counts
  }, [matches])

  // All matches in one table, narrowed by the persistent bucket toggles and any
  // active numeric column filters.
  const visibleMatches = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, f]) =>
      isActiveFilter(f),
    )
    return matches.filter((m) => {
      if (!activeBuckets.has(m.bucket)) {
        return false
      }
      for (const [id, f] of activeFilters) {
        const value =
          id in TRACK_FILTERS
            ? trackFilterValue(
                trackIndex?.get(m.candidate_id),
                id as TrackFilterId,
              )
            : displayScore(m, id)
        if (!passesColumnFilter(value, f)) {
          return false
        }
      }
      return true
    })
  }, [matches, activeBuckets, filters, trackIndex])

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

  const handleColumnSizingChange = useCallback(
    (updater: Updater<ColumnSizingState>) => {
      setResizingSizing((prev) => {
        const base = prev ?? effectiveSizingRef.current
        return typeof updater === 'function' ? updater(base) : updater
      })
    },
    [],
  )

  // @tanstack/react-table is not yet annotated for the React Compiler, so the
  // compiler skips optimization here (informational; not a code defect).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: visibleMatches,
    columns: allColumns,
    state: {
      columnSizing: effectiveSizing,
      columnOrder: fullColumnOrder,
      columnVisibility,
      sorting,
    },
    columnResizeMode: 'onChange',
    enableMultiSort: true,
    onColumnSizingChange: handleColumnSizingChange,
    onSortingChange: setSorting,
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

  // Row virtualization: only the visible window of rows is mounted. A busy
  // source track can return thousands of matches, and mounting every row made
  // any re-render of this table (a column-preference change, a resize) block
  // the main thread — each score cell also computes a gradient background.
  const matchRows = table.getRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: matchRows.length,
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

  // Sort/filter control descriptors derived from the visible columns.
  const sortColumns = useMemo(
    () =>
      visibleIds
        .filter((id) => !NON_SORTABLE.has(id))
        .map((id) => ({ id, label: registryById.get(id)?.label ?? id })),
    [visibleIds, registryById],
  )
  // Candidate-attribute filters come first; their options are the values that
  // actually occur in the current match list.
  const trackFilterColumns = useMemo<FilterableColumn[]>(() => {
    const optionsFor = (id: TrackFilterId) => {
      const seen = new Set<string>()
      for (const m of matches) {
        const v = trackFilterValue(trackIndex?.get(m.candidate_id), id)
        if (v != null && v !== '') {
          seen.add(String(v))
        }
      }
      return [...seen].sort()
    }
    return (Object.keys(TRACK_FILTERS) as TrackFilterId[]).map((id) => {
      const def = TRACK_FILTERS[id]
      return def.kind === 'select'
        ? { id, label: def.label, kind: def.kind, options: optionsFor(id) }
        : { id, label: def.label, kind: def.kind }
    })
  }, [matches, trackIndex])

  const filterColumns = useMemo<FilterableColumn[]>(
    () => [
      ...trackFilterColumns,
      // Score columns are compatibility scores, not track attributes — label
      // them as such so they don't read as a second "Key"/"BPM"/"Genre".
      ...visibleIds
        .filter((id) => id in SCORE_SCALE)
        .map((id) => {
          const label = registryById.get(id)?.label ?? id
          return {
            id,
            label: id === 'overall_score' ? label : `${label} score`,
          }
        }),
    ],
    [trackFilterColumns, visibleIds, registryById],
  )

  const bucketOptions: ToggleOption[] = BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: bucketCounts[b.key],
  }))

  const toggleBucket = useCallback((key: string) => {
    setActiveBuckets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const setFilter = useCallback((columnId: string, filter: ColumnFilter) => {
    setFilters((prev) => ({ ...prev, [columnId]: filter }))
  }, [])

  const removeFilter = useCallback((columnId: string) => {
    setFilters((prev) => {
      const next = { ...prev }
      delete next[columnId]
      return next
    })
  }, [])

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

  // Dropping a track anywhere on the panel makes it the match source. Row drags
  // out of the tracklist/pool set `effectAllowed = 'move'`, so those targets must
  // answer with a 'move' drop effect or the browser rejects the drop.
  const dropTargets = useMemo<TrackDropTarget[]>(
    () =>
      onTrackDrop
        ? [
            { mime: TRACK_DRAG_MIME, onDropTrack: onTrackDrop },
            {
              mime: TRACKLIST_ROW_MIME,
              onDropTrack: onTrackDrop,
              dropEffect: 'move' as const,
            },
            {
              mime: POOL_ROW_MIME,
              onDropTrack: onTrackDrop,
              dropEffect: 'move' as const,
            },
          ]
        : [],
    [onTrackDrop],
  )
  const { dropActive, dropHandlers } = useExternalTrackDrop(dropTargets)
  const panelClassName = `matches-panel${dropActive ? ' set-drop-active' : ''}`

  if (!matchSource) {
    return (
      <div className={panelClassName} {...dropHandlers}>
        <p className="matches-empty">Select a track to see matches</p>
      </div>
    )
  }

  const header = (
    <TableHeader
      leading={
        <button
          type="button"
          className="matches-clear-btn"
          aria-label="Clear matches"
          title="Clear matches"
          onClick={onClearMatchSource}
        >
          ×
        </button>
      }
      title={headerTitle ?? matchSource.title}
      primary={
        <>
          <SortAddButton
            sorting={sorting}
            columns={sortColumns}
            onSortingChange={setSorting}
            label="Add sort"
            className="ds-header-btn"
          />
          <TableFilterAddButton
            columns={filterColumns}
            filters={filters}
            onFilterChange={setFilter}
            label="Add filter"
          />
        </>
      }
    />
  )

  const controlPanel = (
    <TableControlPanel>
      <ToggleFilterGroup
        options={bucketOptions}
        active={activeBuckets}
        onToggle={toggleBucket}
        ariaLabel="Key relationship filter"
      />
      <SortTierBar
        sorting={sorting}
        columns={sortColumns}
        onSortingChange={setSorting}
        hideAddButton
      />
      <TableFilterPills
        columns={filterColumns}
        filters={filters}
        onFilterChange={setFilter}
        onRemove={removeFilter}
      />
    </TableControlPanel>
  )

  if (visibleIds.length === 0) {
    return (
      <div className={panelClassName} {...dropHandlers}>
        {header}
        {controlPanel}
        <TableColumnEmptyRecovery />
      </div>
    )
  }

  return (
    <div className={panelClassName} {...dropHandlers}>
      {header}
      {controlPanel}
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
                    const sortIndex = header.column.getSortIndex()
                    const isDetails = header.column.id === 'details'
                    const isPlay = header.column.id === 'play'
                    return (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className={`${
                          draggedColumn === header.column.id
                            ? 'th-dragging'
                            : ''
                        }${
                          header.column.id === 'track_title'
                            ? ' matches-th-track'
                            : ''
                        }`}
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
                          draggable={!isPlay}
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
                          {isPlay ? (
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
                              onRemove={() =>
                                onToggleColumnVisibility(header.column.id)
                              }
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
              {loading && visibleMatches.length === 0 ? (
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
              ) : visibleMatches.length === 0 ? (
                <tr>
                  <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className="table-status"
                  >
                    No matches for the active filters
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
                    const row = matchRows[virtualRow.index]
                    return (
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
                        {row.getVisibleCells().map((cell) => {
                          const scale = SCORE_SCALE[cell.column.id]
                          const style = scale
                            ? scoreCellStyle(
                                normalizeScore(
                                  (
                                    row.original as unknown as Record<
                                      string,
                                      number | null
                                    >
                                  )[cell.column.id],
                                  scale,
                                ),
                              )
                            : undefined
                          return (
                            <td
                              key={cell.id}
                              className={scale ? 'ds-score-cell' : undefined}
                              style={style}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </td>
                          )
                        })}
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
    </div>
  )
})
