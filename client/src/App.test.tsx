import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Track } from './types';
import { useCollectionCache } from './hooks/useCollectionCache';

vi.mock('./hooks/useCollectionCache', () => ({
  useCollectionCache: vi.fn().mockReturnValue({
    allTracks: [],
    traitMap: new Map(),
    loading: false,
    tracksError: null,
    traitsError: null,
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
    tracksError: null,
    traitsError: null,
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

  it('shows "Saving…" immediately when weights change', async () => {
    vi.useFakeTimers();
    try {
      const httpMod = await import('./api/http');
      vi.mocked(httpMod.fetchWeights).mockResolvedValue({
        raw_weights: { BPM: 50, CAMELOT: 50 },
        effective_weights: { BPM: 50, CAMELOT: 50 },
        raw_sum: 100,
        target_sum: 100,
        is_sum_valid: true,
        message: null,
      });
      vi.mocked(httpMod.fetchDefaultWeights).mockResolvedValue({ BPM: 10, CAMELOT: 90 });
      vi.mocked(httpMod.updateWeights).mockReturnValue(new Promise(() => {}));

      await act(async () => {
        render(<App />);
      });

      await act(async () => {
        screen.getByRole('button', { name: 'Reset Weights' }).click();
      });

      expect(screen.getByText('Saving…')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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

    // Switch back to filter A (all keys) — dropdown stayed open after selecting 01A
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

describe('Error state handling', () => {
  it('shows match fetch failure instead of empty-bucket message', async () => {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchMatches).mockRejectedValue(new Error('Failed to fetch matches: 500'));

    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: makeTracks(10),
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: null,
    });

    render(<App />);

    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    await act(async () => {
      screen.getByText('Track 1').click();
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load matches/)).toBeInTheDocument();
      expect(screen.getByText(/Failed to fetch matches: 500/)).toBeInTheDocument();
    });

    expect(screen.queryByText('No matches in this bucket')).not.toBeInTheDocument();
  });

  it('shows successful zero-result message when match fetch returns empty', async () => {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([]);

    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: makeTracks(10),
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: null,
    });

    render(<App />);

    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    await act(async () => {
      screen.getByText('Track 1').click();
    });

    await waitFor(() => {
      expect(screen.getByText('No matches in this bucket')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Failed to load matches/)).not.toBeInTheDocument();
  });

  it('shows browse track fetch failure instead of No tracks found', async () => {
    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: [],
      traitMap: new Map(),
      loading: false,
      tracksError: 'Failed to fetch tracks: 503',
      traitsError: null,
    });

    render(<App />);

    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    expect(screen.getByText(/Failed to load tracks/)).toBeInTheDocument();
    expect(screen.getByText(/Failed to fetch tracks: 503/)).toBeInTheDocument();
    expect(screen.queryByText('No tracks found')).not.toBeInTheDocument();
  });

  it('shows No tracks found when browse fetch succeeds with zero tracks', async () => {
    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: [],
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: null,
    });

    render(<App />);

    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    expect(screen.getByText('No tracks found')).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load tracks/)).not.toBeInTheDocument();
  });

  it('shows traits fetch failure in Browse without hiding successfully loaded tracks', async () => {
    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: makeTracks(10),
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: 'Failed to fetch track traits: 502',
    });

    render(<App />);

    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    expect(screen.getByText(/Failed to load track traits/)).toBeInTheDocument();
    expect(screen.getByText(/Failed to fetch track traits: 502/)).toBeInTheDocument();
    expect(screen.getByText('Track 1')).toBeInTheDocument();
    expect(screen.queryByText('No tracks found')).not.toBeInTheDocument();
  });
});

describe('BPM exclusivity', () => {
  it('typing exact BPM clears active BPM range fields', async () => {
    await openBrowseTab();

    const minInput = screen.getByPlaceholderText('Min');
    const maxInput = screen.getByPlaceholderText('Max');

    await userEvent.type(minInput, '100');
    await act(async () => { minInput.blur(); });
    await userEvent.type(maxInput, '140');
    await act(async () => { maxInput.blur(); });

    expect(minInput).toHaveValue(100);
    expect(maxInput).toHaveValue(140);

    const exactInput = screen.getByPlaceholderText('Exact');
    await userEvent.type(exactInput, '120');

    await waitFor(() => {
      expect(minInput).toHaveValue(null);
      expect(maxInput).toHaveValue(null);
    });
  });

  it('typing BPM range clears active exact BPM', async () => {
    await openBrowseTab();

    const exactInput = screen.getByPlaceholderText('Exact');
    await userEvent.type(exactInput, '120');
    expect(exactInput).toHaveValue(120);

    const minInput = screen.getByPlaceholderText('Min');
    await userEvent.type(minInput, '100');

    await waitFor(() => {
      expect(exactInput).toHaveValue(null);
    });
  });

  it('clearing exact BPM does not affect range fields', async () => {
    await openBrowseTab();

    const exactInput = screen.getByPlaceholderText('Exact');
    await userEvent.type(exactInput, '120');
    expect(exactInput).toHaveValue(120);

    await userEvent.clear(exactInput);
    expect(exactInput).toHaveValue(null);
    expect(screen.getByPlaceholderText('Min')).toHaveValue(null);
    expect(screen.getByPlaceholderText('Max')).toHaveValue(null);
  });
});

describe('Camelot multi-select', () => {
  it('dropdown stays open after toggling a code', async () => {
    await openBrowseTab();

    await act(async () => {
      screen.getByRole('button', { name: /All keys/ }).click();
    });

    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click();
    });

    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument();
  });

  it('allows selecting multiple codes in one session', async () => {
    await openBrowseTab();

    await act(async () => {
      screen.getByRole('button', { name: /All keys/ }).click();
    });

    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: '02A' }).click();
    });

    const chip01 = screen.getByRole('button', { name: '01A' });
    const chip02 = screen.getByRole('button', { name: '02A' });
    expect(chip01.className).toContain('selected');
    expect(chip02.className).toContain('selected');
  });

  it('closes on Escape key', async () => {
    await openBrowseTab();

    await act(async () => {
      screen.getByRole('button', { name: /All keys/ }).click();
    });

    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(screen.queryByRole('button', { name: '03A' })).not.toBeInTheDocument();
  });
});
