import { useState, useCallback, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, type DragMoveEvent, PointerSensor, useSensor, useSensors, MeasuringStrategy, pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { SearchPanel } from './components/SearchPanel';
import { FilterBar, FilterToggleButton } from './components/FilterBar';
import { TrackTable } from './components/TrackTable';
import { MatchesPanel } from './components/MatchesPanel';
import { MatchDetail } from './components/MatchDetail';
import { WeightControls } from './components/WeightControls';
import { AdminDashboard } from './components/AdminDashboard';
import { SetBuilder } from './components/SetBuilder';
import { SetWorkspacePanel } from './components/SetWorkspacePanel';
import { SetExplorerCanvas } from './components/SetExplorerCanvas';
import { DockBar, type PanelKey } from './components/DockBar';
import { PlayerBar } from './components/PlayerBar';
import { AudioPlayerProvider } from './hooks/useAudioPlayer';
import { useSelectedTrack } from './hooks/useSelectedTrack';
import { useTrackFilters } from './hooks/useTrackFilters';
import { useCollectionCache } from './hooks/useCollectionCache';
import { useCacheStats } from './hooks/useCacheStats';
import { useWeights } from './hooks/useWeights';
import { useSetBuilder } from './hooks/useSetBuilder';
import type { Track, SearchSuggestion, TransitionMatch, TransitionChainEntry } from './types';
import type { DragPayload } from './dnd';
import { DragFillContext } from './dnd';
import type { SortingState } from '@tanstack/react-table';

const BROWSE_PAGE_SIZE = 250;
const SNAP_MODIFIERS = [snapCenterToCursor];

const COL_VIS_STORAGE_KEY = 'dj-tools-browse-col-visibility';
const PANEL_SPLIT_PREFIX = 'dj-tools-panel-split-';
const POOL_EXPANDED_KEY = 'dj-tools-pool-expanded';
const DEFAULT_PANEL_HEIGHT = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.51) : 350;

const BROWSE_CONFIGURABLE_COLUMNS = [
  { id: 'camelot_code', label: 'Camelot' },
  { id: 'key', label: 'Key' },
  { id: 'bpm', label: 'BPM' },
  { id: 'energy', label: 'Energy' },
  { id: 'label', label: 'Label' },
  { id: 'genre', label: 'Genre' },
  { id: 'date_added', label: 'Date Added' },
];

const isEmptyRowId = (id: string) =>
  id.includes('drop-tracklist-empty-') || id.includes('drop-pool-empty-');

// dnd-kit's internal collisionRect / pointerCoordinates can lag behind
// fast pointer movements (the PointerSensor resets delta to zero at
// activation). Track the real pointer position at the document level
// so the collision fallback always has up-to-date coordinates.
let _lastPointerX = 0;
let _lastPointerY = 0;
if (typeof document !== 'undefined') {
  const _trackPointer = (e: PointerEvent) => {
    _lastPointerX = e.clientX;
    _lastPointerY = e.clientY;
  };
  document.addEventListener('pointermove', _trackPointer, true);
  document.addEventListener('pointerup', _trackPointer, true);
}

export const dndCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const rect = rectIntersection(args);

  const activeEmptyId = (args.active.data.current as Record<string, unknown> | undefined)?.__emptyId as string | undefined;
  const isSelfDrop = (id: string) => {
    if (!activeEmptyId) return false;
    return id.endsWith('-' + activeEmptyId);
  };

  if (pointer.length > 0) {
    const hasCell = pointer.some(c => String(c.id).startsWith('drop-explorer-cell-'));
    if (hasCell) {
      const filtered = pointer.filter(c => String(c.id).startsWith('drop-explorer-cell-'));
      if (filtered.length > 0) return filtered;
    }
  }

  const pointerEmpty = pointer.filter(c => isEmptyRowId(String(c.id)) && !isSelfDrop(String(c.id)));
  if (pointerEmpty.length > 0) return pointerEmpty;
  const rectEmpty = rect.filter(c => isEmptyRowId(String(c.id)) && !isSelfDrop(String(c.id)));
  if (rectEmpty.length > 0) return rectEmpty;

  {
    const x = _lastPointerX;
    const y = _lastPointerY;
    const containers = Array.isArray(args.droppableContainers)
      ? args.droppableContainers
      : [...(args.droppableContainers as Iterable<unknown>)].map(
          (entry) => (Array.isArray(entry) ? entry[1] : entry) as { id: unknown; disabled: boolean; node: { current: HTMLElement | null }; data: { current?: Record<string, unknown> } },
        );
    for (const container of containers) {
      if (container.disabled) continue;
      const cid = String(container.id);
      if (!isEmptyRowId(cid) || isSelfDrop(cid)) continue;
      const node = container.node.current;
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return [{ id: container.id as string, data: { droppableContainer: container, value: 0 } }];
      }
    }
  }

  if (pointer.length > 0) {
    const activeData = args.active.data.current as DragPayload | undefined;
    if (activeData?.source === 'tracklist') {
      const isRowId = (id: string) =>
        id.startsWith('drop-tracklist-row-') || /^alt-drop-tracklist-row-/.test(id);
      const rows = pointer.filter(c => isRowId(String(c.id)));
      if (rows.length > 0) return rows;
      const rectRows = rect.filter(c => isRowId(String(c.id)));
      if (rectRows.length > 0) return rectRows;
      const filtered = pointer.filter(c => {
        const id = String(c.id);
        return id !== 'drop-tracklist' && id !== 'alt-drop-tracklist' && !isSelfDrop(id);
      });
      if (filtered.length > 0) return filtered;
    }
    const nonSelf = pointer.filter(c => !isSelfDrop(String(c.id)));
    return nonSelf.length > 0 ? nonSelf : pointer;
  }
  const nonSelfRect = rect.filter(c => !isSelfDrop(String(c.id)));
  return nonSelfRect.length > 0 ? nonSelfRect : rect;
};

