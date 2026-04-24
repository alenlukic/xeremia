import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import App from './App';
import type { Track } from './types';

const mockAudioPlayerState = {
  track: null as { id: number; title: string } | null,
  playing: false, loading: false, currentTime: 0, duration: 0,
  volume: 0.8, error: null as string | null,
  play: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  togglePlayPause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), stop: vi.fn(),
};

vi.mock('./hooks/useAudioPlayer', () => ({
  AudioPlayerProvider: ({ children }: { children: React.ReactNode }) => children,
  useAudioPlayer: () => mockAudioPlayerState,
}));

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
  mockAudioPlayerState.track = null;
  mockAudioPlayerState.playing = false;
  mockAudioPlayerState.error = null;
  mockAudioPlayerState.loading = false;
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

  it('renders search trigger (enabled) in header', async () => {
    await renderApp();
    const trigger = screen.getByTestId('header-search-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).not.toBeDisabled();
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

  it('pool zone is permanently visible (no accordion)', async () => {
    await renderWithActiveSet();
    expect(screen.getByTestId('pool-zone')).toBeInTheDocument();
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

  it('renders column-config button in tracklist zone header (enabled)', async () => {
    await renderWithActiveSet();
    const btn = screen.getByTestId('tracklist-columns-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toBeVisible();
    expect(btn.textContent).toBe('Columns');
    expect(btn).not.toBeDisabled();
    expect(btn.classList.contains('columns-btn')).toBe(true);
  });

  it('pool zone is visible alongside tracklist (legacy set)', async () => {
    await renderWithActiveSet();
    expect(screen.getByTestId('tracklist-zone')).toBeInTheDocument();
    expect(screen.getByTestId('pool-zone')).toBeInTheDocument();
    expect(document.querySelector('.set-pool')).toBeInTheDocument();
  });

  it('export m3u8 button is absent', async () => {
    await renderWithActiveSet();
    expect(screen.queryByTestId('tracklist-export')).not.toBeInTheDocument();
    expect(screen.queryByText('Export m3u8')).not.toBeInTheDocument();
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

  it('explorer toggle state is preserved when active version changes', async () => {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      { id: 1, name: 'Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 },
    ]);
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: { id: 1, name: 'Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 },
      pool: [],
      tracklist: [],
      explorer_trees: [{ id: 1, set_id: 1, name: 'Tree 1' }],
      explorer_nodes: [
        { id: 1, set_id: 1, tree_id: 1, node_id: 'n1', track_id: 3, level: 0, col_index: 0, track: { id: 3, title: 'Track 3', artist_names: [], bpm: 125, key: null, camelot_code: '01B', genre: null, label: null, energy: 0.55, date_added: null } },
      ],
      explorer_edges: [],
      versions: [
        {
          id: 1, set_id: 1, name: 'Main', display_order: 0, explorer_tree_id: 1,
          slots: [{ id: 10, version_id: 1, position: 0, note: '', is_inherited: false, candidates: [{ id: 100, slot_id: 10, track_id: 3, is_selected: true }] }],
          derived_explorer_nodes: [],
        },
        {
          id: 2, set_id: 1, name: 'Alt', display_order: 1, explorer_tree_id: 1,
          slots: [{ id: 20, version_id: 2, position: 0, note: '', is_inherited: false, candidates: [{ id: 200, slot_id: 20, track_id: 3, is_selected: true }] }],
          derived_explorer_nodes: [],
        },
      ],
    });
    vi.mocked(httpMod.fetchTransitionScores).mockResolvedValue({ scores: [] });

    await act(async () => { render(<App />); });
    await act(async () => {});

    const select = await waitFor(() => {
      const el = document.querySelector('.set-select') as HTMLSelectElement;
      expect(el).toBeInTheDocument();
      return el;
    });

    await act(async () => { fireEvent.change(select, { target: { value: '1' } }); });
    await waitFor(() => { expect(screen.getByTestId('explorer-toggle')).toBeInTheDocument(); });

    await act(async () => { screen.getByTestId('explorer-toggle').click(); });
    expect(screen.getByTestId('explorer-toggle').textContent).toContain('Tracklist');
    expect(screen.getByTestId('explorer-nodes-view')).toBeInTheDocument();

    await act(async () => { screen.getByTestId('version-tab-btn-2').click(); });

    expect(screen.getByTestId('explorer-toggle').textContent).toContain('Tracklist');
    expect(screen.getByTestId('explorer-nodes-view')).toBeInTheDocument();
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

describe('Player bar push-up accommodation', () => {
  it('renders PlayerBar when playback is active', async () => {
    mockAudioPlayerState.track = { id: 1, title: 'Test Track' };
    mockAudioPlayerState.playing = true;

    await renderApp();
    expect(screen.getByTestId('player-bar')).toBeInTheDocument();
    expect(screen.getByTestId('player-bar-title').textContent).toBe('Test Track');
  });

  it('does not render PlayerBar when no track is active', async () => {
    await renderApp();
    expect(screen.queryByTestId('player-bar')).not.toBeInTheDocument();
  });

  it('app shell uses flex column layout so PlayerBar pushes content up', async () => {
    mockAudioPlayerState.track = { id: 1, title: 'Test Track' };
    mockAudioPlayerState.playing = true;

    await renderApp();

    const shell = document.querySelector('.app-shell-v2') as HTMLElement;
    expect(shell).toBeInTheDocument();

    const playerBar = screen.getByTestId('player-bar');
    expect(playerBar.closest('.app-shell-v2')).toBe(shell);

    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css'),
      'utf-8',
    );

    const shellRule = css.match(/\.app-shell-v2\s*\{[^}]+\}/)?.[0] ?? '';
    expect(shellRule).toMatch(/display:\s*flex/);
    expect(shellRule).toMatch(/flex-direction:\s*column/);

    const playerRule = css.match(/\.player-bar\s*\{[^}]+\}/)?.[0] ?? '';
    expect(playerRule).not.toMatch(/position:\s*fixed/);
    expect(playerRule).not.toMatch(/position:\s*absolute/);
  });
});

describe('Search modal keyboard shortcut', () => {
  it('Cmd+K opens the search modal', async () => {
    await renderApp();
    expect(screen.queryByTestId('search-modal')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
    });

    expect(screen.getByTestId('search-modal')).toBeInTheDocument();
  });

  it('Ctrl+K opens the search modal', async () => {
    await renderApp();
    expect(screen.queryByTestId('search-modal')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    });

    expect(screen.getByTestId('search-modal')).toBeInTheDocument();
  });

  it('search trigger button opens the search modal', async () => {
    await renderApp();
    expect(screen.queryByTestId('search-modal')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-search-trigger'));
    });

    expect(screen.getByTestId('search-modal')).toBeInTheDocument();
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

describe('Versioned set workspace layout', () => {
  async function renderWithVersionedSet() {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      { id: 1, name: 'Versioned Set', created_at: '', updated_at: '', pool_count: 1, tracklist_count: 0 },
    ]);
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: { id: 1, name: 'Versioned Set', created_at: '', updated_at: '', pool_count: 1, tracklist_count: 0 },
      pool: [
        { id: 10, track_id: 1, insertion_order: 0, starred: false, track: { id: 1, title: 'Pool Track', artist_names: [], bpm: 120, key: null, camelot_code: '01A', genre: null, label: null, energy: 0.5, date_added: null } },
      ],
      tracklist: [],
      explorer_trees: [{ id: 1, set_id: 1, name: 'Tree 1' }],
      explorer_nodes: [
        { id: 1, set_id: 1, tree_id: 1, node_id: 'n1', track_id: 5, level: 0, col_index: 0, track: { id: 5, title: 'Explorer Track', artist_names: [], bpm: 130, key: null, camelot_code: '03A', genre: null, label: null, energy: 0.7, date_added: null } },
      ],
      explorer_edges: [],
      versions: [
        {
          id: 1, set_id: 1, name: 'Main', display_order: 0, explorer_tree_id: 1,
          slots: [
            { id: 10, version_id: 1, position: 0, note: '', is_inherited: false, candidates: [{ id: 100, slot_id: 10, track_id: 5, is_selected: true }] },
          ],
          derived_explorer_nodes: [],
        },
      ],
    });
    vi.mocked(httpMod.fetchTransitionScores).mockResolvedValue({ scores: [] });

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
      expect(screen.getByTestId('slot-tracklist')).toBeInTheDocument();
    });
  }

  it('tracklist zone and pool zone both present for versioned set', async () => {
    await renderWithVersionedSet();
    expect(screen.getByTestId('tracklist-zone')).toBeInTheDocument();
    expect(screen.getByTestId('pool-zone')).toBeInTheDocument();
    expect(screen.getByTestId('slot-tracklist')).toBeInTheDocument();
    expect(document.querySelector('.set-pool')).toBeInTheDocument();
  });

  it('export m3u8 button absent for versioned set', async () => {
    await renderWithVersionedSet();
    expect(screen.queryByTestId('tracklist-export')).not.toBeInTheDocument();
    expect(screen.queryByText('Export m3u8')).not.toBeInTheDocument();
  });

  it('explorer toggle shows ExplorerNodesView for versioned set', async () => {
    await renderWithVersionedSet();

    await act(async () => {
      screen.getByTestId('explorer-toggle').click();
    });

    expect(screen.getByTestId('explorer-nodes-view')).toBeInTheDocument();
    expect(screen.queryByTestId('derived-explorer-view')).not.toBeInTheDocument();
  });

  it('explorer highlights selected candidate node for versioned set', async () => {
    await renderWithVersionedSet();

    await act(async () => {
      screen.getByTestId('explorer-toggle').click();
    });

    const rows = screen.getAllByTestId('explorer-node-row');
    expect(rows.length).toBeGreaterThan(0);
    const selectedRow = rows.find(r => r.classList.contains('explorer-node-row--selected'));
    expect(selectedRow).toBeDefined();
  });

  it('Columns button opens config popover for versioned set', async () => {
    await renderWithVersionedSet();
    expect(screen.queryByTestId('tracklist-columns-popover')).not.toBeInTheDocument();

    await act(async () => {
      screen.getByTestId('tracklist-columns-btn').click();
    });

    expect(screen.getByTestId('tracklist-columns-popover')).toBeInTheDocument();
  });
});

