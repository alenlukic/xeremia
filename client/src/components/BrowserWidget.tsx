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
}: Props) {
  return (
    <>
      <TableHeader
        title={
          <div className="ds-header-search">
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
      />
    </>
  )
}
