import { useCallback, type MutableRefObject } from 'react';
import type { HydratedSet } from '../types';
import type { PendingAdd } from './useWorkspaceState';
import { friendlyError } from './useWorkspaceState';
import {
  tracklistAdd, tracklistRemove, tracklistClear as apiTracklistClear,
  tracklistReorder, tracklistMoveToPool,
  updateTracklistNote as apiUpdateTracklistNote,
  toggleTracklistStar,
} from '../api/http';

interface TracklistDeps {
  activeSetId: number | null;
  refreshActive: () => Promise<void>;
  refreshSets: () => Promise<void>;
  setActiveSet: React.Dispatch<React.SetStateAction<HydratedSet | null>>;
  setErrorWithAutoClear: (msg: string) => void;
  mountedRef: MutableRefObject<boolean>;
  activeSetRef: MutableRefObject<HydratedSet | null>;
  setPendingAdd: (p: PendingAdd | null) => void;
}

export function useTracklistState({
  activeSetId, refreshActive, refreshSets, setActiveSet,
  setErrorWithAutoClear, mountedRef, activeSetRef, setPendingAdd,
}: TracklistDeps) {
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
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef, setPendingAdd]);

  const removeFromTracklist = useCallback(async (trackId: number) => {
    if (activeSetId === null) return;
    try {
      await tracklistRemove(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not remove track from tracklist.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshSets, setErrorWithAutoClear, mountedRef, setActiveSet]);

  const moveTracklistToPool = useCallback(async (trackId: number) => {
    if (activeSetId === null) return;
    try {
      await tracklistMoveToPool(activeSetId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not move track to pool.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const reorderTracklistAction = useCallback(async (trackId: number, newPosition: number) => {
    if (activeSetId === null || trackId <= 0) return;
    try {
      await tracklistReorder(activeSetId, trackId, newPosition);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not reorder tracklist.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef, setPendingAdd]);

  const updateTracklistNote = useCallback(async (trackId: number, note: string) => {
    if (activeSetId === null) return;
    try {
      await apiUpdateTracklistNote(activeSetId, trackId, note);
      if (mountedRef.current && activeSetRef.current) {
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
  }, [activeSetId, activeSetRef, setActiveSet, setErrorWithAutoClear, mountedRef]);

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
  }, [activeSetId, refreshActive, setActiveSet, setErrorWithAutoClear, mountedRef]);

  return {
    addToTracklist,
    removeFromTracklist,
    clearTracklist,
    moveTracklistToPool,
    reorderTracklist: reorderTracklistAction,
    addToTracklistAtPosition,
    updateTracklistNote,
    toggleTracklistStar: toggleTracklistStarAction,
  };
}
