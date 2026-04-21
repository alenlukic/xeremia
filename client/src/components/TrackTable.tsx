import { memo, useState, useRef, useLayoutEffect, useEffect, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type ColumnSizingState,
  type ColumnOrderState,
  type SortingState,
  type Updater,
  type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDraggable } from '@dnd-kit/core';
import type { Track, SearchSuggestion } from '../types';
import { formatFloat, formatBpm, formatDate, displayGenre } from '../utils';
import type { DragPayload } from '../dnd';
import { PlayButton } from './PlayButton';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

const col = createColumnHelper<Track>();

const FIXED_PX = 90;
const FIXED_COUNT = 4;
const FLEX_MINS = [280, 100, 100, 110];
const TOTAL_FLEX = FLEX_MINS.reduce((a, b) => a + b, 0);
const TOTAL_FIXED = FIXED_COUNT * FIXED_PX;
const DRAG_HANDLE_WIDTH = 24;
const PLAY_COL_WIDTH = 32;

export function computeColWidths(container: number, hasColChooser: boolean): number[] {
  const utilityWidth = DRAG_HANDLE_WIDTH + PLAY_COL_WIDTH + (hasColChooser ? COL_CHOOSER_WIDTH : 0);

  if (container <= 0) {
    return [
      DRAG_HANDLE_WIDTH,
      PLAY_COL_WIDTH,
      ...Array(FIXED_COUNT).fill(FIXED_PX),
      ...FLEX_MINS,
      ...(hasColChooser ? [COL_CHOOSER_WIDTH] : []),
    ];
  }

  const flexBudget = Math.round(Math.max(container - TOTAL_FIXED - utilityWidth, TOTAL_FLEX));
  const rawFlexWidths = FLEX_MINS.map((m) => (m / TOTAL_FLEX) * flexBudget);
  const flooredWidths = rawFlexWidths.map(Math.floor);
  const remainder = flexBudget - flooredWidths.reduce((a, b) => a + b, 0);
  const flexWidths = flooredWidths.map((w, i) =>
    i === flooredWidths.length - 1 ? w + remainder : w,
  );

  return [
    DRAG_HANDLE_WIDTH,
    PLAY_COL_WIDTH,
    ...Array<number>(FIXED_COUNT).fill(FIXED_PX),
    ...flexWidths,
    ...(hasColChooser ? [COL_CHOOSER_WIDTH] : []),
  ];
}

const COLUMN_IDS = [
  'camelot_code', 'key', 'bpm', 'energy',
  'title', 'label', 'genre', 'date_added',
];

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
    cell: (info) => <span className="mono">{formatFloat(info.getValue())}</span>,
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
  col.accessor('date_added', {
    header: 'Date Added',
    size: FLEX_MINS[3],
    minSize: 80,
    cell: (info) => <span className="mono">{formatDate(info.getValue())}</span>,
    sortingFn: (a, b) => {
      const da = a.original.date_added ? new Date(a.original.date_added).getTime() : 0;
      const db = b.original.date_added ? new Date(b.original.date_added).getTime() : 0;
      return da - db;
    },
  }),
];

const COL_CHOOSER_WIDTH = 28;

interface ColumnConfig {
  id: string;
  label: string;
}

interface Props {
  tracks: Track[];
  loading: boolean;
  selectedTrack: Track | SearchSuggestion | null;
  selectTrack: (track: Track) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  error?: string | null;
  columnVisibility?: Record<string, boolean>;
  onAddToSet?: (trackId: number) => void;
  configurableColumns?: ColumnConfig[];
  onToggleColumn?: (id: string) => void;
  starredTrackIds?: Set<number>;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  scrollContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
}

const PLAY_DEAD_ZONE_PX = 50;

function isInPlayDeadZone(clientX: number, playCellEl: HTMLElement | null): boolean {
  if (!playCellEl) return false;
  const rect = playCellEl.getBoundingClientRect();
  if (rect.width === 0) return false;
  const centerX = rect.left + rect.width / 2;
  return Math.abs(clientX - centerX) <= PLAY_DEAD_ZONE_PX;
}