describe('Explorer selected-candidate specificity', () => {
  it('only the selected candidate node row receives explorer-node-row--selected; non-selected nodes do not', async () => {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      { id: 1, name: 'Multi-Node Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 },
    ]);
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: { id: 1, name: 'Multi-Node Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 0 },
      pool: [],
      tracklist: [],
      explorer_trees: [{ id: 1, set_id: 1, name: 'Tree 1' }],
      explorer_nodes: [
        { id: 1, set_id: 1, tree_id: 1, node_id: 'n1', track_id: 5, level: 0, col_index: 0, track: { id: 5, title: 'Selected Track', artist_names: [], bpm: 130, key: null, camelot_code: '03A', genre: null, label: null, energy: 0.7, date_added: null } },
        { id: 2, set_id: 1, tree_id: 1, node_id: 'n2', track_id: 6, level: 1, col_index: 0, track: { id: 6, title: 'Unselected Track', artist_names: [], bpm: 128, key: null, camelot_code: '04A', genre: null, label: null, energy: 0.65, date_added: null } },
      ],
      explorer_edges: [],
      versions: [
        {
          id: 1, set_id: 1, name: 'Main', display_order: 0, explorer_tree_id: 1,
          slots: [
            { id: 10, version_id: 1, position: 0, note: '', is_inherited: false, candidates: [{ id: 100, slot_id: 10, track_id: 5, is_selected: true }] },
            { id: 11, version_id: 1, position: 1, note: '', is_inherited: false, candidates: [{ id: 101, slot_id: 11, track_id: 6, is_selected: false }] },
          ],
          derived_explorer_nodes: [],
        },
      ],
    });
    vi.mocked(httpMod.fetchTransitionScores).mockResolvedValue({ scores: [] });

    await act(async () => { render(<App />); });
    await act(async () => {});

    const select = await waitFor(() => {
      const el = document.querySelector('.set-select') as HTMLSelectElement;
      expect(el).toBeInTheDocument();
      return el;
    });
    await act(async () => { fireEvent.change(select, { target: { value: '1' } }); });
    await waitFor(() => expect(screen.getByTestId('slot-tracklist')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('explorer-toggle').click(); });

    const rows = screen.getAllByTestId('explorer-node-row');
    expect(rows.length).toBe(2);

    const selectedRows = rows.filter(r => r.classList.contains('explorer-node-row--selected'));
    const unselectedRows = rows.filter(r => !r.classList.contains('explorer-node-row--selected'));
    expect(selectedRows).toHaveLength(1);
    expect(unselectedRows).toHaveLength(1);

    expect(selectedRows[0].textContent).toContain('Selected Track');
    expect(unselectedRows[0].textContent).toContain('Unselected Track');
  });
});

