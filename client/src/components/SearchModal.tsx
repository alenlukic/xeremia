import { useState, useEffect, useRef, useMemo, useCallback, memo, Fragment } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Track, TransitionMatch, HydratedSet, SetTracklistSlot } from '../types';
import { MAX_CANDIDATES_PER_SLOT } from '../types';
import { formatBpm, formatFloat, formatScore, formatOverallScore, formatDate, displayGenre } from '../utils';
import { fetchTracks, fetchMatches, candidateAdd, slotCreate, slotReorder } from '../api/http';
import { useTrackFilters } from '../hooks/useTrackFilters';
import { FilterBar, FilterToggleButton } from './FilterBar';
import { PlayButton } from './PlayButton';

const SEARCH_COL_CONFIG_KEY = 'dj-tools-search-modal-column-config';
const MATCH_COL_CONFIG_KEY = 'dj-tools-matches-column-config';

const SEARCH_DEFAULT_VISIBILITY: Record<string, boolean> = {
  label: false,
  energy: false,
  date_added: false,
};

const CONFIGURABLE_SEARCH_COLUMNS = [
  { id: 'camelot_code', label: 'Key' },
  { id: 'bpm', label: 'BPM' },
  { id: 'genre', label: 'Genre' },
  { id: 'label', label: 'Label' },
  { id: 'energy', label: 'Energy' },
  { id: 'date_added', label: 'Date Added' },
];

const CONFIGURABLE_MATCH_COLUMNS = [
  { id: 'overall_score', label: 'Score' },
  { id: 'similarity_score', label: 'Spectral' },
  { id: 'camelot_score', label: 'Key' },
  { id: 'bpm_score', label: 'BPM' },
  { id: 'genre_similarity_score', label: 'Genre' },
  { id: 'freshness_score', label: 'Recency' },
  { id: 'energy_score', label: 'Energy (MIK)' },
  { id: 'mood_continuity_score', label: 'Mood' },
  { id: 'instrument_similarity_score', label: 'Instruments' },
  { id: 'vocal_clash_score', label: 'Vocals' },
];

type BucketKey = 'same_key' | 'higher_key' | 'lower_key';
const BUCKET_TABS: { key: BucketKey; label: string }[] = [
  { key: 'same_key', label: 'Same' },
  { key: 'higher_key', label: 'Higher' },
  { key: 'lower_key', label: 'Lower' },
];

// --- Column config persistence ---

function loadSearchColumnVis(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SEARCH_COL_CONFIG_KEY);
    if (!raw) return { ...SEARCH_DEFAULT_VISIBILITY };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...SEARCH_DEFAULT_VISIBILITY };
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.columnVisibility !== 'object' || obj.columnVisibility === null) return { ...SEARCH_DEFAULT_VISIBILITY };
    const vis = { ...SEARCH_DEFAULT_VISIBILITY };
    for (const [k, v] of Object.entries(obj.columnVisibility as Record<string, unknown>)) {
      if (typeof v === 'boolean') vis[k] = v;
    }
    return vis;
  } catch {
    return { ...SEARCH_DEFAULT_VISIBILITY };
  }
}

function saveSearchColumnVis(vis: Record<string, boolean>) {
  localStorage.setItem(SEARCH_COL_CONFIG_KEY, JSON.stringify({ columnVisibility: vis }));
}

function loadMatchColumnVis(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(MATCH_COL_CONFIG_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.columnVisibility !== 'object' || obj.columnVisibility === null) return {};
    const vis: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(obj.columnVisibility as Record<string, unknown>)) {
      if (typeof v === 'boolean') vis[k] = v;
    }
    return vis;
  } catch {
    return {};
  }
}

