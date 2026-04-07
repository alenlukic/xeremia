import { useState, useCallback, useEffect } from 'react';
import type { Track, DjSet, SetTrackEntry } from '../types';

const STORAGE_KEY = 'dj-tools-sets';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadSets(): DjSet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSets(sets: DjSet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
}

export function useSetBuilder() {
  const [sets, setSets] = useState<DjSet[]>(loadSets);
  const [activeSetId, setActiveSetId] = useState<string | null>(() => {
    const loaded = loadSets();
    return loaded.length > 0 ? loaded[0].id : null;
  });

  useEffect(() => {
    saveSets(sets);
  }, [sets]);

  const activeSet = sets.find(s => s.id === activeSetId) ?? null;

  const createSet = useCallback((name: string) => {
    const newSet: DjSet = { id: generateId(), name, tracks: [] };
    setSets(prev => [...prev, newSet]);
    setActiveSetId(newSet.id);
    return newSet;
  }, []);

  const selectSet = useCallback((id: string) => {
    setActiveSetId(id);
  }, []);

  const deleteSet = useCallback((id: string) => {
    setSets(prev => prev.filter(s => s.id !== id));
    setActiveSetId(prev => (prev === id ? null : prev));
  }, []);

  const addTrack = useCallback(
    (track: Track) => {
      setSets(prev =>
        prev.map(s => {
          if (s.id !== activeSetId) return s;
          if (s.tracks.some(e => e.track.id === track.id)) return s;
          const entry: SetTrackEntry = { track };
          return { ...s, tracks: [...s.tracks, entry] };
        }),
      );
    },
    [activeSetId],
  );

  const removeTrack = useCallback(
    (index: number) => {
      setSets(prev =>
        prev.map(s => {
          if (s.id !== activeSetId) return s;
          const next = [...s.tracks];
          next.splice(index, 1);
          return { ...s, tracks: next };
        }),
      );
    },
    [activeSetId],
  );

  const moveTrack = useCallback(
    (fromIndex: number, toIndex: number) => {
      setSets(prev =>
        prev.map(s => {
          if (s.id !== activeSetId) return s;
          if (fromIndex < 0 || fromIndex >= s.tracks.length) return s;
          if (toIndex < 0 || toIndex >= s.tracks.length) return s;
          const next = [...s.tracks];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { ...s, tracks: next };
        }),
      );
    },
    [activeSetId],
  );

  return {
    sets,
    activeSet,
    activeSetId,
    createSet,
    selectSet,
    deleteSet,
    addTrack,
    removeTrack,
    moveTrack,
  };
}
