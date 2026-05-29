import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { Track } from './types';
import type { DragPayload } from './dnd';
import { useCollectionCache } from './hooks/useCollectionCache';
import { useSetBuilder } from './hooks/useSetBuilder';

let capturedOnDragEnd: ((event: unknown) => void) | undefined;

vi.mock('@dnd-kit/core', () => ({
  DndContext: (props: { children: React.ReactNode; onDragEnd?: (e: unknown) => void }) => {
    capturedOnDragEnd = props.onDragEnd;
    return props.children;
  },
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    isDragging: false,
  }),
  useDroppable: () => ({
    setNodeRef: () => {},
    isOver: false,
  }),
  useSensor: () => null,
  useSensors: () => [],
  DragOverlay: ({ children }: { children?: React.ReactNode }) => children || null,
  PointerSensor: class {},
  MeasuringStrategy: { WhileDragging: 'whileDragging' },
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

vi.mock('./hooks/useSetBuilder', () => ({
  useSetBuilder: vi.fn(),
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
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Track ${i + 1}`,
    artist_names: [`Artist ${i + 1}`],
    bpm: 128,
    key: 'C',
    camelot_code: '8B',
    genre: 'Electronic',
    label: 'Label',
    energy: 0.5,
  }));
}

function makeDragEnd(activeId: string, payload: DragPayload, overId: string | null) {
  return {
    active: { id: activeId, data: { current: payload } },
    over: overId ? { id: overId } : null,
  };
}

const browsePayload: DragPayload = { trackId: 1, title: 'Track 1', source: 'browse' };

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

function makeSetBuilderMock(overrides: Record<string, unknown> = {}) {
  return {
    sets: [],
    activeSetId: null as number | null,
    activeSet: null as Record<string, unknown> | null,
    loading: false,
    error: null,
    pendingAdd: null,
    createSet: vi.fn(),
    selectSet: vi.fn(),
    deleteSet: vi.fn(),
    addToPool: vi.fn(),
    addToTracklist: vi.fn(),
    removeFromPool: vi.fn(),
    removeFromTracklist: vi.fn(),
    movePoolToTracklist: vi.fn(),
    moveTracklistToPool: vi.fn(),
    reorderTracklist: vi.fn(),
    updateTracklistNote: vi.fn(),
    addExplorerNode: vi.fn(),
    deleteExplorerNode: vi.fn(),
    addExplorerEdge: vi.fn(),
    deleteExplorerEdge: vi.fn(),
    addSiblingNode: vi.fn(),
    swapExplorerNodes: vi.fn(),
    explorerNodeAddToTracklist: vi.fn(),
    fetchEdgeScores: vi.fn().mockResolvedValue({ scores: [] }),
    isPoolAddInFlight: vi.fn().mockReturnValue(false),
    resolvePendingAdd: vi.fn(),
    clearPendingAdd: vi.fn(),
    clearError: vi.fn(),
    refreshActive: vi.fn(),
    ...overrides,
  };
}

let mockSB: ReturnType<typeof makeSetBuilderMock>;

beforeEach(() => {
  capturedOnDragEnd = undefined;
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  localStorage.clear();
  vi.mocked(useCollectionCache).mockReturnValue({
    allTracks: makeTracks(10),
    traitMap: new Map(),
    loading: false,
    tracksError: null,
    traitsError: null,
  });
  mockSB = makeSetBuilderMock();
  vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
});

async function renderApp() {
  const App = (await import('./App')).default;
  await act(async () => { render(<App />); });
  expect(capturedOnDragEnd).toBeDefined();
}

function fireDragEnd(activeId: string, payload: DragPayload, overId: string | null) {
  act(() => {
    capturedOnDragEnd!(makeDragEnd(activeId, payload, overId));
  });
}

describe('DnD: handleDragEnd guard paths', () => {
  it('no-ops when active.data.current payload is undefined', async () => {
    await renderApp();

    act(() => {
      capturedOnDragEnd!({
        active: { id: 'browse-track-1', data: { current: undefined } },
        over: { id: 'dock-matches' },
      });
    });

    screen.getAllByRole('tab').forEach(tab => {
      expect(tab).toHaveAttribute('aria-selected', 'false');
    });
  });

  it('no-ops for dock-matches when track is not found in allTracks', async () => {
    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: [],
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: null,
    });
    await renderApp();

    const payload: DragPayload = { trackId: 999, title: 'Ghost', source: 'browse' };
    fireDragEnd('browse-track-999', payload, 'dock-matches');

    expect(screen.queryByText('Ghost')).not.toBeInTheDocument();
  });

  it('shows warning when dropping on dock-explorer with no active set', async () => {
    mockSB = makeSetBuilderMock({ activeSetId: null, activeSet: null });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'dock-explorer');

    await waitFor(() => {
      expect(screen.getByTestId('dnd-warning-toast')).toBeInTheDocument();
      expect(screen.getByTestId('dnd-warning-toast').textContent).toContain('Select or create a set');
    });

    expect(mockSB.addExplorerNode).not.toHaveBeenCalled();
  });

  it('shows warning when dropping on drop-explorer with no active set', async () => {
    mockSB = makeSetBuilderMock({ activeSetId: null, activeSet: null });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-explorer');

    await waitFor(() => {
      expect(screen.getByTestId('dnd-warning-toast')).toBeInTheDocument();
      expect(screen.getByTestId('dnd-warning-toast').textContent).toContain('Select or create a set');
    });

    expect(mockSB.addExplorerNode).not.toHaveBeenCalled();
  });
});

describe('DnD: dock-bar closed-panel drops', () => {
  it('drop on dock-matches selects track and opens Matches panel', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'dock-matches');

    const matchesTab = screen.getByRole('tab', { name: 'Matches' });
    expect(matchesTab).toHaveAttribute('aria-selected', 'true');
  });

  it('drop on dock-set adds to tracklist and opens Set panel', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: { pool: [], tracklist: [], explorer_nodes: [], explorer_edges: [] },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'dock-set');

    const setTab = screen.getByRole('tab', { name: /Set/ });
    expect(setTab).toHaveAttribute('aria-selected', 'true');
    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('drop on dock-explorer opens Explorer panel', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'dock-explorer');

    const explorerTab = screen.getByRole('tab', { name: 'Explorer' });
    expect(explorerTab).toHaveAttribute('aria-selected', 'true');
  });

  it('no-op when drop target is null', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, null);

    screen.getAllByRole('tab').forEach(tab => {
      expect(tab).toHaveAttribute('aria-selected', 'false');
    });
  });
});

describe('DnD: open-panel drops', () => {
  beforeEach(() => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: { pool: [], tracklist: [], explorer_nodes: [], explorer_edges: [] },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
  });

  it('drop on drop-tracklist calls addToTracklist', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-tracklist');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('drop on drop-pool calls addToPool', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-pool');

    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('drop on drop-matches-header selects track as source', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-matches-header');

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('Search tracks…') as HTMLInputElement;
      expect(searchInput.value).toBe('Track 1');
    });
  });
});

describe('DnD: Explorer node child drop rejection at MAX_COLS', () => {
  it('shows warning toast when child level is at MAX_COLS', async () => {
    const explorerNodes = [
      { id: 1, set_id: 1, node_id: 'parent1', track_id: 100, level: 0, col_index: 0, track: null },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: i + 2, set_id: 1, node_id: `child${i}`, track_id: 200 + i,
        level: 1, col_index: i, track: null,
      })),
    ];

    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: { pool: [], tracklist: [], explorer_nodes: explorerNodes, explorer_edges: [] },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-explorer-node-parent1');

    await waitFor(() => {
      expect(screen.getByTestId('dnd-warning-toast')).toBeInTheDocument();
      expect(screen.getByTestId('dnd-warning-toast').textContent).toContain('Maximum 5');
    });

    expect(mockSB.addExplorerNode).not.toHaveBeenCalled();
  });

  it('allows drop when child level has fewer than MAX_COLS nodes', async () => {
    const explorerNodes = [
      { id: 1, set_id: 1, node_id: 'parent1', track_id: 100, level: 0, col_index: 0, track: null },
      ...Array.from({ length: 3 }, (_, i) => ({
        id: i + 2, set_id: 1, node_id: `child${i}`, track_id: 200 + i,
        level: 1, col_index: i, track: null,
      })),
    ];

    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: { pool: [], tracklist: [], explorer_nodes: explorerNodes, explorer_edges: [] },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-explorer-node-parent1');

    expect(screen.queryByTestId('dnd-warning-toast')).not.toBeInTheDocument();
    expect(mockSB.addExplorerNode).toHaveBeenCalledWith(1, 'parent1', 1);
  });
});

describe('DnD: Explorer level drop rejection at MAX_COLS', () => {
  it('shows warning toast when drop-explorer-level target is at MAX_COLS', async () => {
    const explorerNodes = [
      { id: 1, set_id: 1, node_id: 'root0', track_id: 100, level: 0, col_index: 0, track: null },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: i + 2, set_id: 1, node_id: `lvl1-${i}`, track_id: 200 + i,
        level: 1, col_index: i, track: null,
      })),
    ];

    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: { pool: [], tracklist: [], explorer_nodes: explorerNodes, explorer_edges: [] },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-explorer-level-1');

    await waitFor(() => {
      expect(screen.getByTestId('dnd-warning-toast')).toBeInTheDocument();
      expect(screen.getByTestId('dnd-warning-toast').textContent).toContain('Maximum 5');
    });

    expect(mockSB.addExplorerNode).not.toHaveBeenCalled();
    expect(mockSB.addSiblingNode).not.toHaveBeenCalled();
  });
});

describe('DnD: duplicate Pool drop no-op', () => {
  it('shows warning toast and does not call API for duplicate pool track', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [{ id: 1, set_id: 1, track_id: 1, insertion_order: 0, track: null }],
        tracklist: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-pool');

    await waitFor(() => {
      expect(screen.getByTestId('dnd-warning-toast')).toBeInTheDocument();
      expect(screen.getByTestId('dnd-warning-toast').textContent).toContain('already in pool');
    });

    expect(mockSB.addToPool).not.toHaveBeenCalled();
  });

  it('shows warning toast and blocks API when pool add is already in flight', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [],
        tracklist: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
      isPoolAddInFlight: vi.fn().mockReturnValue(true),
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-pool');

    await waitFor(() => {
      expect(screen.getByTestId('dnd-warning-toast')).toBeInTheDocument();
      expect(screen.getByTestId('dnd-warning-toast').textContent).toContain('already in pool');
    });

    expect(mockSB.addToPool).not.toHaveBeenCalled();
  });

  it('allows pool drop for a non-duplicate track', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [{ id: 1, set_id: 1, track_id: 99, insertion_order: 0, track: null }],
        tracklist: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-pool');

    expect(screen.queryByTestId('dnd-warning-toast')).not.toBeInTheDocument();
    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
  });
});
