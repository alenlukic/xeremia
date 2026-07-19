import { useState, useCallback, useEffect, useMemo } from 'react'
import { SearchPanel } from './components/SearchPanel'
import { CollapseButton } from './components/CollapseButton'
import { NavRail } from './components/NavRail'
import type { BottomView } from './components/NavRail'
import { FilterBar } from './components/FilterBar'
import { TrackTable } from './components/TrackTable'
import { MatchesPanel } from './components/MatchesPanel'
import { MatchDetail } from './components/MatchDetail'
import { AdminDashboard } from './components/AdminDashboard'
import { SetBuilder } from './components/SetBuilder'
import { PlaybackBar } from './components/PlaybackBar'
import { useSelectedTrack } from './hooks/useSelectedTrack'
import { useTrackFilters } from './hooks/useTrackFilters'
import { useCollectionCache } from './hooks/useCollectionCache'
import { useCacheStats } from './hooks/useCacheStats'
import { useWeights } from './hooks/useWeights'
import { useSetBuilder } from './hooks/useSetBuilder'
import { AudioPlayerProvider } from './hooks/useAudioPlayer'
import type {
  Track,
  SearchSuggestion,
  TransitionMatch,
  TransitionChainEntry,
} from './types'

const COL_VIS_STORAGE_KEY = 'xeremia-browse-col-visibility'

const BOTTOM_VIEW_STORAGE_KEY = 'xeremia-bottom-view'

const BROWSE_CONFIGURABLE_COLUMNS = [
  { id: 'camelot_code', label: 'Camelot' },
  { id: 'key', label: 'Key' },
  { id: 'bpm', label: 'BPM' },
  { id: 'energy', label: 'Energy' },
  { id: 'date_added', label: 'Date Added' },
  { id: 'label', label: 'Label' },
  { id: 'genre', label: 'Genre' },
]

function isPlainObject(v: unknown): v is Record<string, boolean> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function loadBottomView(): BottomView {
  try {
    const raw = localStorage.getItem(BOTTOM_VIEW_STORAGE_KEY)
    if (raw === 'matches' || raw === 'set' || raw === 'admin') {
      return raw
    }
  } catch {
    /* ignore storage access errors */
  }
  return 'matches'
}

type RegionSplit = 'split' | 'top-collapsed' | 'bottom-collapsed'

const DEFAULT_BROWSE_COLUMN_VISIBILITY: Record<string, boolean> = {
  key: false,
  energy: false,
}

// Column selection is scoped to the browser session (sessionStorage), unlike
// the other view-state keys above, which persist indefinitely (localStorage).
function loadColumnVisibility(): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(COL_VIS_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_BROWSE_COLUMN_VISIBILITY
    }
    const parsed: unknown = JSON.parse(raw)
    return isPlainObject(parsed) ? parsed : DEFAULT_BROWSE_COLUMN_VISIBILITY
  } catch {
    return DEFAULT_BROWSE_COLUMN_VISIBILITY
  }
}

