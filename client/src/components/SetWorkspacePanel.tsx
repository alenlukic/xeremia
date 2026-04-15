import { useCallback, memo } from 'react';
import type { HydratedSet, PoolSubgroup } from '../types';
import { SetTracklist } from './SetTracklist';
import { SetPoolTable } from './SetPoolTable';

interface Props {
  activeSet: HydratedSet;
  removeFromPool: (trackId: number) => void;
  clearPool: () => void;
  movePoolToTracklist: (trackId: number) => void;
  addToPool: (trackId: number, title?: string) => void;
  removeFromTracklist: (trackId: number) => void;
  clearTracklist: () => void;
  moveTracklistToPool: (trackId: number) => void;
  reorderTracklist: (trackId: number, newPosition: number) => void;
  updateTracklistNote: (trackId: number, note: string) => void;
  togglePoolStar: (trackId: number, starred: boolean) => void;
  toggleTracklistStar: (trackId: number, starred: boolean) => void;
  addToTracklist: (trackId: number, title?: string) => void;
  createSubgroup: (name: string) => Promise<PoolSubgroup | null>;
  renameSubgroup: (subgroupId: number, name: string) => Promise<boolean>;
  deleteSubgroup: (subgroupId: number) => Promise<boolean>;
  reorderSubgroups: (subgroupIds: number[]) => Promise<boolean>;
  addSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  removeSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  poolExpanded: boolean;
  onPoolExpandedChange: (expanded: boolean) => void;
  dndDisabled?: boolean;
}

export const SetWorkspacePanel = memo(function SetWorkspacePanel({
  activeSet,
  removeFromPool, clearPool, movePoolToTracklist, addToPool,
  removeFromTracklist, clearTracklist, moveTracklistToPool, reorderTracklist,
  updateTracklistNote, togglePoolStar, toggleTracklistStar, addToTracklist,
  createSubgroup, renameSubgroup, deleteSubgroup,
  reorderSubgroups, addSubgroupMember, removeSubgroupMember,
  poolExpanded, onPoolExpandedChange, dndDisabled,
}: Props) {
  const handlePoolAddTrack = useCallback((trackId: number, title?: string) => {
    addToPool(trackId, title);
    if (!poolExpanded) onPoolExpandedChange(true);
  }, [addToPool, poolExpanded, onPoolExpandedChange]);

  return (
    <div className="set-workspace-split">
      <SetTracklist
        tracklist={activeSet.tracklist}
        onRemove={removeFromTracklist}
        onClearAll={clearTracklist}
        onMoveToPool={moveTracklistToPool}
        onReorder={reorderTracklist}
        onUpdateNote={updateTracklistNote}
        onToggleStar={toggleTracklistStar}
        onAddTrack={addToTracklist}
        dndDisabled={dndDisabled}
      />
      <div className={`set-pool-accordion${poolExpanded ? ' expanded' : ''}`}>
        {poolExpanded && (
          <button
            className="set-pool-collapse-handle"
            onClick={() => onPoolExpandedChange(false)}
            aria-label="Collapse pool"
            title="Collapse pool"
          >
            ‹
          </button>
        )}
        {!poolExpanded ? (
          <button
            className="set-pool-expand-tab"
            onClick={() => onPoolExpandedChange(true)}
            aria-label="Expand pool"
            title="Expand pool"
          >
            <span className="set-pool-expand-chevron" aria-hidden="true">›</span>
            <span className="set-pool-expand-label">Pool ({activeSet.pool.length})</span>
          </button>
        ) : (
          <div className="set-pool-accordion-content">
            <SetPoolTable
              pool={activeSet.pool}
              subgroups={activeSet.pool_subgroups ?? []}
              subgroupMemberships={activeSet.pool_subgroup_memberships ?? []}
              onRemove={removeFromPool}
              onClearAll={clearPool}
              onMoveToTracklist={movePoolToTracklist}
              onToggleStar={togglePoolStar}
              onAddTrack={handlePoolAddTrack}
              onCreateSubgroup={createSubgroup}
              onRenameSubgroup={renameSubgroup}
              onDeleteSubgroup={deleteSubgroup}
              onReorderSubgroups={reorderSubgroups}
              onAddSubgroupMember={addSubgroupMember}
              onRemoveSubgroupMember={removeSubgroupMember}
              dndDisabled={dndDisabled}
            />
          </div>
        )}
      </div>
    </div>
  );
});
