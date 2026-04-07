import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Track, TransitionMatch } from './types';
import { useCollectionCache } from './hooks/useCollectionCache';

vi.mock('./hooks/useCollectionCache', () => ({
  useCollectionCache: vi.fn().mockReturnValue({
    allTracks: [],
    traitMap: new Map(),
    loading: false,
  }),
}));

vi.mock('./api/http', () => ({
  fetchTracks: vi.fn().mockResolvedValue([]),
  fetchTrackTraits: vi.fn().mockResolvedValue([]),
  searchTracks: vi.fn().mockResolvedValue([]),
  fetchCacheStats: vi.fn().mockResolvedValue({
    used: 0, capacity: 100, usage_ratio: 0, hits: 0, misses: 0,
    hit_rate: 0, hit_rate_numerator: 0, hit_rate_denominator: 0,
    hit_rate_basis: 'n/a', key_distribution: [], bpm_distribution: [],
    recent_entries: [], recent_exits: [],
  }),
  fetchWeights: vi.fn().mockResolvedValue({
    raw_weights: {}, effective_weights: {}, raw_sum: 1, target_sum: 1,
    is_sum_valid: true, message: null,
  }),
  fetchDefaultWeights: vi.fn().mockResolvedValue({}),
  fetchMatches: vi.fn().mockResolvedValue([]),
  fetchMatchDetail: vi.fn().mockResolvedValue({}),
  updateWeights: vi.fn().mockResolvedValue({}),
  fetchTransitionScores: vi.fn().mockResolvedValue({ scores: [] }),
  exportSetM3u8: vi.fn().mockResolvedValue({ content: '', filename: '' }),
}));

function makeTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => {
    const id = i + 1;
    return {
      id,
      title: `Track ${id}`,
      artist_names: [`Artist ${id}`],
      bpm: id <= count / 2 ? 120 : 130,
      key: 'C',
      camelot_code: id <= count / 2 ? '01A' : '02A',
      genre: 'Electronic',
      label: 'Label',
      energy: 0.5,
    };
  });
}

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

let latestIntersectionCb: IntersectionObserverCallback | null = null;

class IntersectionObserverMock {
  constructor(cb: IntersectionObserverCallback) {
    latestIntersectionCb = cb;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function triggerLoadMore() {
  if (latestIntersectionCb) {
    latestIntersectionCb(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  }
}

beforeEach(() => {
  latestIntersectionCb = null;
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  vi.mocked(useCollectionCache).mockReturnValue({
    allTracks: makeTracks(600),
    traitMap: new Map(),
    loading: false,
  });
});

function getRowCount(): number {
  return document.querySelectorAll('.track-table tbody tr').length;
}

async function openBrowseTab() {
  render(<App />);
  await act(async () => {
    screen.getByRole('button', { name: 'Browse' }).click();
  });
}

describe('Reset Weights', () => {
  it('renders a Reset Weights button', async () => {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchWeights).mockResolvedValue({
      raw_weights: { BPM: 50, CAMELOT: 50 },
      effective_weights: { BPM: 50, CAMELOT: 50 },
      raw_sum: 100,
      target_sum: 100,
      is_sum_valid: true,
      message: null,
    });

    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole('button', { name: 'Reset Weights' })).toBeInTheDocument();
  });

  it('calls fetchDefaultWeights and persists via debounced updateWeights on click', async () => {
    vi.useFakeTimers();
    const httpMod = await import('./api/http');
    const defaults = { BPM: 10, CAMELOT: 90 };
    vi.mocked(httpMod.fetchWeights).mockResolvedValue({
      raw_weights: { BPM: 50, CAMELOT: 50 },
      effective_weights: { BPM: 50, CAMELOT: 50 },
      raw_sum: 100,
      target_sum: 100,
      is_sum_valid: true,
      message: null,
    });
    vi.mocked(httpMod.fetchDefaultWeights).mockResolvedValue(defaults);
    vi.mocked(httpMod.updateWeights).mockResolvedValue({
      raw_weights: defaults,
      effective_weights: defaults,
      raw_sum: 100,
      target_sum: 100,
      is_sum_valid: true,
      message: null,
    });

    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Reset Weights' }).click();
    });

    expect(httpMod.fetchDefaultWeights).toHaveBeenCalled();
    expect(httpMod.updateWeights).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(httpMod.updateWeights).toHaveBeenCalledWith(defaults);

    vi.useRealTimers();
  });
});

