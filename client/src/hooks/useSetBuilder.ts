import { useEffect } from 'react';
import { useWorkspaceState } from './useWorkspaceState';
import { useTracklistState } from './useTracklistState';
import { usePoolState } from './usePoolState';
import { useExplorerState } from './useExplorerState';
import { useVersionState } from './useVersionState';

export type { PendingAdd } from './useWorkspaceState';
export type { SetWorkspaceState } from './useWorkspaceState';

export function useSetBuilder() {
  const workspace = useWorkspaceState();

  const tracklistState = useTracklistState({
    activeSetId: workspace.activeSetId,
    refreshActive: workspace.refreshActive,
    refreshSets: workspace.refreshSets,
    setActiveSet: workspace.setActiveSet,
    setErrorWithAutoClear: workspace.setErrorWithAutoClear,
    mountedRef: workspace.mountedRef,
    activeSetRef: workspace.activeSetRef,
    setPendingAdd: workspace.setPendingAdd,
  });

  const poolState = usePoolState({
    activeSetId: workspace.activeSetId,
    activeSet: workspace.activeSet,
    refreshActive: workspace.refreshActive,
    refreshSets: workspace.refreshSets,
    setActiveSet: workspace.setActiveSet,
    setErrorWithAutoClear: workspace.setErrorWithAutoClear,
    mountedRef: workspace.mountedRef,
    activeSetRef: workspace.activeSetRef,
    setPendingAdd: workspace.setPendingAdd,
  });

  const explorerState = useExplorerState({
    activeSetId: workspace.activeSetId,
    activeSet: workspace.activeSet,
    refreshActive: workspace.refreshActive,
    setErrorWithAutoClear: workspace.setErrorWithAutoClear,
    mountedRef: workspace.mountedRef,
  });

  const versionState = useVersionState({
    activeSetId: workspace.activeSetId,
    activeSet: workspace.activeSet,
    refreshActive: workspace.refreshActive,
    setErrorWithAutoClear: workspace.setErrorWithAutoClear,
    mountedRef: workspace.mountedRef,
  });

  useEffect(() => {
    if (workspace.activeSet) {
      explorerState.syncTreeId(workspace.activeSet);
    }
  }, [workspace.activeSet]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    sets: workspace.sets,
    activeSetId: workspace.activeSetId,
    activeSet: workspace.activeSet,
    loading: workspace.loading,
    error: workspace.error,
    pendingAdd: workspace.pendingAdd,
    createSet: workspace.createSet,
    selectSet: workspace.selectSet,
    deleteSet: workspace.deleteSet,
    clearError: workspace.clearError,
    refreshActive: workspace.refreshActive,
    resolvePendingAdd: workspace.resolvePendingAdd,
    clearPendingAdd: workspace.clearPendingAdd,

    addToTracklist: tracklistState.addToTracklist,
    removeFromTracklist: tracklistState.removeFromTracklist,
    clearTracklist: tracklistState.clearTracklist,
    moveTracklistToPool: tracklistState.moveTracklistToPool,
    reorderTracklist: tracklistState.reorderTracklist,
    addToTracklistAtPosition: tracklistState.addToTracklistAtPosition,
    updateTracklistNote: tracklistState.updateTracklistNote,
    toggleTracklistStar: tracklistState.toggleTracklistStar,

    addToPool: poolState.addToPool,
    removeFromPool: poolState.removeFromPool,
    clearPool: poolState.clearPool,
    movePoolToTracklist: poolState.movePoolToTracklist,
    reorderPool: poolState.reorderPool,
    togglePoolStar: poolState.togglePoolStar,
    isPoolAddInFlight: poolState.isPoolAddInFlight,
    createSubgroup: poolState.createSubgroup,
    renameSubgroup: poolState.renameSubgroup,
    deleteSubgroup: poolState.deleteSubgroup,
    reorderSubgroups: poolState.reorderSubgroups,
    addSubgroupMember: poolState.addSubgroupMember,
    removeSubgroupMember: poolState.removeSubgroupMember,

    activeTreeId: explorerState.activeTreeId,
    selectTree: explorerState.selectTree,
    createTree: explorerState.createTree,
    renameTree: explorerState.renameTree,
    deleteTree: explorerState.deleteTree,
    addExplorerNode: explorerState.addExplorerNode,
    deleteExplorerNode: explorerState.deleteExplorerNode,
    addExplorerEdge: explorerState.addExplorerEdge,
    deleteExplorerEdge: explorerState.deleteExplorerEdge,
    addSiblingNode: explorerState.addSiblingNode,
    swapExplorerNodes: explorerState.swapExplorerNodes,
    moveExplorerNode: explorerState.moveExplorerNode,
    explorerNodeAddToTracklist: explorerState.explorerNodeAddToTracklist,
    fetchEdgeScores: explorerState.fetchEdgeScores,
    addEmptyRows: explorerState.addEmptyRows,
    deleteEmptyRow: explorerState.deleteEmptyRow,
    reorderEmptyRow: explorerState.reorderEmptyRow,

    versions: versionState.versions,
    activeVersionId: versionState.activeVersionId,
    activeVersion: versionState.activeVersion,
    transitionScores: versionState.transitionScores,
    scoresLoading: versionState.scoresLoading,
    versionTrackMap: versionState.trackMap,
    createVersion: versionState.createVersion,
    renameVersion: versionState.renameVersion,
    deleteVersion: versionState.deleteVersion,
    switchVersion: versionState.switchVersion,
    branchFromSlot: versionState.branchFromSlot,
    refreshScores: versionState.refreshScores,
    selectCandidate: versionState.selectCandidate,
    removeCandidate: versionState.removeCandidate,
    addCandidate: versionState.addCandidate,
    removeSlot: versionState.removeSlot,
    appendTrackAsNewSlot: versionState.appendTrackAsNewSlot,
    insertTrackBetween: versionState.insertTrackBetween,
  };
}
