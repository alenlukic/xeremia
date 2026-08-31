import { useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { SearchPanel } from './SearchPanel'
import { TrackTable } from './TrackTable'
import { TableHeader } from './table/TableHeader'
import { TableControlPanel } from './table/TableControlPanel'
import { SortTierBar, SortAddButton } from './SortTierBar'
import { BrowseFilterAddButton, BrowseFilterGroups } from './FilterBar'
import type { NormalizedTableConfig } from '../tablePreferences'
import type { FilterModel } from '../hooks/useTrackFilters'
import type { SearchSuggestion, Track } from '../types'
import { useMultiSelect } from '../hooks/useMultiSelect'
import { useBulkAction } from '../hooks/useBulkAction'
import { useSelectAllShortcut } from '../hooks/useSelectAllShortcut'
import {
  SelectionAction,
  SelectionBar,
  SelectionToggle,
} from './SelectionControls'

// The Browser stack — search, sort, filters, virtualized table — as one unit so
// the workspace shell and the legacy quadrant shell render the same chrome.

interface Props {
  allTracks: Track[]
  tracks: Track[]
  loading: boolean
  tracksError: string | null
  traitsError: string | null
  selectedTrack: Track | SearchSuggestion | null
  selectTrack: (track: Track | SearchSuggestion) => void
  clearBrowseSelection: () => void
  searchText: string
  onSearchTextChange: (text: string) => void
  onTrackDrop: (trackId: number) => void
  sorting: SortingState
  onSortingChange: Dispatch<SetStateAction<SortingState>>
  sortColumns: { id: string; label: string }[]
  filterModel: FilterModel
  setFilterModel: Dispatch<SetStateAction<FilterModel>>
  filtersActive: boolean
  genres: string[]
  labels: string[]
  tableConfig: NormalizedTableConfig
  onToggleColumnVisibility: (columnId: string) => void
  onReorderColumn: (draggedId: string, targetId: string) => void
  onInsertColumnAfter: (afterId: string, columnId: string) => void
  onColumnWidthChange: (columnId: string, width: number) => void
  onColumnWidthFlush: (columnId: string, width: number) => void
  scrollRestorationKey?: string
  /** Bulk actions for a multi-selection; omitted, the bar shows no actions. */
  onAddManyToPool?: (trackId: number) => void | Promise<unknown>
}

export function BrowserWidget({
  allTracks,
  tracks,
  loading,
  tracksError,
  traitsError,
  selectedTrack,
  selectTrack,
  clearBrowseSelection,
  searchText,
  onSearchTextChange,
  onTrackDrop,
  sorting,
  onSortingChange,
  sortColumns,
  filterModel,
  setFilterModel,
  filtersActive,
  genres,
  labels,
  tableConfig,
  onToggleColumnVisibility,
  onReorderColumn,
  onInsertColumnAfter,
  onColumnWidthChange,
  onColumnWidthFlush,
  scrollRestorationKey,
  onAddManyToPool,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  // Selectable rows are exactly what the search and filters leave standing.
  const selection = useMultiSelect(
    useMemo(() => tracks.map((t) => t.id), [tracks]),
  )
  useSelectAllShortcut(hostRef, selection.selectAll)
  const bulk = useBulkAction()

  return (
    <div
      className="ds-stack"
      ref={hostRef}
      tabIndex={-1}
      // Claiming focus on click is what scopes Cmd/Ctrl+A to this list rather
      // than whichever other track list happens to be on screen.
      onMouseDown={() => hostRef.current?.focus({ preventScroll: true })}
    >
      <TableHeader
        title={
          <div className="ds-header-search">
            <SelectionToggle selection={selection} label="browse results" />
            <SearchPanel
              allTracks={allTracks}
              selectedTrack={selectedTrack}
              selectTrack={selectTrack}
              clearBrowseSelection={clearBrowseSelection}
              onSearchTextChange={onSearchTextChange}
              searchText={searchText}
              onTrackDrop={onTrackDrop}
            />
          </div>
        }
        primary={
          <>
            <SortAddButton
              sorting={sorting}
              columns={sortColumns}
              onSortingChange={onSortingChange}
              label="Add sort"
              className="ds-header-btn"
            />
            <BrowseFilterAddButton
              model={filterModel}
              setModel={setFilterModel}
              genres={genres}
              labels={labels}
            />
          </>
        }
      />
      <TableControlPanel>
        {sorting.length > 0 && (
          <SortTierBar
            sorting={sorting}
            columns={sortColumns}
            onSortingChange={onSortingChange}
            hideAddButton
          />
        )}
        {filtersActive && (
          <BrowseFilterGroups
            model={filterModel}
            setModel={setFilterModel}
            genres={genres}
            labels={labels}
          />
        )}
      </TableControlPanel>
      <SelectionBar selection={selection} progress={bulk.progress}>
        {onAddManyToPool && (
          <SelectionAction
            label="Add to Pool"
            disabled={bulk.running}
            onClick={() =>
              void bulk.run(
                'Adding to pool',
                selection.orderedIds,
                onAddManyToPool,
                selection.clear,
              )
            }
          />
        )}
      </SelectionBar>
      {traitsError && (
        <p className="table-status table-status--error">
          Failed to load track traits — {traitsError}
        </p>
      )}
      <TrackTable
        tracks={tracks}
        loading={loading}
        selectedTrack={selectedTrack}
        selectTrack={selectTrack}
        error={tracksError}
        tableConfig={tableConfig}
        sorting={sorting}
        onSortingChange={onSortingChange}
        onToggleColumnVisibility={onToggleColumnVisibility}
        onReorderColumn={onReorderColumn}
        onInsertColumnAfter={onInsertColumnAfter}
        onColumnWidthChange={onColumnWidthChange}
        onColumnWidthFlush={onColumnWidthFlush}
        scrollRestorationKey={scrollRestorationKey}
        selection={selection}
      />
    </div>
  )
}
