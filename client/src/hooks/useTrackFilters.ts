import { useState, useCallback, useMemo, useRef } from 'react';
import type { Track } from '../types';

export interface FilterGroup {
  id: string;
  camelotCodes: string[];
  bpmMin: number | undefined;
  bpmMax: number | undefined;
  artist: string;
  label: string;
  genre: string;
  dateAddedMin: string;
  dateAddedMax: string;
}

interface TrackFiltersResult {
  filterGroups: FilterGroup[];
  filteredTracks: Track[];
  filterCacheKey: string;
  activeFilterCount: number;
  addFilterGroup: () => void;
  removeFilterGroup: (id: string) => void;
  updateFilterGroup: (id: string, updates: Partial<Omit<FilterGroup, 'id'>>) => void;
  clearAllFilters: () => void;
}

export function isGroupActive(group: FilterGroup): boolean {
  return (
    group.camelotCodes.length > 0 ||
    group.bpmMin != null ||
    group.bpmMax != null ||
    group.artist.trim() !== '' ||
    group.label.trim() !== '' ||
    group.genre.trim() !== '' ||
    group.dateAddedMin !== '' ||
    group.dateAddedMax !== ''
  );
}

function makeEmptyGroup(id: string): FilterGroup {
  return {
    id,
    camelotCodes: [],
    bpmMin: undefined,
    bpmMax: undefined,
    artist: '',
    label: '',
    genre: '',
    dateAddedMin: '',
    dateAddedMax: '',
  };
}

/**
 * Client-side filtering over the session-cached collection.
 * Each group owns all per-track browse dimensions (key, BPM, artist,
 * label, genre, date-added) with internal AND semantics.  Groups are
 * ORed together.  Free-text search remains the only global AND filter.
 */
export function useTrackFilters(allTracks: Track[], searchText: string = ''): TrackFiltersResult {
  const nextIdRef = useRef(1);
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(
    () => [makeEmptyGroup(`g${nextIdRef.current++}`)],
  );

  const normalizedSearch = searchText.trim().toLowerCase();

  const filteredTracks = useMemo(() => {
    const activeGroups = filterGroups.filter(isGroupActive);

    return allTracks.filter((track) => {
      if (activeGroups.length > 0) {
        const matchesAnyGroup = activeGroups.some((group) => {
          if (
            group.camelotCodes.length > 0 &&
            !group.camelotCodes.includes(track.camelot_code ?? '')
          ) {
            return false;
          }
          if (group.bpmMin != null && (track.bpm == null || track.bpm < group.bpmMin))
            return false;
          if (group.bpmMax != null && (track.bpm == null || track.bpm > group.bpmMax))
            return false;

          const artistLower = group.artist.trim().toLowerCase();
          if (artistLower && !track.artist_names.some((a) => a.toLowerCase().includes(artistLower)))
            return false;

          const labelLower = group.label.trim().toLowerCase();
          if (labelLower && !(track.label ?? '').toLowerCase().includes(labelLower))
            return false;

          const genreLower = group.genre.trim().toLowerCase();
          if (genreLower && !(track.genre ?? '').toLowerCase().includes(genreLower))
            return false;

          if (group.dateAddedMin && (track.date_added == null || track.date_added.slice(0, 10) < group.dateAddedMin))
            return false;
          if (group.dateAddedMax && (track.date_added == null || track.date_added.slice(0, 10) > group.dateAddedMax))
            return false;

          return true;
        });
        if (!matchesAnyGroup) return false;
      }

      if (normalizedSearch) {
        const title = track.title.toLowerCase();
        const artists = track.artist_names.join(' ').toLowerCase();
        if (!title.includes(normalizedSearch) && !artists.includes(normalizedSearch)) {
          return false;
        }
      }
      return true;
    });
  }, [allTracks, filterGroups, normalizedSearch]);

  const filterCacheKey = useMemo(() => {
    const activeGroups = filterGroups.filter(isGroupActive);
    return JSON.stringify({
      searchText: normalizedSearch,
      groups: activeGroups
        .map((g) => ({
          camelotCodes: [...g.camelotCodes].sort(),
          bpmMin: g.bpmMin ?? null,
          bpmMax: g.bpmMax ?? null,
          artist: g.artist,
          label: g.label,
          genre: g.genre,
          dateAddedMin: g.dateAddedMin,
          dateAddedMax: g.dateAddedMax,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    });
  }, [normalizedSearch, filterGroups]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const g of filterGroups) {
      if (g.camelotCodes.length > 0) count++;
      if (g.bpmMin != null || g.bpmMax != null) count++;
      if (g.artist.trim()) count++;
      if (g.label.trim()) count++;
      if (g.genre.trim()) count++;
      if (g.dateAddedMin || g.dateAddedMax) count++;
    }
    return count;
  }, [filterGroups]);

  const addFilterGroup = useCallback(() => {
    setFilterGroups((prev) => [...prev, makeEmptyGroup(`g${nextIdRef.current++}`)]);
  }, []);

  const removeFilterGroup = useCallback((id: string) => {
    setFilterGroups((prev) => {
      const updated = prev.filter((g) => g.id !== id);
      return updated.length > 0 ? updated : [makeEmptyGroup(`g${nextIdRef.current++}`)];
    });
  }, []);

  const updateFilterGroup = useCallback(
    (id: string, updates: Partial<Omit<FilterGroup, 'id'>>) => {
      setFilterGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
    },
    [],
  );

  const clearAllFilters = useCallback(() => {
    setFilterGroups(() => [makeEmptyGroup(`g${nextIdRef.current++}`)]);
  }, []);

  return {
    filterGroups,
    filteredTracks,
    filterCacheKey,
    activeFilterCount,
    addFilterGroup,
    removeFilterGroup,
    updateFilterGroup,
    clearAllFilters,
  };
}
