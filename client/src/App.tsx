import { useState, useCallback, useEffect, useMemo } from 'react'
import { SearchPanel } from './components/SearchPanel'
import {
  QuadrantDivider,
  QuadrantExpandBar,
} from './components/QuadrantControls'
import { FilterBar } from './components/FilterBar'
import { TrackTable } from './components/TrackTable'
import { MatchesPanel } from './components/MatchesPanel'
import { MatchDetail } from './components/MatchDetail'
import { AdminDashboard } from './components/AdminDashboard'
import { SetBuilder } from './components/SetBuilder'
import { SetPickerControls } from './components/SetPickerControls'
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

/** Top row: track browser (left) vs. matches (right). */
type TopSplit = 'split' | 'browser-collapsed' | 'matches-collapsed'
/** Whole-row collapse: top (browser + matches) vs. bottom (set workspace). */
type RowSplit = 'split' | 'top-collapsed' | 'bottom-collapsed'

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

  const [topSplit, setTopSplit] = useState<TopSplit>('split')
  const [rowSplit, setRowSplit] = useState<RowSplit>('split')
  const [adminOpen, setAdminOpen] = useState(false)

  useEffect(() => {
    if (!adminOpen) {
      return
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setAdminOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [adminOpen])

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
  } = useCacheStats(adminOpen)

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

  const setPicker = (
    <SetPickerControls
      sets={setBuilder.sets}
      activeSetId={setBuilder.activeSetId}
      pendingAdd={setBuilder.pendingAdd}
      createSet={setBuilder.createSet}
      selectSet={setBuilder.selectSet}
      deleteSet={setBuilder.deleteSet}
      resolvePendingAdd={setBuilder.resolvePendingAdd}
      clearPendingAdd={setBuilder.clearPendingAdd}
    />
  )

  return (
    <AudioPlayerProvider>
      <div className="app-shell-v2">
        {rowSplit === 'top-collapsed' && (
          <QuadrantExpandBar
            edge="top"
            label="Track Browser · Matches"
            ariaLabel="Expand top panels"
            onExpand={() => setRowSplit('split')}
          />
        )}
        <div
          className="quad-row quad-row--top"
          hidden={rowSplit === 'top-collapsed'}
        >
          {topSplit === 'browser-collapsed' && (
            <QuadrantExpandBar
              edge="left"
              label="Track Browser"
              ariaLabel="Expand track browser"
              onExpand={() => setTopSplit('split')}
            />
          )}
          <section
            className="quadrant browse-quadrant"
            aria-label="Track browser"
            hidden={topSplit === 'browser-collapsed'}
          >
            <div className="browse-controls">
              <SearchPanel
                allTracks={allTracks}
                selectedTrack={selectedTrack}
                selectTrack={handleSelectTrack}
                clearSelectedTrack={clearSelectedTrack}
                onSearchTextChange={setSearchText}
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
              />
            </div>
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
              scrollRestorationKey={`${topSplit}:${rowSplit}`}
              onAddToPool={handleAddToPool}
              onAddToTracklist={handleAddToTracklist}
            />
          </section>
          {topSplit === 'split' && (
            <QuadrantDivider
              orientation="vertical"
              beforeLabel="Collapse track browser"
              afterLabel="Collapse matches"
              onCollapseBefore={() => setTopSplit('browser-collapsed')}
              onCollapseAfter={() => setTopSplit('matches-collapsed')}
            />
          )}
          <section
            className={`quadrant matches-quadrant${topSplit === 'browser-collapsed' ? ' matches-quadrant--full' : ''}`}
            aria-label="Matches"
            hidden={topSplit === 'matches-collapsed'}
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
            {!detailMatch && (
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
          </section>
          {topSplit === 'matches-collapsed' && (
            <QuadrantExpandBar
              edge="right"
              label="Matches"
              ariaLabel="Expand matches"
              onExpand={() => setTopSplit('split')}
            />
          )}
        </div>

        {rowSplit === 'split' && (
          <QuadrantDivider
            orientation="horizontal"
            beforeLabel="Collapse top panels"
            afterLabel="Collapse bottom panels"
            onCollapseBefore={() => setRowSplit('top-collapsed')}
            onCollapseAfter={() => setRowSplit('bottom-collapsed')}
          />
        )}

        <div
          className="quad-row quad-row--bottom"
          hidden={rowSplit === 'bottom-collapsed'}
        >
          <SetBuilder
            allTracks={allTracks}
            activeSet={setBuilder.activeSet}
            loading={setBuilder.loading}
            error={setBuilder.error}
            setPicker={setPicker}
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
        </div>
        {rowSplit === 'bottom-collapsed' && (
          <QuadrantExpandBar
            edge="bottom"
            label="Tracklist · Pool"
            ariaLabel="Expand bottom panels"
            onExpand={() => setRowSplit('split')}
          />
        )}

        <PlaybackBar />

        <button
          className="admin-gear"
          aria-label="Admin"
          title="Admin"
          aria-haspopup="dialog"
          aria-expanded={adminOpen}
          onClick={() => setAdminOpen((prev) => !prev)}
        >
          <span className="admin-gear-glyph" aria-hidden="true">
            {'\u2699\uFE0E'}
          </span>
        </button>
        {adminOpen && (
          <div
            className="admin-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Admin dashboard"
          >
            <div className="admin-overlay-header">
              <h2 className="admin-overlay-title">Admin</h2>
              <button
                className="admin-overlay-close"
                aria-label="Close admin"
                title="Close admin"
                onClick={() => setAdminOpen(false)}
              >
                ×
              </button>
            </div>
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
          </div>
        )}
      </div>
    </AudioPlayerProvider>
  )
}