function saveMatchColumnVis(vis: Record<string, boolean>) {
  try {
    const raw = localStorage.getItem(MATCH_COL_CONFIG_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    localStorage.setItem(MATCH_COL_CONFIG_KEY, JSON.stringify({ ...prev, columnVisibility: vis }));
  } catch {
    try { localStorage.setItem(MATCH_COL_CONFIG_KEY, JSON.stringify({ columnVisibility: vis })); } catch { /* ignore */ }
  }
}

// --- Column definitions ---

const searchCol = createColumnHelper<Track>();
const searchDataColumns = [
  searchCol.accessor('title', { header: 'Title', size: 280, minSize: 120 }),
  searchCol.accessor('camelot_code', {
    header: 'Key', size: 80, minSize: 50,
    cell: (info) => <span className="mono">{info.getValue() ?? '—'}</span>,
  }),
  searchCol.accessor('bpm', {
    header: 'BPM', size: 80, minSize: 50,
    cell: (info) => <span className="mono">{formatBpm(info.getValue())}</span>,
  }),
  searchCol.accessor('genre', {
    header: 'Genre', size: 120, minSize: 50,
    cell: (info) => displayGenre(info.getValue()),
  }),
  searchCol.accessor('label', { header: 'Label', size: 100, minSize: 50 }),
  searchCol.accessor('energy', {
    header: 'Energy', size: 80, minSize: 50,
    cell: (info) => <span className="mono">{formatFloat(info.getValue())}</span>,
  }),
  searchCol.accessor('date_added', {
    header: 'Date Added', size: 110, minSize: 80,
    cell: (info) => <span className="mono">{formatDate(info.getValue())}</span>,
    sortingFn: (a, b) => {
      const da = a.original.date_added ? new Date(a.original.date_added).getTime() : 0;
      const db = b.original.date_added ? new Date(b.original.date_added).getTime() : 0;
      return da - db;
    },
  }),
];

const matchCol = createColumnHelper<TransitionMatch>();
const matchScoreColumns = [
  matchCol.accessor('overall_score', {
    header: 'SCORE', size: 70, minSize: 50,
    cell: (info) => <span className="mono">{formatOverallScore(info.getValue())}</span>,
  }),
  matchCol.accessor('similarity_score', {
    header: 'Spectral', size: 60, minSize: 50,
    cell: (info) => <span className="mono">{formatScore(info.getValue())}</span>,
  }),
  matchCol.accessor('camelot_score', {
    header: 'Key', size: 60, minSize: 50,
    cell: (info) => <span className="mono">{formatScore(info.getValue())}</span>,
  }),
  matchCol.accessor('bpm_score', {
    header: 'BPM', size: 60, minSize: 50,
    cell: (info) => <span className="mono">{formatScore(info.getValue())}</span>,
  }),
  matchCol.accessor('genre_similarity_score', {
    header: 'Genre', size: 60, minSize: 50,
    cell: (info) => <span className="mono">{formatScore(info.getValue())}</span>,
  }),
  matchCol.accessor('freshness_score', {
    header: 'Recency', size: 60, minSize: 50,
    cell: (info) => <span className="mono">{formatScore(info.getValue())}</span>,
  }),
  matchCol.accessor('energy_score', {
    header: 'Energy', size: 73, minSize: 50,
    cell: (info) => <span className="mono">{formatScore(info.getValue())}</span>,
  }),
  matchCol.accessor('mood_continuity_score', {
    header: 'Mood', size: 60, minSize: 50,
    cell: (info) => <span className="mono">{formatScore(info.getValue())}</span>,
  }),
  matchCol.accessor('instrument_similarity_score', {
    header: 'Instruments', size: 73, minSize: 50,
    cell: (info) => <span className="mono">{formatScore(info.getValue())}</span>,
  }),
  matchCol.accessor('vocal_clash_score', {
    header: 'Vocals', size: 60, minSize: 50,
    cell: (info) => <span className="mono">{formatScore(info.getValue())}</span>,
  }),
];

const coreRowModel = getCoreRowModel<Track>();
const sortedRowModel = getSortedRowModel<Track>();
const matchCoreRowModel = getCoreRowModel<TransitionMatch>();
const matchSortedRowModel = getSortedRowModel<TransitionMatch>();

// --- Row action menu ---

function RowActionMenu({ trackId, onAddToTracklist, onAddToPool, onOpenSlotPanel, registerNested }: {
  trackId: number;
  onAddToTracklist: (id: number) => void;
  onAddToPool: (id: number) => void;
  onOpenSlotPanel?: (id: number) => void;
  registerNested?: () => () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const deregister = registerNested?.();
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
      deregister?.();
    };
  }, [open, registerNested]);

  return (
    <div className="search-modal__row-actions" ref={ref} style={{ display: 'inline-flex' }}>
      <button
        className="search-modal__menu-btn"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="More actions"
        aria-label="More actions"
        data-testid="row-menu-btn"
      >⋯</button>
      {open && (
        <div className="search-modal__menu-popover" data-testid="row-menu-popover">
          <button data-testid="menu-add-tracklist" onClick={() => {
            if (onOpenSlotPanel) { onOpenSlotPanel(trackId); } else { onAddToTracklist(trackId); }
            setOpen(false);
          }}>{onOpenSlotPanel ? 'Add to tracklist\u2026' : 'Add to tracklist'}</button>
          <button data-testid="menu-add-pool" onClick={() => { onAddToPool(trackId); setOpen(false); }}>Add to pool</button>
        </div>
      )}
    </div>
  );
}

// --- Main component ---

interface Props {
  open: boolean;
  onClose: () => void;
  activeSetId: number | null;
  activeSet: HydratedSet | null;
  onAddToTracklist: (trackId: number) => void;
  onAddToPool: (trackId: number) => void;
  slots?: SetTracklistSlot[];
  activeVersionId?: number | null;
  onSlotsChanged?: () => Promise<void> | void;
}

export const SearchModal = memo(function SearchModal({
  open, onClose, activeSetId, onAddToTracklist, onAddToPool,
  slots, activeVersionId, onSlotsChanged,
}: Props) {
  if (!open) return null;
  return (
    <SearchModalInner
      onClose={onClose}
      activeSetId={activeSetId}
      onAddToTracklist={onAddToTracklist}
      onAddToPool={onAddToPool}
      slots={slots}
      activeVersionId={activeVersionId}
      onSlotsChanged={onSlotsChanged}
    />
  );
});

