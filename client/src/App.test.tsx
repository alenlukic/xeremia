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
  fetchTransitionScores: vi.fn().mockResolvedValue({ scores: [] }),
  exportSetM3u8: vi.fn().mockResolvedValue({ content: '', filename: '' }),
  fetchSets: vi.fn().mockResolvedValue([]),
  createSet: vi.fn().mockResolvedValue({ id: 1, name: 'Test', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 }),
  fetchHydratedSet: vi.fn().mockResolvedValue({
    set: { id: 1, name: 'Test', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 },
    pool: [], tracklist: [], explorer_nodes: [], explorer_edges: [],
  }),
  deleteSet: vi.fn().mockResolvedValue(undefined),
  poolAdd: vi.fn().mockResolvedValue(undefined),
  poolRemove: vi.fn().mockResolvedValue(undefined),
  poolMoveToTracklist: vi.fn().mockResolvedValue(undefined),
  tracklistAdd: vi.fn().mockResolvedValue(undefined),
  tracklistRemove: vi.fn().mockResolvedValue(undefined),
  tracklistReorder: vi.fn().mockResolvedValue(undefined),
  tracklistMoveToPool: vi.fn().mockResolvedValue(undefined),
  explorerAddNode: vi.fn().mockResolvedValue({ ok: true, node_id: 'n1', track_id: 1, level: 0 }),
  explorerDeleteNode: vi.fn().mockResolvedValue(undefined),
  explorerSwap: vi.fn().mockResolvedValue(undefined),
  explorerNodeToTracklist: vi.fn().mockResolvedValue(undefined),
  explorerEdgeScores: vi.fn().mockResolvedValue({ scores: [] }),
  updateSet: vi.fn().mockResolvedValue({}),
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
  localStorage.clear();
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

    await act(async () => {
      screen.getByRole('button', { name: /All keys/ }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click();
    });

    await waitFor(() => {
      expect(getRowCount()).toBe(250);
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Clear' }).click();
    });

    await waitFor(() => {
      expect(getRowCount()).toBe(500);
    }, { timeout: 10000 });
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

describe('Browse column visibility localStorage round-trip', () => {
  const COL_VIS_KEY = 'dj-tools-browse-col-visibility';

  beforeEach(() => {
    localStorage.removeItem(COL_VIS_KEY);
  });

  it('restores hidden column from localStorage, persists toggle, and survives remount', async () => {
    const user = userEvent.setup();

    localStorage.setItem(COL_VIS_KEY, JSON.stringify({ bpm: false }));

    const { unmount } = render(<App />);
    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    const headers = () => screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers()).not.toContain('BPM');
    expect(headers()).toContain('Title');

    await user.click(screen.getByRole('button', { name: /Columns/ }));
    const bpmCheckbox = screen.getByLabelText('BPM') as HTMLInputElement;
    expect(bpmCheckbox.checked).toBe(false);

    await user.click(bpmCheckbox);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(COL_VIS_KEY)!);
      expect(stored.bpm).toBe(true);
    });

    expect(headers()).toContain('BPM');

    unmount();

    render(<App />);
    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    expect(headers()).toContain('BPM');

    await user.click(screen.getByRole('button', { name: /Columns/ }));
    const restoredCheckbox = screen.getByLabelText('BPM') as HTMLInputElement;
    expect(restoredCheckbox.checked).toBe(true);
  });

  it('starts with all columns visible when localStorage has no saved state', async () => {
    render(<App />);
    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toContain('BPM');
    expect(headers).toContain('Camelot');
    expect(headers).toContain('Energy');
  });
});

describe('Browse column visibility – invalid localStorage values', () => {
  const COL_VIS_KEY = 'dj-tools-browse-col-visibility';

  beforeEach(() => {
    localStorage.removeItem(COL_VIS_KEY);
  });

  it.each([
    ['number', '42'],
    ['boolean', 'true'],
    ['array', '[1]'],
    ['string', '"hello"'],
    ['null', 'null'],
  ])('falls back to all columns visible when stored value is a %s', async (_label, stored) => {
    localStorage.setItem(COL_VIS_KEY, stored);

    render(<App />);
    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toContain('BPM');
    expect(headers).toContain('Camelot');
    expect(headers).toContain('Energy');
  });

  it('restores valid object visibility maps correctly', async () => {
    localStorage.setItem(COL_VIS_KEY, JSON.stringify({ bpm: false, energy: false }));

    render(<App />);
    await act(async () => {
      screen.getByRole('button', { name: 'Browse' }).click();
    });

    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).not.toContain('BPM');
    expect(headers).not.toContain('Energy');
    expect(headers).toContain('Camelot');
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
    expect(screen.getByRole('button', { name: 'Set' })).toBeInTheDocument();
  });

  it('shows set builder when Set tab is clicked', async () => {
    await act(async () => {
      render(<App />);
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Set' }).click();
    });
    expect(screen.getByText(/No sets yet/)).toBeInTheDocument();
  });

  it('renders dual add-to-pool/tracklist buttons in matches panel', async () => {
    const httpMod = await import('./api/http');
    const match = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' });
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([match]);

    await act(async () => {
      render(<App />);
    });

    await selectTrackViaBrowse('Track 1');

    await waitFor(() => {
      const poolBtns = screen.getAllByTitle('Add to Pool');
      const tlBtns = screen.getAllByTitle('Add to Tracklist');
      expect(poolBtns.length).toBeGreaterThan(0);
      expect(tlBtns.length).toBeGreaterThan(0);
    });
  });

  it('renders dual add buttons in browse table', async () => {
    await openBrowseTab();

    const poolBtns = screen.getAllByTitle('Add to Pool');
    const tlBtns = screen.getAllByTitle('Add to Tracklist');
    expect(poolBtns.length).toBeGreaterThan(0);
    expect(tlBtns.length).toBeGreaterThan(0);
  });
});
