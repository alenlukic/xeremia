import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTrackFilters } from './useTrackFilters';
import type { Track } from '../types';

function makeTrack(overrides: Partial<Track> & { id: number; title: string }): Track {
  return {
    artist_names: [],
    bpm: null,
    key: null,
    camelot_code: null,
    genre: null,
    label: null,
    energy: null,
    date_added: null,
    ...overrides,
  };
}

const TRACKS: Track[] = [
  makeTrack({ id: 1, title: 'Track A', camelot_code: '01A', bpm: 120, artist_names: ['Alpha'], label: 'Anjuna', genre: 'Trance', date_added: '2024-06-01T00:00:00' }),
  makeTrack({ id: 2, title: 'Track B', camelot_code: '02A', bpm: 130, artist_names: ['Beta'], label: 'Drumcode', genre: 'Techno', date_added: '2024-07-15T00:00:00' }),
  makeTrack({ id: 3, title: 'Track C', camelot_code: '01A', bpm: 140, artist_names: ['Alpha'], label: 'Drumcode', genre: 'Techno', date_added: '2024-08-01T00:00:00' }),
  makeTrack({ id: 4, title: 'Track D', camelot_code: '03A', bpm: 125, artist_names: ['Gamma'], label: 'Anjuna', genre: 'House', date_added: '2024-09-01T00:00:00' }),
  makeTrack({ id: 5, title: 'Track E', camelot_code: '02A', bpm: 120, artist_names: ['Beta'], label: 'Afterlife', genre: 'Melodic Techno', date_added: '2024-10-01T00:00:00' }),
];

describe('useTrackFilters – empty-group baseline', () => {
  it('returns all tracks when no group has active criteria', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    expect(result.current.filteredTracks).toHaveLength(5);
  });

  it('returns all tracks when multiple empty groups exist', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => { result.current.addFilterGroup(); });
    act(() => { result.current.addFilterGroup(); });
    expect(result.current.filterGroups).toHaveLength(3);
    expect(result.current.filteredTracks).toHaveLength(5);
  });
});

describe('useTrackFilters – single group AND semantics', () => {
  it('filters by camelot code within a single group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
      });
    });
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([1, 3]);
  });

  it('filters by BPM range within a single group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        bpmMin: 125,
        bpmMax: 135,
      });
    });
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([2, 4]);
  });

  it('applies AND within a group (key + BPM)', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
        bpmMin: 130,
      });
    });
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([3]);
  });

  it('filters by artist within a single group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        artist: 'Alpha',
      });
    });
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([1, 3]);
  });

  it('filters by label within a single group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        label: 'Drumcode',
      });
    });
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([2, 3]);
  });

  it('filters by genre within a single group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        genre: 'Techno',
      });
    });
    // "Techno" matches both "Techno" and "Melodic Techno"
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([2, 3, 5]);
  });

  it('filters by date-added range within a single group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        dateAddedMin: '2024-08-01',
        dateAddedMax: '2024-09-30',
      });
    });
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([3, 4]);
  });

  it('applies AND across key + BPM + artist within a single group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
        bpmMin: 115,
        bpmMax: 125,
        artist: 'Alpha',
      });
    });
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([1]);
  });
});

describe('useTrackFilters – OR union across groups', () => {
  it('two groups produce the union of their matches', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));

    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
      });
    });
    act(() => { result.current.addFilterGroup(); });
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[1].id, {
        camelotCodes: ['03A'],
      });
    });

    const ids = result.current.filteredTracks.map((t) => t.id).sort();
    expect(ids).toEqual([1, 3, 4]);
  });

  it('groups with different key+BPM combinations produce correct union', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));

    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
        bpmMin: 115,
        bpmMax: 125,
      });
    });
    act(() => { result.current.addFilterGroup(); });
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[1].id, {
        camelotCodes: ['02A'],
        bpmMin: 125,
        bpmMax: 135,
      });
    });

    const ids = result.current.filteredTracks.map((t) => t.id).sort();
    expect(ids).toEqual([1, 2]);
  });

  it('multi-dimension OR: one group key+BPM+artist, another label+genre+date', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));

    // Group 1: 01A + BPM 115-125 + Alpha → Track A only
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
        bpmMin: 115,
        bpmMax: 125,
        artist: 'Alpha',
      });
    });
    // Group 2: Anjuna + House + Sept 2024 → Track D only
    act(() => { result.current.addFilterGroup(); });
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[1].id, {
        label: 'Anjuna',
        genre: 'House',
        dateAddedMin: '2024-09-01',
        dateAddedMax: '2024-09-30',
      });
    });

    const ids = result.current.filteredTracks.map((t) => t.id).sort();
    expect(ids).toEqual([1, 4]);
  });
});

