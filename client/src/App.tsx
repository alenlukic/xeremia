import { useState, useCallback, useEffect, useMemo } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { SearchPanel } from './components/SearchPanel'
import {
  QuadrantDivider,
  QuadrantExpandBar,
} from './components/QuadrantControls'
import {
  BrowseFilterAddButton,
  BrowseFilterGroups,
} from './components/FilterBar'
import { TrackTable } from './components/TrackTable'
import { MatchesPanel } from './components/MatchesPanel'
import { TableHeader } from './components/table/TableHeader'
import { TableControlPanel } from './components/table/TableControlPanel'
import { SortTierBar, SortAddButton } from './components/SortTierBar'
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
import { useTablePreferences } from './hooks/useTablePreferences'
import { AudioPlayerProvider } from './hooks/useAudioPlayer'
import { visibleColumnIds, TABLE_REGISTRIES } from './tablePreferences'
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
  const [searchSorting, setSearchSorting] = useState<SortingState>([])
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

  // Sortable browse columns (visible order, minus display/action columns), fed
  // to the design-system Add-sort control and control-panel sort tiers.
  const searchSortColumns = useMemo(() => {
    const reg = new Map(TABLE_REGISTRIES.search.map((e) => [e.id, e]))
    const nonSortable = new Set(['play', 'add_to_set'])
    return visibleColumnIds(searchConfig)
      .filter((id) => !nonSortable.has(id))
      .map((id) => ({ id, label: reg.get(id)?.label ?? id }))
  }, [searchConfig])

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
            <TableHeader
              title={
                <div className="ds-header-search">
                  <SearchPanel
                    allTracks={allTracks}
                    selectedTrack={browseSelection}
                    selectTrack={handleSelectTrack}
                    clearBrowseSelection={handleClearBrowse}
                    onSearchTextChange={setSearchText}
                    searchText={searchText}
                    onTrackDrop={handleTrackDropAsSource}
                  />
                </div>
              }
              primary={
                <>
                  <SortAddButton
                    sorting={searchSorting}
                    columns={searchSortColumns}
                    onSortingChange={setSearchSorting}
                    label="Add sort"
                    className="ds-header-btn"
                  />
                  <BrowseFilterAddButton
                    model={filterModel}
                    setModel={setFilterModel}
                    genres={filterGenres}
                    labels={filterLabels}
                  />
                </>
              }
            />
            <TableControlPanel>
              {searchSorting.length > 0 && (
                <SortTierBar
                  sorting={searchSorting}
                  columns={searchSortColumns}
                  onSortingChange={setSearchSorting}
                  hideAddButton
                />
              )}
              {filtersActive && (
                <BrowseFilterGroups
                  model={filterModel}
                  setModel={setFilterModel}
                  genres={filterGenres}
                  labels={filterLabels}
                />
              )}
            </TableControlPanel>
            {traitsError && (
              <p className="table-status table-status--error">
                Failed to load track traits — {traitsError}
              </p>
            )}
            <TrackTable
              tracks={browseTracks}
              loading={collectionLoading}
              selectedTrack={browseSelection}
              selectTrack={handleSelectTrack}
              error={tracksError}
              tableConfig={searchConfig}
              sorting={searchSorting}
              onSortingChange={setSearchSorting}
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
            {!detailMatch && (
              <MatchesPanel
                matchSource={matchSource}
                matches={matches}
                loading={matchesLoading}
                matchesError={matchesError}
                headerTitle={
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
                      <span className="chain-current">{matchSource.title}</span>
                    </div>
                  ) : undefined
                }
                tableConfig={matchesConfig}
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
                onAddToPool={handleAddToPool}
                onAddToTracklist={handleAddToTracklist}
              />
            )}
            {detailMatch && (
              <MatchDetail
                sourceTrack={matchSource}
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
            addToPool={setBuilder.addToPool}
            createSubgroup={setBuilder.createSubgroup}
            renameSubgroup={setBuilder.renameSubgroup}
            deleteSubgroup={setBuilder.deleteSubgroup}
            reorderSubgroups={setBuilder.reorderSubgroups}
            addSubgroupMember={setBuilder.addSubgroupMember}
            removeSubgroupMember={setBuilder.removeSubgroupMember}
            dropTrackToSubgroup={setBuilder.dropTrackToSubgroup}
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
              tablePrefs={tablePrefs}
            />
          </div>
        )}
      </div>
    </AudioPlayerProvider>
  )
}
