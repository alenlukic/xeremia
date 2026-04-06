import { memo, useState, useRef, useLayoutEffect, useEffect, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnSizingState,
  type ColumnOrderState,
  type Updater,
} from '@tanstack/react-table';
import type { Track, SearchSuggestion } from '../types';
import { formatFloat, displayGenre } from '../utils';

const col = createColumnHelper<Track>();

const FIXED_PX = 90;
const FIXED_COUNT = 4;
const FLEX_MINS = [280, 100, 100];
const TOTAL_FLEX = FLEX_MINS.reduce((a, b) => a + b, 0);
const TOTAL_FIXED = FIXED_COUNT * FIXED_PX;

function computeColWidths(container: number): number[] {
  if (container <= 0) {
    return Array(FIXED_COUNT).fill(FIXED_PX).concat(FLEX_MINS);
  }
  const flexBudget = Math.max(container - TOTAL_FIXED, TOTAL_FLEX);
  return [
    ...Array<number>(FIXED_COUNT).fill(FIXED_PX),
    ...FLEX_MINS.map((m) => (m / TOTAL_FLEX) * flexBudget),
  ];
}

const COLUMN_IDS = [
  'camelot_code', 'key', 'bpm', 'energy',
  'title', 'label', 'genre',
];

const columns = [
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
    cell: (info) => <span className="mono">{formatFloat(info.getValue())}</span>,
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
];

interface Props {
  tracks: Track[];
  loading: boolean;
  selectedTrack: Track | SearchSuggestion | null;
  selectTrack: (track: Track) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export const TrackTable = memo(function TrackTable({ tracks, loading, selectedTrack, selectTrack, hasMore, onLoadMore }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(COLUMN_IDS);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  const ignoreNextScroll = useRef<'top' | 'wrapper' | null>(null);

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

  const responsiveSizing = useMemo(() => {
    if (containerWidth <= 0) return {};
    const widths = computeColWidths(containerWidth);
    const sizing: ColumnSizingState = {};
    COLUMN_IDS.forEach((id, i) => { sizing[id] = widths[i]; });
    return sizing;
  }, [containerWidth]);

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

  const table = useReactTable({
    data: tracks,
    columns,
    state: { columnSizing: effectiveSizing, columnOrder },
    columnResizeMode: 'onChange',
    onColumnSizingChange: handleColumnSizingChange,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalWidth = table.getTotalSize();
  const isOverflowing = containerWidth > 0 && totalWidth > containerWidth;

  const handleTopScroll = useCallback(() => {
    if (ignoreNextScroll.current === 'top') {
      ignoreNextScroll.current = null;
      return;
    }
    if (wrapperRef.current && topScrollRef.current) {
      ignoreNextScroll.current = 'wrapper';
      wrapperRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  }, []);

  const handleWrapperScroll = useCallback(() => {
    if (ignoreNextScroll.current === 'wrapper') {
      ignoreNextScroll.current = null;
      return;
    }
    if (topScrollRef.current && wrapperRef.current) {
      ignoreNextScroll.current = 'top';
      topScrollRef.current.scrollLeft = wrapperRef.current.scrollLeft;
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

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || !onLoadMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, tracks.length]);

  return (
    <div className="track-table-outer" ref={outerRef}>
      {isOverflowing && (
        <div className="track-table-top-scrollbar" ref={topScrollRef} onScroll={handleTopScroll}>
          <div style={{ width: totalWidth, height: 1 }} />
        </div>
      )}
      <div
        className="track-table-wrapper"
        ref={wrapperRef}
        onScroll={isOverflowing ? handleWrapperScroll : undefined}
      >
        <table
          className="track-table"
          style={containerWidth > 0 ? { width: totalWidth } : undefined}
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className={draggedColumn === header.column.id ? 'th-dragging' : ''}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, header.column.id)}
                  >
                    <div
                      className="th-content"
                      draggable
                      onDragStart={(e) => handleDragStart(e, header.column.id)}
                      onDragEnd={handleDragEnd}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </div>
                    <div
                      className={`col-resizer${header.column.getIsResizing() ? ' col-resizer--active' : ''}`}
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="table-status">
                  Loading tracks…
                </td>
              </tr>
            ) : tracks.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="table-status">
                  No tracks found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isSelected = selectedTrack?.id === row.original.id;
                return (
                  <tr
                    key={row.id}
                    className={isSelected ? 'row-selected' : ''}
                    onClick={() => selectTrack(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {hasMore && (
          <div ref={sentinelRef} className="scroll-sentinel">
            Loading more tracks…
          </div>
        )}
      </div>
    </div>
  );
});