describe('Browse infinite scroll', () => {
  it('initially renders the first 250 tracks', async () => {
    await openBrowseTab();
    expect(getRowCount()).toBe(250);
  });

  it('loads next chunk when sentinel intersection fires', async () => {
    await openBrowseTab();
    expect(getRowCount()).toBe(250);

    await act(async () => {
      triggerLoadMore();
    });
    expect(getRowCount()).toBe(500);
  });

  it('resets to first chunk when key filter changes', async () => {
    await openBrowseTab();

    await act(async () => {
      triggerLoadMore();
    });
    expect(getRowCount()).toBe(500);

    await act(async () => {
      screen.getByRole('button', { name: /All keys/ }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click();
    });

    await waitFor(() => {
      expect(getRowCount()).toBe(250);
    });
  });

  it('resets to first chunk when BPM filter changes', async () => {
    await openBrowseTab();

    await act(async () => {
      triggerLoadMore();
    });
    expect(getRowCount()).toBe(500);

    const bpmInput = screen.getByPlaceholderText('Exact');
    await userEvent.type(bpmInput, '120');

    await waitFor(() => {
      expect(getRowCount()).toBe(250);
    });
  });

  it('resets to first chunk when search text changes', async () => {
    await openBrowseTab();

    await act(async () => {
      triggerLoadMore();
    });
    expect(getRowCount()).toBe(500);

    const searchInput = screen.getByPlaceholderText('Search tracks…');
    await userEvent.type(searchInput, 'track');

    await waitFor(() => {
      expect(getRowCount()).toBe(250);
    });
  });

  it('preserves loaded progress on tab switch with unchanged filters', async () => {
    await openBrowseTab();

    await act(async () => {
      triggerLoadMore();
    });
    expect(getRowCount()).toBe(500);

    await act(async () => {
      screen.getByRole('button', { name: 'Matches' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    expect(getRowCount()).toBe(500);
  });

  it('restores loaded progress when returning to a previous filter key', async () => {
    await openBrowseTab();

    await act(async () => {
      triggerLoadMore();
    });
    expect(getRowCount()).toBe(500);

    // Switch to filter B (key=01A) — resets to page 1
    await act(async () => {
      screen.getByRole('button', { name: /All keys/ }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click();
    });

    await waitFor(() => {
      expect(getRowCount()).toBe(250);
    });

    // Switch back to filter A (all keys) — should restore 2-page progress
    await act(async () => {
      screen.getByRole('button', { name: /01A/ }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Clear' }).click();
    });

    await waitFor(() => {
      expect(getRowCount()).toBe(500);
    });
  });

  it('shows sentinel when more pages are available', async () => {
    await openBrowseTab();
    expect(screen.getByText('Loading more tracks…')).toBeInTheDocument();
  });

  it('hides sentinel when all pages are loaded', async () => {
    await openBrowseTab();
    await act(async () => { triggerLoadMore(); });
    await act(async () => { triggerLoadMore(); });
    expect(getRowCount()).toBe(600);
    expect(screen.queryByText('Loading more tracks…')).not.toBeInTheDocument();
  });
});

function makeTransitionMatch(overrides: Partial<TransitionMatch> = {}): TransitionMatch {
  return {
    candidate_id: 2,
    title: 'Match Track',
    overall_score: 85,
    bucket: 'same_key',
    camelot_score: 0.9,
    bpm_score: 0.85,
    energy_score: 0.7,
    similarity_score: 0.8,
    freshness_score: 0.6,
    genre_similarity_score: 0.75,
    mood_continuity_score: 0.65,
    vocal_clash_score: 0.5,
    instrument_similarity_score: 0.55,
    ...overrides,
  };
}

async function selectTrackViaBrowse(trackTitle: string) {
  await act(async () => {
    screen.getByRole('button', { name: 'Browse' }).click();
  });

  const row = screen.getByText(trackTitle).closest('tr')!;
  await act(async () => {
    row.click();
  });

  await waitFor(() => {
    expect(screen.getByText(`Matches for`)).toBeInTheDocument();
  });
}

describe('Transition chaining', () => {
  it('renders transition chain breadcrumb after Use as source', async () => {
    const httpMod = await import('./api/http');
    const matchForTrack2 = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' });
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([matchForTrack2]);

    await act(async () => {
      render(<App />);
    });

    await selectTrackViaBrowse('Track 1');

    await waitFor(() => {
      expect(screen.getByTitle('Use as source track')).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByTitle('Use as source track').click();
    });

    await waitFor(() => {
      const chainEntries = document.querySelectorAll('.chain-entry');
      expect(chainEntries.length).toBe(1);
      expect(chainEntries[0].textContent).toBe('Track 1');
    });
  });

  it('navigates back through chain when back button is clicked', async () => {
    const httpMod = await import('./api/http');
    const matchForTrack2 = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' });
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([matchForTrack2]);

    await act(async () => {
      render(<App />);
    });

    await selectTrackViaBrowse('Track 1');

    await waitFor(() => {
      expect(screen.getByTitle('Use as source track')).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByTitle('Use as source track').click();
    });

    await waitFor(() => {
      expect(document.querySelector('.chain-back-btn')).toBeInTheDocument();
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>('.chain-back-btn')!.click();
    });

    await waitFor(() => {
      expect(document.querySelector('.chain-back-btn')).not.toBeInTheDocument();
    });
  });

  it('clears chain on fresh track selection via browse', async () => {
    const httpMod = await import('./api/http');
    const matchForTrack2 = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' });
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([matchForTrack2]);

    await act(async () => {
      render(<App />);
    });

    await selectTrackViaBrowse('Track 1');

    await waitFor(() => {
      expect(screen.getByTitle('Use as source track')).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByTitle('Use as source track').click();
    });

    await waitFor(() => {
      expect(document.querySelectorAll('.chain-entry').length).toBe(1);
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    const row = screen.getByText('Track 2').closest('tr')!;
    await act(async () => {
      row.click();
    });

    await waitFor(() => {
      expect(document.querySelectorAll('.chain-entry').length).toBe(0);
      expect(document.querySelector('.chain-back-btn')).not.toBeInTheDocument();
    });
  });
});

describe('Set tab', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the Set tab button', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByRole('button', { name: /Set/ })).toBeInTheDocument();
  });

  it('shows set builder when Set tab is clicked', async () => {
    await act(async () => {
      render(<App />);
    });
    await act(async () => {
      screen.getByRole('button', { name: /Set/ }).click();
    });
    expect(screen.getByText(/No sets yet/)).toBeInTheDocument();
  });

  it('shows Add to Set button on match rows when a set exists', async () => {
    localStorage.setItem('dj-tools-sets', JSON.stringify([
      { id: 'test', name: 'Test', tracks: [] },
    ]));

    const httpMod = await import('./api/http');
    const match = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' });
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([match]);

    await act(async () => {
      render(<App />);
    });

    await selectTrackViaBrowse('Track 1');

    await waitFor(() => {
      expect(screen.getByTitle('Add to set')).toBeInTheDocument();
    });
  });
});
