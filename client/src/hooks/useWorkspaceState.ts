import { useState, useCallback, useEffect, useRef } from 'react';
import type { SetSummary, HydratedSet } from '../types';
import {
  fetchSets, createSet as apiCreateSet, fetchHydratedSet, deleteSet as apiDeleteSet,
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

export function friendlyError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/409|already exists|duplicate/i.test(raw)) return 'This track is already in the list.';
  if (/404|not found/i.test(raw)) return 'Item not found — it may have been removed.';
  if (/network|fetch|ECONNREFUSED/i.test(raw)) return 'Network error — please check your connection.';
  if (/500|internal server/i.test(raw)) return 'Server error — please try again shortly.';
  if (/timeout|timed out/i.test(raw)) return 'Request timed out — please try again.';
  return fallback;
}

export function useWorkspaceState() {
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [activeSet, setActiveSet] = useState<HydratedSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const mountedRef = useRef(true);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      }
      return data;
    } catch (err) {
      if (mountedRef.current) {
        setErrorWithAutoClear(friendlyError(err, 'Failed to load set.'));
      }
      return null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [setErrorWithAutoClear]);

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
  }, [refreshSets, hydrateSet, setErrorWithAutoClear]);

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
  }, [activeSetId, refreshSets, setErrorWithAutoClear]);

  const refreshActive = useCallback(async () => {
    if (activeSetId !== null) {
      await hydrateSet(activeSetId);
      await refreshSets();
    }
  }, [activeSetId, hydrateSet, refreshSets]);

  const resolvePendingAdd = useCallback(async (setId: number) => {
    if (!pendingAdd) return;
    const { type, trackId } = pendingAdd;
    setPendingAdd(null);
    const { poolAdd, tracklistAdd } = await import('../api/http');
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
    setActiveSet,
    loading,
    error,
    pendingAdd,
    setPendingAdd,
    createSet,
    selectSet,
    deleteSet: deleteSetAction,
    refreshActive,
    refreshSets,
    resolvePendingAdd,
    clearPendingAdd,
    clearError,
    setErrorWithAutoClear,
    mountedRef,
    activeSetRef,
  };
}