describe('useTrackFilters – deduplication', () => {
  it('a track matching multiple groups appears exactly once', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));

    // Group 1: BPM 120 exact
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        bpmMin: 120,
        bpmMax: 120,
      });
    });
    // Group 2: camelot 01A (includes Track A which also has BPM 120)
    act(() => { result.current.addFilterGroup(); });
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[1].id, {
        camelotCodes: ['01A'],
      });
    });

    const ids = result.current.filteredTracks.map((t) => t.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.sort()).toEqual([1, 3, 5]);
  });

  it('a track matching overlapping artist + label groups appears once', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));

    // Group 1: artist Alpha → tracks 1, 3
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        artist: 'Alpha',
      });
    });
    // Group 2: label Anjuna → tracks 1, 4
    act(() => { result.current.addFilterGroup(); });
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[1].id, {
        label: 'Anjuna',
      });
    });

    const ids = result.current.filteredTracks.map((t) => t.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.sort()).toEqual([1, 3, 4]);
  });
});

describe('useTrackFilters – global search narrows grouped results', () => {
  it('search text narrows grouped results', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS, 'Track A'));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
      });
    });
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([1]);
  });

  it('search text remains a global post-group AND constraint', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS, 'Alpha'));

    // Group 1: label Drumcode → tracks 2, 3
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        label: 'Drumcode',
      });
    });
    // Group 2: genre House → track 4
    act(() => { result.current.addFilterGroup(); });
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[1].id, {
        genre: 'House',
      });
    });

    // OR union: [2, 3, 4]. Search "Alpha" (artist) narrows to track 3 and 4.
    // Track 3 has artist Alpha + label Drumcode; Track 4 has artist Gamma (no match).
    // Only track 3 survives the search filter (title doesn't match "Alpha" but artist does).
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([3]);
  });
});

describe('useTrackFilters – pagination cache key', () => {
  it('filterCacheKey changes when group criteria change', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    const baseKey = result.current.filterCacheKey;

    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
      });
    });
    expect(result.current.filterCacheKey).not.toBe(baseKey);
  });

  it('adding an empty group does NOT change filterCacheKey', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    const baseKey = result.current.filterCacheKey;

    act(() => { result.current.addFilterGroup(); });
    expect(result.current.filterCacheKey).toBe(baseKey);
  });

  it('adding criteria to a second group changes filterCacheKey', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));

    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
      });
    });
    const key1 = result.current.filterCacheKey;

    act(() => { result.current.addFilterGroup(); });
    expect(result.current.filterCacheKey).toBe(key1);

    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[1].id, {
        camelotCodes: ['02A'],
      });
    });
    expect(result.current.filterCacheKey).not.toBe(key1);
  });

  it('clearAllFilters restores the baseline filterCacheKey', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    const baseKey = result.current.filterCacheKey;

    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
        artist: 'Test',
      });
    });
    expect(result.current.filterCacheKey).not.toBe(baseKey);

    act(() => { result.current.clearAllFilters(); });
    expect(result.current.filterCacheKey).toBe(baseKey);
  });

  it('filterCacheKey changes when group-owned text filters change', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    const baseKey = result.current.filterCacheKey;

    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        artist: 'Alpha',
      });
    });
    const key1 = result.current.filterCacheKey;
    expect(key1).not.toBe(baseKey);

    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        label: 'Drumcode',
      });
    });
    expect(result.current.filterCacheKey).not.toBe(key1);
  });
});

