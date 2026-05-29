import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSetBuilder } from './useSetBuilder';
import type { ExplorerNode, HydratedSet, SetSummary, Track } from '../types';

vi.mock('../api/http', () => ({
  fetchSets: vi.fn(),
  createSet: vi.fn(),
  fetchHydratedSet: vi.fn(),
  deleteSet: vi.fn(),
  poolAdd: vi.fn(),
  poolRemove: vi.fn(),
  poolMoveToTracklist: vi.fn(),
  tracklistAdd: vi.fn(),
  tracklistRemove: vi.fn(),
  tracklistReorder: vi.fn(),
  tracklistMoveToPool: vi.fn(),
  updateTracklistNote: vi.fn(),
  explorerAddNode: vi.fn(),
  explorerDeleteNode: vi.fn(),
  explorerAddEdge: vi.fn(),
  explorerSwap: vi.fn(),
  explorerNodeToTracklist: vi.fn(),
  explorerDeleteEdge: vi.fn(),
  explorerEdgeScores: vi.fn(),
}));

function makeSetSummary(overrides: Partial<SetSummary> = {}): SetSummary {
  return {
    id: 1,
    name: 'Test Set',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    pool_count: 0,
    tracklist_count: 0,
    ...overrides,
  };
}

function makeTrack(id: number, title = `Track ${id}`): Track {
  return {
    id,
    title,
    artist_names: [],
    bpm: 128,
    key: 'C',
    camelot_code: '8B',
    genre: null,
    label: null,
    energy: null,
  };
}

function makeExplorerNode(
  overrides: Partial<ExplorerNode> & { node_id: string; track_id: number; level: number },
): ExplorerNode {
  return {
    id: 1,
    set_id: 1,
    col_index: 0,
    track: makeTrack(overrides.track_id),
    ...overrides,
  };
}

function makeHydratedSet(overrides: Partial<HydratedSet> = {}): HydratedSet {
  return {
    set: makeSetSummary(),
    pool: [],
    tracklist: [],
    explorer_nodes: [],
    explorer_edges: [],
    ...overrides,
  };
}

describe('useSetBuilder poolAddInFlightRef duplicate suppression', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    const http = await import('../api/http');
    vi.mocked(http.fetchSets).mockResolvedValue([makeSetSummary()]);
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(makeHydratedSet());
    vi.mocked(http.poolAdd).mockResolvedValue(undefined);
  });

  it('blocks duplicate addToPool calls while the first is still in flight', async () => {
    const http = await import('../api/http');
    let resolvePoolAdd!: () => void;
    vi.mocked(http.poolAdd).mockImplementation(
      () => new Promise<void>(r => { resolvePoolAdd = r; }),
    );
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(makeHydratedSet());

    const { result } = renderHook(() => useSetBuilder());
    await act(async () => { result.current.selectSet(1); });
    await waitFor(() => expect(result.current.activeSetId).toBe(1));

    expect(result.current.isPoolAddInFlight(42)).toBe(false);

    let firstDone = false;
    act(() => {
      result.current.addToPool(42, 'T42').then(() => { firstDone = true; });
    });

    expect(result.current.isPoolAddInFlight(42)).toBe(true);

    await act(async () => { await result.current.addToPool(42, 'T42'); });
    expect(http.poolAdd).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePoolAdd();
      await new Promise(r => setTimeout(r, 10));
    });
    expect(firstDone).toBe(true);
  });

  it('clears in-flight state on error', async () => {
    const http = await import('../api/http');
    vi.mocked(http.poolAdd).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useSetBuilder());
    await act(async () => { result.current.selectSet(1); });
    await waitFor(() => expect(result.current.activeSetId).toBe(1));

    await act(async () => { await result.current.addToPool(42, 'T42'); });

    expect(result.current.isPoolAddInFlight(42)).toBe(false);
    expect(result.current.error).toContain('pool');
  });

  it('cleans up in-flight set when activeSet pool confirms the track', async () => {
    const http = await import('../api/http');
    let resolvePoolAdd!: () => void;
    vi.mocked(http.poolAdd).mockImplementation(
      () => new Promise<void>(r => { resolvePoolAdd = r; }),
    );

    const { result } = renderHook(() => useSetBuilder());
    await act(async () => { result.current.selectSet(1); });
    await waitFor(() => expect(result.current.activeSetId).toBe(1));

    act(() => { result.current.addToPool(7, 'T7'); });
    expect(result.current.isPoolAddInFlight(7)).toBe(true);

    const withTrack = makeHydratedSet({
      pool: [{ id: 1, set_id: 1, track_id: 7, insertion_order: 0, track: makeTrack(7) }],
    });
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(withTrack);

    await act(async () => {
      resolvePoolAdd();
      await new Promise(r => setTimeout(r, 10));
    });

    await waitFor(() => expect(result.current.isPoolAddInFlight(7)).toBe(false));
  });
});

