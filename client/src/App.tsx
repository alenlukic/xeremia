import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { SearchPanel } from './components/SearchPanel';
import { FilterBar } from './components/FilterBar';
import { TrackTable } from './components/TrackTable';
import { MatchesPanel } from './components/MatchesPanel';
import { MatchDetail } from './components/MatchDetail';
import { WeightControls } from './components/WeightControls';
import { AdminDashboard } from './components/AdminDashboard';
import { SetBuilder } from './components/SetBuilder';
import { useSelectedTrack } from './hooks/useSelectedTrack';
import { useTrackFilters } from './hooks/useTrackFilters';
import { useCollectionCache } from './hooks/useCollectionCache';
import { useCacheStats } from './hooks/useCacheStats';
import { useWeights } from './hooks/useWeights';
import { useSetBuilder } from './hooks/useSetBuilder';
import type { Track, SearchSuggestion, TransitionMatch, TransitionChainEntry } from './types';

type TabKey = 'matches' | 'browse' | 'admin' | 'set';

const BROWSE_PAGE_SIZE = 250;

const COL_VIS_STORAGE_KEY = 'xeremia-browse-col-visibility';

const BROWSE_CONFIGURABLE_COLUMNS = [
  { id: 'camelot_code', label: 'Camelot' },
  { id: 'key', label: 'Key' },
  { id: 'bpm', label: 'BPM' },
  { id: 'energy', label: 'Energy' },
  { id: 'label', label: 'Label' },
  { id: 'genre', label: 'Genre' },
];

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