describe('useTrackFilters – group management', () => {
  it('starts with one empty group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    expect(result.current.filterGroups).toHaveLength(1);
    expect(result.current.filterGroups[0].camelotCodes).toEqual([]);
    expect(result.current.filterGroups[0].bpmMin).toBeUndefined();
    expect(result.current.filterGroups[0].artist).toBe('');
    expect(result.current.filterGroups[0].label).toBe('');
    expect(result.current.filterGroups[0].genre).toBe('');
    expect(result.current.filterGroups[0].dateAddedMin).toBe('');
    expect(result.current.filterGroups[0].dateAddedMax).toBe('');
  });

  it('addFilterGroup appends a new empty group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => { result.current.addFilterGroup(); });
    expect(result.current.filterGroups).toHaveLength(2);
    expect(result.current.filterGroups[1].camelotCodes).toEqual([]);
  });

  it('removeFilterGroup removes the specified group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => { result.current.addFilterGroup(); });
    const id0 = result.current.filterGroups[0].id;
    const id1 = result.current.filterGroups[1].id;

    act(() => { result.current.removeFilterGroup(id0); });
    expect(result.current.filterGroups).toHaveLength(1);
    expect(result.current.filterGroups[0].id).toBe(id1);
  });

  it('removing the last group replaces it with a fresh empty group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    const id = result.current.filterGroups[0].id;
    act(() => { result.current.removeFilterGroup(id); });

    expect(result.current.filterGroups).toHaveLength(1);
    expect(result.current.filterGroups[0].camelotCodes).toEqual([]);
    expect(result.current.filterGroups[0].id).not.toBe(id);
  });

  it('clearAllFilters resets to one empty group and clears all group-owned filters', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
        artist: 'Test',
        label: 'SomeLabel',
      });
      result.current.addFilterGroup();
    });

    act(() => { result.current.clearAllFilters(); });

    expect(result.current.filterGroups).toHaveLength(1);
    expect(result.current.filterGroups[0].camelotCodes).toEqual([]);
    expect(result.current.filterGroups[0].artist).toBe('');
    expect(result.current.filterGroups[0].label).toBe('');
    expect(result.current.filteredTracks).toHaveLength(5);
  });
});

describe('useTrackFilters – clearAllFilters mints fresh group id (stale-state regression)', () => {
  it('clearAllFilters produces a new group id so React unmounts stale FilterGroupPanel state', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));
    const originalId = result.current.filterGroups[0].id;

    act(() => {
      result.current.updateFilterGroup(originalId, {
        camelotCodes: ['01A'],
        bpmMin: 100,
        bpmMax: 130,
      });
    });
    expect(result.current.filteredTracks.map((t) => t.id)).toEqual([1]);

    act(() => { result.current.clearAllFilters(); });

    const newGroup = result.current.filterGroups[0];
    expect(newGroup.id).not.toBe(originalId);
    expect(newGroup.camelotCodes).toEqual([]);
    expect(newGroup.bpmMin).toBeUndefined();
    expect(newGroup.bpmMax).toBeUndefined();
    expect(newGroup.artist).toBe('');
    expect(result.current.filteredTracks).toHaveLength(5);

    act(() => {
      result.current.updateFilterGroup(originalId, { bpmMin: 100 });
    });
    expect(result.current.filteredTracks).toHaveLength(5);
    expect(result.current.filterGroups[0].bpmMin).toBeUndefined();
  });
});

describe('useTrackFilters – activeFilterCount', () => {
  it('counts individual criteria across groups', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));

    // Group 1: key + BPM range → 2
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        camelotCodes: ['01A'],
        bpmMin: 100,
      });
    });
    expect(result.current.activeFilterCount).toBe(2);

    // Add group 2 with key → +1 = 3
    act(() => { result.current.addFilterGroup(); });
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[1].id, {
        camelotCodes: ['02A'],
      });
    });
    expect(result.current.activeFilterCount).toBe(3);

    // Add artist in group 1 → +1 = 4
    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        artist: 'Test',
      });
    });
    expect(result.current.activeFilterCount).toBe(4);
  });

  it('counts group-owned text dimensions per group', () => {
    const { result } = renderHook(() => useTrackFilters(TRACKS));

    act(() => {
      result.current.updateFilterGroup(result.current.filterGroups[0].id, {
        artist: 'Alpha',
        label: 'Anjuna',
        genre: 'Trance',
        dateAddedMin: '2024-01-01',
      });
    });
    // artist + label + genre + date range = 4
    expect(result.current.activeFilterCount).toBe(4);
  });
});