function SearchModalInner({
  onClose, activeSetId, onAddToTracklist, onAddToPool,
  slots, activeVersionId, onSlotsChanged,
}: Omit<Props, 'open' | 'activeSet'>) {
  // --- Track data ---
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [tracksError, setTracksError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTracksLoading(true);
    fetchTracks({}).then(
      (tracks) => { if (!cancelled) { setAllTracks(tracks); setTracksLoading(false); } },
      (err: unknown) => { if (!cancelled) { setTracksError(err instanceof Error ? err.message : 'Failed to load tracks'); setTracksLoading(false); } },
    );
    return () => { cancelled = true; };
  }, []);

  // --- Search + filter state ---
  const [query, setQuery] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(false);
  const filterExpandedRef = useRef(false);
  filterExpandedRef.current = filterExpanded;
  const {
    filterGroups, filteredTracks, activeFilterCount,
    addFilterGroup, removeFilterGroup, updateFilterGroup, clearAllFilters,
  } = useTrackFilters(allTracks, query);

  // --- Nested surface tracking (Fix 1: Escape ordering) ---
  const nestedOpenRef = useRef(0);
  const registerNested = useCallback(() => {
    nestedOpenRef.current += 1;
    return () => { nestedOpenRef.current -= 1; };
  }, []);

  // --- Slot-targeting side panel state ---
  const [pendingTrackId, setPendingTrackId] = useState<number | null>(null);
  const pendingTrack = useMemo(
    () => pendingTrackId != null ? allTracks.find(t => t.id === pendingTrackId) ?? null : null,
    [pendingTrackId, allTracks],
  );
  const hasSlotPanel = activeVersionId != null && activeSetId != null;
  const handleOpenSlotPanel = useCallback((trackId: number) => {
    setPendingTrackId(trackId);
  }, []);
  const handleCloseSlotPanel = useCallback(() => {
    setPendingTrackId(null);
  }, []);

  // --- Transition state (sourceChain stack for multi-level chaining) ---
  const [sourceChain, setSourceChain] = useState<Array<{ id: number; title: string }>>([]);
  const [transitionMatches, setTransitionMatches] = useState<TransitionMatch[]>([]);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [bucketTab, setBucketTab] = useState<BucketKey>('same_key');

  // --- Column config ---
  const [searchColVis, setSearchColVis] = useState(loadSearchColumnVis);
  const [matchColVis, setMatchColVis] = useState(loadMatchColumnVis);
  const [searchColConfigOpen, setSearchColConfigOpen] = useState(false);
  const [matchColConfigOpen, setMatchColConfigOpen] = useState(false);
  const searchColConfigRef = useRef<HTMLTableCellElement>(null);
  const matchColConfigRef = useRef<HTMLTableCellElement>(null);

  // --- Sorting ---
  const [searchSorting, setSearchSorting] = useState<SortingState>([]);
  const [matchSorting, setMatchSorting] = useState<SortingState>([]);

  // --- Refs ---
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBodyRef = useRef<HTMLDivElement>(null);
  const matchBodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus search input on mount
  useEffect(() => { searchInputRef.current?.focus(); }, []);

  // Persist column config
  useEffect(() => { saveSearchColumnVis(searchColVis); }, [searchColVis]);
  useEffect(() => { saveMatchColumnVis(matchColVis); }, [matchColVis]);

  // Close col-config popover on outside click
  useEffect(() => {
    if (!searchColConfigOpen && !matchColConfigOpen) return;
    function handleClick(e: MouseEvent) {
      if (searchColConfigOpen && searchColConfigRef.current && !searchColConfigRef.current.contains(e.target as Node)) setSearchColConfigOpen(false);
      if (matchColConfigOpen && matchColConfigRef.current && !matchColConfigRef.current.contains(e.target as Node)) setMatchColConfigOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [searchColConfigOpen, matchColConfigOpen]);

  // Escape handler (two-stage: nested surfaces / filter tray first, then modal)
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (filterExpandedRef.current || nestedOpenRef.current > 0) return;
      onCloseRef.current();
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  // --- Actions ---
  const handleSource = useCallback((trackId: number, title: string) => {
    setSourceChain(prev => [...prev, { id: trackId, title }]);
    setTransitionLoading(true);
    setBucketTab('same_key');
    fetchMatches(trackId).then(
      (m) => { setTransitionMatches(m); setTransitionLoading(false); },
      () => { setTransitionMatches([]); setTransitionLoading(false); },
    );
  }, []);

  const handleBack = useCallback(() => {
    setSourceChain(prev => {
      const next = prev.slice(0, -1);
      if (next.length > 0) {
        setTransitionLoading(true);
        setBucketTab('same_key');
        fetchMatches(next[next.length - 1].id).then(
          (m) => { setTransitionMatches(m); setTransitionLoading(false); },
          () => { setTransitionMatches([]); setTransitionLoading(false); },
        );
      } else {
        setTransitionMatches([]);
      }
      return next;
    });
  }, []);

  const handleBreadcrumbNav = useCallback((targetIndex: number) => {
    setSourceChain(prev => {
      if (targetIndex < 0) {
        setTransitionMatches([]);
        return [];
      }
      const next = prev.slice(0, targetIndex + 1);
      setTransitionLoading(true);
      setBucketTab('same_key');
      fetchMatches(next[next.length - 1].id).then(
        (m) => { setTransitionMatches(m); setTransitionLoading(false); },
        () => { setTransitionMatches([]); setTransitionLoading(false); },
      );
      return next;
    });
  }, []);

  const handleScrimClick = useCallback(() => { onCloseRef.current(); }, []);
  const handleFilterToggle = useCallback(() => setFilterExpanded(prev => !prev), []);

  const toggleSearchCol = useCallback((id: string) => {
    setSearchColVis(prev => ({ ...prev, [id]: prev[id] !== false ? false : true }));
  }, []);

  const toggleMatchCol = useCallback((id: string) => {
    setMatchColVis(prev => ({ ...prev, [id]: prev[id] !== false ? false : true }));
  }, []);

  // --- Search results table ---
  const searchTable = useReactTable({
    data: filteredTracks,
    columns: searchDataColumns,
    state: { columnVisibility: searchColVis, sorting: searchSorting },
    onSortingChange: setSearchSorting,
    getCoreRowModel: coreRowModel,
    getSortedRowModel: sortedRowModel,
  });

  const searchRows = searchTable.getRowModel().rows;
  const searchVirtualizer = useVirtualizer({
    count: searchRows.length,
    getScrollElement: () => searchBodyRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });
  const searchVirtualItems = searchVirtualizer.getVirtualItems();

  // --- Transition results table ---
  const bucketPartitions = useMemo(() => {
    const p: Record<BucketKey, TransitionMatch[]> = { same_key: [], higher_key: [], lower_key: [] };
    for (const m of transitionMatches) {
      if (m.bucket in p) p[m.bucket as BucketKey].push(m);
    }
    return p;
  }, [transitionMatches]);
  const bucketCounts = useMemo(() => ({
    same_key: bucketPartitions.same_key.length,
    higher_key: bucketPartitions.higher_key.length,
    lower_key: bucketPartitions.lower_key.length,
  }), [bucketPartitions]);
  const activeBucketMatches = bucketPartitions[bucketTab];

  const matchTitleColumn = useMemo(() => matchCol.accessor('title', {
    id: 'track_title',
    header: 'Track', size: 300, minSize: 120,
    cell: (info) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.getValue()}</span>
        <button
          className="search-modal__source-btn"
          onClick={(e) => { e.stopPropagation(); handleSource(info.row.original.candidate_id, info.row.original.title); }}
          title="Source this track"
          data-testid="source-btn"
        >Source</button>
      </div>
    ),
  }), [handleSource]);

  const matchAllColumns = useMemo(() => [matchTitleColumn, ...matchScoreColumns], [matchTitleColumn]);

  const matchTable = useReactTable({
    data: activeBucketMatches,
    columns: matchAllColumns,
    state: { columnVisibility: matchColVis, sorting: matchSorting },
    onSortingChange: setMatchSorting,
    getCoreRowModel: matchCoreRowModel,
    getSortedRowModel: matchSortedRowModel,
  });

  const matchRows = matchTable.getRowModel().rows;
  const matchVirtualizer = useVirtualizer({
    count: matchRows.length,
    getScrollElement: () => matchBodyRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });
  const matchVirtualItems = matchVirtualizer.getVirtualItems();

  const isTransitionView = sourceChain.length > 0;

  return (
    <>
      <div className="search-modal-overlay" onClick={handleScrimClick} data-testid="search-modal-scrim" />
      <div className="search-modal" data-testid="search-modal" role="dialog" aria-label="Search">
        {/* Header */}
        <div className="search-modal__header">
          <span className="search-modal__title">Search</span>
          <button className="search-modal__close" onClick={onClose} aria-label="Close search" data-testid="search-modal-close">×</button>
        </div>

        {/* Search row (visible in both views) */}
        {!isTransitionView && (
          <div className="search-modal__search-row">
            <input
              ref={searchInputRef}
              className="search-modal__search-input"
              placeholder="Search tracks…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              data-testid="search-modal-input"
            />
            <FilterToggleButton expanded={filterExpanded} onToggle={handleFilterToggle} activeCount={activeFilterCount} />
          </div>
        )}

        {/* Breadcrumb (transition view — multi-level chain) */}
        {isTransitionView && (
          <div className="search-modal__breadcrumb" data-testid="search-modal-breadcrumb">
            <button className="search-modal__breadcrumb-back" onClick={handleBack} data-testid="breadcrumb-back">←</button>
            <button className="search-modal__breadcrumb-entry" onClick={() => handleBreadcrumbNav(-1)} data-testid="breadcrumb-search">Search</button>
            {sourceChain.map((entry, i) => (
              <Fragment key={i}>
                <span className="search-modal__breadcrumb-sep">·</span>
                {i < sourceChain.length - 1 ? (
                  <button className="search-modal__breadcrumb-entry" onClick={() => handleBreadcrumbNav(i)} data-testid={`breadcrumb-entry-${i}`}>{entry.title}</button>
                ) : (
                  <span className="search-modal__breadcrumb-source" data-testid="breadcrumb-source">{entry.title}</span>
                )}
              </Fragment>
            ))}
          </div>
        )}

        {/* Bucket tabs (transition view) */}
        {isTransitionView && (
          <div className="search-modal__bucket-tabs">
            {BUCKET_TABS.map(bt => (
              <button
                key={bt.key}
                className={`bucket-tab${bucketTab === bt.key ? ' active' : ''}`}
                onClick={() => setBucketTab(bt.key)}
              >
                {bt.label}
                <span className="bucket-count">{bucketCounts[bt.key]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Body: search results or transition matches */}
        <div className="search-modal__body" ref={isTransitionView ? matchBodyRef : searchBodyRef} data-testid="search-modal-body">
          {!isTransitionView ? (
            <SearchResultsTable
              table={searchTable}
              rows={searchRows}
              virtualizer={searchVirtualizer}
              virtualItems={searchVirtualItems}
              loading={tracksLoading}
              error={tracksError}
              isEmpty={filteredTracks.length === 0 && !tracksLoading && !tracksError}
              onAddToTracklist={onAddToTracklist}
              onAddToPool={onAddToPool}
              onSource={handleSource}
              onOpenSlotPanel={hasSlotPanel ? handleOpenSlotPanel : undefined}
              colConfigOpen={searchColConfigOpen}
              onToggleColConfig={() => setSearchColConfigOpen(p => !p)}
              colConfigRef={searchColConfigRef}
              configurableColumns={CONFIGURABLE_SEARCH_COLUMNS}
              columnVisibility={searchColVis}
              onToggleColumn={toggleSearchCol}
              registerNested={registerNested}
            />
          ) : (
            <TransitionResultsTable
              table={matchTable}
              rows={matchRows}
              virtualizer={matchVirtualizer}
              virtualItems={matchVirtualItems}
              loading={transitionLoading}
              onAddToTracklist={onAddToTracklist}
              onAddToPool={onAddToPool}
              onSource={handleSource}
              onOpenSlotPanel={hasSlotPanel ? handleOpenSlotPanel : undefined}
              colConfigOpen={matchColConfigOpen}
              onToggleColConfig={() => setMatchColConfigOpen(p => !p)}
              colConfigRef={matchColConfigRef}
              configurableColumns={CONFIGURABLE_MATCH_COLUMNS}
              columnVisibility={matchColVis}
              onToggleColumn={toggleMatchCol}
              registerNested={registerNested}
            />
          )}
        </div>

        {/* Slot-targeting side panel */}
        {pendingTrack && activeSetId != null && activeVersionId != null && slots && (
          <SlotTargetPanel
            track={pendingTrack}
            slots={slots}
            activeSetId={activeSetId}
            activeVersionId={activeVersionId}
            onSlotsChanged={onSlotsChanged}
            onClose={handleCloseSlotPanel}
            registerNested={registerNested}
          />
        )}
      </div>

      {/* Filter bar rendered outside modal div so its fixed positioning works correctly */}
      <div className="search-modal-filters">
        <FilterBar
          expanded={filterExpanded}
          onToggleExpanded={handleFilterToggle}
          activeFilterCount={activeFilterCount}
          filterGroups={filterGroups}
          addFilterGroup={addFilterGroup}
          removeFilterGroup={removeFilterGroup}
          updateFilterGroup={updateFilterGroup}
          onClearFilters={clearAllFilters}
        />
      </div>
    </>
  );
}

// --- Slot target panel (pending track placement) ---

function SlotTargetPanel({ track, slots, activeSetId, activeVersionId, onSlotsChanged, onClose, registerNested }: {
  track: Track;
  slots: SetTracklistSlot[];
  activeSetId: number;
  activeVersionId: number;
  onSlotsChanged?: () => Promise<void> | void;
  onClose: () => void;
  registerNested: () => () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...slots].sort((a, b) => a.position - b.position),
    [slots],
  );

  useEffect(() => {
    const cleanup = registerNested();
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    }
    document.addEventListener('keydown', handleEsc, true);
    return () => { cleanup(); document.removeEventListener('keydown', handleEsc, true); };
  }, [registerNested, onClose]);

  const handleAppend = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const slot = await slotCreate(activeSetId, activeVersionId);
      await candidateAdd(activeSetId, slot.id, track.id);
      await onSlotsChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to append');
    } finally {
      setBusy(false);
    }
  }, [activeSetId, activeVersionId, track.id, onSlotsChanged, onClose]);

  const handleInsertBetween = useCallback(async (afterPosition: number) => {
    setBusy(true);
    setError(null);
    try {
      const slot = await slotCreate(activeSetId, activeVersionId);
      await slotReorder(activeSetId, activeVersionId, slot.id, afterPosition + 1);
      await candidateAdd(activeSetId, slot.id, track.id);
      await onSlotsChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert');
    } finally {
      setBusy(false);
    }
  }, [activeSetId, activeVersionId, track.id, onSlotsChanged, onClose]);

  const handleAddToSlot = useCallback(async (slotId: number) => {
    setBusy(true);
    setError(null);
    try {
      await candidateAdd(activeSetId, slotId, track.id);
      await onSlotsChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add candidate');
    } finally {
      setBusy(false);
    }
  }, [activeSetId, track.id, onSlotsChanged, onClose]);

  return (
    <div className="slot-target-panel" ref={panelRef} data-testid="slot-target-panel">
      <div className="slot-target-panel__header">
        <div className="slot-target-panel__pending">
          <span className="slot-target-panel__label">Placing:</span>
          <span className="slot-target-panel__track-name" data-testid="slot-target-track-name">{track.title}</span>
          {track.camelot_code && <span className="mono text-muted" style={{ fontSize: 11 }}>{track.camelot_code}</span>}
          {track.bpm != null && <span className="mono text-muted" style={{ fontSize: 11 }}>{Math.round(track.bpm)}</span>}
        </div>
        <button className="slot-target-panel__close" onClick={onClose} data-testid="slot-target-close" disabled={busy}>×</button>
      </div>

      {error && <div className="slot-target-panel__error" data-testid="slot-target-error">{error}</div>}

      <div className="slot-target-panel__body" data-testid="slot-target-body">
        {sorted.length === 0 ? (
          <button
            className="slot-target-panel__append-btn"
            onClick={handleAppend}
            disabled={busy}
            data-testid="slot-target-append"
          >
            {busy ? 'Adding…' : 'Add as first slot'}
          </button>
        ) : (
          <>
            <button
              className="slot-target-panel__insert-btn"
              onClick={() => handleInsertBetween(-1)}
              disabled={busy}
              data-testid="slot-target-insert-before-0"
            >Insert before slot 1</button>

            {sorted.map((slot, i) => {
              const selected = slot.candidates.find(c => c.is_selected);
              const title = selected
                ? (selected.track ? selected.track.title : `Track ${selected.track_id}`)
                : `Slot ${slot.position + 1}`;
              const isFull = slot.candidates.length >= MAX_CANDIDATES_PER_SLOT;
              const alreadyHasTrack = slot.candidates.some(c => c.track_id === track.id);

              return (
                <Fragment key={slot.id}>
                  <div className={`slot-target-panel__slot${isFull ? ' slot-target-panel__slot--full' : ''}${alreadyHasTrack ? ' slot-target-panel__slot--has-track' : ''}`} data-testid={`slot-target-slot-${slot.id}`}>
                    <span className="slot-target-panel__slot-num">{i + 1}</span>
                    <span className="slot-target-panel__slot-title">{title}</span>
                    <span className="slot-target-panel__slot-count mono">{slot.candidates.length}/{MAX_CANDIDATES_PER_SLOT}</span>
                    {isFull ? (
                      <span className="slot-target-panel__full-tag" data-testid={`slot-target-full-${slot.id}`}>Full</span>
                    ) : alreadyHasTrack ? (
                      <span className="slot-target-panel__full-tag">Added</span>
                    ) : (
                      <button
                        className="set-action-btn"
                        onClick={() => handleAddToSlot(slot.id)}
                        disabled={busy}
                        data-testid={`slot-target-add-to-${slot.id}`}
                      >Add candidate</button>
                    )}
                  </div>
                  {i < sorted.length - 1 && (
                    <button
                      className="slot-target-panel__insert-btn"
                      onClick={() => handleInsertBetween(slot.position)}
                      disabled={busy}
                      data-testid={`slot-target-insert-after-${i}`}
                    >Insert here</button>
                  )}
                </Fragment>
              );
            })}

            <button
              className="slot-target-panel__append-btn"
              onClick={handleAppend}
              disabled={busy}
              data-testid="slot-target-append"
            >
              {busy ? 'Adding…' : 'Append to end'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// --- Search results table sub-component ---

const COL_CHOOSER_WIDTH = 28;

function SearchResultsTable({ table, rows, virtualizer, virtualItems, loading, error, isEmpty, onAddToTracklist, onAddToPool, onSource, onOpenSlotPanel, colConfigOpen, onToggleColConfig, colConfigRef, configurableColumns, columnVisibility, onToggleColumn, registerNested }: {
  table: ReturnType<typeof useReactTable<Track>>;
  rows: ReturnType<ReturnType<typeof useReactTable<Track>>['getRowModel']>['rows'];
  virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
  virtualItems: ReturnType<ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>['getVirtualItems']>;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  onAddToTracklist: (id: number) => void;
  onAddToPool: (id: number) => void;
  onSource: (id: number, title: string) => void;
  onOpenSlotPanel?: (id: number) => void;
  colConfigOpen: boolean;
  onToggleColConfig: () => void;
  colConfigRef: React.RefObject<HTMLTableCellElement | null>;
  configurableColumns: { id: string; label: string }[];
  columnVisibility: Record<string, boolean>;
  onToggleColumn: (id: string) => void;
  registerNested: () => () => void;
}) {
  const colCount = table.getVisibleLeafColumns().length + 3 + 1;

  useEffect(() => {
    if (colConfigOpen) {
      const cleanup = registerNested();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.stopImmediatePropagation(); onToggleColConfig(); }
      };
      document.addEventListener('keydown', onKey, true);
      return () => { cleanup(); document.removeEventListener('keydown', onKey, true); };
    }
  }, [colConfigOpen, registerNested, onToggleColConfig]);

  function renderRow(
    row: (typeof rows)[number],
    virtualRef?: (node: Element | null) => void,
    virtualIndex?: number,
    virtualStyle?: React.CSSProperties,
  ) {
    return (
      <tr key={row.id} ref={virtualRef} data-index={virtualIndex} data-testid="search-result-row" style={virtualStyle}>
        <td style={{ width: 32 }}>
          <PlayButton trackId={row.original.id} title={row.original.title} />
        </td>
        {row.getVisibleCells().map(cell => (
          <td key={cell.id} style={{ width: cell.column.getSize() }}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
        <td style={{ width: 120 }}>
          <div className="search-modal__row-actions">
            <button className="search-modal__add-btn" onClick={() => onOpenSlotPanel ? onOpenSlotPanel(row.original.id) : onAddToTracklist(row.original.id)} title={onOpenSlotPanel ? 'Place in slot…' : 'Add to tracklist'} aria-label={onOpenSlotPanel ? 'Place in slot' : 'Add to tracklist'} data-testid="row-add-btn">+</button>
            <button className="search-modal__source-btn" onClick={() => onSource(row.original.id, row.original.title)} title="Show transitions" data-testid="source-btn">Source</button>
            <RowActionMenu trackId={row.original.id} onAddToTracklist={onAddToTracklist} onAddToPool={onAddToPool} onOpenSlotPanel={onOpenSlotPanel} registerNested={registerNested} />
          </div>
        </td>
        <td style={{ width: COL_CHOOSER_WIDTH }} />
      </tr>
    );
  }

  return (
    <table className="track-table" data-testid="search-results-table">
      <thead>
        {table.getHeaderGroups().map(hg => (
          <tr key={hg.id}>
            <th style={{ width: 32 }} />
            {hg.headers.map(header => {
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              return (
                <th key={header.id} style={{ width: header.getSize() }}>
                  <div
                    className={`th-content${canSort ? ' th-sortable' : ''}`}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sorted && <span className="sort-indicator">{sorted === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </div>
                </th>
              );
            })}
            <th style={{ width: 120 }}>Actions</th>
            <th className="col-chooser-th" ref={colConfigRef} style={{ width: COL_CHOOSER_WIDTH }}>
              <button className="col-chooser-btn" onClick={onToggleColConfig} title="Configure columns" aria-label="Configure columns" data-testid="search-col-config-btn">⋮</button>
              {colConfigOpen && (
                <div className="column-config-popover" data-testid="search-col-config-popover">
                  {configurableColumns.map(c => (
                    <label key={c.id} className="column-config-item">
                      <input type="checkbox" checked={columnVisibility[c.id] !== false} onChange={() => onToggleColumn(c.id)} data-testid={`col-toggle-${c.id}`} />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </th>
          </tr>
        ))}
      </thead>
      <tbody style={virtualItems.length > 0 ? { height: virtualizer.getTotalSize(), position: 'relative' } : undefined}>
        {loading ? (
          <tr><td colSpan={colCount} className="table-status">Loading tracks…</td></tr>
        ) : error ? (
          <tr><td colSpan={colCount} className="table-status table-status--error">Failed to load — {error}</td></tr>
        ) : isEmpty ? (
          <tr><td colSpan={colCount} className="table-status">No tracks found</td></tr>
        ) : virtualItems.length > 0 ? (
          virtualItems.map(vi => renderRow(
            rows[vi.index],
            virtualizer.measureElement,
            vi.index,
            { position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, display: 'table-row' },
          ))
        ) : (
          rows.map(row => renderRow(row))
        )}
      </tbody>
    </table>
  );
}

// --- Transition results table sub-component ---

function TransitionResultsTable({ table, rows, virtualizer, virtualItems, loading, onAddToTracklist, onAddToPool, onSource, onOpenSlotPanel, colConfigOpen, onToggleColConfig, colConfigRef, configurableColumns, columnVisibility, onToggleColumn, registerNested }: {
  table: ReturnType<typeof useReactTable<TransitionMatch>>;
  rows: ReturnType<ReturnType<typeof useReactTable<TransitionMatch>>['getRowModel']>['rows'];
  virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
  virtualItems: ReturnType<ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>['getVirtualItems']>;
  loading: boolean;
  onAddToTracklist: (id: number) => void;
  onAddToPool: (id: number) => void;
  onSource: (id: number, title: string) => void;
  onOpenSlotPanel?: (id: number) => void;
  colConfigOpen: boolean;
  onToggleColConfig: () => void;
  colConfigRef: React.RefObject<HTMLTableCellElement | null>;
  configurableColumns: { id: string; label: string }[];
  columnVisibility: Record<string, boolean>;
  onToggleColumn: (id: string) => void;
  registerNested: () => () => void;
}) {
  const colCount = table.getVisibleLeafColumns().length + 3 + 1;

  useEffect(() => {
    if (colConfigOpen) {
      const cleanup = registerNested();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.stopImmediatePropagation(); onToggleColConfig(); }
      };
      document.addEventListener('keydown', onKey, true);
      return () => { cleanup(); document.removeEventListener('keydown', onKey, true); };
    }
  }, [colConfigOpen, registerNested, onToggleColConfig]);

  function renderRow(
    row: (typeof rows)[number],
    virtualRef?: (node: Element | null) => void,
    virtualIndex?: number,
    virtualStyle?: React.CSSProperties,
  ) {
    return (
      <tr key={row.id} ref={virtualRef} data-index={virtualIndex} data-testid="transition-result-row" style={virtualStyle}>
        <td style={{ width: 32 }}>
          <PlayButton trackId={row.original.candidate_id} title={row.original.title} />
        </td>
        {row.getVisibleCells().map(cell => (
          <td key={cell.id} style={{ width: cell.column.getSize() }}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
        <td style={{ width: 120 }}>
          <div className="search-modal__row-actions">
            <button className="search-modal__add-btn" onClick={() => onOpenSlotPanel ? onOpenSlotPanel(row.original.candidate_id) : onAddToTracklist(row.original.candidate_id)} title={onOpenSlotPanel ? 'Place in slot…' : 'Add to tracklist'} aria-label={onOpenSlotPanel ? 'Place in slot' : 'Add to tracklist'} data-testid="row-add-btn">+</button>
            <button className="search-modal__source-btn" onClick={() => onSource(row.original.candidate_id, row.original.title)} title="Source this track" data-testid="source-btn">Source</button>
            <RowActionMenu trackId={row.original.candidate_id} onAddToTracklist={onAddToTracklist} onAddToPool={onAddToPool} onOpenSlotPanel={onOpenSlotPanel} registerNested={registerNested} />
          </div>
        </td>
        <td style={{ width: COL_CHOOSER_WIDTH }} />
      </tr>
    );
  }

  return (
    <table className="matches-table" data-testid="transition-results-table">
      <thead>
        {table.getHeaderGroups().map(hg => (
          <tr key={hg.id}>
            <th style={{ width: 32 }} />
            {hg.headers.map(header => {
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              return (
                <th key={header.id} style={{ width: header.getSize() }}>
                  <div
                    className={`th-content${canSort ? ' th-sortable' : ''}`}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sorted && <span className="sort-indicator">{sorted === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </div>
                </th>
              );
            })}
            <th style={{ width: 120 }}>Actions</th>
            <th className="col-chooser-th" ref={colConfigRef} style={{ width: COL_CHOOSER_WIDTH }}>
              <button className="col-chooser-btn" onClick={onToggleColConfig} title="Configure columns" aria-label="Configure columns" data-testid="match-col-config-btn">⋮</button>
              {colConfigOpen && (
                <div className="column-config-popover" data-testid="match-col-config-popover">
                  {configurableColumns.map(c => (
                    <label key={c.id} className="column-config-item">
                      <input type="checkbox" checked={columnVisibility[c.id] !== false} onChange={() => onToggleColumn(c.id)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </th>
          </tr>
        ))}
      </thead>
      <tbody style={virtualItems.length > 0 ? { height: virtualizer.getTotalSize(), position: 'relative' } : undefined}>
        {loading ? (
          <tr><td colSpan={colCount} className="table-status">Loading matches…</td></tr>
        ) : rows.length === 0 ? (
          <tr><td colSpan={colCount} className="table-status">No matches in this bucket</td></tr>
        ) : virtualItems.length > 0 ? (
          virtualItems.map(vi => renderRow(
            rows[vi.index],
            virtualizer.measureElement,
            vi.index,
            { position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, display: 'table-row' },
          ))
        ) : (
          rows.map(row => renderRow(row))
        )}
      </tbody>
    </table>
  );
}


