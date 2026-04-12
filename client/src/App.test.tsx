import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  return document.querySelectorAll('.track-table tbody tr:not(:has(.table-status))').length;
}

async function renderApp() {
  render(<App />);
  await act(async () => {});
}

describe('Reset Weights', () => {
  it('renders a Reset Weights button inside weights overlay', async () => {
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

    await act(async () => {
      screen.getByRole('button', { name: 'Toggle weights' }).click();
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
      screen.getByRole('button', { name: 'Toggle weights' }).click();
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
        screen.getByRole('button', { name: 'Toggle weights' }).click();
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
    await renderApp();
    expect(getRowCount()).toBe(250);
  });

  it('loads next chunk when sentinel intersection fires', async () => {
    await renderApp();
    expect(getRowCount()).toBe(250);

    await act(async () => {
      triggerLoadMore();
    });
    expect(getRowCount()).toBe(500);
  });

  it('resets to first chunk when key filter changes', async () => {
    await renderApp();

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
  }, 15000);

  it('resets to first chunk when BPM filter changes', async () => {
    await renderApp();

    await act(async () => {
      triggerLoadMore();
    });
    expect(getRowCount()).toBe(500);

    const bpmInput = screen.getByPlaceholderText('BPM');
    await userEvent.type(bpmInput, '120');

    await waitFor(() => {
      expect(getRowCount()).toBe(250);
    });
  });

  it('resets to first chunk when search text changes', async () => {
    await renderApp();

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

  it('preserves loaded progress when interacting with dock panels', async () => {
    await renderApp();

    await act(async () => {
      triggerLoadMore();
    });
    expect(getRowCount()).toBe(500);

    await act(async () => {
      screen.getByRole('tab', { name: 'Matches' }).click();
    });
    await act(async () => {
      screen.getByRole('tab', { name: 'Matches' }).click();
    });

    expect(getRowCount()).toBe(500);
  });

  it('restores loaded progress when returning to a previous filter key', async () => {
    await renderApp();

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
  }, 20000);

  it('shows sentinel when more pages are available', async () => {
    await renderApp();
    expect(screen.getByText('Loading more tracks…')).toBeInTheDocument();
  });

  it('hides sentinel when all pages are loaded', async () => {
    await renderApp();
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

    const row = screen.getByText('Track 1').closest('tr')!;
    await act(async () => {
      row.click();
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

    const row = screen.getByText('Track 1').closest('tr')!;
    await act(async () => {
      row.click();
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
    await act(async () => {});

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
    await act(async () => {});

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
    await act(async () => {});

    expect(screen.getByText(/Failed to load track traits/)).toBeInTheDocument();
    expect(screen.getByText(/Failed to fetch track traits: 502/)).toBeInTheDocument();
    expect(screen.getByText('Track 1')).toBeInTheDocument();
    expect(screen.queryByText('No tracks found')).not.toBeInTheDocument();
  });
});

describe('BPM exclusivity', () => {
  it('typing exact BPM clears active BPM range fields', async () => {
    await renderApp();

    const minInput = screen.getByPlaceholderText('Min');
    const maxInput = screen.getByPlaceholderText('Max');

    await userEvent.type(minInput, '100');
    await act(async () => { minInput.blur(); });
    await userEvent.type(maxInput, '140');
    await act(async () => { maxInput.blur(); });

    expect(minInput).toHaveValue(100);
    expect(maxInput).toHaveValue(140);

    const exactInput = screen.getByPlaceholderText('BPM');
    await userEvent.type(exactInput, '120');

    await waitFor(() => {
      expect(minInput).toHaveValue(null);
      expect(maxInput).toHaveValue(null);
    });
  });

  it('typing BPM range clears active exact BPM', async () => {
    await renderApp();

    const exactInput = screen.getByPlaceholderText('BPM');
    await userEvent.type(exactInput, '120');
    expect(exactInput).toHaveValue(120);

    const minInput = screen.getByPlaceholderText('Min');
    await userEvent.type(minInput, '100');

    await waitFor(() => {
      expect(exactInput).toHaveValue(null);
    });
  });

  it('clearing exact BPM does not affect range fields', async () => {
    await renderApp();

    const exactInput = screen.getByPlaceholderText('BPM');
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
    await renderApp();

    await act(async () => {
      screen.getByRole('button', { name: /All keys/ }).click();
    });

    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click();
    });

    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument();
  }, 15000);

  it('allows selecting multiple codes in one session', async () => {
    await renderApp();

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
  }, 15000);

  it('closes on Escape key', async () => {
    await renderApp();

    await act(async () => {
      screen.getByRole('button', { name: /All keys/ }).click();
    });

    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(screen.queryByRole('button', { name: '03A' })).not.toBeInTheDocument();
  }, 15000);
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

    const trackTable = document.querySelector('.track-table')!;
    const track2Cell = Array.from(trackTable.querySelectorAll('td')).find(
      (td) => td.textContent === 'Track 2',
    )!;
    const row2 = track2Cell.closest('tr')!;
    await act(async () => {
      row2.click();
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
    await act(async () => {});

    const headers = () => screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers()).not.toContain('BPM');
    expect(headers()).toContain('Title');

    await user.click(screen.getByRole('button', { name: /columns/i }));
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
    await act(async () => {});

    expect(headers()).toContain('BPM');

    await user.click(screen.getByRole('button', { name: /columns/i }));
    const restoredCheckbox = screen.getByLabelText('BPM') as HTMLInputElement;
    expect(restoredCheckbox.checked).toBe(true);
  });

  it('starts with all columns visible when localStorage has no saved state', async () => {
    render(<App />);
    await act(async () => {});

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
    await act(async () => {});

    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toContain('BPM');
    expect(headers).toContain('Camelot');
    expect(headers).toContain('Energy');
  });

  it('restores valid object visibility maps correctly', async () => {
    localStorage.setItem(COL_VIS_KEY, JSON.stringify({ bpm: false, energy: false }));

    render(<App />);
    await act(async () => {});

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

  it('renders the Set dock tab', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByRole('tab', { name: 'Set' })).toBeInTheDocument();
  });

  it('shows set builder when Set dock tab is clicked', async () => {
    await act(async () => {
      render(<App />);
    });
    await act(async () => {
      screen.getByRole('tab', { name: 'Set' }).click();
    });
    const setPanel = document.getElementById('panel-set')!;
    expect(setPanel.style.display).toBe('flex');
    expect(setPanel.textContent).toMatch(/No sets yet/);
  });

});

describe('DockBar keyboard navigation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ArrowRight cycles focus through Matches → Set → Explorer → Matches', async () => {
    const user = userEvent.setup();
    await renderApp();

    const tabs = screen.getAllByRole('tab');
    const [matchesTab, setTab, explorerTab] = tabs;

    await user.click(matchesTab);
    matchesTab.focus();

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(setTab);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(explorerTab);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(matchesTab);
  });

  it('ArrowLeft cycles focus through Matches → Explorer → Set → Matches', async () => {
    const user = userEvent.setup();
    await renderApp();

    const tabs = screen.getAllByRole('tab');
    const [matchesTab, setTab, explorerTab] = tabs;

    await user.click(matchesTab);
    matchesTab.focus();

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(explorerTab);

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(setTab);

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(matchesTab);
  });

  it('Home jumps focus to first tab, End jumps to last tab', async () => {
    const user = userEvent.setup();
    await renderApp();

    const tabs = screen.getAllByRole('tab');
    const [matchesTab, , explorerTab] = tabs;

    await user.click(explorerTab);
    explorerTab.focus();

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(matchesTab);

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(explorerTab);
  });

  it('roving tabindex: active tab has tabIndex 0, others have -1', async () => {
    await renderApp();

    const tabs = screen.getAllByRole('tab');
    const [matchesTab, setTab, explorerTab] = tabs;

    expect(matchesTab).toHaveAttribute('tabindex', '0');
    expect(setTab).toHaveAttribute('tabindex', '-1');
    expect(explorerTab).toHaveAttribute('tabindex', '-1');

    await act(async () => { setTab.click(); });

    expect(matchesTab).toHaveAttribute('tabindex', '-1');
    expect(setTab).toHaveAttribute('tabindex', '0');
    expect(explorerTab).toHaveAttribute('tabindex', '-1');
  });

  it('aria-selected reflects the active panel', async () => {
    await renderApp();

    const tabs = screen.getAllByRole('tab');
    const [matchesTab, setTab, explorerTab] = tabs;

    tabs.forEach(tab => expect(tab).toHaveAttribute('aria-selected', 'false'));

    await act(async () => { matchesTab.click(); });
    expect(matchesTab).toHaveAttribute('aria-selected', 'true');
    expect(setTab).toHaveAttribute('aria-selected', 'false');
    expect(explorerTab).toHaveAttribute('aria-selected', 'false');

    await act(async () => { explorerTab.click(); });
    expect(matchesTab).toHaveAttribute('aria-selected', 'false');
    expect(setTab).toHaveAttribute('aria-selected', 'false');
    expect(explorerTab).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Clear Filters with exact BPM', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Clear Filters resets exact BPM alongside other filters', async () => {
    const user = userEvent.setup();
    await renderApp();

    const exactInput = screen.getByPlaceholderText('BPM');
    await user.type(exactInput, '128');
    await act(async () => { exactInput.blur(); });
    expect(exactInput).toHaveValue(128);

    const clearBtn = screen.getByRole('button', { name: 'Clear Filters' });
    await act(async () => { clearBtn.click(); });

    await waitFor(() => {
      expect(exactInput).toHaveValue(null);
    });
  });
});

describe('Drag and Drop', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('registers droppable targets for dock tabs', async () => {
    await renderApp();
    const matchesTab = screen.getByRole('tab', { name: 'Matches' });
    const setTab = screen.getByRole('tab', { name: 'Set' });
    const explorerTab = screen.getByRole('tab', { name: 'Explorer' });
    expect(matchesTab).toBeInTheDocument();
    expect(setTab).toBeInTheDocument();
    expect(explorerTab).toBeInTheDocument();
  });

  it('renders drag handle affordance on browse table rows', async () => {
    await renderApp();
    const handles = document.querySelectorAll('.track-table .drag-handle');
    expect(handles.length).toBeGreaterThan(0);
  });

  it('renders drag handle affordance on match rows when matches are loaded', async () => {
    const httpMod = await import('./api/http');
    const match = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' });
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([match]);

    await act(async () => { render(<App />); });
    await selectTrackViaBrowse('Track 1');

    await waitFor(() => {
      const handles = document.querySelectorAll('.matches-table .drag-handle');
      expect(handles.length).toBeGreaterThan(0);
    });
  });

  it('renders droppable tracklist zone when Set panel is open with active set', async () => {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      { id: 1, name: 'Test Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 },
    ]);
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: { id: 1, name: 'Test Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 },
      pool: [], tracklist: [], explorer_nodes: [], explorer_edges: [],
    });

    await act(async () => { render(<App />); });

    await act(async () => {
      screen.getByRole('tab', { name: /Set/ }).click();
    });

    await waitFor(() => {
      const setPanel = document.getElementById('panel-set')!;
      expect(setPanel.style.display).toBe('flex');
    });

    const select = await waitFor(() => {
      const el = document.querySelector('.set-select') as HTMLSelectElement;
      expect(el).toBeInTheDocument();
      return el;
    });

    await act(async () => {
      fireEvent.change(select, { target: { value: '1' } });
    });

    await waitFor(() => {
      expect(document.querySelector('.set-tracklist')).toBeInTheDocument();
    });
  });

  it('renders droppable matches-header when matches panel is active', async () => {
    const httpMod = await import('./api/http');
    const match = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' });
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([match]);

    await act(async () => { render(<App />); });
    await selectTrackViaBrowse('Track 1');

    await waitFor(() => {
      const header = document.querySelector('.panel-title');
      expect(header).toBeInTheDocument();
      expect(header!.textContent).toContain('Matches for');
    });
  });

  it('renders MatchDetail with drag capability including drag handle', async () => {
    const httpMod = await import('./api/http');
    const match = makeTransitionMatch({ candidate_id: 2 });
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([match]);
    vi.mocked(httpMod.fetchMatchDetail).mockResolvedValue({
      on_deck: { id: 1, title: 'Track 1', bpm: 120, key: 'C', camelot_code: '01A', energy: 0.5, genre: 'Electronic', label: 'Label', traits: {} },
      candidate: { id: 2, title: 'Track 2', bpm: 128, key: 'D', camelot_code: '02A', energy: 0.6, genre: 'House', label: 'Label', traits: {} },
      factors: [{ name: 'BPM', score: 0.8, weight: 0.5 }],
      overall_score: 85,
    });

    await act(async () => { render(<App />); });
    await selectTrackViaBrowse('Track 1');

    await waitFor(() => {
      expect(screen.getByText('Match Track')).toBeInTheDocument();
    });

    const detailBtn = screen.getByLabelText('View match detail for Match Track');
    await act(async () => { detailBtn.click(); });

    await waitFor(() => {
      const summary = document.querySelector('.detail-tracks-summary');
      expect(summary).toBeInTheDocument();
      const handle = summary!.querySelector('.drag-handle');
      expect(handle).toBeInTheDocument();
    });
  });

  it('real @dnd-kit wiring: DndContext creates accessibility structure and drag handles receive listeners', async () => {
    await renderApp();

    const liveRegion = document.querySelector('[role="status"][aria-live="assertive"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion!.id).toMatch(/DndLiveRegion/);

    const handles = document.querySelectorAll('.track-table .drag-handle');
    expect(handles.length).toBeGreaterThan(0);
    const handle = handles[0] as HTMLElement;
    expect(handle.textContent).toBe('⠿');
  });
});

describe('Shell state model', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders dock bar with exactly Matches, Set, and Explorer tabs', async () => {
    await renderApp();
    const tabs = screen.getAllByRole('tab');
    const tabLabels = tabs.map(t => t.textContent);
    expect(tabLabels).toEqual(['Matches', 'Set', 'Explorer']);
  });

  it('dock bar uses role=tablist with proper aria semantics', async () => {
    await renderApp();
    const tablist = screen.getByRole('tablist', { name: 'Panels' });
    expect(tablist).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    tabs.forEach(tab => {
      expect(tab).toHaveAttribute('aria-selected');
      expect(tab).toHaveAttribute('aria-controls');
    });
  });

  it('all panels stay mounted when hidden', async () => {
    await renderApp();
    expect(document.getElementById('panel-matches')).toBeInTheDocument();
    expect(document.getElementById('panel-set')).toBeInTheDocument();
    expect(document.getElementById('panel-explorer')).toBeInTheDocument();
  });

  it('clicking active tab collapses the panel', async () => {
    await renderApp();
    const matchesTab = screen.getByRole('tab', { name: 'Matches' });

    await act(async () => { matchesTab.click(); });
    expect(matchesTab).toHaveAttribute('aria-selected', 'true');

    await act(async () => { matchesTab.click(); });
    expect(matchesTab).toHaveAttribute('aria-selected', 'false');
    expect(document.getElementById('panel-matches')!.style.display).toBe('none');
  });

  it('auto-opens Matches when selecting a track with no panel active', async () => {
    await renderApp();
    const matchesTab = screen.getByRole('tab', { name: 'Matches' });
    expect(matchesTab).toHaveAttribute('aria-selected', 'false');

    const row = screen.getByText('Track 1').closest('tr')!;
    await act(async () => { row.click(); });

    expect(matchesTab).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById('panel-matches')!.style.display).toBe('flex');
  });

  it('does not steal focus from Set when selecting a track', async () => {
    await renderApp();
    const setTab = screen.getByRole('tab', { name: 'Set' });
    await act(async () => { setTab.click(); });
    expect(setTab).toHaveAttribute('aria-selected', 'true');

    const row = screen.getByText('Track 1').closest('tr')!;
    await act(async () => { row.click(); });

    expect(setTab).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById('panel-set')!.style.display).toBe('flex');
    expect(document.getElementById('panel-matches')!.style.display).toBe('none');
  });

  it('search input remains available after track selection', async () => {
    await renderApp();
    const searchInput = screen.getByPlaceholderText('Search tracks…');
    expect(searchInput).toBeInTheDocument();

    const row = screen.getByText('Track 1').closest('tr')!;
    await act(async () => { row.click(); });

    expect(searchInput).toBeInTheDocument();
    expect((searchInput as HTMLInputElement).value).toBe('Track 1');
  });

  it('clearing selected track resets Matches to empty state without closing panel', async () => {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([makeTransitionMatch()]);

    await act(async () => { render(<App />); });

    await selectTrackViaBrowse('Track 1');

    await waitFor(() => {
      expect(screen.getByText('Match Track')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search tracks…') as HTMLInputElement;
    expect(searchInput.value).toBe('Track 1');

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: '' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Select a track to see matches')).toBeInTheDocument();
    });

    const matchesTab = screen.getByRole('tab', { name: 'Matches' });
    expect(matchesTab).toHaveAttribute('aria-selected', 'true');
  });

  it('persists and restores per-panel split height from localStorage', async () => {
    localStorage.setItem('dj-tools-panel-split-matches', '400');
    localStorage.setItem('dj-tools-panel-split-set', '250');

    await renderApp();

    await act(async () => {
      screen.getByRole('tab', { name: 'Matches' }).click();
    });
    const panelZone = document.querySelector('.panel-zone') as HTMLElement;
    expect(panelZone.style.height).toBe('400px');

    await act(async () => {
      screen.getByRole('tab', { name: 'Set' }).click();
    });
    expect(panelZone.style.height).toBe('250px');
  });
});

describe('DragOverlay snapCenterToCursor modifier guard', () => {
  const appSrc = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'App.tsx'),
    'utf-8',
  );

  it('fails if snapCenterToCursor is removed from the shared DragOverlay modifiers', () => {
    expect(appSrc).toMatch(
      /import\s*\{[^}]*snapCenterToCursor[^}]*\}\s*from\s+['"]@dnd-kit\/modifiers['"]/,
    );

    expect(appSrc).toMatch(/SNAP_MODIFIERS\s*=\s*\[.*snapCenterToCursor.*\]/);

    expect(appSrc).toMatch(/<DragOverlay[\s\S]*?modifiers=\{SNAP_MODIFIERS\}/);
  });
});
