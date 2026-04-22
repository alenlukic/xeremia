import { useState, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { HydratedSet, SetTracklistVersion, Track } from '../types';
import {
  versionCreate, versionRename, versionDelete, versionBranch,
  fetchTransitionScores,
  candidateAdd, candidateRemove, candidateSelect,
  slotCreate, slotDelete, slotReorder,
} from '../api/http';

interface VersionDeps {
  activeSetId: number | null;
  activeSet: HydratedSet | null;
  refreshActive: () => Promise<void>;
  setErrorWithAutoClear: (msg: string) => void;
  mountedRef: MutableRefObject<boolean>;
}

const SCORE_KEY = (a: number, b: number) => `${a}-${b}`;

export function useVersionState({
  activeSetId, activeSet, refreshActive, setErrorWithAutoClear, mountedRef,
}: VersionDeps) {
  const [activeVersionId, setActiveVersionId] = useState<number | null>(null);
  const [transitionScores, setTransitionScores] = useState<Map<string, number | null>>(new Map());
  const [scoresLoading, setScoresLoading] = useState(false);
  const scoreFetchId = useRef(0);

  const versions: SetTracklistVersion[] = activeSet?.versions ?? [];

  useEffect(() => {
    if (versions.length === 0) {
      setActiveVersionId(null);
      return;
    }
    if (activeVersionId !== null && versions.some(v => v.id === activeVersionId)) return;
    setActiveVersionId(versions[0].id);
  }, [versions, activeVersionId]);

  const activeVersion = useMemo(
    () => versions.find(v => v.id === activeVersionId) ?? null,
    [versions, activeVersionId],
  );

  const trackMap = useMemo((): Map<number, Track> => {
    const map = new Map<number, Track>();
    if (!activeSet) return map;
    for (const entry of activeSet.pool) {
      if (entry.track) map.set(entry.track_id, entry.track);
    }
    for (const entry of activeSet.tracklist) {
      if (entry.track) map.set(entry.track_id, entry.track);
    }
    if (activeVersion) {
      for (const slot of activeVersion.slots) {
        for (const c of slot.candidates) {
          const embedded = (c as unknown as Record<string, unknown>).track;
          if (embedded && typeof embedded === 'object' && (embedded as Record<string, unknown>).id != null) {
            map.set(c.track_id, embedded as Track);
          }
        }
      }
    }
    return map;
  }, [activeSet, activeVersion]);

  const fetchScoresForVersion = useCallback(async (version: SetTracklistVersion) => {
    const id = ++scoreFetchId.current;
    if (!activeSetId || version.slots.length < 2) {
      setTransitionScores(new Map());
      return;
    }

    const sorted = [...version.slots].sort((a, b) => a.position - b.position);
    const pairs: [number, number][] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i].candidates.find(c => c.is_selected);
      const to = sorted[i + 1].candidates.find(c => c.is_selected);
      if (from && to) pairs.push([from.track_id, to.track_id]);
    }

    if (pairs.length === 0) { setTransitionScores(new Map()); return; }

    setScoresLoading(true);
    try {
      const result = await fetchTransitionScores(pairs);
      if (scoreFetchId.current !== id || !mountedRef.current) return;
      const next = new Map<string, number | null>();
      pairs.forEach((p, i) => next.set(SCORE_KEY(p[0], p[1]), result.scores[i]));
      setTransitionScores(next);
    } catch {
      if (scoreFetchId.current === id && mountedRef.current) setTransitionScores(new Map());
    } finally {
      if (scoreFetchId.current === id && mountedRef.current) setScoresLoading(false);
    }
  }, [activeSetId, mountedRef]);

  useEffect(() => {
    if (activeVersion) fetchScoresForVersion(activeVersion);
    else setTransitionScores(new Map());
  }, [activeVersion, fetchScoresForVersion]);

  const create = useCallback(async (name: string) => {
    if (!activeSetId) return;
    try {
      const v = await versionCreate(activeSetId, name);
      await refreshActive();
      if (mountedRef.current) setActiveVersionId(v.id);
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not create version.');
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const rename = useCallback(async (versionId: number, name: string) => {
    if (!activeSetId) return;
    try {
      await versionRename(activeSetId, versionId, name);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not rename version.');
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const remove = useCallback(async (versionId: number) => {
    if (!activeSetId) return;
    if (versions.length <= 1) {
      setErrorWithAutoClear('Cannot delete the last version.');
      return;
    }
    try {
      await versionDelete(activeSetId, versionId);
      if (mountedRef.current && activeVersionId === versionId) {
        const remaining = versions.filter(v => v.id !== versionId);
        setActiveVersionId(remaining.length > 0 ? remaining[0].id : null);
      }
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not delete version.');
    }
  }, [activeSetId, activeVersionId, versions, refreshActive, setErrorWithAutoClear, mountedRef]);

  const switchVersion = useCallback((versionId: number) => {
    setActiveVersionId(versionId);
  }, []);

  const branch = useCallback(async (versionId: number, slotPosition: number, name: string) => {
    if (!activeSetId) return;
    try {
      const v = await versionBranch(activeSetId, versionId, slotPosition, name);
      await refreshActive();
      if (mountedRef.current) setActiveVersionId(v.id);
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not branch version.');
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const refreshScores = useCallback(() => {
    if (activeVersion) fetchScoresForVersion(activeVersion);
  }, [activeVersion, fetchScoresForVersion]);

  const selectCandidate = useCallback(async (slotId: number, candidateId: number) => {
    if (!activeSetId) return;
    try {
      await candidateSelect(activeSetId, slotId, candidateId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not select candidate.');
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const removeCandidate = useCallback(async (slotId: number, candidateId: number) => {
    if (!activeSetId) return;
    try {
      await candidateRemove(activeSetId, slotId, candidateId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not remove candidate.');
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const addCandidate = useCallback(async (slotId: number, trackId: number) => {
    if (!activeSetId) return;
    try {
      await candidateAdd(activeSetId, slotId, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not add candidate.');
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const removeSlot = useCallback(async (versionId: number, slotId: number) => {
    if (!activeSetId) return;
    try {
      await slotDelete(activeSetId, versionId, slotId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not delete slot.');
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const appendTrackAsNewSlot = useCallback(async (trackId: number) => {
    if (!activeSetId || !activeVersionId) return;
    try {
      const slot = await slotCreate(activeSetId, activeVersionId);
      await candidateAdd(activeSetId, slot.id, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not add track.');
    }
  }, [activeSetId, activeVersionId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const insertTrackBetween = useCallback(async (trackId: number, afterPosition: number) => {
    if (!activeSetId || !activeVersionId) return;
    try {
      const slot = await slotCreate(activeSetId, activeVersionId);
      await slotReorder(activeSetId, activeVersionId, slot.id, afterPosition + 1);
      await candidateAdd(activeSetId, slot.id, trackId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(err instanceof Error ? err.message : 'Could not insert track.');
    }
  }, [activeSetId, activeVersionId, refreshActive, setErrorWithAutoClear, mountedRef]);

  return {
    versions,
    activeVersionId,
    activeVersion,
    transitionScores,
    scoresLoading,
    trackMap,
    createVersion: create,
    renameVersion: rename,
    deleteVersion: remove,
    switchVersion,
    branchFromSlot: branch,
    refreshScores,
    selectCandidate,
    removeCandidate,
    addCandidate,
    removeSlot,
    appendTrackAsNewSlot,
    insertTrackBetween,
  };
}
