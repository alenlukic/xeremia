import { useState, useCallback, useEffect, useRef } from 'react';
import type { SetSummary, HydratedSet, PoolSubgroup, PersistedEmptyRow } from '../types';
import type { ExplorerTree } from '../types';
import {
  fetchSets, createSet as apiCreateSet, fetchHydratedSet, deleteSet as apiDeleteSet,
  poolAdd, poolRemove, poolClear as apiPoolClear, poolMoveToTracklist,
  tracklistAdd, tracklistRemove, tracklistClear as apiTracklistClear,
  tracklistReorder, tracklistMoveToPool,
  updateTracklistNote as apiUpdateTracklistNote,
  togglePoolStar, toggleTracklistStar,
  explorerAddNode, explorerDeleteNode, explorerAddEdge, explorerDeleteEdge,
  explorerSwap, explorerMoveNode, explorerNodeToTracklist, explorerEdgeScores,
  explorerCreateTree, explorerRenameTree, explorerDeleteTree,
  subgroupCreate as apiSubgroupCreate,
  subgroupRename as apiSubgroupRename,
  subgroupDelete as apiSubgroupDelete,
  subgroupReorder as apiSubgroupReorder,
  subgroupAddMember as apiSubgroupAddMember,
  subgroupRemoveMember as apiSubgroupRemoveMember,
  emptyRowAdd as apiEmptyRowAdd,
  emptyRowDelete as apiEmptyRowDelete,
  emptyRowReorder as apiEmptyRowReorder,
} from '../api/http';

export interface PendingAdd {
  type: 'pool' | 'tracklist';
  trackId: number;
  title: string;
}

export interface SetWorkspaceState {
  sets: SetSummary[];
  activeSetId: number | null;
  activeSet: HydratedSet | null;
  loading: boolean;
  error: string | null;
  pendingAdd: PendingAdd | null;
}

const ERROR_DISMISS_MS = 4000;

function friendlyError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/409|already exists|duplicate/i.test(raw)) return 'This track is already in the list.';
  if (/404|not found/i.test(raw)) return 'Item not found — it may have been removed.';
  if (/network|fetch|ECONNREFUSED/i.test(raw)) return 'Network error — please check your connection.';
  if (/500|internal server/i.test(raw)) return 'Server error — please try again shortly.';
  if (/timeout|timed out/i.test(raw)) return 'Request timed out — please try again.';
  return fallback;
}