describe('useSetBuilder addExplorerNode', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    const http = await import('../api/http');
    vi.mocked(http.fetchSets).mockResolvedValue([]);
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(makeHydratedSet());
    vi.mocked(http.explorerAddNode).mockResolvedValue({ ok: true, node_id: 'created', track_id: 999, level: 1 });
    vi.mocked(http.explorerAddEdge).mockResolvedValue(undefined);
    vi.mocked(http.explorerEdgeScores).mockResolvedValue({ scores: [] });
  });

  it('reuses an existing target-level node by adding an edge instead of a duplicate node', async () => {
    const http = await import('../api/http');
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'parent', track_id: 10, level: 0 }),
        makeExplorerNode({ node_id: 'existing', track_id: 99, level: 1 }),
      ],
    });
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated);

    const { result } = renderHook(() => useSetBuilder());

    await act(async () => {
      result.current.selectSet(1);
    });

    await waitFor(() => expect(result.current.activeSetId).toBe(1));

    await act(async () => {
      await result.current.addExplorerNode(99, 'parent', 1);
    });

    expect(http.explorerAddEdge).toHaveBeenCalledWith(1, 'parent', 'existing');
    expect(http.explorerAddNode).not.toHaveBeenCalled();
  });

  it('deleteExplorerEdge calls explorerDeleteEdge and refreshes the active set', async () => {
    const http = await import('../api/http');
    vi.mocked(http.explorerDeleteEdge).mockResolvedValue(undefined);
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'n1', track_id: 10, level: 0 }),
        makeExplorerNode({ node_id: 'n2', track_id: 11, level: 1 }),
      ],
      explorer_edges: [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ],
    });
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated);

    const { result } = renderHook(() => useSetBuilder());

    await act(async () => {
      result.current.selectSet(1);
    });

    await waitFor(() => expect(result.current.activeSetId).toBe(1));

    await act(async () => {
      await result.current.deleteExplorerEdge(42);
    });

    expect(http.explorerDeleteEdge).toHaveBeenCalledWith(1, 42);
    expect(http.fetchHydratedSet).toHaveBeenCalled();
  });

  it('addExplorerEdge skips API call when edge already exists in active set', async () => {
    const http = await import('../api/http');
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'n1', track_id: 10, level: 0 }),
        makeExplorerNode({ node_id: 'n2', track_id: 11, level: 1 }),
      ],
      explorer_edges: [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ],
    });
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated);

    const { result } = renderHook(() => useSetBuilder());

    await act(async () => {
      result.current.selectSet(1);
    });

    await waitFor(() => expect(result.current.activeSetId).toBe(1));

    await act(async () => {
      await result.current.addExplorerEdge('n1', 'n2');
    });

    expect(http.explorerAddEdge).not.toHaveBeenCalled();
  });

  it('addExplorerEdge calls API when edge does not yet exist', async () => {
    const http = await import('../api/http');
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'n1', track_id: 10, level: 0 }),
        makeExplorerNode({ node_id: 'n2', track_id: 11, level: 1 }),
      ],
      explorer_edges: [],
    });
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated);

    const { result } = renderHook(() => useSetBuilder());

    await act(async () => {
      result.current.selectSet(1);
    });

    await waitFor(() => expect(result.current.activeSetId).toBe(1));

    await act(async () => {
      await result.current.addExplorerEdge('n1', 'n2');
    });

    expect(http.explorerAddEdge).toHaveBeenCalledWith(1, 'n1', 'n2');
  });

  it('creates a new node when no matching target-level node exists', async () => {
    const http = await import('../api/http');
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'parent', track_id: 10, level: 0 }),
        makeExplorerNode({ node_id: 'other', track_id: 99, level: 2 }),
      ],
    });
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated);

    const { result } = renderHook(() => useSetBuilder());

    await act(async () => {
      result.current.selectSet(1);
    });

    await waitFor(() => expect(result.current.activeSetId).toBe(1));

    await act(async () => {
      await result.current.addExplorerNode(99, 'parent', 1);
    });

    expect(http.explorerAddNode).toHaveBeenCalledWith(1, 99, 'parent', 1);
    expect(http.explorerAddEdge).not.toHaveBeenCalled();
  });
});
