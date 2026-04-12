import { useState, useCallback, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, type DragMoveEvent, PointerSensor, useSensor, useSensors, MeasuringStrategy, pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { SearchPanel } from './components/SearchPanel';
import { FilterBar } from './components/FilterBar';
import { TrackTable } from './components/TrackTable';
import { MatchesPanel } from './components/MatchesPanel';
import { MatchDetail } from './components/MatchDetail';
import { WeightControls } from './components/WeightControls';
import { AdminDashboard } from './components/AdminDashboard';
import { SetBuilder } from './components/SetBuilder';
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
import { MAX_COLS } from './dnd';

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
];

const dndCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
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
  const [dndWarningNodeId, setDndWarningNodeId] = useState<string | null>(null);

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
    setCamelotCodes,
    setBpm,
    setBpmMin,
    setBpmMax,
  } = useTrackFilters(allTracks, effectiveSearchText);

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
    reorderTracklist,
    updateTracklistNote,
    togglePoolStar,
    toggleTracklistStar,
    addExplorerNode,
    deleteExplorerNode,
    addExplorerEdge,
    deleteExplorerEdge,
    addSiblingNode,
    swapExplorerNodes,
    explorerNodeAddToTracklist,
    fetchEdgeScores,
    isPoolAddInFlight,
    resolvePendingAdd,
    clearPendingAdd,
    clearError,
    activeTreeId,
    selectTree,
    createTree,
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

  const browsePages = useMemo(() => {
    const pages: Track[][] = [];
    for (let i = 0; i < filteredTracks.length; i += BROWSE_PAGE_SIZE) {
      pages.push(filteredTracks.slice(i, i + BROWSE_PAGE_SIZE));
    }
    return pages;
  }, [filteredTracks]);

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
      handleSelectTrack(track);
    },
    [handleSelectTrack],
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
    setCamelotCodes([]);
    setBpm(undefined);
    setBpmMin(undefined);
    setBpmMax(undefined);
    if (!selectedTrack) {
      setSearchText('');
    }
  }, [setCamelotCodes, setBpm, setBpmMin, setBpmMax, selectedTrack]);

  const handleClearSelectedTrack = useCallback(() => {
    setDetailMatch(null);
    setTransitionChain([]);
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
    const { active, over } = event;
    if (!over) return;
    const payload = active.data.current as DragPayload | undefined;
    if (!payload) return;
    const targetId = String(over.id);
    const sb = setBuilderRef.current;

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
      addToTracklistFn(payload.trackId, payload.title);
      if (targetId === 'dock-set') setActivePanel('set');
    } else if (targetId === 'drop-pool') {
      if (
        (sb.activeSet && sb.activeSet.pool.some(e => e.track_id === payload.trackId))
        || sb.isPoolAddInFlight(payload.trackId)
      ) {
        setDndWarning('Track already in pool');
        setTimeout(() => setDndWarning(null), 2000);
        return;
      }
      addToPoolFn(payload.trackId, payload.title);
      if (!poolExpanded) handlePoolExpandedChange(true);
    } else if (targetId === 'dock-explorer' || targetId === 'drop-explorer') {
      if (sb.activeSet) {
        const allNodes = sb.activeSet.explorer_nodes;
        const allEdges = sb.activeSet.explorer_edges;
        const nodes = sb.activeTreeId != null ? allNodes.filter(n => n.tree_id === sb.activeTreeId) : allNodes;
        const edges = sb.activeTreeId != null ? allEdges.filter(e => e.tree_id === sb.activeTreeId) : allEdges;
        const maxLevel = nodes.length > 0 ? Math.max(...nodes.map(n => n.level)) : -1;
        if (maxLevel < 0) {
          sb.addExplorerNode(payload.trackId, undefined, 0);
        } else {
          const nodesAtMaxLevel = nodes.filter(n => n.level === maxLevel);
          const targetLevel = nodesAtMaxLevel.length < MAX_COLS ? maxLevel : maxLevel + 1;
          const nodesAtTarget = nodes.filter(n => n.level === targetLevel);
          const parentIds = nodesAtTarget.length > 0
            ? [...new Set(edges
                .filter(e => nodesAtTarget.some(n => n.node_id === e.child_node_id))
                .map(e => e.parent_node_id))]
            : [];
          if (parentIds.length > 0) {
            sb.addSiblingNode(payload.trackId, parentIds, targetLevel);
          } else {
            sb.addExplorerNode(payload.trackId, undefined, targetLevel);
          }
        }
      } else {
        setDndWarning('Select or create a set first');
        setTimeout(() => setDndWarning(null), 2000);
      }
      if (targetId === 'dock-explorer') setActivePanel('explorer');
    } else if (targetId === 'drop-matches-header') {
      const track = allTracks.find(t => t.id === payload.trackId);
      if (track) handleSelectTrack(track);
    } else if (targetId.startsWith('drop-explorer-level-')) {
      const level = parseInt(targetId.replace('drop-explorer-level-', ''), 10);
      if (!isNaN(level) && sb.activeSet) {
        const treeNodes = sb.activeTreeId != null
          ? sb.activeSet.explorer_nodes.filter(n => n.tree_id === sb.activeTreeId) : sb.activeSet.explorer_nodes;
        const treeEdges = sb.activeTreeId != null
          ? sb.activeSet.explorer_edges.filter(e => e.tree_id === sb.activeTreeId) : sb.activeSet.explorer_edges;
        const nodesAtLevel = treeNodes.filter(n => n.level === level);
        if (nodesAtLevel.length >= MAX_COLS) {
          setDndWarning(`Maximum ${MAX_COLS} children per level`);
          setTimeout(() => setDndWarning(null), 2000);
        } else {
          const parentIds = nodesAtLevel.length > 0
            ? [...new Set(treeEdges
                .filter(e => nodesAtLevel.some(n => n.node_id === e.child_node_id))
                .map(e => e.parent_node_id))]
            : [];
          if (parentIds.length > 0) {
            sb.addSiblingNode(payload.trackId, parentIds, level);
          } else {
            sb.addExplorerNode(payload.trackId, undefined, level);
          }
        }
      }
    } else if (targetId.startsWith('drop-explorer-node-')) {
      const nodeId = targetId.replace('drop-explorer-node-', '');
      if (sb.activeSet) {
        const treeNodes = sb.activeTreeId != null
          ? sb.activeSet.explorer_nodes.filter(n => n.tree_id === sb.activeTreeId) : sb.activeSet.explorer_nodes;
        const parentNode = treeNodes.find(n => n.node_id === nodeId);
        if (parentNode) {
          const childLevel = parentNode.level + 1;
          const childrenAtLevel = treeNodes.filter(n => n.level === childLevel);
          if (childrenAtLevel.length >= MAX_COLS) {
            setDndWarning(`Maximum ${MAX_COLS} children per level`);
            setDndWarningNodeId(nodeId);
            setTimeout(() => { setDndWarning(null); setDndWarningNodeId(null); }, 2000);
          } else {
            sb.addExplorerNode(payload.trackId, nodeId, childLevel);
          }
        }
      }
    }
  }, [allTracks, handleSelectTrack, addToTracklistFn, addToPoolFn, poolExpanded, handlePoolExpandedChange]);

  return (
    <AudioPlayerProvider>
    <DndContext sensors={sensors} collisionDetection={dndCollisionDetection} measuring={measuringConfig} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="app-shell-v2">
        {/* ─── Top Anchor Zone ─── */}
        <div className="top-anchor" style={{ flex: '1 1 0%', minHeight: '28vh' }}>
          {/* ─── Unified search + filter row ─── */}
          <div className="controls-strip">
            <SearchPanel
              selectedTrack={selectedTrack}
              selectTrack={handleSelectTrack}
              onSearchTextChange={setSearchText}
              onClearSelectedTrack={handleClearSelectedTrack}
              searchText={searchText}
            />
            <FilterBar
              camelotCodes={filters.camelotCodes}
              bpm={filters.bpm}
              bpmMin={filters.bpmMin}
              bpmMax={filters.bpmMax}
              setCamelotCodes={setCamelotCodes}
              setBpm={setBpm}
              setBpmMin={setBpmMin}
              setBpmMax={setBpmMax}
              onClearFilters={handleClearFilters}
            />
          </div>

          {traitsError && (
            <p className="table-status table-status--error" style={{ margin: '0 var(--content-gutter)' }}>
              Failed to load track traits — {traitsError}
            </p>
          )}

          <div className="gutter-actions">
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
            />
          </div>
        </div>

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
          style={{ height: panelHeight }}
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
                  title="Go back to previous source"
                >
                  ← Back
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
              addToPool={sbAddToPool}
              removeFromTracklist={removeFromTracklist}
              clearTracklist={clearTracklist}
              moveTracklistToPool={moveTracklistToPool}
              reorderTracklist={reorderTracklist}
              updateTracklistNote={updateTracklistNote}
              togglePoolStar={togglePoolStar}
              toggleTracklistStar={toggleTracklistStar}
              addToTracklist={sbAddToTracklist}
              resolvePendingAdd={resolvePendingAdd}
              clearPendingAdd={clearPendingAdd}
              clearError={clearError}
              poolExpanded={poolExpanded}
              onPoolExpandedChange={handlePoolExpandedChange}
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
                onNodeToTracklist={explorerNodeAddToTracklist}
                onAddSibling={addSiblingNode}
                tracklistTrackIds={tracklistTrackIds}
                fetchEdgeScores={fetchEdgeScores}
                warningNodeId={dndWarningNodeId}
                trees={activeSet.explorer_trees}
                activeTreeId={activeTreeId}
                onSelectTree={selectTree}
                onCreateTree={createTree}
              />
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
                  Normalize Weights{!isSumValid && ` (${parseFloat(rawSum.toFixed(1))})`}
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
          </div>
        )}
      </DragOverlay>
    </DndContext>
    </AudioPlayerProvider>
  );
}
