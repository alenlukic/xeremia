import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import App from './App';
import type { Track } from './types';

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
    pool: [], tracklist: [], explorer_trees: [], explorer_nodes: [], explorer_edges: [],
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

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  localStorage.clear();
});

async function renderApp() {
  render(<App />);
  await act(async () => {});
}

describe('Workspace header', () => {
  it('renders workspace header on load', async () => {
    await renderApp();
    expect(screen.getByTestId('workspace-header')).toBeInTheDocument();
  });

  it('shows empty state when no sets exist', async () => {
    await renderApp();
    expect(screen.getByTestId('workspace-empty')).toBeInTheDocument();
    expect(screen.getByText('Create a set to get started.')).toBeInTheDocument();
  });

  it('renders + New Set button in header', async () => {
    await renderApp();
    expect(screen.getByTestId('header-new-set')).toBeInTheDocument();
  });

  it('renders search trigger (disabled) in header', async () => {
    await renderApp();
    const trigger = screen.getByTestId('header-search-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toBeDisabled();
  });

  it('renders weights toggle in header', async () => {
    await renderApp();
    expect(screen.getByRole('button', { name: 'Toggle weights' })).toBeInTheDocument();
  });

  it('renders admin toggle in header', async () => {
    await renderApp();
    expect(screen.getByRole('button', { name: 'Admin Dashboard' })).toBeInTheDocument();
  });
});

describe('Workspace layout with active set', () => {
  async function renderWithActiveSet() {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      { id: 1, name: 'Live Set', created_at: '', updated_at: '', pool_count: 2, tracklist_count: 1 },
    ]);
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: { id: 1, name: 'Live Set', created_at: '', updated_at: '', pool_count: 2, tracklist_count: 1 },
      pool: [
        { id: 10, track_id: 1, insertion_order: 0, starred: false, track: { id: 1, title: 'Track 1', artist_names: [], bpm: 120, key: null, camelot_code: '01A', genre: null, label: null, energy: 0.5, date_added: null } },
        { id: 11, track_id: 2, insertion_order: 1, starred: true, track: { id: 2, title: 'Track 2', artist_names: [], bpm: 128, key: null, camelot_code: '02A', genre: null, label: null, energy: 0.6, date_added: null } },
      ],
      tracklist: [
        { id: 20, track_id: 3, position: 0, starred: false, note: '', track: { id: 3, title: 'Track 3', artist_names: [], bpm: 125, key: null, camelot_code: '01B', genre: null, label: null, energy: 0.55, date_added: null } },
      ],
      explorer_trees: [], explorer_nodes: [], explorer_edges: [],
    });

    await act(async () => { render(<App />); });
    await act(async () => {});

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
  }

  it('shows workspace body when set is selected', async () => {
    await renderWithActiveSet();
    expect(screen.getByTestId('workspace-body')).toBeInTheDocument();
  });

  it('shows tracklist zone header', async () => {
    await renderWithActiveSet();
    expect(screen.getByTestId('tracklist-zone-header')).toBeInTheDocument();
  });

  it('shows explorer toggle button', async () => {
    await renderWithActiveSet();
    expect(screen.getByTestId('explorer-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('explorer-toggle').textContent).toContain('Explorer');
  });

  it('pool is permanently visible (no accordion)', async () => {
    await renderWithActiveSet();
    const pool = document.querySelector('.set-pool');
    expect(pool).toBeInTheDocument();
  });

  it('does not render DockBar', async () => {
    await renderWithActiveSet();
    expect(document.querySelector('.dock-bar-zone')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Panels' })).not.toBeInTheDocument();
  });

  it('does not render Browse table', async () => {
    await renderWithActiveSet();
    expect(document.querySelector('.track-table')).not.toBeInTheDocument();
  });

  it('does not render Matches panel', async () => {
    await renderWithActiveSet();
    expect(document.getElementById('panel-matches')).not.toBeInTheDocument();
  });
});

describe('Explorer toggle', () => {
  async function renderWithNodes() {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      { id: 1, name: 'Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 },
    ]);
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: { id: 1, name: 'Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 },
      pool: [],
      tracklist: [
        { id: 20, track_id: 3, position: 0, starred: false, note: '', track: { id: 3, title: 'Track 3', artist_names: [], bpm: 125, key: null, camelot_code: '01B', genre: null, label: null, energy: 0.55, date_added: null } },
      ],
      explorer_trees: [{ id: 1, set_id: 1, name: 'Tree 1' }],
      explorer_nodes: [
        { id: 1, set_id: 1, tree_id: 1, node_id: 'n1', track_id: 3, level: 0, col_index: 0, track: { id: 3, title: 'Track 3', artist_names: [], bpm: 125, key: null, camelot_code: '01B', genre: null, label: null, energy: 0.55, date_added: null } },
      ],
      explorer_edges: [],
    });

    await act(async () => { render(<App />); });
    await act(async () => {});

    const select = await waitFor(() => {
      const el = document.querySelector('.set-select') as HTMLSelectElement;
      expect(el).toBeInTheDocument();
      return el;
    });

    await act(async () => {
      fireEvent.change(select, { target: { value: '1' } });
    });

    await waitFor(() => {
      expect(screen.getByTestId('explorer-toggle')).toBeInTheDocument();
    });
  }

  it('toggles to explorer nodes view and back', async () => {
    await renderWithNodes();

    expect(screen.queryByTestId('explorer-nodes-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('explorer-toggle').textContent).toContain('Explorer');

    await act(async () => {
      screen.getByTestId('explorer-toggle').click();
    });

    expect(screen.getByTestId('explorer-nodes-view')).toBeInTheDocument();
    expect(screen.getByTestId('explorer-toggle').textContent).toContain('Tracklist');

    await act(async () => {
      screen.getByTestId('explorer-toggle').click();
    });

    expect(screen.queryByTestId('explorer-nodes-view')).not.toBeInTheDocument();
  });

  it('explorer nodes view uses Row and Position labels', async () => {
    await renderWithNodes();

    await act(async () => {
      screen.getByTestId('explorer-toggle').click();
    });

    const table = screen.getByTestId('explorer-nodes-table');
    const headers = table.querySelectorAll('th');
    const headerTexts = Array.from(headers).map(h => h.textContent);
    expect(headerTexts).toContain('Row');
    expect(headerTexts).toContain('Position');
  });
});

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
