import { useCallback, memo } from 'react';
import type { HydratedSet, PoolSubgroup } from '../types';
import { SetTracklist } from './SetTracklist';
import { SetPoolTable } from './SetPoolTable';

interface Props {
  activeSet: HydratedSet;
  removeFromPool: (trackId: number) => void;
  clearPool: () => void;
  movePoolToTracklist: (trackId: number) => void;
  reorderPool: (trackId: number, newPosition: number) => void;
  addToPool: (trackId: number, title?: string) => void;
  removeFromTracklist: (trackId: number) => void;
  clearTracklist: () => void;
  moveTracklistToPool: (trackId: number) => void;
  reorderTracklist: (trackId: number, newPosition: number) => void;
  addToTracklistAtPosition: (trackId: number, position: number, title?: string) => void;
  updateTracklistNote: (trackId: number, note: string) => void;
  addToTracklist: (trackId: number, title?: string) => void;
  createSubgroup: (name: string) => Promise<PoolSubgroup | null>;
  renameSubgroup: (subgroupId: number, name: string) => Promise<boolean>;
  deleteSubgroup: (subgroupId: number) => Promise<boolean>;
  reorderSubgroups: (subgroupIds: number[]) => Promise<boolean>;
  addSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  removeSubgroupMember: (subgroupId: number, poolEntryId: number) => Promise<boolean>;
  addEmptyRows: (surface: 'tracklist' | 'pool', count: number, position: number) => void;
  deleteEmptyRow: (emptyRowId: number) => void;
  reorderEmptyRow: (emptyRowId: number, newPosition: number) => void;
  poolExpanded: boolean;
  onPoolExpandedChange: (expanded: boolean) => void;
  dndDisabled?: boolean;
  dndIdPrefix?: string;
}

export const SetWorkspacePanel = memo(function SetWorkspacePanel({
  activeSet,
  removeFromPool, clearPool, movePoolToTracklist, reorderPool, addToPool,
  removeFromTracklist, clearTracklist, moveTracklistToPool, reorderTracklist,
  addToTracklistAtPosition,
  updateTracklistNote, addToTracklist,
  createSubgroup, renameSubgroup, deleteSubgroup,
  reorderSubgroups, addSubgroupMember, removeSubgroupMember,
  addEmptyRows, deleteEmptyRow, reorderEmptyRow,
  poolExpanded, onPoolExpandedChange, dndDisabled, dndIdPrefix,
}: Props) {
  const handlePoolAddTrack = useCallback((trackId: number, title?: string) => {
    addToPool(trackId, title);
    if (!poolExpanded) onPoolExpandedChange(true);
  }, [addToPool, poolExpanded, onPoolExpandedChange]);

  const handleTracklistFillEmptyRow = useCallback((_emptyId: string, trackId: number, title?: string, position?: number) => {
    if (position != null) {
      addToTracklistAtPosition(trackId, position, title);
    } else {
      addToTracklist(trackId, title);
    }
  }, [addToTracklist, addToTracklistAtPosition]);

  const handlePoolFillEmptyRow = useCallback((_emptyId: string, trackId: number, title?: string) => {
    addToPool(trackId, title);
    if (!poolExpanded) onPoolExpandedChange(true);
  }, [addToPool, poolExpanded, onPoolExpandedChange]);

  return (
    <div className="set-workspace-split set-workspace-split--vertical">
      <div className="tracklist-zone" data-testid="tracklist-zone">
        <SetTracklist
          tracklist={activeSet.tracklist}
          emptyRows={(activeSet.empty_rows ?? []).filter(r => r.surface === 'tracklist')}
          onRemove={removeFromTracklist}
          onClearAll={clearTracklist}
          onMoveToPool={moveTracklistToPool}
          onReorder={reorderTracklist}
          onUpdateNote={updateTracklistNote}
          onAddTrack={addToTracklist}
          onFillEmptyRow={handleTracklistFillEmptyRow}
          onInsertEmptyRows={(count, position) => addEmptyRows('tracklist', count, position)}
          onDeleteEmptyRow={deleteEmptyRow}
          onReorderEmptyRow={reorderEmptyRow}
          dndDisabled={dndDisabled}
          dndIdPrefix={dndIdPrefix}
        />
      </div>
      <div className="zone-divider" />
      <div className="pool-zone" data-testid="pool-zone">
        <SetPoolTable
          pool={activeSet.pool}
          emptyRows={(activeSet.empty_rows ?? []).filter(r => r.surface === 'pool')}
          subgroups={activeSet.pool_subgroups ?? []}
          subgroupMemberships={activeSet.pool_subgroup_memberships ?? []}
          onRemove={removeFromPool}
          onClearAll={clearPool}
          onMoveToTracklist={movePoolToTracklist}
          onReorder={reorderPool}
          onAddTrack={handlePoolAddTrack}
          onFillEmptyRow={handlePoolFillEmptyRow}
          onInsertEmptyRows={(count, position) => addEmptyRows('pool', count, position)}
          onDeleteEmptyRow={deleteEmptyRow}
          onReorderEmptyRow={reorderEmptyRow}
          onCreateSubgroup={createSubgroup}
          onRenameSubgroup={renameSubgroup}
          onDeleteSubgroup={deleteSubgroup}
          onReorderSubgroups={reorderSubgroups}
          onAddSubgroupMember={addSubgroupMember}
          onRemoveSubgroupMember={removeSubgroupMember}
          dndDisabled={dndDisabled}
          dndIdPrefix={dndIdPrefix}
        />
      </div>
    </div>
  );
});
