import { useState, useCallback, useEffect, useRef } from 'react';
import type { SetSummary, HydratedSet } from '../types';
import {
  fetchSets, createSet as apiCreateSet, fetchHydratedSet, deleteSet as apiDeleteSet,
  poolAdd, poolRemove, poolMoveToTracklist,
  tracklistAdd, tracklistRemove, tracklistReorder, tracklistMoveToPool,
  updateTracklistNote as apiUpdateTracklistNote,
  explorerAddNode, explorerDeleteNode, explorerAddEdge, explorerSwap, explorerNodeToTracklist,
  explorerEdgeScores,
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
  const mountedRef = useRef(true);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const addToPool = useCallback(async (trackId: number, title?: string) => {
    if (activeSetId === null) {
      setPendingAdd({ type: 'pool', trackId, title: title ?? `Track #${trackId}` });
      return;
    }
    try {
      await poolAdd(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
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
    if (activeSetId === null) return;
    try {
      await tracklistReorder(activeSetId, trackId, newPosition);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not reorder tracklist.'));
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

  const addExplorerNode = useCallback(async (
    trackId: number, parentNodeId?: string, level: number = 0,
  ) => {
    if (activeSetId === null) return null;
    try {
      const result = await explorerAddNode(activeSetId, trackId, parentNodeId, level);
      await refreshActive();
      return result;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add node.'));
      return null;
    }
  }, [activeSetId, refreshActive]);

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
    try {
      await explorerAddEdge(activeSetId, parentNodeId, childNodeId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add edge.'));
    }
  }, [activeSetId, refreshActive]);

  const addSiblingNode = useCallback(async (
    trackId: number,
    inheritParentIds: string[],
    level: number,
  ) => {
    if (activeSetId === null) return null;
    try {
      const firstParent = inheritParentIds[0];
      const result = await explorerAddNode(activeSetId, trackId, firstParent, level);
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
  }, [activeSetId, refreshActive]);

  const swapExplorerNodes = useCallback(async (nodeAId: string, nodeBId: string) => {
    if (activeSetId === null) return;
    try {
      await explorerSwap(activeSetId, nodeAId, nodeBId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not swap nodes.'));
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
    movePoolToTracklist,
    moveTracklistToPool,
    reorderTracklist,
    updateTracklistNote,
    addExplorerNode,
    deleteExplorerNode,
    addExplorerEdge,
    addSiblingNode,
    swapExplorerNodes,
    explorerNodeAddToTracklist,
    fetchEdgeScores,
    resolvePendingAdd,
    clearPendingAdd,
    clearError,
    refreshActive,
  };
}
