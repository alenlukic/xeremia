import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { AdminDashboard } from './components/AdminDashboard'
import { SetPickerControls } from './components/SetPickerControls'
import { PlaybackBar } from './components/PlaybackBar'
import { BrowserWidget } from './components/BrowserWidget'
import { MatchesWidget } from './components/MatchesWidget'
import { PoolWidget } from './components/PoolWidget'
import { ExplorerMatrix } from './components/ExplorerMatrix'
import { Sequencer } from './components/Sequencer'
import { WorkspaceGrid } from './components/WorkspaceGrid'
import type { WorkspacePanel } from './components/WorkspaceGrid'
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout'
import type { WidgetId } from './hooks/useWorkspaceLayout'
import type { LaneKey } from './hooks/useSequencer'
import { useSelectedTrack } from './hooks/useSelectedTrack'
import { useTrackFilters } from './hooks/useTrackFilters'
import { useCollectionCache } from './hooks/useCollectionCache'
import { useCacheStats } from './hooks/useCacheStats'
import { useWeights } from './hooks/useWeights'
import { useSetBuilder } from './hooks/useSetBuilder'
import { useCrates } from './hooks/useCrates'
import { useTablePreferences } from './hooks/useTablePreferences'
import { AudioPlayerProvider } from './hooks/useAudioPlayer'
import { visibleColumnIds, TABLE_REGISTRIES } from './tablePreferences'
import { readTableViewState, usePersistTableViewSlice } from './tableViewState'
import { displayTitle } from './utils/trackTitle'
import type {
  Track,
  SearchSuggestion,
  TransitionMatch,
  TransitionChainEntry,
} from './types'