function DraggableBrowseRow({ row, isSelected, isPlaying, onSelect, virtualTop, totalWidth, measureRef, virtualIndex, hasColChooser, isStarred }: {
  row: Row<Track>;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: (track: Track) => void;
  virtualTop?: number;
  totalWidth?: number;
  measureRef?: (node: HTMLElement | null) => void;
  virtualIndex?: number;
  hasColChooser?: boolean;
  isStarred?: boolean;
}) {
  const payload: DragPayload = {
    trackId: row.original.id,
    title: row.original.title,
    source: 'browse',
  };
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `browse-track-${row.original.id}`,
    data: payload,
    attributes: { role: undefined as unknown as string, tabIndex: undefined as unknown as number },
  });

  const playCellRef = useRef<HTMLTableCellElement>(null);

  const combinedRef = useCallback((node: HTMLElement | null) => {
    setNodeRef(node);
    measureRef?.(node);
  }, [setNodeRef, measureRef]);

  const rowListeners = useMemo(() => {
    if (!listeners) return {};
    const { onPointerDown, ...rest } = listeners as Record<string, unknown>;
    return {
      ...rest,
      onPointerDown: (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
        if (isInPlayDeadZone(e.clientX, playCellRef.current)) return;
        (onPointerDown as (e: React.PointerEvent) => void)?.(e);
      },
    };
  }, [listeners]);

  const isVirtual = virtualTop !== undefined;
  const style: React.CSSProperties = isVirtual
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: totalWidth,
        transform: `translateY(${virtualTop}px)`,
        display: 'table-row',
        cursor: isDragging ? 'grabbing' : 'grab',
      }
    : { cursor: isDragging ? 'grabbing' : 'grab' };

  return (
    <tr
      ref={combinedRef}
      data-index={virtualIndex}
      className={`${isSelected ? 'row-selected' : ''}${isPlaying ? ' playing-row' : ''}${isDragging ? ' row-dragging' : ''}`}
      style={style}
      onClick={(e) => {
        if (isInPlayDeadZone(e.clientX, playCellRef.current)) return;
        onSelect(row.original);
      }}
      {...rowListeners}
    >
      <td className="drag-handle-cell" style={{ width: DRAG_HANDLE_WIDTH }}>
        {isStarred
          ? <span className="star-indicator" title="Starred in active set" aria-label="Starred">★</span>
          : <span className="drag-handle" aria-hidden="true">⠿</span>}
      </td>
      <td className="play-cell" ref={playCellRef} onClick={(e) => e.stopPropagation()}>
        <PlayButton trackId={row.original.id} title={row.original.title} />
      </td>
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} style={{ width: cell.column.getSize() }}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
      {hasColChooser && <td style={{ width: COL_CHOOSER_WIDTH }} />}
    </tr>
  );
}

