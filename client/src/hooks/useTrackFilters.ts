import { useState, useCallback, useMemo } from 'react';
import type { Track } from '../types';

interface FilterState {
  camelotCodes: string[];
  bpm: number | undefined;
  bpmMin: number | undefined;
  bpmMax: number | undefined;
  artist: string;
  label: string;
  genre: string;
  dateAddedMin: string;
  dateAddedMax: string;
}

interface TrackFiltersResult {
  filters: FilterState;
  filteredTracks: Track[];
  filterCacheKey: string;
  activeFilterCount: number;
  setCamelotCodes: (codes: string[]) => void;
  setBpm: (bpm: number | undefined) => void;
  setBpmMin: (min: number | undefined) => void;
  setBpmMax: (max: number | undefined) => void;
  setArtist: (artist: string) => void;
  setLabel: (label: string) => void;
  setGenre: (genre: string) => void;
  setDateAddedMin: (date: string) => void;
  setDateAddedMax: (date: string) => void;
  clearAllFilters: () => void;
}

/**
 * Client-side filtering over the session-cached collection.
 * No server round-trips on filter change — all computation is local.
 */
const EMPTY_FILTERS: FilterState = {
  camelotCodes: [],
  bpm: undefined,
  bpmMin: undefined,
  bpmMax: undefined,
  artist: '',
  label: '',
  genre: '',
  dateAddedMin: '',
  dateAddedMax: '',
};

export function useTrackFilters(allTracks: Track[], searchText: string = ''): TrackFiltersResult {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const normalizedSearch = searchText.trim().toLowerCase();

  const filteredTracks = useMemo(() => {
    const artistLower = filters.artist.trim().toLowerCase();
    const labelLower = filters.label.trim().toLowerCase();
    const genreLower = filters.genre.trim().toLowerCase();
    const dateMin = filters.dateAddedMin || null;
    const dateMax = filters.dateAddedMax || null;

    return allTracks.filter((track) => {
      if (
        filters.camelotCodes.length > 0 &&
        !filters.camelotCodes.includes(track.camelot_code ?? '')
      ) {
        return false;
      }
      if (filters.bpm != null && track.bpm !== filters.bpm) return false;
      if (filters.bpmMin != null && (track.bpm == null || track.bpm < filters.bpmMin))
        return false;
      if (filters.bpmMax != null && (track.bpm == null || track.bpm > filters.bpmMax))
        return false;
      if (artistLower && !track.artist_names.some(a => a.toLowerCase().includes(artistLower)))
        return false;
      if (labelLower && !(track.label ?? '').toLowerCase().includes(labelLower))
        return false;
      if (genreLower && !(track.genre ?? '').toLowerCase().includes(genreLower))
        return false;
      if (dateMin && (track.date_added == null || track.date_added.slice(0, 10) < dateMin))
        return false;
      if (dateMax && (track.date_added == null || track.date_added.slice(0, 10) > dateMax))
        return false;
      if (normalizedSearch) {
        const title = track.title.toLowerCase();
        const artists = track.artist_names.join(' ').toLowerCase();
        if (!title.includes(normalizedSearch) && !artists.includes(normalizedSearch)) {
          return false;
        }
      }
      return true;
    });
  }, [allTracks, filters, normalizedSearch]);

  const filterCacheKey = useMemo(() => {
    return JSON.stringify({
      searchText: normalizedSearch,
      camelotCodes: [...filters.camelotCodes].sort(),
      bpm: filters.bpm ?? null,
      bpmMin: filters.bpmMin ?? null,
      bpmMax: filters.bpmMax ?? null,
      artist: filters.artist,
      label: filters.label,
      genre: filters.genre,
      dateAddedMin: filters.dateAddedMin,
      dateAddedMax: filters.dateAddedMax,
    });
  }, [normalizedSearch, filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.camelotCodes.length > 0) count++;
    if (filters.bpm != null) count++;
    if (filters.bpmMin != null || filters.bpmMax != null) count++;
    if (filters.artist.trim()) count++;
    if (filters.label.trim()) count++;
    if (filters.genre.trim()) count++;
    if (filters.dateAddedMin || filters.dateAddedMax) count++;
    return count;
  }, [filters]);

  const setCamelotCodes = useCallback((codes: string[]) => {
    setFilters((prev) => ({ ...prev, camelotCodes: codes }));
  }, []);

  const setBpm = useCallback((bpm: number | undefined) => {
    setFilters((prev) => ({
      ...prev,
      bpm,
      ...(bpm != null ? { bpmMin: undefined, bpmMax: undefined } : {}),
    }));
  }, []);

  const setBpmMin = useCallback((min: number | undefined) => {
    setFilters((prev) => ({
      ...prev,
      bpmMin: min,
      ...(min != null ? { bpm: undefined } : {}),
    }));
  }, []);

  const setBpmMax = useCallback((max: number | undefined) => {
    setFilters((prev) => ({
      ...prev,
      bpmMax: max,
      ...(max != null ? { bpm: undefined } : {}),
    }));
  }, []);

  const setArtist = useCallback((artist: string) => {
    setFilters((prev) => ({ ...prev, artist }));
  }, []);

  const setLabel = useCallback((label: string) => {
    setFilters((prev) => ({ ...prev, label }));
  }, []);

  const setGenre = useCallback((genre: string) => {
    setFilters((prev) => ({ ...prev, genre }));
  }, []);

  const setDateAddedMin = useCallback((dateAddedMin: string) => {
    setFilters((prev) => ({ ...prev, dateAddedMin }));
  }, []);

  const setDateAddedMax = useCallback((dateAddedMax: string) => {
    setFilters((prev) => ({ ...prev, dateAddedMax }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);

  return {
    filters, filteredTracks, filterCacheKey, activeFilterCount,
    setCamelotCodes, setBpm, setBpmMin, setBpmMax,
    setArtist, setLabel, setGenre, setDateAddedMin, setDateAddedMax,
    clearAllFilters,
  };
}
