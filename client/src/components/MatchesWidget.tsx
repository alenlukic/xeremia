import type { ReactNode } from 'react'
import { MatchesPanel } from './MatchesPanel'
import { MatchDetail } from './MatchDetail'
import type { NormalizedTableConfig } from '../tablePreferences'
import type { TraitMap } from '../hooks/useCollectionCache'
import type { SearchSuggestion, Track, TransitionMatch } from '../types'

// Matches, plus the detail view it swaps to. Shared by both shells.

interface Props {
  matchSource: Track | SearchSuggestion | null
  matches: TransitionMatch[]
  loading: boolean
  matchesError: string | null
  detailMatch: TransitionMatch | null
  headerTitle?: ReactNode
  tableConfig: NormalizedTableConfig
  traitMap: TraitMap
  trackIndex: Map<number, Track>
  genres: string[]
  labels: string[]
  onClearMatchSource: () => void
  onToggleColumnVisibility: (columnId: string) => void
  onReorderColumn: (draggedId: string, targetId: string) => void
  onInsertColumnAfter: (afterId: string, columnId: string) => void
  onColumnWidthChange: (columnId: string, width: number) => void
  onColumnWidthFlush: (columnId: string, width: number) => void
  onViewDetail: (match: TransitionMatch | null) => void
  onUseAsSource: (candidateId: number) => void
  onTrackDrop: (trackId: number) => void
  onAddToPool: (candidateId: number) => void
  onAddToTracklist: (candidateId: number) => void
}

export function MatchesWidget({
  matchSource,
  matches,
  loading,
  matchesError,
  detailMatch,
  headerTitle,
  tableConfig,
  traitMap,
  trackIndex,
  genres,
  labels,
  onClearMatchSource,
  onToggleColumnVisibility,
  onReorderColumn,
  onInsertColumnAfter,
  onColumnWidthChange,
  onColumnWidthFlush,
  onViewDetail,
  onUseAsSource,
  onTrackDrop,
  onAddToPool,
  onAddToTracklist,
}: Props) {
  if (detailMatch) {
    return (
      <MatchDetail
        sourceTrack={matchSource}
        match={detailMatch}
        onBack={() => onViewDetail(null)}
        traitMap={traitMap}
        onUseAsSource={onUseAsSource}
        onAddToPool={onAddToPool}
        onAddToTracklist={onAddToTracklist}
      />
    )
  }
  return (
    <MatchesPanel
      matchSource={matchSource}
      matches={matches}
      loading={loading}
      matchesError={matchesError}
      headerTitle={headerTitle}
      tableConfig={tableConfig}
      onClearMatchSource={onClearMatchSource}
      onToggleColumnVisibility={onToggleColumnVisibility}
      onReorderColumn={onReorderColumn}
      onInsertColumnAfter={onInsertColumnAfter}
      onColumnWidthChange={onColumnWidthChange}
      onColumnWidthFlush={onColumnWidthFlush}
      onViewDetail={onViewDetail}
      onUseAsSource={onUseAsSource}
      onTrackDrop={onTrackDrop}
      trackIndex={trackIndex}
      genres={genres}
      labels={labels}
    />
  )
}