export function App() {
  const {
    allTracks,
    traitMap,
    loading: collectionLoading,
    tracksError,
    traitsError,
  } = useCollectionCache()

  const [bottomView, setBottomView] = useState<BottomView>(loadBottomView)
  const [regionSplit, setRegionSplit] = useState<RegionSplit>('split')

  useEffect(() => {
    localStorage.setItem(BOTTOM_VIEW_STORAGE_KEY, bottomView)
  }, [bottomView])

  // Selecting a bottom view from the nav while that region is collapsed
  // should reveal it again — the user is asking to see it.
  const showBottomView = useCallback((view: BottomView) => {
    setBottomView(view)
    setRegionSplit((prev) => (prev === 'bottom-collapsed' ? 'split' : prev))
  }, [])
  const [detailMatch, setDetailMatch] = useState<TransitionMatch | null>(null)
  const [searchText, setSearchText] = useState('')
  const [transitionChain, setTransitionChain] = useState<
    TransitionChainEntry[]
  >([])

  const {
    stats: cacheStats,
    loading: cacheLoading,
    error: cacheError,
    refresh: refreshCacheStats,
  } = useCacheStats(bottomView === 'admin')

  const {
    selectedTrack,
    matches,
    matchesLoading,
    matchesError,
    selectTrack,
    clearSelectedTrack,
    refetchMatches,
  } = useSelectedTrack(refreshCacheStats)

  const {
    filters,
    filteredTracks,
    setCamelotCodes,
    setBpm,
    setBpmMin,
    setBpmMax,
  } = useTrackFilters(allTracks, searchText)

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
  } = useWeights(refetchMatches)

  const setBuilder = useSetBuilder()
  // Depend on the individual callbacks (stable across renders), not the
  // `setBuilder` object, whose identity changes every render and would
  // otherwise defeat memo() on TrackTable/MatchesPanel via the handlers below.
  const {
    addToPool: setBuilderAddToPool,
    addToTracklist: setBuilderAddToTracklist,
  } = setBuilder

  const [browseColumnVisibility, setBrowseColumnVisibility] =
    useState<Record<string, boolean>>(loadColumnVisibility)

  useEffect(() => {
    sessionStorage.setItem(
      COL_VIS_STORAGE_KEY,
      JSON.stringify(browseColumnVisibility),
    )
  }, [browseColumnVisibility])

  const toggleBrowseColumn = useCallback((id: string) => {
    setBrowseColumnVisibility((prev) => ({
      ...prev,
      [id]: prev[id] !== false ? false : true,
    }))
  }, [])

  const browseTracks = useMemo(
    () =>
      selectedTrack
        ? allTracks.filter((t) => t.id === selectedTrack.id)
        : filteredTracks,
    [selectedTrack, allTracks, filteredTracks],
  )

  const handleSelectTrack = useCallback(
    (track: Track | SearchSuggestion) => {
      setDetailMatch(null)
      setTransitionChain([])
      selectTrack(track)
      setSearchText('')
    },
    [selectTrack],
  )

  const handleUseAsSource = useCallback(
    (candidateId: number) => {
      if (!selectedTrack) {
        return
      }
      const candidate = allTracks.find((t) => t.id === candidateId)
      if (!candidate) {
        return
      }
      setTransitionChain((prev) => [...prev, { track: selectedTrack }])
      setDetailMatch(null)
      selectTrack(candidate)
    },
    [selectedTrack, allTracks, selectTrack],
  )

  const handleChainNavigate = useCallback(
    (index: number) => {
      const entry = transitionChain[index]
      if (!entry) {
        return
      }
      setTransitionChain((prev) => prev.slice(0, index))
      setDetailMatch(null)
      selectTrack(entry.track)
    },
    [transitionChain, selectTrack],
  )

  const handleChainBack = useCallback(() => {
    if (transitionChain.length === 0) {
      return
    }
    const last = transitionChain[transitionChain.length - 1]
    setTransitionChain((prev) => prev.slice(0, -1))
    setDetailMatch(null)
    selectTrack(last.track)
  }, [transitionChain, selectTrack])

  const handleAddToPool = useCallback(
    (candidateId: number) => {
      const track = allTracks.find((t) => t.id === candidateId)
      if (track) {
        setBuilderAddToPool(track.id, track.title)
      }
    },
    [allTracks, setBuilderAddToPool],
  )

  const handleAddToTracklist = useCallback(
    (candidateId: number) => {
      const track = allTracks.find((t) => t.id === candidateId)
      if (track) {
        setBuilderAddToTracklist(track.id, track.title)
      }
    },
    [allTracks, setBuilderAddToTracklist],
  )

  const handleAddSelectedToPool = useCallback(() => {
    if (!selectedTrack) {
      return
    }
    const track = allTracks.find((t) => t.id === selectedTrack.id)
    if (track) {
      setBuilderAddToPool(track.id, track.title)
    }
  }, [selectedTrack, allTracks, setBuilderAddToPool])

  const handleAddSelectedToTracklist = useCallback(() => {
    if (!selectedTrack) {
      return
    }
    const track = allTracks.find((t) => t.id === selectedTrack.id)
    if (track) {
      setBuilderAddToTracklist(track.id, track.title)
    }
  }, [selectedTrack, allTracks, setBuilderAddToTracklist])

  const handleClearFilters = useCallback(() => {
    setCamelotCodes([])
    setBpmMin(undefined)
    setBpmMax(undefined)
    setSearchText('')
  }, [setCamelotCodes, setBpmMin, setBpmMax])

  const setTabLabel = useMemo(() => {
    if (setBuilder.activeSet) {
      const total =
        setBuilder.activeSet.pool.length + setBuilder.activeSet.tracklist.length
      return `Set (${total})`
    }
    return 'Set'
  }, [setBuilder.activeSet])

  return (
    <AudioPlayerProvider>
      <div className="app-shell-v2">
        <NavRail
          bottomView={bottomView}
          onSelectMatches={() => {
            showBottomView('matches')
            setDetailMatch(null)
          }}
          onSelectSet={() => showBottomView('set')}
          onSelectAdmin={() => showBottomView('admin')}
          setLabel={setTabLabel}
          sets={setBuilder.sets}
          activeSetId={setBuilder.activeSetId}
          pendingAdd={setBuilder.pendingAdd}
          createSet={setBuilder.createSet}
          selectSet={setBuilder.selectSet}
          deleteSet={setBuilder.deleteSet}
          resolvePendingAdd={setBuilder.resolvePendingAdd}
          clearPendingAdd={setBuilder.clearPendingAdd}
        />

        {regionSplit === 'top-collapsed' && (
          <button
            className="region-expand-tab"
            onClick={() => setRegionSplit('split')}
            aria-label="Expand track browser"
            title="Expand track browser"
          >
            <span className="region-expand-chevron" aria-hidden="true">
              ⌄
            </span>
            Track Browser
          </button>
        )}
        {/* The set view no longer carries its sub-tab bar (moved to a hover
            rail), so its region shed that height; the reclaim class hands it
            to the browser instead of letting the tracklist/pool grow. */}
        <div
          className={`top-region${bottomView === 'set' ? ' top-region--reclaim' : ''}`}
          hidden={regionSplit === 'top-collapsed'}
        >
          <div className="search-rail">
            <SearchPanel
              allTracks={allTracks}
              selectedTrack={selectedTrack}
              selectTrack={handleSelectTrack}
              clearSelectedTrack={clearSelectedTrack}
              onSearchTextChange={setSearchText}
              onAddToPool={handleAddSelectedToPool}
              onAddToTracklist={handleAddSelectedToTracklist}
              searchText={searchText}
              onTrackDrop={handleUseAsSource}
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
              configurableColumns={BROWSE_CONFIGURABLE_COLUMNS}
              columnVisibility={browseColumnVisibility}
              onToggleColumn={toggleBrowseColumn}
              onClearFilters={handleClearFilters}
            />
          </div>
          <div
            className="browse-panel"
            role="region"
            aria-label="Browse tracks"
          >
            <div className="table-panel">
              {traitsError && (
                <p className="table-status table-status--error">
                  Failed to load track traits — {traitsError}
                </p>
              )}
              <TrackTable
                tracks={browseTracks}
                loading={collectionLoading}
                selectedTrack={selectedTrack}
                selectTrack={handleSelectTrack}
                error={tracksError}
                columnVisibility={browseColumnVisibility}
                onAddToPool={handleAddToPool}
                onAddToTracklist={handleAddToTracklist}
              />
            </div>
          </div>
        </div>

        {regionSplit === 'split' && (
          <div className="region-divider">
            <CollapseButton
              orientation="horizontal"
              size={22}
              direction="up"
              label="Collapse track browser"
              onClick={() => setRegionSplit('top-collapsed')}
            />
            <CollapseButton
              orientation="horizontal"
              size={22}
              direction="down"
              label="Collapse bottom panel"
              onClick={() => setRegionSplit('bottom-collapsed')}
            />
          </div>
        )}
        {regionSplit === 'bottom-collapsed' && (
          <button
            className="region-expand-tab region-expand-tab--bottom"
            onClick={() => setRegionSplit('split')}
            aria-label="Expand bottom panel"
            title="Expand bottom panel"
          >
            <span
              className="region-expand-chevron region-chevron--up"
              aria-hidden="true"
            >
              ⌄
            </span>
            {bottomView === 'matches'
              ? 'Matches'
              : bottomView === 'set'
                ? setTabLabel
                : 'Admin'}
          </button>
        )}
        <div
          className="bottom-region"
          hidden={regionSplit === 'bottom-collapsed'}
        >
          {bottomView === 'matches' &&
            transitionChain.length > 0 &&
            selectedTrack && (
              <div className="transition-chain">
                <button
                  className="chain-back-btn"
                  onClick={handleChainBack}
                  title="Go back to previous source"
                >
                  ← Back
                </button>
                {transitionChain.map((entry, i) => (
                  <span
                    key={`chain-${entry.track.id}-${i}`}
                    className="chain-step"
                  >
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
          {bottomView === 'matches' && !detailMatch && (
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
          {bottomView === 'matches' && detailMatch && (
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
          {bottomView === 'admin' && (
            <AdminDashboard
              stats={cacheStats}
              loading={cacheLoading}
              error={cacheError}
              weights={weights}
              weightsLoading={weightsLoading}
              setWeight={setWeight}
              weightsSaving={weightsSaving}
              weightsSaveSuccess={weightsSaveSuccess}
              weightsError={weightsError}
              weightsWarning={weightsWarning}
              normalizeWeights={normalizeWeights}
              resetWeights={resetWeights}
              isSumValid={isSumValid}
              rawSum={rawSum}
            />
          )}
          {bottomView === 'set' && (
            <SetBuilder
              allTracks={allTracks}
              activeSet={setBuilder.activeSet}
              loading={setBuilder.loading}
              error={setBuilder.error}
              removeFromPool={setBuilder.removeFromPool}
              movePoolToTracklist={setBuilder.movePoolToTracklist}
              reorderPool={setBuilder.reorderPool}
              addToPool={setBuilder.addToPool}
              createSubgroup={setBuilder.createSubgroup}
              renameSubgroup={setBuilder.renameSubgroup}
              deleteSubgroup={setBuilder.deleteSubgroup}
              reorderSubgroups={setBuilder.reorderSubgroups}
              addSubgroupMember={setBuilder.addSubgroupMember}
              removeSubgroupMember={setBuilder.removeSubgroupMember}
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
              clearError={setBuilder.clearError}
            />
          )}
          <PlaybackBar />
        </div>
        {regionSplit === 'bottom-collapsed' && <PlaybackBar />}
      </div>
    </AudioPlayerProvider>
  )
}
