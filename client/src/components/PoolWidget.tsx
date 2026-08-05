import { SetPoolTable } from './SetPoolTable'
import type { NormalizedTableConfig } from '../tablePreferences'
import type { HydratedSet, PoolSubgroup, Track } from '../types'

// The Pool widget frames the existing pool table, which already owns the rows
// and the groups rail. Groups are pool subgroups, and the Sequencer's
// alternative lanes read the same records.

interface Props {
  allTracks: Track[]
  activeSet: HydratedSet | null
  tableConfig: NormalizedTableConfig
  onToggleColumn: (columnId: string) => void
  onReorderColumn: (draggedId: string, targetId: string) => void
  onInsertColumnAfter: (afterId: string, columnId: string) => void
  onColumnWidthChange: (columnId: string, width: number) => void
  onColumnWidthFlush: (columnId: string, width: number) => void
  onRemove: (trackId: number) => void
  onReorder: (trackId: number, newPosition: number) => void
  onSetHighlight: (trackId: number, color: string | null) => void
  onAddTrack: (trackId: number, title?: string) => void
  onCreateSubgroup: (name: string) => Promise<PoolSubgroup | null>
  onRenameSubgroup: (subgroupId: number, name: string) => Promise<boolean>
  onDeleteSubgroup: (subgroupId: number) => Promise<boolean>
  onReorderSubgroups: (subgroupIds: number[]) => Promise<boolean>
  onReorderSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
    newPosition: number,
  ) => Promise<boolean>
  onAddSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
  onRemoveSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
  onDropTrackToSubgroup: (
    subgroupId: number,
    trackId: number,
    source: 'browse' | 'tracklist' | 'pool',
  ) => Promise<void>
  onDropFromTracklist: (trackId: number) => void
}

export function PoolWidget({ allTracks, activeSet, ...actions }: Props) {
  if (!activeSet) {
    return (
      <p className="table-status">
        No active set — create or select one to build a pool.
      </p>
    )
  }
  return (
    <SetPoolTable
      allTracks={allTracks}
      pool={activeSet.pool}
      subgroups={activeSet.pool_subgroups ?? []}
      subgroupMemberships={activeSet.pool_subgroup_memberships ?? []}
      {...actions}
    />
  )
}