export function App() {
  const {
    allTracks,
    traitMap,
    loading: collectionLoading,
    tracksError,
    traitsError,
  } = useCollectionCache()

  const tablePrefs = useTablePreferences()
  const layout = useWorkspaceLayout()

  const [adminOpen, setAdminOpen] = useState(false)
  const [workspaceUiError, setWorkspaceUiError] = useState<string | null>(null)
  // The Sequencer's selected tile, so the Explorer can light its cell.
  const [sequencerFocus, setSequencerFocus] = useState<Track | null>(null)

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

  const [initialSearchView] = useState(() => readTableViewState().search)

  const [detailMatch, setDetailMatch] = useState<TransitionMatch | null>(null)
  const [searchText, setSearchText] = useState(initialSearchView.searchText)
  const [searchSorting, setSearchSorting] = useState(initialSearchView.sorting)
  const [browseSelection, setBrowseSelection] = useState<
    Track | SearchSuggestion | null
  >(null)
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
    matchSource,
    matches,
    matchesLoading,
    matchesError,
    selectMatchSource,
    clearMatchSource,
    refetchMatches,
  } = useSelectedTrack(refreshCacheStats)

  const {
    filteredTracks,
    model: filterModel,
    setModel: setFilterModel,
    isActive: filtersActive,
    genres: filterGenres,
    labels: filterLabels,
  } = useTrackFilters(allTracks, searchText, initialSearchView.filterModel)

  const searchViewState = useMemo(
    () => ({
      searchText,
      filterModel,
      sorting: searchSorting,
    }),
    [searchText, filterModel, searchSorting],
  )
  usePersistTableViewSlice('search', searchViewState)

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
  const {
    addToPool: setBuilderAddToPool,
    addToTracklist: setBuilderAddToTracklist,
  } = setBuilder

  // Library-scoped Explorer crates; independent of the active set.
  const crateStore = useCrates()

  const browseTracks = useMemo(
    () =>
      browseSelection
        ? allTracks.filter((t) => t.id === browseSelection.id)
        : filteredTracks,
    [browseSelection, allTracks, filteredTracks],
  )

  // Lets the matches quadrant read candidate attributes (key/BPM/genre), which
  // the match payload itself does not carry.
  const trackIndex = useMemo(
    () => new Map(allTracks.map((t) => [t.id, t])),
    [allTracks],
  )

  const handleSelectTrack = useCallback(
    (track: Track | SearchSuggestion) => {
      setDetailMatch(null)
      setTransitionChain([])
      setBrowseSelection(track)
      selectMatchSource(track)
      setSearchText('')
    },
    [selectMatchSource],
  )

  const handleClearBrowse = useCallback(() => {
    setBrowseSelection(null)
  }, [])

  const handleClearMatches = useCallback(() => {
    setDetailMatch(null)
    setTransitionChain([])
    clearMatchSource()
  }, [clearMatchSource])

  const handleUseAsSource = useCallback(
    (candidateId: number, syncBrowseSelection = false) => {
      if (!matchSource) {
        return
      }
      const candidate = trackIndex.get(candidateId)
      if (!candidate) {
        return
      }
      setTransitionChain((prev) => [...prev, { track: matchSource }])
      setDetailMatch(null)
      if (syncBrowseSelection) {
        setBrowseSelection(candidate)
      }
      selectMatchSource(candidate)
    },
    [matchSource, trackIndex, selectMatchSource],
  )

  const handleTrackDropAsSource = useCallback(
    (candidateId: number) => handleUseAsSource(candidateId, true),
    [handleUseAsSource],
  )

  // Dropping a track on the matches quadrant loads its matches outright: this is
  // a fresh source selection, not a step in the current transition chain.
  const handleMatchSourceDrop = useCallback(
    (trackId: number) => {
      const track = trackIndex.get(trackId)
      if (!track) {
        return
      }
      setDetailMatch(null)
      setTransitionChain([])
      selectMatchSource(track)
    },
    [trackIndex, selectMatchSource],
  )

  const handleChainNavigate = useCallback(
    (index: number) => {
      const entry = transitionChain[index]
      if (!entry) {
        return
      }
      setTransitionChain((prev) => prev.slice(0, index))
      setDetailMatch(null)
      setBrowseSelection(entry.track)
      selectMatchSource(entry.track)
    },
    [transitionChain, selectMatchSource],
  )

  const handleChainBack = useCallback(() => {
    if (transitionChain.length === 0) {
      return
    }
    const last = transitionChain[transitionChain.length - 1]
    setTransitionChain((prev) => prev.slice(0, -1))
    setDetailMatch(null)
    setBrowseSelection(last.track)
    selectMatchSource(last.track)
  }, [transitionChain, selectMatchSource])

  const handleAddToPool = useCallback(
    (candidateId: number) => {
      const track = trackIndex.get(candidateId)
      if (track) {
        setBuilderAddToPool(track.id, track.title)
      }
    },
    [setBuilderAddToPool, trackIndex],
  )

  const handleAddToTracklist = useCallback(
    (candidateId: number) => {
      const track = trackIndex.get(candidateId)
      if (track) {
        setBuilderAddToTracklist(track.id, track.title)
      }
    },
    [setBuilderAddToTracklist, trackIndex],
  )

  const setPicker = (
    <SetPickerControls
      sets={setBuilder.sets}
      activeSetId={setBuilder.activeSetId}
      pendingAdd={setBuilder.pendingAdd}
      createSet={setBuilder.createSet}
      selectSet={setBuilder.selectSet}
      renameSet={setBuilder.renameSet}
      deleteSet={setBuilder.deleteSet}
      resolvePendingAdd={setBuilder.resolvePendingAdd}
      clearPendingAdd={setBuilder.clearPendingAdd}
    />
  )

  const searchConfig = tablePrefs.configs.search
  const matchesConfig = tablePrefs.configs.matches

  const laneCount = setBuilder.activeSet?.pool_subgroups?.length ?? 0

  /** Pool entries the virtual default lane shows while no subgroup exists. */
  const poolEntryIds = useMemo(
    () => (setBuilder.activeSet?.pool ?? []).map((entry) => entry.id),
    [setBuilder.activeSet],
  )

  // The default lane is virtual: it exists only while the set has no subgroup,
  // and the first drop or paste on it creates the subgroup that replaces it.
  // The new subgroup keeps the pool entries the lane already showed, and the
  // id is remembered so that pasting several tracks fills one lane instead of
  // creating a lane per track. A stale-closure caller cannot see the subgroup
  // it just created, so the effect below drops the id once it is gone.
  const subgroups = setBuilder.activeSet?.pool_subgroups
  const materializedLaneRef = useRef<number | null>(null)
  const laneCreationRef = useRef<Promise<number | null> | null>(null)
  useEffect(() => {
    const materialized = materializedLaneRef.current
    if (
      materialized !== null &&
      !(subgroups ?? []).some((group) => group.id === materialized)
    ) {
      materializedLaneRef.current = null
    }
  }, [subgroups])

  const resolveLane = useCallback(
    async (lane: LaneKey): Promise<number | null> => {
      if (typeof lane === 'number') {
        return lane
      }
      if (materializedLaneRef.current !== null) {
        return materializedLaneRef.current
      }
      if (!laneCreationRef.current) {
        laneCreationRef.current = setBuilder
          .createSubgroupWithEntries(`Alt ${laneCount + 1}`, poolEntryIds)
          .then((created) => {
            if (!created) {
              return null
            }
            materializedLaneRef.current = created.id
            return created.id
          })
          .finally(() => {
            laneCreationRef.current = null
          })
      }
      return laneCreationRef.current
    },
    [laneCount, poolEntryIds, setBuilder],
  )

  const handleBenchToLane = useCallback(
    async (
      trackId: number,
      lane: LaneKey,
      source: 'browse' | 'pool' | 'tracklist',
    ) => {
      const subgroupId = await resolveLane(lane)
      if (subgroupId === null) {
        throw new Error('Could not create the source lane.')
      }
      await setBuilder.dropTrackToSubgroup(subgroupId, trackId, source, true)
    },
    [resolveLane, setBuilder],
  )

  const handleMoveBench = useCallback(
    async (poolEntryId: number, from: number, to: number) => {
      if (from === to) {
        return true
      }
      // Add first so a failed second write can only duplicate the track, never
      // orphan it from every visible lane.
      const added = await setBuilder.addSubgroupMember(to, poolEntryId)
      if (!added) {
        return false
      }
      await setBuilder.removeSubgroupMember(from, poolEntryId)
      return true
    },
    [setBuilder],
  )

  const handlePromote = useCallback(
    async (trackId: number, position: number) => {
      await setBuilder.movePoolToTracklist(trackId, true)
      // Once the atomic pool→tracklist move succeeds, the track is safe. A
      // reorder failure leaves it appended and is already surfaced by the
      // builder; it must not leave a stale clipboard item that can never move
      // from the pool again.
      try {
        await setBuilder.reorderTracklist(trackId, position, true)
      } catch {
        return true
      }
      return true
    },
    [setBuilder],
  )

  const handleAddLane = useCallback(() => {
    void setBuilder.createSubgroup(`Alt ${laneCount + 1}`)
  }, [setBuilder, laneCount])

  // Sortable browse columns (visible order, minus display/action columns), fed
  // to the design-system Add-sort control and control-panel sort tiers.
  const searchSortColumns = useMemo(() => {
    const reg = new Map(TABLE_REGISTRIES.search.map((e) => [e.id, e]))
    const nonSortable = new Set(['play'])
    return visibleColumnIds(searchConfig)
      .filter((id) => !nonSortable.has(id))
      .map((id) => ({ id, label: reg.get(id)?.label ?? id }))
  }, [searchConfig])

  const matchesHeaderTitle =
    transitionChain.length > 0 && matchSource ? (
      <div className="transition-chain transition-chain--header">
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
              title={`Return to ${displayTitle(entry.track, entry.track.id)}`}
            >
              {displayTitle(entry.track, entry.track.id)}
            </button>
            <span className="chain-arrow">→</span>
          </span>
        ))}
        <span className="chain-current">
          {displayTitle(matchSource, matchSource.id)}
        </span>
      </div>
    ) : undefined

  const browserStack = (
    <BrowserWidget
      allTracks={allTracks}
      tracks={browseTracks}
      loading={collectionLoading}
      tracksError={tracksError}
      traitsError={traitsError}
      selectedTrack={browseSelection}
      selectTrack={handleSelectTrack}
      clearBrowseSelection={handleClearBrowse}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      onTrackDrop={handleTrackDropAsSource}
      sorting={searchSorting}
      onSortingChange={setSearchSorting}
      sortColumns={searchSortColumns}
      filterModel={filterModel}
      setFilterModel={setFilterModel}
      filtersActive={filtersActive}
      genres={filterGenres}
      labels={filterLabels}
      tableConfig={searchConfig}
      onToggleColumnVisibility={(id) =>
        tablePrefs.toggleVisibility('search', id)
      }
      onReorderColumn={(draggedId, targetId) =>
        tablePrefs.reorderColumn('search', draggedId, targetId)
      }
      onInsertColumnAfter={(afterId, columnId) =>
        tablePrefs.insertColumnAfter('search', afterId, columnId)
      }
      onColumnWidthChange={(id, width) =>
        tablePrefs.setColumnWidth('search', id, width)
      }
      onColumnWidthFlush={(id, width) =>
        tablePrefs.flushColumnWidth('search', id, width)
      }
      scrollRestorationKey="workspace"
      onAddManyToPool={handleAddToPool}
    />
  )

  const matchesStack = (
    <MatchesWidget
      matchSource={matchSource}
      matches={matches}
      loading={matchesLoading}
      matchesError={matchesError}
      detailMatch={detailMatch}
      headerTitle={matchesHeaderTitle}
      tableConfig={matchesConfig}
      traitMap={traitMap}
      trackIndex={trackIndex}
      genres={filterGenres}
      labels={filterLabels}
      onClearMatchSource={handleClearMatches}
      onToggleColumnVisibility={(id) =>
        tablePrefs.toggleVisibility('matches', id)
      }
      onReorderColumn={(draggedId, targetId) =>
        tablePrefs.reorderColumn('matches', draggedId, targetId)
      }
      onInsertColumnAfter={(afterId, columnId) =>
        tablePrefs.insertColumnAfter('matches', afterId, columnId)
      }
      onColumnWidthChange={(id, width) =>
        tablePrefs.setColumnWidth('matches', id, width)
      }
      onColumnWidthFlush={(id, width) =>
        tablePrefs.flushColumnWidth('matches', id, width)
      }
      onViewDetail={setDetailMatch}
      onUseAsSource={handleUseAsSource}
      onTrackDrop={handleMatchSourceDrop}
      onAddToPool={handleAddToPool}
      onAddToTracklist={handleAddToTracklist}
    />
  )

  const workspacePanels = useMemo<Partial<Record<WidgetId, WorkspacePanel>>>(
    () => ({
      browser: { node: browserStack },
      matches: { node: matchesStack },
      pool: {
        node: (
          <PoolWidget
            allTracks={allTracks}
            activeSet={setBuilder.activeSet}
            tableConfig={tablePrefs.configs.pool}
            onToggleColumn={(id) => tablePrefs.toggleVisibility('pool', id)}
            onReorderColumn={(draggedId, targetId) =>
              tablePrefs.reorderColumn('pool', draggedId, targetId)
            }
            onInsertColumnAfter={(afterId, columnId) =>
              tablePrefs.insertColumnAfter('pool', afterId, columnId)
            }
            onColumnWidthChange={(id, width) =>
              tablePrefs.setColumnWidth('pool', id, width)
            }
            onColumnWidthFlush={(id, width) =>
              tablePrefs.flushColumnWidth('pool', id, width)
            }
            onRemove={setBuilder.removeFromPool}
            onReorder={setBuilder.reorderPool}
            onSetHighlight={setBuilder.setPoolHighlight}
            onAddTrack={setBuilder.addToPool}
            onCreateSubgroup={setBuilder.createSubgroup}
            onRenameSubgroup={setBuilder.renameSubgroup}
            onDeleteSubgroup={setBuilder.deleteSubgroup}
            onReorderSubgroups={setBuilder.reorderSubgroups}
            onReorderSubgroupMember={setBuilder.reorderSubgroupMember}
            onAddSubgroupMember={setBuilder.addSubgroupMember}
            onRemoveSubgroupMember={setBuilder.removeSubgroupMember}
            onDropTrackToSubgroup={setBuilder.dropTrackToSubgroup}
            onDropFromTracklist={setBuilder.moveTracklistToPool}
          />
        ),
      },
      explorer: {
        node: (
          <ExplorerMatrix
            tracks={allTracks}
            focus={sequencerFocus}
            crates={crateStore.crates}
            crateMemberships={crateStore.memberships}
            onCreateCrate={crateStore.createCrate}
            onRenameCrate={crateStore.renameCrate}
            onDeleteCrate={crateStore.deleteCrate}
            onAddTrackToCrate={crateStore.addTrackToCrate}
            onRemoveFromCrate={crateStore.removeTrackFromCrate}
          />
        ),
      },
      sequencer: {
        node: (
          <Sequencer
            allTracks={allTracks}
            onFocusTrack={setSequencerFocus}
            onRenameLane={(id, name) => void setBuilder.renameSubgroup(id, name)}
            onReorderLanes={(ids) => void setBuilder.reorderSubgroups(ids)}
            activeSet={setBuilder.activeSet}
            onAddCommitted={(trackId, position) =>
              setBuilder.insertIntoTracklist(trackId, position, true)
            }
            onPromote={handlePromote}
            onReorder={(trackId, position) =>
              setBuilder.reorderTracklist(trackId, position, true)
            }
            onBenchToLane={handleBenchToLane}
            onMoveBench={handleMoveBench}
            onRemove={(trackId) => setBuilder.removeFromTracklist(trackId, true)}
            // Lanes are alternative orderings over one pool, so removing from
            // a real lane drops only that lane's membership. The default lane
            // is virtual — it exists only before any subgroup does, and has no
            // membership to drop, so there it is a pool removal.
            onRemoveBenched={(trackId, lane, poolEntryId) =>
              typeof lane === 'number'
                ? setBuilder.removeSubgroupMember(lane, poolEntryId)
                : setBuilder.removeFromPool(trackId, true)
            }
            onAddLane={handleAddLane}
            onDeleteLane={(subgroupId) => {
              void setBuilder.deleteSubgroup(subgroupId)
            }}
            onSaved={setBuilder.refreshActive}
            onUiError={setWorkspaceUiError}
          />
        ),
      },
    }),
    [
      allTracks,
      browserStack,
      crateStore.crates,
      crateStore.memberships,
      crateStore.createCrate,
      crateStore.renameCrate,
      crateStore.deleteCrate,
      crateStore.addTrackToCrate,
      crateStore.removeTrackFromCrate,
      handleAddLane,
      handleBenchToLane,
      handleMoveBench,
      handlePromote,
      matchesStack,
      sequencerFocus,
      setBuilder.activeSet,
      setBuilder.addToPool,
      setBuilder.addSubgroupMember,
      setBuilder.createSubgroup,
      setBuilder.deleteSubgroup,
      setBuilder.dropTrackToSubgroup,
      setBuilder.insertIntoTracklist,
      setBuilder.moveTracklistToPool,
      setBuilder.refreshActive,
      setBuilder.removeFromPool,
      setBuilder.removeFromTracklist,
      setBuilder.renameSubgroup,
      setBuilder.reorderPool,
      setBuilder.reorderSubgroupMember,
      setBuilder.reorderSubgroups,
      setBuilder.reorderTracklist,
      setBuilder.setPoolHighlight,
      tablePrefs.configs.pool,
      tablePrefs.flushColumnWidth,
      tablePrefs.insertColumnAfter,
      tablePrefs.reorderColumn,
      tablePrefs.setColumnWidth,
      tablePrefs.toggleVisibility,
    ],
  )

  const renderAdminGear = (className: string) => (
    <button
      className={className}
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
  )

  const toastMessage =
    workspaceUiError ?? layout.saveError ?? setBuilder.error ?? crateStore.error

  const dismissToast = useCallback(() => {
    setWorkspaceUiError(null)
    setBuilder.clearError()
    layout.clearSaveError()
  }, [layout, setBuilder])

  const adminOverlay = adminOpen && (
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
        tablePrefs={tablePrefs}
      />
    </div>
  )

  return (
    <AudioPlayerProvider>
      {/* The shell fills the viewport and the playback bar sits under it, so
          they share one column rather than the bar being pushed off-screen. */}
      <div className="app-viewport">
        {layout.hydrated ? (
          <WorkspaceGrid
            layout={layout}
            panels={workspacePanels}
            headerControls={
              <>
                <span className="ws-header-label">Set</span>
                {setPicker}
              </>
            }
            headerExtras={renderAdminGear('ws-icon-btn ws-header-gear')}
          />
        ) : (
          <div className="ws-shell">
            <p className="table-status">Loading workspace layout...</p>
          </div>
        )}
        <PlaybackBar />
      </div>
      {toastMessage && (
        <div className="set-toast" role="alert">
          <span>{toastMessage}</span>
          <button
            className="set-toast-dismiss"
            onClick={dismissToast}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {adminOverlay}
    </AudioPlayerProvider>
  )
}