export const TrackTable = memo(function TrackTable({ tracks, loading, selectedTrack, selectTrack, hasMore, onLoadMore, error, columnVisibility, onAddToSet, configurableColumns, onToggleColumn, starredTrackIds, sorting: sortingProp, onSortingChange, scrollContainerRef }: Props) {
  const { track: playingTrack, playing: isAudioPlaying } = useAudioPlayer();
  const playingTrackId = isAudioPlaying ? playingTrack?.id ?? null : null;

  const outerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);

  const mergedWrapperRef = useCallback((node: HTMLDivElement | null) => {
    (wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (scrollContainerRef) scrollContainerRef.current = node;
  }, [scrollContainerRef]);

  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollbarGap, setScrollbarGap] = useState(0);
  const [wrapperScrollWidth, setWrapperScrollWidth] = useState(0);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([
    ...COLUMN_IDS.slice(0, 4), 'add_to_set', ...COLUMN_IDS.slice(4),
  ]);
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const sorting = sortingProp ?? internalSorting;
  const setSorting = useCallback((updater: SortingState | ((prev: SortingState) => SortingState)) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    if (onSortingChange) onSortingChange(next);
    else setInternalSorting(next);
  }, [sorting, onSortingChange]);
  const isExternalSort = !!onSortingChange;
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [colConfigOpen, setColConfigOpen] = useState(false);
  const colConfigRef = useRef<HTMLTableCellElement>(null);

  const hasColChooser = !!(configurableColumns && configurableColumns.length > 0);

  const ignoreNextScroll = useRef<'top' | 'wrapper' | null>(null);

  useEffect(() => {
    if (!colConfigOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (colConfigRef.current && !colConfigRef.current.contains(e.target as Node)) {
        setColConfigOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setColConfigOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [colConfigOpen]);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const measure = (p: Element) => setContainerWidth(Math.max(0, p.clientWidth));
    measure(parent);
    const ro = new ResizeObserver(() => measure(parent));
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const w = wrapperRef.current;
    if (!w) return;
    const measure = () => {
      setScrollbarGap(w.offsetWidth - w.clientWidth);
      setWrapperScrollWidth(w.scrollWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(w);
    return () => ro.disconnect();
  }, []);

  const responsiveSizing = useMemo(() => {
    if (containerWidth <= 0) return {};
    const allWidths = computeColWidths(containerWidth, hasColChooser);
    const sizing: ColumnSizingState = {};
    COLUMN_IDS.forEach((id, i) => { sizing[id] = allWidths[i + 2]; });
    return sizing;
  }, [containerWidth, hasColChooser]);

  const effectiveSizing = useMemo(() => {
    if (Object.keys(columnSizing).length > 0) return columnSizing;
    return responsiveSizing;
  }, [columnSizing, responsiveSizing]);

  const handleColumnSizingChange = useCallback((updater: Updater<ColumnSizingState>) => {
    setColumnSizing(prev => {
      const base = Object.keys(prev).length > 0 ? prev : responsiveSizing;
      return typeof updater === 'function' ? updater(base) : updater;
    });
  }, [responsiveSizing]);

  const addToSetColumn = useMemo(() => col.display({
    id: 'add_to_set',
    header: '',
    size: 74,
    minSize: 60,
    enableSorting: false,
    cell: ({ row }) => onAddToSet ? (
      <button
        className="match-action-btn"
        onClick={(e) => { e.stopPropagation(); onAddToSet(row.original.id); }}
        title="Add to set"
      >
        + Set
      </button>
    ) : null,
  }), [onAddToSet]);

  const allColumns = useMemo(
    () => onAddToSet ? [...dataColumns, addToSetColumn] : dataColumns,
    [onAddToSet, addToSetColumn],
  );

  const fullColumnOrder = columnOrder;

  const sortedRowModel = useMemo(() => isExternalSort ? undefined : getSortedRowModel(), [isExternalSort]);

  const table = useReactTable({
    data: tracks,
    columns: allColumns,
    state: { columnSizing: effectiveSizing, columnOrder: fullColumnOrder, columnVisibility: columnVisibility ?? {}, sorting },
    manualSorting: isExternalSort,
    columnResizeMode: 'onChange',
    onColumnSizingChange: handleColumnSizingChange,
    onColumnOrderChange: setColumnOrder,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    ...(sortedRowModel ? { getSortedRowModel: sortedRowModel } : {}),
  });

  const totalWidth = table.getTotalSize() + DRAG_HANDLE_WIDTH + PLAY_COL_WIDTH + (hasColChooser ? COL_CHOOSER_WIDTH : 0);
  const isOverflowing = containerWidth > 0 && totalWidth > containerWidth;

  useLayoutEffect(() => {
    const w = wrapperRef.current;
    if (w) setWrapperScrollWidth(w.scrollWidth);
  }, [totalWidth]);

  const handleTopScroll = useCallback(() => {
    if (ignoreNextScroll.current === 'top') {
      ignoreNextScroll.current = null;
      return;
    }
    const w = wrapperRef.current;
    const t = topScrollRef.current;
    if (w && t) {
      const maxW = Math.max(0, w.scrollWidth - w.clientWidth);
      const sl = Math.min(t.scrollLeft, maxW);
      if (w.scrollLeft !== sl) {
        ignoreNextScroll.current = 'wrapper';
        w.scrollLeft = sl;
      }
    }
  }, []);

  const handleWrapperScroll = useCallback(() => {
    if (ignoreNextScroll.current === 'wrapper') {
      ignoreNextScroll.current = null;
      return;
    }
    const t = topScrollRef.current;
    const w = wrapperRef.current;
    if (t && w) {
      const maxT = Math.max(0, t.scrollWidth - t.clientWidth);
      const sl = Math.min(w.scrollLeft, maxT);
      if (t.scrollLeft !== sl) {
        ignoreNextScroll.current = 'top';
        t.scrollLeft = sl;
      }
    }
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, columnId: string) => {
    setDraggedColumn(columnId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) {
      setDraggedColumn(null);
      return;
    }
    setColumnOrder(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(draggedId);
      const toIdx = next.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggedId);
      return next;
    });
    setDraggedColumn(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedColumn(null);
  }, []);

  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => wrapperRef.current,
    estimateSize: () => 40,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const loadMoreFiredForCount = useRef<number | null>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const range = rowVirtualizer.range;
    if (!range) return;
    const nearEnd = range.endIndex >= rows.length - 5;
    if (nearEnd) {
      if (loadMoreFiredForCount.current === rows.length) return;
      loadMoreFiredForCount.current = rows.length;
      onLoadMore();
    } else {
      loadMoreFiredForCount.current = null;
    }
  }, [rowVirtualizer.range, rows.length, hasMore, onLoadMore]);

  useEffect(() => {
    if (!hasMore || !onLoadMore || virtualItems.length > 0) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onLoadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onLoadMore, virtualItems.length]);

  return (
    <div className="track-table-outer" ref={outerRef}>
      {isOverflowing && (
        <div className="track-table-top-scrollbar" ref={topScrollRef} onScroll={handleTopScroll}>
          <div style={{ width: (wrapperScrollWidth || totalWidth) + scrollbarGap, height: 1 }} />
        </div>
      )}
      <div
        className="track-table-wrapper"
        ref={mergedWrapperRef}
        onScroll={handleWrapperScroll}
      >
        <table
          className="track-table"
          style={containerWidth > 0 ? { width: totalWidth } : undefined}
        >
          <colgroup>
            <col style={{ width: DRAG_HANDLE_WIDTH }} />
            <col style={{ width: PLAY_COL_WIDTH }} />
            {table.getVisibleLeafColumns().map((col) => (
              <col key={col.id} style={{ width: col.getSize() }} />
            ))}
            {hasColChooser && <col style={{ width: COL_CHOOSER_WIDTH }} />}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="drag-handle-cell" style={{ width: DRAG_HANDLE_WIDTH }} />
                <th className="play-cell" style={{ width: 32 }} />
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const sortIndex = header.column.getSortIndex();
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={draggedColumn === header.column.id ? 'th-dragging' : ''}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, header.column.id)}
                    >
                      <div
                        className={`th-content${canSort ? ' th-sortable' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, header.column.id)}
                        onDragEnd={handleDragEnd}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted && (
                          <span className="sort-indicator">
                            {sorting.length > 1 && <span className="sort-precedence">{sortIndex + 1}</span>}
                            {sorted === 'asc' ? ' ▲' : ' ▼'}
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
                  );
                })}
                {hasColChooser && (
                  <th className="col-chooser-th" ref={colConfigRef} style={{ width: COL_CHOOSER_WIDTH }}>
                    <button
                      className="col-chooser-btn"
                      onClick={() => setColConfigOpen(prev => !prev)}
                      title="Configure columns"
                      aria-label="Configure columns"
                    >
                      ⋮
                    </button>
                    {colConfigOpen && (
                      <div className="column-config-popover">
                        {configurableColumns!.map((c) => (
                          <label key={c.id} className="column-config-item">
                            <input
                              type="checkbox"
                              checked={columnVisibility?.[c.id] !== false}
                              onChange={() => onToggleColumn?.(c.id)}
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </th>
                )}
              </tr>
            ))}
          </thead>
          <tbody style={virtualItems.length > 0 ? { height: rowVirtualizer.getTotalSize(), position: 'relative' } : undefined}>
            {loading ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length + 2 + (hasColChooser ? 1 : 0)} className="table-status">
                  Loading tracks…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length + 2 + (hasColChooser ? 1 : 0)} className="table-status table-status--error">
                  Failed to load tracks — {error}
                </td>
              </tr>
            ) : tracks.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length + 2 + (hasColChooser ? 1 : 0)} className="table-status">
                  No tracks found
                </td>
              </tr>
            ) : virtualItems.length > 0 ? (
              virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <DraggableBrowseRow
                    key={row.id}
                    row={row}
                    isSelected={selectedTrack?.id === row.original.id}
                    isPlaying={playingTrackId === row.original.id}
                    onSelect={selectTrack}
                    virtualTop={virtualRow.start}
                    totalWidth={totalWidth}
                    measureRef={rowVirtualizer.measureElement}
                    virtualIndex={virtualRow.index}
                    hasColChooser={hasColChooser}
                    isStarred={starredTrackIds?.has(row.original.id)}
                  />
                );
              })
            ) : (
              <>
                {rows.map((row) => (
                  <DraggableBrowseRow
                    key={row.id}
                    row={row}
                    isSelected={selectedTrack?.id === row.original.id}
                    isPlaying={playingTrackId === row.original.id}
                    onSelect={selectTrack}
                    hasColChooser={hasColChooser}
                    isStarred={starredTrackIds?.has(row.original.id)}
                  />
                ))}
                {hasMore && onLoadMore && (
                  <tr ref={sentinelRef}>
                    <td colSpan={table.getVisibleLeafColumns().length + 2 + (hasColChooser ? 1 : 0)} className="table-status">
                      Loading more tracks…
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