function isPlainObject(v: unknown): v is Record<string, boolean> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function loadColumnVisibility(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COL_VIS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function loadPanelHeight(): number {
  try {
    const raw = localStorage.getItem(PANEL_SPLIT_PREFIX + 'shared');
    if (!raw) return DEFAULT_PANEL_HEIGHT;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 120 ? n : DEFAULT_PANEL_HEIGHT;
  } catch {
    return DEFAULT_PANEL_HEIGHT;
  }
}

function savePanelHeight(h: number) {
  localStorage.setItem(PANEL_SPLIT_PREFIX + 'shared', String(Math.round(h)));
}

function loadPoolExpanded(): boolean {
  try {
    return localStorage.getItem(POOL_EXPANDED_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function App() {
  const { allTracks, traitMap, loading: collectionLoading, tracksError, traitsError } = useCollectionCache();

  const [activePanel, setActivePanel] = useState<PanelKey | null>(null);
  const [detailMatch, setDetailMatch] = useState<TransitionMatch | null>(null);
  const [searchText, setSearchText] = useState('');
  const rawDeferredSearchText = useDeferredValue(searchText);
  const effectiveSearchText = searchText === '' ? '' : rawDeferredSearchText;
  const [loadedPages, setLoadedPages] = useState(1);
  const loadedPageCacheRef = useRef<Map<string, number>>(new Map());
  const [transitionChain, setTransitionChain] = useState<TransitionChainEntry[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [poolExpanded, setPoolExpanded] = useState(loadPoolExpanded);
  const [dragItem, setDragItem] = useState<DragPayload | null>(null);
  const [dndWarning, setDndWarning] = useState<string | null>(null);
  const dragFillNotification = null;

  const browseScrollRef = useRef<HTMLDivElement | null>(null);
  const browseContextRef = useRef<{ scrollTop: number; targetFilterKey: string } | null>(null);
  const pendingScrollRestoreRef = useRef<{ scrollTop: number; targetFilterKey: string } | null>(null);

  const weightsChangedRef = useRef(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoverPanelRef = useRef<PanelKey | null>(null);

  const [panelHeight, setPanelHeight] = useState<number>(loadPanelHeight);

  const handlePanelHeightChange = useCallback(
    (h: number) => {
      setPanelHeight(h);
      savePanelHeight(h);
    },
    [],
  );

  const handlePoolExpandedChange = useCallback((expanded: boolean) => {
    setPoolExpanded(expanded);
    try { localStorage.setItem(POOL_EXPANDED_KEY, String(expanded)); } catch {}
  }, []);

  const {
    stats: cacheStats,
    loading: cacheLoading,
    error: cacheError,
    refresh: refreshCacheStats,
  } = useCacheStats(showAdmin);

  const {
    selectedTrack,
    matches,
    matchesLoading,
    matchesError,
    selectTrack,
    clearSelectedTrack,
    refetchMatches,
  } = useSelectedTrack(refreshCacheStats);

  const {
    filters,
    filteredTracks,
    filterCacheKey,
    activeFilterCount,
    setCamelotCodes,
    setBpmMin,
    setBpmMax,
    setArtist,
    setLabel,
    setGenre,
    setDateAddedMin,
    setDateAddedMax,
    clearAllFilters,
  } = useTrackFilters(allTracks, effectiveSearchText);

  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const {
    weights,
    loading: weightsLoading,
    error: weightsError,
    saving: weightsSaving,
    saveSuccess: weightsSaveSuccess,
    setWeight: rawSetWeight,
    rawSum,
    isSumValid,
    warningMessage: weightsWarning,
    normalizeWeights,
    resetWeights,
  } = useWeights(refetchMatches);

  const setWeight = useCallback((factor: string, value: number) => {
    weightsChangedRef.current = true;
    rawSetWeight(factor, value);
  }, [rawSetWeight]);

  const handleCloseWeights = useCallback(() => {
    setShowWeights(false);
    if (weightsChangedRef.current) {
      refetchMatches();
      weightsChangedRef.current = false;
    }
  }, [refetchMatches]);

  useEffect(() => {
    if (!showWeights) return;
    weightsChangedRef.current = false;
  }, [showWeights]);

  useEffect(() => {
    if (!showWeights && !showAdmin) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showWeights) handleCloseWeights();
        else if (showAdmin) setShowAdmin(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showWeights, showAdmin, handleCloseWeights]);

  const {
    sets,
    activeSetId: sbActiveSetId,
    activeSet,
    loading: sbLoading,
    error: sbError,
    pendingAdd,
    createSet,
    selectSet,
    deleteSet,
    addToPool: sbAddToPool,
    addToTracklist: sbAddToTracklist,
    removeFromPool,
    clearPool,
    removeFromTracklist,
    clearTracklist,
    movePoolToTracklist,
    moveTracklistToPool,
    reorderPool,
    reorderTracklist,
    addToTracklistAtPosition,
    updateTracklistNote,
    togglePoolStar,
    toggleTracklistStar,
    addExplorerNode,
    deleteExplorerNode,
    addExplorerEdge,
    deleteExplorerEdge,
    addSiblingNode,
    swapExplorerNodes,
    moveExplorerNode,
    explorerNodeAddToTracklist,
    fetchEdgeScores,
    isPoolAddInFlight,
    resolvePendingAdd,
    clearPendingAdd,
    clearError,
    activeTreeId,
    selectTree,
    createTree,
    renameTree,
    deleteTree,
    createSubgroup,
    renameSubgroup,
    deleteSubgroup,
    reorderSubgroups,
    addSubgroupMember,
    removeSubgroupMember,
    addEmptyRows,
    deleteEmptyRow,
    reorderEmptyRow,
  } = useSetBuilder();

  const starredTrackIds = useMemo(() => {
    if (!activeSet) return new Set<number>();
    const ids = new Set<number>();
    for (const e of activeSet.pool) { if (e.starred) ids.add(e.track_id); }
    for (const e of activeSet.tracklist) { if (e.starred) ids.add(e.track_id); }
    return ids;
  }, [activeSet]);

  const [browseColumnVisibility, setBrowseColumnVisibility] = useState<Record<string, boolean>>(loadColumnVisibility);

  useEffect(() => {
    localStorage.setItem(COL_VIS_STORAGE_KEY, JSON.stringify(browseColumnVisibility));
  }, [browseColumnVisibility]);

  const toggleBrowseColumn = useCallback((id: string) => {
    setBrowseColumnVisibility(prev => ({
      ...prev,
      [id]: prev[id] !== false ? false : true,
    }));
  }, []);

  const [browseSorting, setBrowseSorting] = useState<SortingState>([]);

  const sortedTracks = useMemo(() => {
    if (browseSorting.length === 0) return filteredTracks;
    return [...filteredTracks].sort((a, b) => {
      for (const { id, desc } of browseSorting) {
        const av = a[id as keyof Track];
        const bv = b[id as keyof Track];
        if (av == null && bv == null) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        let cmp: number;
        if (id === 'date_added') {
          cmp = new Date(av as string).getTime() - new Date(bv as string).getTime();
        } else if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv;
        } else {
          cmp = String(av).localeCompare(String(bv));
        }
        if (cmp !== 0) return desc ? -cmp : cmp;
      }
      return 0;
    });
  }, [filteredTracks, browseSorting]);

  const browsePages = useMemo(() => {
    const pages: Track[][] = [];
    for (let i = 0; i < sortedTracks.length; i += BROWSE_PAGE_SIZE) {
      pages.push(sortedTracks.slice(i, i + BROWSE_PAGE_SIZE));
    }
    return pages;
  }, [sortedTracks]);

  const totalPages = browsePages.length;

  const visibleTracks = useMemo(() => {
    const cap = Math.min(loadedPages, totalPages);
    return browsePages.slice(0, cap).flat();
  }, [browsePages, loadedPages, totalPages]);

  const hasMorePages = loadedPages < totalPages;

  useEffect(() => {
    const cached = loadedPageCacheRef.current.get(filterCacheKey);
    setLoadedPages(cached ?? 1);
  }, [filterCacheKey]);

  useEffect(() => {
    if (pendingScrollRestoreRef.current == null) return;
    if (selectedTrack != null) return;
    if (browseContextRef.current != null) return;

    const pending = pendingScrollRestoreRef.current;
    if (pending.targetFilterKey !== filterCacheKey) {
      pendingScrollRestoreRef.current = null;
      return;
    }

    const expectedPages = loadedPageCacheRef.current.get(filterCacheKey);
    if (expectedPages != null && expectedPages > 1 && loadedPages < expectedPages) return;

    pendingScrollRestoreRef.current = null;
    requestAnimationFrame(() => {
      if (browseScrollRef.current) {
        browseScrollRef.current.scrollTop = pending.scrollTop;
      }
    });
  }, [filterCacheKey, loadedPages, selectedTrack]);

  const handleLoadMore = useCallback(() => {
    setLoadedPages(prev => {
      const next = Math.min(prev + 1, totalPages);
      loadedPageCacheRef.current.set(filterCacheKey, next);
      return next;
    });
  }, [totalPages, filterCacheKey]);

  const activePanelRef = useRef(activePanel);
  activePanelRef.current = activePanel;

  const handleSelectTrack = useCallback(
    (track: Track | SearchSuggestion) => {
      setDetailMatch(null);
      setTransitionChain([]);
      selectTrack(track);
      setSearchText(track.title);
      if (activePanelRef.current === null) {
        setActivePanel('matches');
      }
    },
    [selectTrack],
  );

  const handleBrowseSelect = useCallback(
    (track: Track) => {
      browseContextRef.current = {
        scrollTop: browseScrollRef.current?.scrollTop ?? 0,
        targetFilterKey: filterCacheKey,
      };
      handleSelectTrack(track);
    },
    [handleSelectTrack, filterCacheKey],
  );

  const handleUseAsSource = useCallback(
    (candidateId: number) => {
      if (!selectedTrack) return;
      const candidate = allTracks.find(t => t.id === candidateId);
      if (!candidate) return;
      setTransitionChain(prev => [...prev, { track: selectedTrack }]);
      setDetailMatch(null);
      selectTrack(candidate);
      setSearchText(candidate.title);
    },
    [selectedTrack, allTracks, selectTrack],
  );

  const handleChainNavigate = useCallback(
    (index: number) => {
      const entry = transitionChain[index];
      if (!entry) return;
      setTransitionChain(prev => prev.slice(0, index));
      setDetailMatch(null);
      selectTrack(entry.track);
      setSearchText(entry.track.title);
    },
    [transitionChain, selectTrack],
  );

  const handleChainBack = useCallback(() => {
    if (transitionChain.length === 0) return;
    const last = transitionChain[transitionChain.length - 1];
    setTransitionChain(prev => prev.slice(0, -1));
    setDetailMatch(null);
    selectTrack(last.track);
    setSearchText(last.track.title);
  }, [transitionChain, selectTrack]);

  const addToPoolFn = sbAddToPool;
  const addToTracklistFn = sbAddToTracklist;

  const setBuilderRef = useRef({
    activeSet, isPoolAddInFlight, addExplorerNode, addSiblingNode, activeTreeId,
  });
  setBuilderRef.current = {
    activeSet, isPoolAddInFlight, addExplorerNode, addSiblingNode, activeTreeId,
  };

  const handleAddToPool = useCallback(
    (candidateId: number) => {
      const track = allTracks.find(t => t.id === candidateId);
      if (track) addToPoolFn(track.id, track.title);
    },
    [allTracks, addToPoolFn],
  );

  const handleAddToTracklist = useCallback(
    (candidateId: number) => {
      const track = allTracks.find(t => t.id === candidateId);
      if (track) addToTracklistFn(track.id, track.title);
    },
    [allTracks, addToTracklistFn],
  );

  const handleClearFilters = useCallback(() => {
    clearAllFilters();
    if (!selectedTrack) {
      setSearchText('');
    }
  }, [clearAllFilters, selectedTrack]);

  const handleClearSelectedTrack = useCallback(() => {
    setDetailMatch(null);
    setTransitionChain([]);
    const ctx = browseContextRef.current;
    if (ctx) {
      pendingScrollRestoreRef.current = { scrollTop: ctx.scrollTop, targetFilterKey: ctx.targetFilterKey };
      browseContextRef.current = null;
    }
    clearSelectedTrack();
  }, [clearSelectedTrack]);

  const setTabLabel = useMemo(() => {
    if (activeSet) {
      const total = activeSet.pool.length + activeSet.tracklist.length;
      return `Set (${total})`;
    }
    return 'Set';
  }, [activeSet]);

  const tracklistTrackIds = useMemo(() => {
    if (!activeSet) return new Set<number>();
    return new Set(activeSet.tracklist.map(e => e.track_id));
  }, [activeSet]);

  const panelIsOpen = activePanel !== null;
  const isSetMode = activePanel === 'explorer' && activeSet !== null;

  // --- DnD ---
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const measuringConfig = useMemo(() => ({
    droppable: {
      strategy: MeasuringStrategy.WhileDragging,
      frequency: 100,
    },
  }), []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragPayload | undefined;
    if (data) setDragItem(data);
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    const panelKey: PanelKey | null =
      overId === 'dock-matches' ? 'matches' :
      overId === 'dock-set'     ? 'set'     :
      overId === 'dock-explorer'? 'explorer': null;

    if (panelKey === lastHoverPanelRef.current) return;
    lastHoverPanelRef.current = panelKey;

    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    if (panelKey) {
      hoverTimerRef.current = setTimeout(() => {
        setActivePanel(panelKey);
      }, 400);
    }
  }, []);

  const handleDragCancel = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    lastHoverPanelRef.current = null;
    setDragItem(null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    lastHoverPanelRef.current = null;
    setDragItem(null);
    const { active, over: dndOver } = event;
    const payload = active.data.current as DragPayload | undefined;
    if (!payload) return;

    let over = dndOver;
    const CONTAINER_IDS = ['drop-tracklist', 'alt-drop-tracklist', 'drop-pool', 'alt-drop-pool'];
    if (
      payload.trackId > 0 &&
      (!over || CONTAINER_IDS.includes(String(over.id)))
    ) {
      const el = typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(_lastPointerX, _lastPointerY)
        : null;
      const emptyTr = el?.closest?.('tr[data-empty-id]');
      if (emptyTr) {
        const domEmptyId = emptyTr.getAttribute('data-empty-id')!;
        const inTracklist = emptyTr.closest('.set-tracklist-table') != null;
        const prefix = inTracklist ? 'drop-tracklist-empty-' : 'drop-pool-empty-';
        const isAlt = emptyTr.closest('#panel-explorer') != null;
        const droppableId = (isAlt ? 'alt-' : '') + prefix + domEmptyId;
        const realPosAttr = emptyTr.getAttribute('data-real-position');
        const realPosition = realPosAttr != null && !isNaN(Number(realPosAttr))
          ? parseInt(realPosAttr, 10)
          : undefined;
        over = {
          id: droppableId,
          rect: emptyTr.getBoundingClientRect(),
          data: { current: { __emptyId: domEmptyId, realPosition } },
          disabled: false,
        } as typeof dndOver;
      }
    }

    if (!over) return;
    const rawTargetId = String(over.id);
    const targetId = rawTargetId.startsWith('alt-') ? rawTargetId.slice(4) : rawTargetId;
    const sb = setBuilderRef.current;
    const trackIds = payload.selectedTrackIds && payload.selectedTrackIds.length > 1
      ? payload.selectedTrackIds
      : [payload.trackId];

    if (targetId.startsWith('drop-tracklist-empty-') || targetId.startsWith('drop-pool-empty-')) {
      if (!sb.activeSet) return;
      const isTracklist = targetId.startsWith('drop-tracklist-empty-');
      const overData = over.data?.current as { __emptyId?: string; __persistedId?: number; realPosition?: number } | undefined;
      const overPersistedId = overData?.__persistedId;
      const realPosition = overData?.realPosition;
      const validTrackIds = trackIds.filter(id => id > 0);

      const dragData = active.data.current as DragPayload & { __persistedId?: number } | undefined;
      const dragPersistedId = dragData?.__persistedId;

      if (validTrackIds.length === 0 && dragPersistedId != null && overPersistedId != null) {
        if (dragPersistedId === overPersistedId) return;
        if (realPosition != null) {
          reorderEmptyRow(dragPersistedId, realPosition);
        }
        return;
      }

      if (validTrackIds.length === 0) return;

      for (const tid of validTrackIds) {
        const t = allTracks.find(tr => tr.id === tid);
        if (isTracklist) {
          if (payload.source === 'tracklist' && realPosition != null) {
            reorderTracklist(tid, realPosition);
          } else if (realPosition != null) {
            addToTracklistAtPosition(tid, realPosition, t?.title ?? payload.title);
          } else {
            addToTracklistFn(tid, t?.title ?? payload.title);
          }
        } else {
          addToPoolFn(tid, t?.title ?? payload.title);
        }
      }
      if (overPersistedId != null) {
        deleteEmptyRow(overPersistedId);
      }
      return;
    }

    if (payload.source === 'tracklist' && targetId.startsWith('drop-tracklist-row-')) {
      const dragData = active.data.current as DragPayload & { __persistedId?: number } | undefined;
      const dragPersistedId = dragData?.__persistedId;
      if (payload.trackId <= 0 && dragPersistedId != null) {
        const displayIndex = parseInt(targetId.replace('drop-tracklist-row-', ''), 10);
        if (!isNaN(displayIndex)) {
          reorderEmptyRow(dragPersistedId, displayIndex);
        }
        return;
      }

      const overRowData = over.data?.current as { trackId?: number } | undefined;
      const targetTrackId = overRowData?.trackId;
      if (targetTrackId != null && sb.activeSet) {
        const sourceEntry = sb.activeSet.tracklist.find(e => e.track_id === payload.trackId);
        const targetEntry = sb.activeSet.tracklist.find(e => e.track_id === targetTrackId);
        if (sourceEntry && targetEntry && sourceEntry.position !== targetEntry.position) {
          reorderTracklist(payload.trackId, targetEntry.position);
        }
      }
      return;
    }

    if (payload.source === 'tracklist' && targetId === 'drop-tracklist') {
      return;
    }

    if (payload.source === 'pool' && targetId.startsWith('drop-pool-row-')) {
      const overData = event.over?.data?.current as { entryRank?: number } | undefined;
      const targetRank = overData?.entryRank;
      if (targetRank != null && sb.activeSet) {
        const sourceRank = sb.activeSet.pool.findIndex(e => e.track_id === payload.trackId);
        if (sourceRank !== -1 && sourceRank !== targetRank) {
          reorderPool(payload.trackId, targetRank);
        }
      }
      return;
    }

    if (payload.source === 'pool' && targetId === 'drop-pool') {
      return;
    }

    if (targetId === 'dock-matches') {
      const track = allTracks.find(t => t.id === payload.trackId);
      if (track) {
        handleSelectTrack(track);
        setActivePanel('matches');
      }
    } else if (targetId === 'dock-set' || targetId === 'drop-tracklist') {
      if (!sb.activeSet) {
        setDndWarning('Select or create a set first');
        setTimeout(() => setDndWarning(null), 2000);
        if (targetId === 'dock-set') setActivePanel('set');
        return;
      }
      for (const tid of trackIds) {
        const t = allTracks.find(tr => tr.id === tid);
        addToTracklistFn(tid, t?.title ?? payload.title);
      }
      if (targetId === 'dock-set') setActivePanel('set');
    } else if (targetId === 'drop-pool') {
      const poolSet = sb.activeSet ? new Set(sb.activeSet.pool.map(e => e.track_id)) : new Set<number>();
      let anySkipped = false;
      for (const tid of trackIds) {
        if (poolSet.has(tid) || sb.isPoolAddInFlight(tid)) {
          anySkipped = true;
          continue;
        }
        const t = allTracks.find(tr => tr.id === tid);
        addToPoolFn(tid, t?.title ?? payload.title);
      }
      if (anySkipped && trackIds.length === 1) {
        setDndWarning('Track already in pool');
        setTimeout(() => setDndWarning(null), 2000);
        return;
      }
      if (!poolExpanded) handlePoolExpandedChange(true);
    } else if (targetId === 'dock-explorer') {
      if (sb.activeSet) {
        const treeNodes = sb.activeTreeId != null
          ? sb.activeSet.explorer_nodes.filter(n => n.tree_id === sb.activeTreeId)
          : sb.activeSet.explorer_nodes;
        const maxLevel = treeNodes.length > 0 ? Math.max(...treeNodes.map(n => n.level)) : -1;
        const targetLevel = maxLevel < 0 ? 0 : maxLevel;
        const occupied = new Set(treeNodes.filter(n => n.level === targetLevel).map(n => n.col_index));
        const freeCol = [0, 1, 2, 3, 4].find(c => !occupied.has(c));
        if (freeCol !== undefined) {
          sb.addExplorerNode(payload.trackId, undefined, targetLevel, freeCol);
        } else {
          sb.addExplorerNode(payload.trackId, undefined, targetLevel + 1, 0);
        }
      } else {
        setDndWarning('Select or create a set first');
        setTimeout(() => setDndWarning(null), 2000);
      }
      setActivePanel('explorer');
    } else if (targetId === 'drop-matches-header') {
      const track = allTracks.find(t => t.id === payload.trackId);
      if (track) handleSelectTrack(track);
    } else if (targetId.startsWith('drop-explorer-cell-')) {
      const parts = targetId.replace('drop-explorer-cell-', '').split('-');
      const level = parseInt(parts[0], 10);
      const colIndex = parseInt(parts[1], 10);
      if (!isNaN(level) && !isNaN(colIndex) && sb.activeSet) {
        const treeNodes = sb.activeTreeId != null
          ? sb.activeSet.explorer_nodes.filter(n => n.tree_id === sb.activeTreeId)
          : sb.activeSet.explorer_nodes;
        const occupant = treeNodes.find(n => n.level === level && n.col_index === colIndex);
        if (occupant) {
          sb.addExplorerNode(payload.trackId, occupant.node_id, level + 1);
        } else {
          sb.addExplorerNode(payload.trackId, undefined, level, colIndex);
        }
      }
    }
  }, [allTracks, handleSelectTrack, addToTracklistFn, addToPoolFn, addToTracklistAtPosition, poolExpanded, handlePoolExpandedChange, reorderTracklist, reorderPool, reorderEmptyRow, deleteEmptyRow]);

  return (
    <AudioPlayerProvider>
    <DragFillContext.Provider value={dragFillNotification}>
    <DndContext sensors={sensors} collisionDetection={dndCollisionDetection} measuring={measuringConfig} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="app-shell-v2">
        {/* ─── Top Anchor Zone (hidden in Set Mode) ─── */}
        {!isSetMode && (
          <div className="top-anchor" style={{ flex: '1 1 0%', minHeight: '28vh' }}>
            {/* ─── Search row with filter toggle ─── */}
            <div className="controls-strip">
              <SearchPanel
                selectedTrack={selectedTrack}
                selectTrack={handleSelectTrack}
                onSearchTextChange={setSearchText}
                onClearSelectedTrack={handleClearSelectedTrack}
                searchText={searchText}
              />
              <FilterToggleButton
                expanded={filtersExpanded}
                onToggle={() => setFiltersExpanded(prev => !prev)}
                activeCount={activeFilterCount}
              />
              <div className="controls-strip-actions">
                <button
                  className={`search-weights-btn${showWeights ? ' search-weights-btn--active' : ''}`}
                  onClick={() => setShowWeights(prev => !prev)}
                  title="Weights"
                  aria-label="Toggle weights"
                >
                  ⚖
                </button>
                <button
                  className={`dock-admin-btn${showAdmin ? ' dock-admin-btn--active' : ''}`}
                  onClick={() => setShowAdmin(prev => !prev)}
                  title="Admin Dashboard"
                  aria-label="Admin Dashboard"
                >
                  ⚙
                </button>
              </div>
            </div>

            {/* ─── Expandable filter tray ─── */}
            <FilterBar
              expanded={filtersExpanded}
              onToggleExpanded={() => setFiltersExpanded(prev => !prev)}
              activeFilterCount={activeFilterCount}
              camelotCodes={filters.camelotCodes}
              bpmMin={filters.bpmMin}
              bpmMax={filters.bpmMax}
              artist={filters.artist}
              label={filters.label}
              genre={filters.genre}
              dateAddedMin={filters.dateAddedMin}
              dateAddedMax={filters.dateAddedMax}
              setCamelotCodes={setCamelotCodes}
              setBpmMin={setBpmMin}
              setBpmMax={setBpmMax}
              setArtist={setArtist}
              setLabel={setLabel}
              setGenre={setGenre}
              setDateAddedMin={setDateAddedMin}
              setDateAddedMax={setDateAddedMax}
              onClearFilters={handleClearFilters}
            />

            {traitsError && (
              <p className="table-status table-status--error" style={{ margin: '0 var(--content-gutter)' }}>
                Failed to load track traits — {traitsError}
              </p>
            )}

            <div className="browse-zone-body">
              <div className="table-panel">
                <TrackTable
                  tracks={visibleTracks}
                  loading={collectionLoading}
                  selectedTrack={selectedTrack}
                  selectTrack={handleBrowseSelect}
                  hasMore={hasMorePages}
                  onLoadMore={handleLoadMore}
                  error={tracksError}
                  columnVisibility={browseColumnVisibility}
                  configurableColumns={BROWSE_CONFIGURABLE_COLUMNS}
                  onToggleColumn={toggleBrowseColumn}
                  starredTrackIds={starredTrackIds}
                  sorting={browseSorting}
                  onSortingChange={setBrowseSorting}
                  scrollContainerRef={browseScrollRef}
                />
              </div>

            </div>
          </div>
        )}

        {/* ─── Dock Bar ─── */}
        <DockBar
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          setLabel={setTabLabel}
          panelHeight={panelHeight}
          onPanelHeightChange={handlePanelHeightChange}
          defaultHeight={DEFAULT_PANEL_HEIGHT}
          isDragging={dragItem !== null}
        />

        {/* ─── Panel Zone (always visible, idle when no panel active) ─── */}
        <div
          className="panel-zone"
          style={isSetMode ? { flex: 1, minHeight: 0 } : { height: panelHeight }}
        >
          {/* Matches panel */}
          <div
            id="panel-matches"
            role="tabpanel"
            aria-labelledby="dock-tab-matches"
            className="panel-content"
            style={{ display: activePanel === 'matches' ? 'flex' : 'none' }}
          >
            {transitionChain.length > 0 && selectedTrack && (
              <div className="transition-chain">
                <button
                  className="chain-back-btn"
                  onClick={handleChainBack}
                  title={`Back to ${transitionChain[transitionChain.length - 1].track.title}`}
                >
                  ← {(() => {
                    const t = transitionChain[transitionChain.length - 1].track.title;
                    return t.length > 25 ? t.slice(0, 25) + '…' : t;
                  })()}
                </button>
                {transitionChain.map((entry, i) => (
                  <span key={`chain-${entry.track.id}-${i}`} className="chain-step">
                    <button
                      className="chain-entry"
                      onClick={() => handleChainNavigate(i)}
                      title={`Return to ${entry.track.title}`}
                    >
                      {entry.track.title}
                    </button>
                    <span className="chain-arrow">→</span>
                  </span>
                ))}
                <span className="chain-current">{selectedTrack.title}</span>
              </div>
            )}

            {!detailMatch && (
              <div className="panel-matches-table">
                <MatchesPanel
                  selectedTrack={selectedTrack}
                  matches={matches}
                  loading={matchesLoading}
                  matchesError={matchesError}
                  onViewDetail={setDetailMatch}
                  onUseAsSource={handleUseAsSource}
                  starredTrackIds={starredTrackIds}
                />
              </div>
            )}
            {detailMatch && (
              <MatchDetail
                sourceTrack={selectedTrack}
                match={detailMatch}
                onBack={() => setDetailMatch(null)}
                traitMap={traitMap}
                onUseAsSource={handleUseAsSource}
                onAddToPool={handleAddToPool}
                onAddToTracklist={handleAddToTracklist}
              />
            )}
          </div>

          {/* Set panel */}
          <div
            id="panel-set"
            role="tabpanel"
            aria-labelledby="dock-tab-set"
            className="panel-content"
            style={{ display: activePanel === 'set' ? 'flex' : 'none' }}
          >
            <SetBuilder
              sets={sets}
              activeSetId={sbActiveSetId}
              activeSet={activeSet}
              loading={sbLoading}
              error={sbError}
              pendingAdd={pendingAdd}
              createSet={createSet}
              selectSet={selectSet}
              deleteSet={deleteSet}
              removeFromPool={removeFromPool}
              clearPool={clearPool}
              movePoolToTracklist={movePoolToTracklist}
              reorderPool={reorderPool}
              addToPool={sbAddToPool}
              removeFromTracklist={removeFromTracklist}
              clearTracklist={clearTracklist}
              moveTracklistToPool={moveTracklistToPool}
              reorderTracklist={reorderTracklist}
              addToTracklistAtPosition={addToTracklistAtPosition}
              updateTracklistNote={updateTracklistNote}
              togglePoolStar={togglePoolStar}
              toggleTracklistStar={toggleTracklistStar}
              addToTracklist={sbAddToTracklist}
              resolvePendingAdd={resolvePendingAdd}
              clearPendingAdd={clearPendingAdd}
              clearError={clearError}
              createSubgroup={createSubgroup}
              renameSubgroup={renameSubgroup}
              deleteSubgroup={deleteSubgroup}
              reorderSubgroups={reorderSubgroups}
              addSubgroupMember={addSubgroupMember}
              removeSubgroupMember={removeSubgroupMember}
              addEmptyRows={addEmptyRows}
              deleteEmptyRow={deleteEmptyRow}
              reorderEmptyRow={reorderEmptyRow}
              poolExpanded={poolExpanded}
              onPoolExpandedChange={handlePoolExpandedChange}
              dndDisabled={activePanel !== 'set'}
            />
          </div>

          {/* Explorer panel */}
          <div
            id="panel-explorer"
            role="tabpanel"
            aria-labelledby="dock-tab-explorer"
            className="panel-content"
            style={{ display: activePanel === 'explorer' ? 'flex' : 'none' }}
          >
            {activeSet ? (
              <div className="set-mode-columns">
                <div className="set-mode-left">
                  <SetWorkspacePanel
                    activeSet={activeSet}
                    removeFromPool={removeFromPool}
                    clearPool={clearPool}
                    movePoolToTracklist={movePoolToTracklist}
                    reorderPool={reorderPool}
                    addToPool={sbAddToPool}
                    removeFromTracklist={removeFromTracklist}
                    clearTracklist={clearTracklist}
                    moveTracklistToPool={moveTracklistToPool}
                    reorderTracklist={reorderTracklist}
                    addToTracklistAtPosition={addToTracklistAtPosition}
                    updateTracklistNote={updateTracklistNote}
                    togglePoolStar={togglePoolStar}
                    toggleTracklistStar={toggleTracklistStar}
                    addToTracklist={sbAddToTracklist}
                    createSubgroup={createSubgroup}
                    renameSubgroup={renameSubgroup}
                    deleteSubgroup={deleteSubgroup}
                    reorderSubgroups={reorderSubgroups}
                    addSubgroupMember={addSubgroupMember}
                    removeSubgroupMember={removeSubgroupMember}
                    addEmptyRows={addEmptyRows}
                    deleteEmptyRow={deleteEmptyRow}
                    reorderEmptyRow={reorderEmptyRow}
                    poolExpanded={true}
                    onPoolExpandedChange={handlePoolExpandedChange}
                    dndDisabled={activePanel !== 'explorer'}
                    dndIdPrefix="alt-"
                  />
                </div>
                <div className="set-mode-right">
                  <SetExplorerCanvas
                    nodes={activeTreeId != null
                      ? activeSet.explorer_nodes.filter(n => n.tree_id === activeTreeId)
                      : activeSet.explorer_nodes}
                    edges={activeTreeId != null
                      ? activeSet.explorer_edges.filter(e => e.tree_id === activeTreeId)
                      : activeSet.explorer_edges}
                    onAddNode={addExplorerNode}
                    onDeleteNode={deleteExplorerNode}
                    onAddEdge={addExplorerEdge}
                    onDeleteEdge={deleteExplorerEdge}
                    onSwap={swapExplorerNodes}
                    onMoveNode={moveExplorerNode}
                    onNodeToTracklist={explorerNodeAddToTracklist}
                    onAddSibling={addSiblingNode}
                    tracklistTrackIds={tracklistTrackIds}
                    fetchEdgeScores={fetchEdgeScores}
                    warningNodeId={null}
                    trees={activeSet.explorer_trees}
                    activeTreeId={activeTreeId}
                    onSelectTree={selectTree}
                    onCreateTree={createTree}
                    onRenameTree={renameTree}
                    onDeleteTree={deleteTree}
                  />
                </div>
              </div>
            ) : (
              <div className="set-builder">
                <div className="set-empty">
                  <p>Select or create a set to use the Explorer.</p>
                  {sets.length > 0 ? (
                    <select
                      className="set-select"
                      value=""
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) selectSet(val);
                      }}
                    >
                      <option value="" disabled>Select a set…</option>
                      {sets.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-muted">No sets exist yet. Create one in the Set panel.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Idle panel state */}
          {!panelIsOpen && (
            <div className="panel-content panel-idle" data-testid="panel-idle">
              <p className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>
                Select a panel above to get started
              </p>
            </div>
          )}
        </div>

        {/* ─── Weights overlay ─── */}
        {showWeights && (
          <>
            <div className="overlay-scrim" onClick={handleCloseWeights} />
            <div className="weights-overlay">
              <div className="weights-overlay__header">
                <span className="weights-overlay__title">Match Weights</span>
                <button
                  className="clear-btn"
                  onClick={handleCloseWeights}
                  title="Close weights"
                >
                  ×
                </button>
              </div>
              {!weightsLoading && Object.keys(weights).length > 0 && (
                <WeightControls
                  weights={weights}
                  setWeight={setWeight}
                  saving={weightsSaving}
                  saveSuccess={weightsSaveSuccess}
                  saveError={weightsError}
                  warningMessage={weightsWarning}
                />
              )}
              <div className="weights-overlay__actions">
                <button
                  className="weight-normalize-btn weight-normalize-btn--secondary"
                  onClick={resetWeights}
                >
                  Reset Weights
                </button>
                <button
                  className={`weight-normalize-btn${isSumValid ? ' inactive' : ''}`}
                  disabled={isSumValid}
                  onClick={normalizeWeights}
                >
                  {`Normalize (Σ ${parseFloat(rawSum.toFixed(1))})`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── Admin modal (centered) ─── */}
        {showAdmin && (
          <>
            <div className="overlay-scrim" onClick={() => setShowAdmin(false)} />
            <div className="admin-modal">
              <div className="admin-modal__header">
                <span className="admin-modal__title">Admin Dashboard</span>
                <button
                  className="clear-btn"
                  onClick={() => setShowAdmin(false)}
                  title="Close admin"
                >
                  ×
                </button>
              </div>
              <AdminDashboard
                stats={cacheStats}
                loading={cacheLoading}
                error={cacheError}
              />
            </div>
          </>
        )}

        {/* DnD warning toast */}
        {dndWarning && (
          <div className="dnd-warning-toast" role="status" data-testid="dnd-warning-toast">
            {dndWarning}
          </div>
        )}

        {/* Global Player Bar */}
        <PlayerBar />
      </div>

      <DragOverlay dropAnimation={null} adjustScale={false} modifiers={SNAP_MODIFIERS}>
        {dragItem && (
          <div className="dnd-drag-preview">
            {dragItem.title}
            {dragItem.selectedTrackIds && dragItem.selectedTrackIds.length > 1 && (
              <span className="dnd-drag-preview__count"> +{dragItem.selectedTrackIds.length - 1}</span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
    </DragFillContext.Provider>
    </AudioPlayerProvider>
  );
}