export function useSetBuilder() {
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [activeSet, setActiveSet] = useState<HydratedSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [activeTreeId, setActiveTreeId] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poolAddInFlightRef = useRef(new Set<number>());
  const activeSetRef = useRef(activeSet);
  activeSetRef.current = activeSet;

  const setErrorWithAutoClear = useCallback((msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setError(msg);
    errorTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setError(null);
      errorTimerRef.current = null;
    }, ERROR_DISMISS_MS);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const refreshSets = useCallback(async () => {
    try {
      const data = await fetchSets();
      if (mountedRef.current) setSets(data);
    } catch {
      /* non-critical */
    }
  }, []);

  const hydrateSet = useCallback(async (setId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHydratedSet(setId);
      if (mountedRef.current) {
        setActiveSet(data);
        setActiveSetId(setId);
        if (data.explorer_trees.length > 0) {
          setActiveTreeId(prev => {
            if (prev !== null && data.explorer_trees.some(t => t.id === prev)) return prev;
            return data.explorer_trees[0].id;
          });
        } else {
          setActiveTreeId(null);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setErrorWithAutoClear(friendlyError(err, 'Failed to load set.'));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSets().then(() => {
      const stored = localStorage.getItem('dj-tools-active-set-id');
      if (stored) {
        const id = parseInt(stored, 10);
        if (!isNaN(id)) hydrateSet(id);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeSetId !== null) {
      localStorage.setItem('dj-tools-active-set-id', String(activeSetId));
    } else {
      localStorage.removeItem('dj-tools-active-set-id');
    }
  }, [activeSetId]);

  const createSet = useCallback(async (name: string) => {
    try {
      const newSet = await apiCreateSet(name);
      await refreshSets();
      await hydrateSet(newSet.id);
      return newSet;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not create set.'));
      return null;
    }
  }, [refreshSets, hydrateSet]);

  const selectSet = useCallback((id: number) => {
    if (activeSetRef.current?.set.id === id) return;
    hydrateSet(id);
  }, [hydrateSet]);

  const deleteSetAction = useCallback(async (id: number) => {
    try {
      await apiDeleteSet(id);
      await refreshSets();
      if (activeSetId === id) {
        setActiveSetId(null);
        setActiveSet(null);
      }
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete set.'));
    }
  }, [activeSetId, refreshSets]);

  const refreshActive = useCallback(async () => {
    if (activeSetId !== null) {
      await hydrateSet(activeSetId);
      await refreshSets();
    }
  }, [activeSetId, hydrateSet, refreshSets]);

  useEffect(() => {
    if (activeSet && poolAddInFlightRef.current.size > 0) {
      const poolTrackIds = new Set(activeSet.pool.map(e => e.track_id));
      for (const id of poolAddInFlightRef.current) {
        if (poolTrackIds.has(id)) {
          poolAddInFlightRef.current.delete(id);
        }
      }
    }
  }, [activeSet]);

  const isPoolAddInFlight = useCallback(
    (trackId: number) => poolAddInFlightRef.current.has(trackId),
    [],
  );

  const addToPool = useCallback(async (trackId: number, title?: string) => {
    if (activeSetId === null) {
      setPendingAdd({ type: 'pool', trackId, title: title ?? `Track #${trackId}` });
      return;
    }
    const cur = activeSetRef.current;
    if (cur && cur.pool.some(e => e.track_id === trackId)) return;
    if (poolAddInFlightRef.current.has(trackId)) return;
    poolAddInFlightRef.current.add(trackId);
    try {
      await poolAdd(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      poolAddInFlightRef.current.delete(trackId);
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add track to pool.'));
    }
  }, [activeSetId, refreshActive]);

  const addToTracklist = useCallback(async (trackId: number, title?: string) => {
    if (activeSetId === null) {
      setPendingAdd({ type: 'tracklist', trackId, title: title ?? `Track #${trackId}` });
      return;
    }
    try {
      await tracklistAdd(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add track to tracklist.'));
    }
  }, [activeSetId, refreshActive]);

  const removeFromPool = useCallback(async (trackId: number) => {
    if (activeSetId === null) return;
    try {
      await poolRemove(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not remove track from pool.'));
    }
  }, [activeSetId, refreshActive]);

  const removeFromTracklist = useCallback(async (trackId: number) => {
    if (activeSetId === null) return;
    try {
      await tracklistRemove(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not remove track from tracklist.'));
    }
  }, [activeSetId, refreshActive]);

  const clearPool = useCallback(async () => {
    if (activeSetId === null) return;
    try {
      await apiPoolClear(activeSetId);
      if (mountedRef.current) {
        setActiveSet(prev => {
          if (!prev) return prev;
          return { ...prev, pool: [], set: { ...prev.set, pool_count: 0 } };
        });
        await refreshSets();
      }
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not clear pool.'));
    }
  }, [activeSetId, refreshSets, setErrorWithAutoClear]);

  const clearTracklist = useCallback(async () => {
    if (activeSetId === null) return;
    try {
      await apiTracklistClear(activeSetId);
      if (mountedRef.current) {
        setActiveSet(prev => {
          if (!prev) return prev;
          return { ...prev, tracklist: [], set: { ...prev.set, tracklist_count: 0 } };
        });
        await refreshSets();
      }
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not clear tracklist.'));
    }
  }, [activeSetId, refreshSets, setErrorWithAutoClear]);

  const movePoolToTracklist = useCallback(async (trackId: number) => {
    if (activeSetId === null) return;
    try {
      await poolMoveToTracklist(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not move track to tracklist.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear]);

  const moveTracklistToPool = useCallback(async (trackId: number) => {
    if (activeSetId === null) return;
    try {
      await tracklistMoveToPool(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not move track to pool.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear]);

  const reorderTracklist = useCallback(async (trackId: number, newPosition: number) => {
    if (activeSetId === null || trackId <= 0) return;
    try {
      await tracklistReorder(activeSetId, trackId, newPosition);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not reorder tracklist.'));
    }
  }, [activeSetId, refreshActive]);

  const addToTracklistAtPosition = useCallback(async (trackId: number, position: number, title?: string) => {
    if (trackId <= 0) return;
    if (activeSetId === null) {
      setPendingAdd({ type: 'tracklist', trackId, title: title ?? `Track #${trackId}` });
      return;
    }
    let added = false;
    try {
      await tracklistAdd(activeSetId, trackId);
      added = true;
      if (position >= 0) {
        await tracklistReorder(activeSetId, trackId, position);
      }
      await refreshActive();
    } catch (err) {
      if (added) {
        try { await tracklistRemove(activeSetId, trackId); } catch { /* best-effort rollback */ }
      }
      await refreshActive();
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add track at position.'));
    }
  }, [activeSetId, refreshActive]);

  const updateTracklistNote = useCallback(async (trackId: number, note: string) => {
    if (activeSetId === null) return;
    try {
      await apiUpdateTracklistNote(activeSetId, trackId, note);
      if (mountedRef.current && activeSet) {
        setActiveSet(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            tracklist: prev.tracklist.map(e =>
              e.track_id === trackId ? { ...e, note } : e
            ),
          };
        });
      }
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not save note.'));
    }
  }, [activeSetId, activeSet]);

  const togglePoolStarAction = useCallback(async (trackId: number, starred: boolean) => {
    if (activeSetId === null) return;
    setActiveSet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pool: prev.pool.map(e => e.track_id === trackId ? { ...e, starred } : e),
        tracklist: prev.tracklist.map(e => e.track_id === trackId ? { ...e, starred } : e),
      };
    });
    try {
      await togglePoolStar(activeSetId, trackId, starred);
    } catch (err) {
      await refreshActive();
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not toggle star.'));
    }
  }, [activeSetId, refreshActive]);

  const toggleTracklistStarAction = useCallback(async (trackId: number, starred: boolean) => {
    if (activeSetId === null) return;
    setActiveSet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pool: prev.pool.map(e => e.track_id === trackId ? { ...e, starred } : e),
        tracklist: prev.tracklist.map(e => e.track_id === trackId ? { ...e, starred } : e),
      };
    });
    try {
      await toggleTracklistStar(activeSetId, trackId, starred);
    } catch (err) {
      await refreshActive();
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not toggle star.'));
    }
  }, [activeSetId, refreshActive]);

  const addExplorerNode = useCallback(async (
    trackId: number, parentNodeId?: string, level: number = 0, colIndex?: number,
  ) => {
    if (activeSetId === null) return null;
    try {
      const treeNodes = activeTreeId !== null && activeSet
        ? activeSet.explorer_nodes.filter(n => n.tree_id === activeTreeId)
        : activeSet?.explorer_nodes ?? [];
      if (colIndex === undefined && parentNodeId && activeSet) {
        const parentNode = treeNodes.find(n => n.node_id === parentNodeId);
        if (parentNode) {
          const targetLevel = parentNode.level + 1;
          const existing = treeNodes.find(
            n => n.track_id === trackId && n.level === targetLevel,
          );
          if (existing) {
            await explorerAddEdge(activeSetId, parentNodeId, existing.node_id);
            await refreshActive();
            return { node_id: existing.node_id, track_id: trackId, level: targetLevel };
          }
        }
      }
      const result = await explorerAddNode(activeSetId, trackId, parentNodeId, level, activeTreeId ?? undefined, colIndex);
      await refreshActive();
      return result;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add node.'));
      return null;
    }
  }, [activeSetId, activeSet, activeTreeId, refreshActive]);

  const deleteExplorerNode = useCallback(async (
    nodeId: string,
    rewireEdges?: { parent_node_id: string; child_node_id: string }[],
  ) => {
    if (activeSetId === null) return;
    try {
      await explorerDeleteNode(activeSetId, nodeId, rewireEdges);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete node.'));
    }
  }, [activeSetId, refreshActive]);

  const addExplorerEdge = useCallback(async (parentNodeId: string, childNodeId: string) => {
    if (activeSetId === null) return;
    if (activeSet?.explorer_edges.some(
      e => e.parent_node_id === parentNodeId && e.child_node_id === childNodeId,
    )) {
      return;
    }
    try {
      await explorerAddEdge(activeSetId, parentNodeId, childNodeId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add edge.'));
    }
  }, [activeSetId, activeSet, refreshActive]);

  const deleteExplorerEdgeAction = useCallback(async (edgeId: number) => {
    if (activeSetId === null) return;
    try {
      await explorerDeleteEdge(activeSetId, edgeId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete edge.'));
    }
  }, [activeSetId, refreshActive]);

  const addSiblingNode = useCallback(async (
    trackId: number,
    inheritParentIds: string[],
    level: number,
    colIndex?: number,
  ) => {
    if (activeSetId === null) return null;
    try {
      const firstParent = inheritParentIds[0];
      const result = await explorerAddNode(activeSetId, trackId, firstParent, level, activeTreeId ?? undefined, colIndex);
      if (!result) return null;
      for (let i = 1; i < inheritParentIds.length; i++) {
        await explorerAddEdge(activeSetId, inheritParentIds[i], result.node_id);
      }
      await refreshActive();
      return result;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add sibling.'));
      return null;
    }
  }, [activeSetId, activeTreeId, refreshActive]);

  const swapExplorerNodes = useCallback(async (nodeAId: string, nodeBId: string) => {
    if (activeSetId === null) return;
    try {
      await explorerSwap(activeSetId, nodeAId, nodeBId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not swap nodes.'));
    }
  }, [activeSetId, refreshActive]);

  const moveExplorerNodeAction = useCallback(async (
    nodeId: string,
    targetLevel?: number,
    targetColIndex?: number,
    newParentNodeId?: string,
  ) => {
    if (activeSetId === null) return;
    try {
      await explorerMoveNode(activeSetId, nodeId, targetLevel, targetColIndex, newParentNodeId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not move node.'));
    }
  }, [activeSetId, refreshActive]);

  const explorerNodeAddToTracklist = useCallback(async (nodeId: string) => {
    if (activeSetId === null) return;
    try {
      await explorerNodeToTracklist(activeSetId, nodeId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add to tracklist.'));
    }
  }, [activeSetId, refreshActive]);

  const fetchEdgeScores = useCallback(async (pairs: [number, number][]) => {
    if (activeSetId === null) return { scores: [] as (number | null)[] };
    return explorerEdgeScores(activeSetId, pairs);
  }, [activeSetId]);

  const resolvePendingAdd = useCallback(async (setId: number) => {
    if (!pendingAdd) return;
    const { type, trackId } = pendingAdd;
    setPendingAdd(null);
    await hydrateSet(setId);
    if (type === 'pool') {
      await poolAdd(setId, trackId);
    } else {
      await tracklistAdd(setId, trackId);
    }
    await hydrateSet(setId);
    await refreshSets();
  }, [pendingAdd, hydrateSet, refreshSets]);

  const clearPendingAdd = useCallback(() => {
    setPendingAdd(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const createTree = useCallback(async (
    name: string,
    mode: 'empty' | 'full_copy' | 'subtree_copy' = 'empty',
    sourceTreeId?: number,
    sourceNodeId?: string,
  ): Promise<ExplorerTree | null> => {
    if (activeSetId === null) return null;
    try {
      const tree = await explorerCreateTree(activeSetId, name, mode, sourceTreeId, sourceNodeId);
      await refreshActive();
      if (mountedRef.current) setActiveTreeId(tree.id);
      return tree;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not create tree.'));
      return null;
    }
  }, [activeSetId, refreshActive]);

  const selectTree = useCallback((treeId: number) => {
    setActiveTreeId(treeId);
  }, []);

  const renameTree = useCallback(async (treeId: number, name: string): Promise<boolean> => {
    if (activeSetId === null) return false;
    try {
      await explorerRenameTree(activeSetId, treeId, name);
      await refreshActive();
      return true;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not rename tree.'));
      return false;
    }
  }, [activeSetId, refreshActive]);

  const deleteTree = useCallback(async (treeId: number): Promise<boolean> => {
    if (activeSetId === null) return false;
    try {
      await explorerDeleteTree(activeSetId, treeId);
      await refreshActive();
      return true;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete tree.'));
      return false;
    }
  }, [activeSetId, refreshActive]);

  const createSubgroup = useCallback(async (name: string): Promise<PoolSubgroup | null> => {
    if (activeSetId === null) return null;
    try {
      const sg = await apiSubgroupCreate(activeSetId, name);
      await refreshActive();
      return sg;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not create subgroup.'));
      return null;
    }
  }, [activeSetId, refreshActive]);

  const renameSubgroup = useCallback(async (subgroupId: number, name: string): Promise<boolean> => {
    if (activeSetId === null) return false;
    try {
      await apiSubgroupRename(activeSetId, subgroupId, name);
      await refreshActive();
      return true;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not rename subgroup.'));
      return false;
    }
  }, [activeSetId, refreshActive]);

  const deleteSubgroup = useCallback(async (subgroupId: number): Promise<boolean> => {
    if (activeSetId === null) return false;
    try {
      await apiSubgroupDelete(activeSetId, subgroupId);
      await refreshActive();
      return true;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete subgroup.'));
      return false;
    }
  }, [activeSetId, refreshActive]);

  const reorderSubgroups = useCallback(async (subgroupIds: number[]): Promise<boolean> => {
    if (activeSetId === null) return false;
    try {
      await apiSubgroupReorder(activeSetId, subgroupIds);
      await refreshActive();
      return true;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not reorder subgroups.'));
      return false;
    }
  }, [activeSetId, refreshActive]);

  const addSubgroupMember = useCallback(async (subgroupId: number, poolEntryId: number): Promise<boolean> => {
    if (activeSetId === null) return false;
    try {
      await apiSubgroupAddMember(activeSetId, subgroupId, poolEntryId);
      await refreshActive();
      return true;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add to subgroup.'));
      return false;
    }
  }, [activeSetId, refreshActive]);

  const removeSubgroupMember = useCallback(async (subgroupId: number, poolEntryId: number): Promise<boolean> => {
    if (activeSetId === null) return false;
    try {
      await apiSubgroupRemoveMember(activeSetId, subgroupId, poolEntryId);
      await refreshActive();
      return true;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not remove from subgroup.'));
      return false;
    }
  }, [activeSetId, refreshActive]);

  const addEmptyRows = useCallback(async (surface: 'tracklist' | 'pool', count: number, position: number) => {
    if (activeSetId === null) return;
    try {
      await apiEmptyRowAdd(activeSetId, surface, count, position);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add empty rows.'));
    }
  }, [activeSetId, refreshActive]);

  const deleteEmptyRow = useCallback(async (emptyRowId: number) => {
    if (activeSetId === null) return;
    try {
      await apiEmptyRowDelete(activeSetId, emptyRowId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete empty row.'));
    }
  }, [activeSetId, refreshActive]);

  const reorderEmptyRow = useCallback(async (emptyRowId: number, newPosition: number) => {
    if (activeSetId === null) return;
    try {
      await apiEmptyRowReorder(activeSetId, emptyRowId, newPosition);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not reorder empty row.'));
    }
  }, [activeSetId, refreshActive]);

  return {
    sets,
    activeSetId,
    activeSet,
    loading,
    error,
    pendingAdd,
    createSet,
    selectSet,
    deleteSet: deleteSetAction,
    addToPool,
    addToTracklist,
    removeFromPool,
    removeFromTracklist,
    clearPool,
    clearTracklist,
    movePoolToTracklist,
    moveTracklistToPool,
    reorderTracklist,
    addToTracklistAtPosition,
    updateTracklistNote,
    togglePoolStar: togglePoolStarAction,
    toggleTracklistStar: toggleTracklistStarAction,
    addExplorerNode,
    deleteExplorerNode,
    addExplorerEdge,
    deleteExplorerEdge: deleteExplorerEdgeAction,
    addSiblingNode,
    swapExplorerNodes,
    moveExplorerNode: moveExplorerNodeAction,
    explorerNodeAddToTracklist,
    fetchEdgeScores,
    isPoolAddInFlight,
    resolvePendingAdd,
    clearPendingAdd,
    clearError,
    refreshActive,
    activeTreeId,
    selectTree,
    createTree,
    renameTree,
    deleteTree,
    createSubgroup,
    renameSubgroup,
    deleteSubgroup,
    reorderSubgroups,
    addSubgroupMember,
    removeSubgroupMember,
    addEmptyRows,
    deleteEmptyRow,
    reorderEmptyRow,
  };
}