export default function App() {
  const { allTracks, traitMap, loading: collectionLoading, tracksError, traitsError } = useCollectionCache();

  const [activeTab, setActiveTab] = useState<TabKey>('matches');
  const [detailMatch, setDetailMatch] = useState<TransitionMatch | null>(null);
  const [searchText, setSearchText] = useState('');
  const [loadedPages, setLoadedPages] = useState(1);
  const [pageCache, setPageCache] = useState<Record<string, number>>({});
  const [transitionChain, setTransitionChain] = useState<TransitionChainEntry[]>([]);

  const gaugeRowRef = useRef<HTMLDivElement>(null);
  const [searchPadding, setSearchPadding] = useState<{ left: number; right: number } | null>(null);

  const {
    stats: cacheStats,
    loading: cacheLoading,
    error: cacheError,
    refresh: refreshCacheStats,
  } = useCacheStats(activeTab === 'admin');

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
  } = useTrackFilters(allTracks, searchText);

  const {
    weights,
    loading: weightsLoading,
    error: weightsError,
    saving: weightsSaving,
    saveSuccess: weightsSaveSuccess,
    setWeight,
    rawSum,
    isSumValid,
    warningMessage: weightsWarning,
    normalizeWeights,
    resetWeights,
  } = useWeights(refetchMatches);

  const setBuilder = useSetBuilder();

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

  // Measure the weight-controls row to align the search panel padding with the
  // gauge groups. This is a DOM-measurement useLayoutEffect: setState here is
  // intentional (React endorses useLayoutEffect for measuring layout before
  // paint). The react-hooks/set-state-in-effect rule is a false positive for
  // this pattern, so it is scoped-and-documented rather than refactored.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const wrapper = gaugeRowRef.current;
    if (!wrapper) {
      setSearchPadding(null);
      return;
    }

    const row = wrapper.querySelector('.weight-controls-row') as HTMLElement | null;
    if (!row) return;

    const measure = () => {
      const groups = row.querySelectorAll(':scope > .gauge-group');
      if (groups.length < 2) {
        setSearchPadding(null);
        return;
      }

      const rowRect = row.getBoundingClientRect();
      const rects = Array.from(groups).map(g => g.getBoundingClientRect());
      const allSameRow = rects.every(r => Math.abs(r.top - rects[0].top) < 10);

      if (allSameRow) {
        setSearchPadding({
          left: Math.round(rects[0].left - rowRect.left),
          right: Math.round(rowRect.right - rects[rects.length - 1].right),
        });
      } else {
        setSearchPadding(null);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [weightsLoading]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  const browseTracks = useMemo(
    () => selectedTrack ? allTracks.filter(t => t.id === selectedTrack.id) : visibleTracks,
    [selectedTrack, allTracks, visibleTracks],
  );

  const hasMorePages = loadedPages < totalPages;

  // Reset pagination when the filter key changes, restoring any cached page
  // depth for that filter. Adjusting during render avoids the cascading render
  // and react-hooks/set-state-in-effect warning; reading from `pageCache`
  // (state) instead of a ref avoids the react-hooks/refs render-read warning.
  const [prevFilterCacheKey, setPrevFilterCacheKey] = useState(filterCacheKey);
  if (filterCacheKey !== prevFilterCacheKey) {
    setPrevFilterCacheKey(filterCacheKey);
    setLoadedPages(pageCache[filterCacheKey] ?? 1);
  }

  const handleLoadMore = useCallback(() => {
    const next = Math.min(loadedPages + 1, totalPages);
    setLoadedPages(next);
    setPageCache(prev => ({ ...prev, [filterCacheKey]: next }));
  }, [totalPages, filterCacheKey, loadedPages]);

  const handleSelectTrack = useCallback(
    (track: Track | SearchSuggestion) => {
      setDetailMatch(null);
      setTransitionChain([]);
      selectTrack(track);
      setActiveTab('matches');
      setSearchText('');
    },
    [selectTrack],
  );

  const handleBrowseSelect = useCallback(
    (track: Track) => {
      handleSelectTrack(track);
      setActiveTab('matches');
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
    },
    [transitionChain, selectTrack],
  );

  const handleChainBack = useCallback(() => {
    if (transitionChain.length === 0) return;
    const last = transitionChain[transitionChain.length - 1];
    setTransitionChain(prev => prev.slice(0, -1));
    setDetailMatch(null);
    selectTrack(last.track);
  }, [transitionChain, selectTrack]);

  const handleAddToPool = useCallback(
    (candidateId: number) => {
      const track = allTracks.find(t => t.id === candidateId);
      if (track) setBuilder.addToPool(track.id, track.title);
    },
    [allTracks, setBuilder],
  );

  const handleAddToTracklist = useCallback(
    (candidateId: number) => {
      const track = allTracks.find(t => t.id === candidateId);
      if (track) setBuilder.addToTracklist(track.id, track.title);
    },
    [allTracks, setBuilder],
  );

  const handleAddSelectedToPool = useCallback(() => {
    if (!selectedTrack) return;
    const track = allTracks.find(t => t.id === selectedTrack.id);
    if (track) setBuilder.addToPool(track.id, track.title);
  }, [selectedTrack, allTracks, setBuilder]);

  const handleAddSelectedToTracklist = useCallback(() => {
    if (!selectedTrack) return;
    const track = allTracks.find(t => t.id === selectedTrack.id);
    if (track) setBuilder.addToTracklist(track.id, track.title);
  }, [selectedTrack, allTracks, setBuilder]);

  const handleClearFilters = useCallback(() => {
    setCamelotCodes([]);
    setBpmMin(undefined);
    setBpmMax(undefined);
    setSearchText('');
  }, [setCamelotCodes, setBpmMin, setBpmMax]);

  const setTabLabel = useMemo(() => {
    if (setBuilder.activeSet) {
      const total = setBuilder.activeSet.pool.length + setBuilder.activeSet.tracklist.length;
      return `Set (${total})`;
    }
    return 'Set';
  }, [setBuilder.activeSet]);

  return (
    <div className="app-shell-v2">
      {!weightsLoading && Object.keys(weights).length > 0 && (
        <div ref={gaugeRowRef}>
          <WeightControls
            weights={weights}
            setWeight={setWeight}
            saving={weightsSaving}
            saveSuccess={weightsSaveSuccess}
            saveError={weightsError}
            warningMessage={weightsWarning}
          />
        </div>
      )}

      <SearchPanel
        selectedTrack={selectedTrack}
        selectTrack={handleSelectTrack}
        clearSelectedTrack={clearSelectedTrack}
        normalizeWeights={normalizeWeights}
        resetWeights={resetWeights}
        isSumValid={isSumValid}
        rawSum={rawSum}
        onSearchTextChange={setSearchText}
        searchPadding={searchPadding}
        onAddToPool={handleAddSelectedToPool}
        onAddToTracklist={handleAddSelectedToTracklist}
        searchText={searchText}
      />

      <div className="tab-bar">
        <button
          className={`tab${activeTab === 'matches' ? ' active' : ''}`}
          onClick={() => {
            setActiveTab('matches');
            setDetailMatch(null);
          }}
        >
          Matches
        </button>
        <button
          className={`tab${activeTab === 'browse' ? ' active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          Browse
        </button>
        <button
          className={`tab${activeTab === 'admin' ? ' active' : ''}`}
          onClick={() => setActiveTab('admin')}
        >
          Admin
        </button>
        <button
          className={`tab${activeTab === 'set' ? ' active' : ''}`}
          onClick={() => setActiveTab('set')}
        >
          {setTabLabel}
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'matches' && transitionChain.length > 0 && selectedTrack && (
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
        {activeTab === 'matches' && !detailMatch && (
          <div className="table-panel">
            <MatchesPanel
              selectedTrack={selectedTrack}
              matches={matches}
              loading={matchesLoading}
              matchesError={matchesError}
              onViewDetail={setDetailMatch}
              onUseAsSource={handleUseAsSource}
              onAddToPool={handleAddToPool}
              onAddToTracklist={handleAddToTracklist}
            />
          </div>
        )}
        {activeTab === 'matches' && detailMatch && (
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
        {activeTab === 'browse' && (
          <div className="table-panel">
            <FilterBar
              camelotCodes={filters.camelotCodes}
              bpm={filters.bpm}
              bpmMin={filters.bpmMin}
              bpmMax={filters.bpmMax}
              setCamelotCodes={setCamelotCodes}
              setBpm={setBpm}
              setBpmMin={setBpmMin}
              setBpmMax={setBpmMax}
              configurableColumns={BROWSE_CONFIGURABLE_COLUMNS}
              columnVisibility={browseColumnVisibility}
              onToggleColumn={toggleBrowseColumn}
              onClearFilters={handleClearFilters}
            />
            {traitsError && (
              <p className="table-status table-status--error">
                Failed to load track traits — {traitsError}
              </p>
            )}
            <TrackTable
              tracks={browseTracks}
              loading={collectionLoading}
              selectedTrack={selectedTrack}
              selectTrack={handleBrowseSelect}
              hasMore={!selectedTrack ? hasMorePages : undefined}
              onLoadMore={!selectedTrack ? handleLoadMore : undefined}
              error={tracksError}
              columnVisibility={browseColumnVisibility}
              onAddToPool={handleAddToPool}
              onAddToTracklist={handleAddToTracklist}
            />
          </div>
        )}
        {activeTab === 'admin' && (
          <AdminDashboard
            stats={cacheStats}
            loading={cacheLoading}
            error={cacheError}
          />
        )}
        {activeTab === 'set' && (
          <SetBuilder
            sets={setBuilder.sets}
            activeSetId={setBuilder.activeSetId}
            activeSet={setBuilder.activeSet}
            loading={setBuilder.loading}
            error={setBuilder.error}
            pendingAdd={setBuilder.pendingAdd}
            createSet={setBuilder.createSet}
            selectSet={setBuilder.selectSet}
            deleteSet={setBuilder.deleteSet}
            removeFromPool={setBuilder.removeFromPool}
            movePoolToTracklist={setBuilder.movePoolToTracklist}
            addToPool={setBuilder.addToPool}
            removeFromTracklist={setBuilder.removeFromTracklist}
            moveTracklistToPool={setBuilder.moveTracklistToPool}
            reorderTracklist={setBuilder.reorderTracklist}
            updateTracklistNote={setBuilder.updateTracklistNote}
            addToTracklist={setBuilder.addToTracklist}
            addExplorerNode={setBuilder.addExplorerNode}
            deleteExplorerNode={setBuilder.deleteExplorerNode}
            addExplorerEdge={setBuilder.addExplorerEdge}
            deleteExplorerEdge={setBuilder.deleteExplorerEdge}
            swapExplorerNodes={setBuilder.swapExplorerNodes}
            explorerNodeAddToTracklist={setBuilder.explorerNodeAddToTracklist}
            addSiblingNode={setBuilder.addSiblingNode}
            fetchEdgeScores={setBuilder.fetchEdgeScores}
            resolvePendingAdd={setBuilder.resolvePendingAdd}
            clearPendingAdd={setBuilder.clearPendingAdd}
            clearError={setBuilder.clearError}
          />
        )}
      </div>
    </div>
  );
}
