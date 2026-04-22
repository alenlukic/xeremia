import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { HydratedSet, PoolSubgroup } from '../types';
import type { PendingAdd } from './useWorkspaceState';
import { friendlyError } from './useWorkspaceState';
import {
  poolAdd, poolRemove, poolClear as apiPoolClear, poolMoveToTracklist,
  poolReorder as apiPoolReorder,
  togglePoolStar,
  subgroupCreate as apiSubgroupCreate,
  subgroupRename as apiSubgroupRename,
  subgroupDelete as apiSubgroupDelete,
  subgroupReorder as apiSubgroupReorder,
  subgroupAddMember as apiSubgroupAddMember,
  subgroupRemoveMember as apiSubgroupRemoveMember,
} from '../api/http';

interface PoolDeps {
  activeSetId: number | null;
  activeSet: HydratedSet | null;
  refreshActive: () => Promise<void>;
  refreshSets: () => Promise<void>;
  setActiveSet: React.Dispatch<React.SetStateAction<HydratedSet | null>>;
  setErrorWithAutoClear: (msg: string) => void;
  mountedRef: MutableRefObject<boolean>;
  activeSetRef: MutableRefObject<HydratedSet | null>;
  setPendingAdd: (p: PendingAdd | null) => void;
}

export function usePoolState({
  activeSetId, activeSet, refreshActive, refreshSets, setActiveSet,
  setErrorWithAutoClear, mountedRef, activeSetRef, setPendingAdd,
}: PoolDeps) {
  const poolAddInFlightRef = useRef(new Set<number>());

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
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef, activeSetRef, setPendingAdd]);

  const removeFromPool = useCallback(async (trackId: number) => {
    if (activeSetId === null) return;
    try {
      await poolRemove(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not remove track from pool.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshSets, setErrorWithAutoClear, mountedRef, setActiveSet]);

  const movePoolToTracklist = useCallback(async (trackId: number) => {
    if (activeSetId === null) return;
    try {
      await poolMoveToTracklist(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not move track to tracklist.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const reorderPool = useCallback(async (trackId: number, newPosition: number) => {
    if (activeSetId === null || trackId <= 0) return;
    try {
      await apiPoolReorder(activeSetId, trackId, newPosition);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not reorder pool.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshActive, setActiveSet, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  return {
    addToPool,
    removeFromPool,
    clearPool,
    movePoolToTracklist,
    reorderPool,
    togglePoolStar: togglePoolStarAction,
    isPoolAddInFlight,
    createSubgroup,
    renameSubgroup,
    deleteSubgroup,
    reorderSubgroups,
    addSubgroupMember,
    removeSubgroupMember,
  };
}
