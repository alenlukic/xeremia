import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  QuadrantDivider,
  QuadrantExpandBar,
} from './components/QuadrantControls'
import { AdminDashboard } from './components/AdminDashboard'
import { SetBuilder } from './components/SetBuilder'
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
import { useTablePreferences } from './hooks/useTablePreferences'
import { AudioPlayerProvider } from './hooks/useAudioPlayer'
import { visibleColumnIds, TABLE_REGISTRIES } from './tablePreferences'
import { readTableViewState, usePersistTableViewSlice } from './tableViewState'
import type {
  Track,
  SearchSuggestion,
  TransitionMatch,
  TransitionChainEntry,
} from './types'

/** Top row: track browser (left) vs. matches (right). */
type TopSplit = 'split' | 'browser-collapsed' | 'matches-collapsed'
/** Whole-row collapse: top (browser + matches) vs. bottom (set workspace). */
type RowSplit = 'split' | 'top-collapsed' | 'bottom-collapsed'

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

  const [topSplit, setTopSplit] = useState<TopSplit>('split')
  const [rowSplit, setRowSplit] = useState<RowSplit>('split')
  const [adminOpen, setAdminOpen] = useState(false)
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

  const initialSearchView = readTableViewState().search

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

  const browseTracks = useMemo(
    () =>
      browseSelection
        ? allTracks.filter((t) => t.id === browseSelection.id)
        : filteredTracks,
    [browseSelection, allTracks, filteredTracks],
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
      const candidate = allTracks.find((t) => t.id === candidateId)
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
    [matchSource, allTracks, selectMatchSource],
  )

  const handleTrackDropAsSource = useCallback(
    (candidateId: number) => handleUseAsSource(candidateId, true),
    [handleUseAsSource],
  )

  // Lets the matches quadrant read candidate attributes (key/BPM/genre), which
  // the match payload itself does not carry.
  const trackIndex = useMemo(
    () => new Map(allTracks.map((t) => [t.id, t])),
    [allTracks],
  )

  // Dropping a track on the matches quadrant loads its matches outright: this is
  // a fresh source selection, not a step in the current transition chain.
  const handleMatchSourceDrop = useCallback(
    (trackId: number) => {
      const track = allTracks.find((t) => t.id === trackId)
      if (!track) {
        return
      }
      setDetailMatch(null)
      setTransitionChain([])
      selectMatchSource(track)
    },
    [allTracks, selectMatchSource],
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

  const searchConfig = tablePrefs.configs.search
  const matchesConfig = tablePrefs.configs.matches

  const laneCount = setBuilder.activeSet?.pool_subgroups?.length ?? 0

  /** The Explorer's Prune reads the committed lane as the source of truth. */
  const committedTrackIds = useMemo(
    () =>
      new Set(
        (setBuilder.activeSet?.tracklist ?? []).map((entry) => entry.track_id),
      ),
    [setBuilder.activeSet],
  )

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
      const created = await setBuilder.createSubgroupWithEntries(
        `Alt ${laneCount + 1}`,
        poolEntryIds,
      )
      if (!created) {
        return null
      }
      materializedLaneRef.current = created.id
      return created.id
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
              title={`Return to ${entry.track.title}`}
            >
              {entry.track.title}
            </button>
            <span className="chain-arrow">→</span>
          </span>
        ))}
        <span className="chain-current">{matchSource.title}</span>
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
      scrollRestorationKey={`${layout.shell}:${topSplit}:${rowSplit}`}
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

  const workspacePanels: Partial<Record<WidgetId, WorkspacePanel>> = {
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
          pool={setBuilder.activeSet?.pool ?? []}
          onDropTrack={(trackId) => setBuilderAddToPool(trackId)}
          focus={sequencerFocus}
          committedTrackIds={committedTrackIds}
          onRemoveTracks={setBuilder.removeManyFromPool}
        />
      ),
    },
    sequencer: {
      node: (
        <Sequencer
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
          onRemoveBenched={(trackId) =>
            setBuilder.removeFromPool(trackId, true)
          }
          onAddLane={handleAddLane}
          onDeleteLane={(subgroupId) => {
            void setBuilder.deleteSubgroup(subgroupId)
          }}
          onSaved={setBuilder.refreshActive}
        />
      ),
    },
  }

  // The workspace shell carries this in its header; the legacy quadrants have
  // no header, so there it stays a floating control.
  const renderShellToggle = (className: string) => (
    <button
      className={className}
      aria-pressed={layout.shell === 'legacy'}
      title={
        layout.shell === 'workspace'
          ? 'Switch to the legacy quadrant shell'
          : 'Switch to the set builder workspace'
      }
      onClick={() =>
        layout.setShell(layout.shell === 'workspace' ? 'legacy' : 'workspace')
      }
    >
      {layout.shell === 'workspace' ? 'Legacy shell' : 'Workspace shell'}
    </button>
  )

  // The workspace shell carries the gear in its header; the legacy quadrants
  // have no header, so there it stays a floating control.
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

  const adminControls = (
    <>
      {layout.shell === 'legacy' && (
        <>
          {renderShellToggle('shell-toggle')}
          {renderAdminGear('admin-gear')}
        </>
      )}
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
            tablePrefs={tablePrefs}
          />
        </div>
      )}
    </>
  )

  if (layout.shell === 'workspace') {
    return (
      <AudioPlayerProvider>
        {/* The shell fills the viewport and the playback bar sits under it, so
            they share one column rather than the bar being pushed off-screen. */}
        <div className="app-viewport">
          <WorkspaceGrid
            layout={layout}
            panels={workspacePanels}
            headerExtras={
              <>
                {setPicker}
                {renderAdminGear('ws-icon-btn ws-header-gear')}
              </>
            }
            shellToggle={renderShellToggle('ws-pill')}
          />
          <PlaybackBar />
        </div>
        {setBuilder.error && (
          <div className="set-toast" role="alert">
            <span>{setBuilder.error}</span>
            <button
              className="set-toast-dismiss"
              onClick={setBuilder.clearError}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        {adminControls}
      </AudioPlayerProvider>
    )
  }

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
            {browserStack}
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
            {matchesStack}
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
            tracklistConfig={tablePrefs.configs.tracklist}
            poolConfig={tablePrefs.configs.pool}
            onTracklistToggleColumn={(id) =>
              tablePrefs.toggleVisibility('tracklist', id)
            }
            onTracklistReorderColumn={(draggedId, targetId) =>
              tablePrefs.reorderColumn('tracklist', draggedId, targetId)
            }
            onTracklistInsertColumnAfter={(afterId, columnId) =>
              tablePrefs.insertColumnAfter('tracklist', afterId, columnId)
            }
            onTracklistColumnWidthChange={(id, width) =>
              tablePrefs.setColumnWidth('tracklist', id, width)
            }
            onTracklistColumnWidthFlush={(id, width) =>
              tablePrefs.flushColumnWidth('tracklist', id, width)
            }
            onPoolToggleColumn={(id) => tablePrefs.toggleVisibility('pool', id)}
            onPoolReorderColumn={(draggedId, targetId) =>
              tablePrefs.reorderColumn('pool', draggedId, targetId)
            }
            onPoolInsertColumnAfter={(afterId, columnId) =>
              tablePrefs.insertColumnAfter('pool', afterId, columnId)
            }
            onPoolColumnWidthChange={(id, width) =>
              tablePrefs.setColumnWidth('pool', id, width)
            }
            onPoolColumnWidthFlush={(id, width) =>
              tablePrefs.flushColumnWidth('pool', id, width)
            }
            removeFromPool={setBuilder.removeFromPool}
            movePoolToTracklist={setBuilder.movePoolToTracklist}
            reorderPool={setBuilder.reorderPool}
            setPoolHighlight={setBuilder.setPoolHighlight}
            addToPool={setBuilder.addToPool}
            createSubgroup={setBuilder.createSubgroup}
            renameSubgroup={setBuilder.renameSubgroup}
            deleteSubgroup={setBuilder.deleteSubgroup}
            reorderSubgroups={setBuilder.reorderSubgroups}
            reorderSubgroupMember={setBuilder.reorderSubgroupMember}
            addSubgroupMember={setBuilder.addSubgroupMember}
            removeSubgroupMember={setBuilder.removeSubgroupMember}
            dropTrackToSubgroup={setBuilder.dropTrackToSubgroup}
            removeFromTracklist={setBuilder.removeFromTracklist}
            moveTracklistToPool={setBuilder.moveTracklistToPool}
            reorderTracklist={setBuilder.reorderTracklist}
            updateTracklistNote={setBuilder.updateTracklistNote}
            addToTracklist={setBuilder.addToTracklist}
            insertIntoTracklist={setBuilder.insertIntoTracklist}
            addExplorerNode={setBuilder.addExplorerNode}
            moveExplorerNode={setBuilder.moveExplorerNode}
            setExplorerPositions={setBuilder.setExplorerPositions}
            deleteExplorerNode={setBuilder.deleteExplorerNode}
            addExplorerEdge={setBuilder.addExplorerEdge}
            deleteExplorerEdge={setBuilder.deleteExplorerEdge}
            swapExplorerNodes={setBuilder.swapExplorerNodes}
            explorerNodeAddToTracklist={setBuilder.explorerNodeAddToTracklist}
            addNodeWithParents={setBuilder.addNodeWithParents}
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

        {adminControls}
      </div>
    </AudioPlayerProvider>
  )
}