describe('Columns action', () => {
  async function renderWithActiveSet() {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      { id: 1, name: 'Live Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 1 },
    ]);
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: { id: 1, name: 'Live Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 1 },
      pool: [],
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

  it('Columns button opens and closes config popover (legacy set)', async () => {
    await renderWithActiveSet();
    const btn = screen.getByTestId('tracklist-columns-btn');
    expect(screen.queryByTestId('tracklist-columns-popover')).not.toBeInTheDocument();

    await act(async () => { btn.click(); });
    expect(screen.getByTestId('tracklist-columns-popover')).toBeInTheDocument();

    await act(async () => { btn.click(); });
    expect(screen.queryByTestId('tracklist-columns-popover')).not.toBeInTheDocument();
  });
});

describe('Workspace split layout structure', () => {
  it('split container and zone-divider are rendered with both zones for legacy set', async () => {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      { id: 1, name: 'Split Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 1 },
    ]);
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: { id: 1, name: 'Split Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 1 },
      pool: [],
      tracklist: [
        { id: 20, track_id: 3, position: 0, starred: false, note: '', track: { id: 3, title: 'Track A', artist_names: [], bpm: 130, key: null, camelot_code: '01A', genre: null, label: null, energy: 0.6, date_added: null } },
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
    await act(async () => { fireEvent.change(select, { target: { value: '1' } }); });
    await waitFor(() => expect(document.querySelector('.set-tracklist')).toBeInTheDocument());

    const split = document.querySelector('.set-workspace-split--vertical');
    expect(split).toBeInTheDocument();
    expect(split!.querySelector('[data-testid="tracklist-zone"]')).toBeInTheDocument();
    expect(split!.querySelector('[data-testid="pool-zone"]')).toBeInTheDocument();
    expect(split!.querySelector('.zone-divider')).toBeInTheDocument();
  });
});

describe('Legacy explorer empty-state', () => {
  it('legacy set with no explorer nodes shows ExplorerNodesView empty state, not derived-explorer error', async () => {
    const httpMod = await import('./api/http');
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      { id: 1, name: 'Empty Explorer Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 1 },
    ]);
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: { id: 1, name: 'Empty Explorer Set', created_at: '', updated_at: '', pool_count: 0, tracklist_count: 1 },
      pool: [],
      tracklist: [
        { id: 20, track_id: 3, position: 0, starred: false, note: '', track: { id: 3, title: 'Track Z', artist_names: [], bpm: 130, key: null, camelot_code: '01A', genre: null, label: null, energy: 0.6, date_added: null } },
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
    await act(async () => { fireEvent.change(select, { target: { value: '1' } }); });
    await waitFor(() => expect(document.querySelector('.set-tracklist')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('explorer-toggle').click(); });

    expect(screen.getByTestId('explorer-nodes-view')).toBeInTheDocument();
    expect(screen.queryByTestId('derived-explorer-view')).not.toBeInTheDocument();
    expect(screen.queryByText(/No derived explorer nodes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No explorer nodes yet/i)).toBeInTheDocument();
  });
});
