import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { Track } from './types';
import type { DragPayload } from './dnd';
import { useCollectionCache } from './hooks/useCollectionCache';
import { useSetBuilder } from './hooks/useSetBuilder';

let capturedOnDragEnd: ((event: unknown) => void) | undefined;
let capturedOnDragMove: ((event: unknown) => void) | undefined;

const mockPointerWithin = vi.fn().mockReturnValue([]);
const mockRectIntersection = vi.fn().mockReturnValue([]);
const mockUseDroppable = vi.fn(() => ({
  setNodeRef: () => {},
  isOver: false,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: (props: { children: React.ReactNode; onDragEnd?: (e: unknown) => void; onDragMove?: (e: unknown) => void }) => {
    capturedOnDragEnd = props.onDragEnd;
    capturedOnDragMove = props.onDragMove;
    return props.children;
  },
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    isDragging: false,
  }),
  useDroppable: (opts: unknown) => mockUseDroppable(opts),
  useDndMonitor: () => {},
  useSensor: () => null,
  useSensors: () => [],
  DragOverlay: ({ children }: { children?: React.ReactNode }) => children || null,
  PointerSensor: class {},
  MeasuringStrategy: { WhileDragging: 'whileDragging' },
  pointerWithin: (...a: unknown[]) => mockPointerWithin(...a),
  rectIntersection: (...a: unknown[]) => mockRectIntersection(...a),
}));

vi.mock('./hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    track: null, playing: false, loading: false, currentTime: 0, duration: 0,
    volume: 0.8, error: null, play: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    togglePlayPause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), stop: vi.fn(),
  }),
  AudioPlayerProvider: ({ children }: { children: React.ReactNode }) => children,
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
    date_added: null,
  }));
}

function makeDragEnd(activeId: string, payload: DragPayload, overId: string | null, overData?: Record<string, unknown>, overRect?: { top: number; left: number; width: number; height: number }) {
  return {
    active: { id: activeId, data: { current: payload } },
    over: overId ? { id: overId, data: overData ? { current: overData } : undefined, ...(overRect ? { rect: overRect } : {}) } : null,
  };
}

function fireDragMove(pointerY: number, pointerX = 100) {
  if (!capturedOnDragMove) return;
  act(() => {
    capturedOnDragMove!({
      activatorEvent: { clientY: 0, clientX: 0 },
      delta: { x: pointerX, y: pointerY },
      over: null,
    });
  });
}

const browsePayload: DragPayload = { trackId: 1, title: 'Track 1', source: 'browse' };
const tracklistPayload: DragPayload = { trackId: 1, title: 'Track 1', source: 'tracklist' };
const poolPayload: DragPayload = { trackId: 1, title: 'Track 1', source: 'pool' };

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
    reorderPool: vi.fn(),
    reorderTracklist: vi.fn(),
    addToTracklistAtPosition: vi.fn(),
    updateTracklistNote: vi.fn(),
    addExplorerNode: vi.fn(),
    deleteExplorerNode: vi.fn(),
    addExplorerEdge: vi.fn(),
    deleteExplorerEdge: vi.fn(),
    addSiblingNode: vi.fn(),
    swapExplorerNodes: vi.fn(),
    moveExplorerNode: vi.fn(),
    explorerNodeAddToTracklist: vi.fn(),
    fetchEdgeScores: vi.fn().mockResolvedValue({ scores: [] }),
    isPoolAddInFlight: vi.fn().mockReturnValue(false),
    resolvePendingAdd: vi.fn(),
    clearPendingAdd: vi.fn(),
    clearError: vi.fn(),
    clearPool: vi.fn(),
    clearTracklist: vi.fn(),
    refreshActive: vi.fn(),
    activeTreeId: null as number | null,
    selectTree: vi.fn(),
    createTree: vi.fn(),
    renameTree: vi.fn(),
    deleteTree: vi.fn(),
    createSubgroup: vi.fn().mockResolvedValue(null),
    renameSubgroup: vi.fn().mockResolvedValue(true),
    deleteSubgroup: vi.fn().mockResolvedValue(true),
    reorderSubgroups: vi.fn().mockResolvedValue(true),
    addSubgroupMember: vi.fn().mockResolvedValue(true),
    removeSubgroupMember: vi.fn().mockResolvedValue(true),
    addEmptyRows: vi.fn(),
    deleteEmptyRow: vi.fn(),
    reorderEmptyRow: vi.fn(),
    ...overrides,
  };
}

let mockSB: ReturnType<typeof makeSetBuilderMock>;

beforeEach(() => {
  capturedOnDragEnd = undefined;
  capturedOnDragMove = undefined;
  mockPointerWithin.mockReset().mockReturnValue([]);
  mockRectIntersection.mockReset().mockReturnValue([]);
  mockUseDroppable.mockClear();
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

function fireDragEnd(activeId: string, payload: DragPayload, overId: string | null, overData?: Record<string, unknown>, overRect?: { top: number; left: number; width: number; height: number }) {
  act(() => {
    capturedOnDragEnd!(makeDragEnd(activeId, payload, overId, overData, overRect));
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
      activeSet: { pool: [], tracklist: [], explorer_trees: [], explorer_nodes: [], explorer_edges: [] },
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
      activeSet: { pool: [], tracklist: [], explorer_trees: [], explorer_nodes: [], explorer_edges: [] },
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

describe('DnD: Explorer cell-based drops', () => {
  const matchPayload: DragPayload = { trackId: 1, title: 'Track 1', source: 'matches' };

  it('drop on empty cell calls addExplorerNode with exact slot', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [],
        tracklist: [],
        explorer_trees: [],
        explorer_nodes: [
          { id: 1, set_id: 1, tree_id: 1, node_id: 'root1', track_id: 100, level: 0, col_index: 0, track: null },
        ],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('match-track-1', matchPayload, 'drop-explorer-cell-1-2');

    expect(mockSB.addExplorerNode).toHaveBeenCalledWith(1, undefined, 1, 2);
  });

  it('drop on occupied cell adds track as child of the occupant', async () => {
    const explorerNodes = [
      { id: 1, set_id: 1, tree_id: 1, node_id: 'n1', track_id: 100, level: 0, col_index: 0, track: null },
      { id: 2, set_id: 1, tree_id: 1, node_id: 'n2', track_id: 101, level: 1, col_index: 2, track: null },
    ];
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [], tracklist: [], explorer_trees: [],
        explorer_nodes: explorerNodes,
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-explorer-cell-1-2');

    expect(mockSB.addExplorerNode).toHaveBeenCalledWith(1, 'n2', 2);
  });

  it('dock-explorer places at first free slot on deepest level', async () => {
    const explorerNodes = [
      { id: 1, set_id: 1, tree_id: 1, node_id: 'root1', track_id: 100, level: 0, col_index: 0, track: null },
      { id: 2, set_id: 1, tree_id: 1, node_id: 'n2', track_id: 101, level: 0, col_index: 1, track: null },
    ];
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [], tracklist: [], explorer_trees: [],
        explorer_nodes: explorerNodes,
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'dock-explorer');

    expect(mockSB.addExplorerNode).toHaveBeenCalledWith(1, undefined, 0, 2);
  });

  it('dock-explorer moves to next level when deepest level is full', async () => {
    const explorerNodes = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1, set_id: 1, tree_id: 1,
      node_id: `n${i}`, track_id: 100 + i,
      level: 0, col_index: i, track: null,
    }));
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [], tracklist: [], explorer_trees: [],
        explorer_nodes: explorerNodes,
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'dock-explorer');

    expect(mockSB.addExplorerNode).toHaveBeenCalledWith(1, undefined, 1, 0);
  });
});

describe('DnD: duplicate Pool drop no-op', () => {
  it('shows warning toast and does not call API for duplicate pool track', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [{ id: 1, set_id: 1, track_id: 1, insertion_order: 0, starred: false, track: null }],
        tracklist: [],
        explorer_trees: [],
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
        explorer_trees: [],
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
        pool: [{ id: 1, set_id: 1, track_id: 99, insertion_order: 0, starred: false, track: null }],
        tracklist: [],
        explorer_trees: [],
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

describe('DnD: tracklist source drops to explorer', () => {
  it('tracklist drag to dock-explorer calls addExplorerNode', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [], tracklist: [], explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('tracklist-track-1', tracklistPayload, 'dock-explorer');

    expect(mockSB.addExplorerNode).toHaveBeenCalledWith(1, undefined, 0, 0);
  });

  it('tracklist drag to empty explorer cell calls addExplorerNode with slot', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [], tracklist: [], explorer_trees: [],
        explorer_nodes: [
          { id: 1, set_id: 1, tree_id: 1, node_id: 'root1', track_id: 100, level: 0, col_index: 0, track: null },
        ],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('tracklist-track-1', tracklistPayload, 'drop-explorer-cell-0-2');

    expect(mockSB.addExplorerNode).toHaveBeenCalledWith(1, undefined, 0, 2);
  });
});

describe('DnD: pool source drops to explorer', () => {
  it('pool drag to dock-explorer calls addExplorerNode', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [], tracklist: [], explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('pool-track-1', poolPayload, 'dock-explorer');

    expect(mockSB.addExplorerNode).toHaveBeenCalledWith(1, undefined, 0, 0);
  });

  it('pool drag to empty explorer cell calls addExplorerNode with slot', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [], tracklist: [], explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('pool-track-1', poolPayload, 'drop-explorer-cell-1-3');

    expect(mockSB.addExplorerNode).toHaveBeenCalledWith(1, undefined, 1, 3);
  });

  it('pool drag to dock-set adds to tracklist', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        pool: [], tracklist: [], explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('pool-track-1', poolPayload, 'dock-set');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });
});

describe('DnD: pool row-to-row reorder', () => {
  it('reorders pool when dragging pool row to a different pool row position', async () => {
    const pool = [
      { id: 1, set_id: 1, track_id: 10, insertion_order: 0, starred: false, track: { id: 10, title: 'Track 10', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
      { id: 2, set_id: 1, track_id: 20, insertion_order: 1, starred: false, track: { id: 20, title: 'Track 20', artist_names: [], bpm: 130, key: 'D', camelot_code: '10B', genre: null, label: null, energy: null } },
      { id: 3, set_id: 1, track_id: 30, insertion_order: 2, starred: false, track: { id: 30, title: 'Track 30', artist_names: [], bpm: 125, key: 'A', camelot_code: '11B', genre: null, label: null, energy: null } },
    ];
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool, tracklist: [], explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'pool' };
    fireDragEnd('pool-track-10', reorderPayload, 'drop-pool-row-2', { entryRank: 2 });

    expect(mockSB.reorderPool).toHaveBeenCalledWith(10, 2);
  });

  it('does not reorder pool when dropping on the same position', async () => {
    const pool = [
      { id: 1, set_id: 1, track_id: 10, insertion_order: 0, starred: false, track: { id: 10, title: 'Track 10', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
      { id: 2, set_id: 1, track_id: 20, insertion_order: 1, starred: false, track: { id: 20, title: 'Track 20', artist_names: [], bpm: 130, key: 'D', camelot_code: '10B', genre: null, label: null, energy: null } },
    ];
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool, tracklist: [], explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'pool' };
    fireDragEnd('pool-track-10', reorderPayload, 'drop-pool-row-0', { entryRank: 0 });

    expect(mockSB.reorderPool).not.toHaveBeenCalled();
  });
});

describe('DnD: tracklist row-to-row reorder', () => {
  it('reorders tracklist when dragging row to a different row position', async () => {
    const tracklist = [
      { id: 1, set_id: 1, track_id: 10, position: 0, note: '', starred: false, track: { id: 10, title: 'Track 10', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
      { id: 2, set_id: 1, track_id: 20, position: 1, note: '', starred: false, track: { id: 20, title: 'Track 20', artist_names: [], bpm: 130, key: 'D', camelot_code: '10B', genre: null, label: null, energy: null } },
      { id: 3, set_id: 1, track_id: 30, position: 2, note: '', starred: false, track: { id: 30, title: 'Track 30', artist_names: [], bpm: 125, key: 'A', camelot_code: '11B', genre: null, label: null, energy: null } },
    ];
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [], tracklist, explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'tracklist' };
    fireDragEnd('tracklist-track-10', reorderPayload, 'drop-tracklist-row-2', { trackId: 30 });

    expect(mockSB.reorderTracklist).toHaveBeenCalledWith(10, 2);
  });

  it('does not reorder when dropping on the same position', async () => {
    const tracklist = [
      { id: 1, set_id: 1, track_id: 10, position: 0, note: '', starred: false, track: { id: 10, title: 'Track 10', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
      { id: 2, set_id: 1, track_id: 20, position: 1, note: '', starred: false, track: { id: 20, title: 'Track 20', artist_names: [], bpm: 130, key: 'D', camelot_code: '10B', genre: null, label: null, energy: null } },
    ];
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [], tracklist, explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'tracklist' };
    fireDragEnd('tracklist-track-10', reorderPayload, 'drop-tracklist-row-0', { trackId: 10 });

    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
  });

  it('no-ops tracklist reorder when dropping on tracklist container', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [],
        tracklist: [{ id: 1, set_id: 1, track_id: 10, position: 0, note: '', starred: false, track: null }],
        explorer_trees: [], explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'tracklist' };
    fireDragEnd('tracklist-track-10', reorderPayload, 'drop-tracklist');

    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
  });
});

describe('DnD: multi-select payload handling', () => {
  beforeEach(() => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [],
        tracklist: [
          { id: 1, set_id: 1, track_id: 10, position: 0, note: '', starred: false, track: { id: 10, title: 'Track 10', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
          { id: 2, set_id: 1, track_id: 20, position: 1, note: '', starred: false, track: { id: 20, title: 'Track 20', artist_names: [], bpm: 130, key: 'D', camelot_code: '10B', genre: null, label: null, energy: null } },
          { id: 3, set_id: 1, track_id: 30, position: 2, note: '', starred: false, track: { id: 30, title: 'Track 30', artist_names: [], bpm: 125, key: 'A', camelot_code: '11B', genre: null, label: null, energy: null } },
        ],
        explorer_trees: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
  });

  it('multi-select drop on drop-pool adds all selected tracks', async () => {
    await renderApp();

    const multiPayload: DragPayload = {
      trackId: 1,
      title: 'Track 1',
      source: 'tracklist',
      selectedTrackIds: [1, 2, 3],
    };
    fireDragEnd('tracklist-track-1', multiPayload, 'drop-pool');

    expect(mockSB.addToPool).toHaveBeenCalledTimes(3);
    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
    expect(mockSB.addToPool).toHaveBeenCalledWith(2, 'Track 2');
    expect(mockSB.addToPool).toHaveBeenCalledWith(3, 'Track 3');
  });

  it('multi-select drop on drop-tracklist adds all selected tracks', async () => {
    await renderApp();

    const multiPayload: DragPayload = {
      trackId: 1,
      title: 'Track 1',
      source: 'browse',
      selectedTrackIds: [1, 2, 3],
    };
    fireDragEnd('browse-track-1', multiPayload, 'drop-tracklist');

    expect(mockSB.addToTracklist).toHaveBeenCalledTimes(3);
    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
    expect(mockSB.addToTracklist).toHaveBeenCalledWith(2, 'Track 2');
    expect(mockSB.addToTracklist).toHaveBeenCalledWith(3, 'Track 3');
  });

  it('multi-select drop on drop-pool skips duplicates', async () => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [{ id: 1, set_id: 1, track_id: 1, insertion_order: 0, starred: false, track: null }],
        tracklist: [],
        explorer_trees: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    const multiPayload: DragPayload = {
      trackId: 1,
      title: 'Track 1',
      source: 'tracklist',
      selectedTrackIds: [1, 2],
    };
    fireDragEnd('tracklist-track-1', multiPayload, 'drop-pool');

    expect(mockSB.addToPool).toHaveBeenCalledTimes(1);
    expect(mockSB.addToPool).toHaveBeenCalledWith(2, 'Track 2');
  });

  it('single-track payload without selectedTrackIds still works for drop-tracklist', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-tracklist');

    expect(mockSB.addToTracklist).toHaveBeenCalledTimes(1);
    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('single-track payload without selectedTrackIds still works for drop-pool', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-pool');

    expect(mockSB.addToPool).toHaveBeenCalledTimes(1);
    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
  });
});

describe('DnD: Set tab parity with Explorer', () => {
  beforeEach(() => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [],
        tracklist: [],
        explorer_trees: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
  });

  it('browse drag to drop-tracklist adds track (same as Explorer context)', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-tracklist');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('browse drag to drop-pool adds track (same as Explorer context)', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-pool');

    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('matches drag to drop-tracklist adds track', async () => {
    await renderApp();

    const matchPayload: DragPayload = { trackId: 1, title: 'Track 1', source: 'matches' };
    fireDragEnd('match-track-1', matchPayload, 'drop-tracklist');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('matches drag to drop-pool adds track', async () => {
    await renderApp();

    const matchPayload: DragPayload = { trackId: 1, title: 'Track 1', source: 'matches' };
    fireDragEnd('match-track-1', matchPayload, 'drop-pool');

    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('pool drag to drop-tracklist adds track', async () => {
    await renderApp();

    fireDragEnd('pool-track-1', poolPayload, 'drop-tracklist');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });
});

describe('DnD: drag-fill into empty rows', () => {
  beforeEach(() => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [],
        tracklist: [],
        explorer_trees: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
  });

  it('browse drag to drop-tracklist-empty-* without realPosition calls addToTracklist', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-tracklist-empty-empty-tl-1');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
  });

  it('tracklist fill calls addToTracklistAtPosition when droppable data includes realPosition', async () => {
    await renderApp();

    act(() => {
      capturedOnDragEnd!(makeDragEnd(
        'browse-track-1', browsePayload, 'drop-tracklist-empty-empty-tl-1',
        { __emptyId: 'empty-tl-1', realPosition: 2 },
      ));
    });

    expect(mockSB.addToTracklistAtPosition).toHaveBeenCalledWith(1, 2, 'Track 1');
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
  });

  it('matches drag to drop-tracklist-empty-* calls addToTracklist', async () => {
    await renderApp();

    const matchPayload: DragPayload = { trackId: 2, title: 'Track 2', source: 'matches' };
    fireDragEnd('match-track-2', matchPayload, 'drop-tracklist-empty-empty-tl-2');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(2, 'Track 2');
  });

  it('pool drag to drop-tracklist-empty-* calls addToTracklist', async () => {
    await renderApp();

    fireDragEnd('pool-track-1', poolPayload, 'drop-tracklist-empty-empty-tl-3');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('browse drag to drop-pool-empty-* calls addToPool (fill)', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-pool-empty-empty-pool-1');

    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('pool fill does not call reorderTracklist or addToTracklistAtPosition', async () => {
    await renderApp();

    act(() => {
      capturedOnDragEnd!(makeDragEnd(
        'browse-track-1', browsePayload, 'drop-pool-empty-empty-pool-1',
        { __emptyId: 'empty-pool-1', realPosition: 0 },
      ));
    });

    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
  });

  it('tracklist drag to drop-pool-empty-* calls addToPool', async () => {
    await renderApp();

    fireDragEnd('tracklist-track-1', tracklistPayload, 'drop-pool-empty-empty-pool-2');

    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('multi-select drop on drop-tracklist-empty-* adds all selected tracks', async () => {
    await renderApp();

    const multiPayload: DragPayload = {
      trackId: 1,
      title: 'Track 1',
      source: 'browse',
      selectedTrackIds: [1, 2],
    };
    fireDragEnd('browse-track-1', multiPayload, 'drop-tracklist-empty-empty-tl-4');

    expect(mockSB.addToTracklist).toHaveBeenCalledTimes(2);
    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
    expect(mockSB.addToTracklist).toHaveBeenCalledWith(2, 'Track 2');
  });

  it('alt-prefixed empty row targets are normalized and handled', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'alt-drop-tracklist-empty-empty-tl-5');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('no-ops empty row fill when no active set', async () => {
    mockSB = makeSetBuilderMock({ activeSetId: null, activeSet: null });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-tracklist-empty-empty-tl-6');

    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
  });
});

describe('DnD: alt-prefix normalization (Explorer panel droppable IDs)', () => {
  beforeEach(() => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [],
        tracklist: [
          { id: 1, set_id: 1, track_id: 10, position: 0, note: '', starred: false, track: { id: 10, title: 'Track 10', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
        ],
        explorer_trees: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
  });

  it('drop on alt-drop-tracklist adds track (Explorer workspace panel)', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'alt-drop-tracklist');

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('drop on alt-drop-pool adds track (Explorer workspace panel)', async () => {
    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'alt-drop-pool');

    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
  });

  it('tracklist reorder via alt-drop-tracklist-row works', async () => {
    await renderApp();

    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'tracklist' };
    fireDragEnd('alt-tracklist-track-10', reorderPayload, 'alt-drop-tracklist-row-0');

    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
  });

  it('multi-select drop on alt-drop-pool adds all selected tracks', async () => {
    await renderApp();

    const multiPayload: DragPayload = {
      trackId: 1,
      title: 'Track 1',
      source: 'browse',
      selectedTrackIds: [1, 2],
    };
    fireDragEnd('browse-track-1', multiPayload, 'alt-drop-pool');

    expect(mockSB.addToPool).toHaveBeenCalledTimes(2);
    expect(mockSB.addToPool).toHaveBeenCalledWith(1, 'Track 1');
    expect(mockSB.addToPool).toHaveBeenCalledWith(2, 'Track 2');
  });
});

describe('dndCollisionDetection: empty-row rectIntersection fallback', () => {
  function makeCollisionArgs(source: DragPayload['source']) {
    return {
      active: { id: `${source}-1`, data: { current: { trackId: 1, title: 'T1', source } } },
      collisionRect: { top: 0, left: 0, bottom: 10, right: 10, width: 10, height: 10 },
      droppableRects: new Map(),
      droppableContainers: [],
      pointerCoordinates: { x: 5, y: 5 },
    };
  }

  function col(id: string) {
    return { id, data: { droppableContainer: { id } } };
  }

  let collisionDetection: typeof import('./App').dndCollisionDetection;

  beforeEach(async () => {
    const mod = await import('./App');
    collisionDetection = mod.dndCollisionDetection;
  });

  it('prefers empty-row from rectIntersection when pointerWithin hits only container (browse source)', () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-empty-empty-tl-1')]);

    const result = collisionDetection(makeCollisionArgs('browse') as never);

    expect(result).toEqual([col('drop-tracklist-empty-empty-tl-1')]);
  });

  it('prefers empty-row from rectIntersection when pointerWithin hits only container (pool source)', () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-empty-empty-tl-2')]);

    const result = collisionDetection(makeCollisionArgs('pool') as never);

    expect(result).toEqual([col('drop-tracklist-empty-empty-tl-2')]);
  });

  it('prefers empty-row over row targets for tracklist-source drag', () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-row-1')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-row-1'), col('drop-tracklist-empty-empty-tl-3')]);

    const result = collisionDetection(makeCollisionArgs('tracklist') as never);

    expect(result).toEqual([col('drop-tracklist-empty-empty-tl-3')]);
  });

  it('prefers empty-row from rectIntersection in pure fallback (no pointer hits)', () => {
    mockPointerWithin.mockReturnValueOnce([]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-empty-empty-tl-4')]);

    const result = collisionDetection(makeCollisionArgs('browse') as never);

    expect(result).toEqual([col('drop-tracklist-empty-empty-tl-4')]);
  });

  it('falls through to row targets when no empty-row in either source (tracklist reorder)', () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-row-2')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-row-2')]);

    const result = collisionDetection(makeCollisionArgs('tracklist') as never);

    expect(result).toEqual([col('drop-tracklist-row-2')]);
  });

  it('prefers pool-empty from rectIntersection when pointer hits only pool container', () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-pool')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-pool'), col('drop-pool-empty-empty-pool-1')]);

    const result = collisionDetection(makeCollisionArgs('browse') as never);

    expect(result).toEqual([col('drop-pool-empty-empty-pool-1')]);
  });

  it('direct pointer hit on empty-row still takes priority (no regression)', () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-empty-empty-tl-5')]);
    mockRectIntersection.mockReturnValueOnce([]);

    const result = collisionDetection(makeCollisionArgs('browse') as never);

    expect(result).toEqual([col('drop-tracklist-empty-empty-tl-5')]);
  });
});

describe('DnD: empty-row drag guard (reorder 400 fix)', () => {
  beforeEach(() => {
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [],
        tracklist: [],
        explorer_trees: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
  });

  it('empty row (trackId=-1) dropped onto tracklist-empty does not call addToTracklist or addToTracklistAtPosition', async () => {
    await renderApp();

    const emptyPayload: DragPayload = { trackId: -1, title: '', source: 'tracklist' };
    fireDragEnd('tracklist-empty-e1', emptyPayload, 'drop-tracklist-empty-e2', { __emptyId: 'e2', realPosition: 1 });

    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
  });

  it('empty row (trackId=-1) dropped onto pool-empty does not call addToPool', async () => {
    await renderApp();

    const emptyPayload: DragPayload = { trackId: -1, title: '', source: 'pool' };
    fireDragEnd('pool-empty-e1', emptyPayload, 'drop-pool-empty-e2', { __emptyId: 'e2', realPosition: 0 });

    expect(mockSB.addToPool).not.toHaveBeenCalled();
  });

  it('valid track dropped onto tracklist-empty with realPosition calls addToTracklistAtPosition', async () => {
    await renderApp();

    fireDragEnd('browse-track-3', { trackId: 3, title: 'Track 3', source: 'browse' }, 'drop-tracklist-empty-e1', { __emptyId: 'e1', realPosition: 1 });

    expect(mockSB.addToTracklistAtPosition).toHaveBeenCalledWith(3, 1, 'Track 3');
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
  });

  it('pool track dropped onto tracklist-empty without realPosition calls addToTracklist', async () => {
    await renderApp();

    fireDragEnd('pool-track-5', { trackId: 5, title: 'Track 5', source: 'pool' }, 'drop-tracklist-empty-e1', { __emptyId: 'e1' });

    expect(mockSB.addToTracklist).toHaveBeenCalledWith(5, 'Track 5');
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
  });

  it('matches track dropped onto pool-empty calls addToPool', async () => {
    await renderApp();

    fireDragEnd('match-track-7', { trackId: 7, title: 'Track 7', source: 'matches' }, 'drop-pool-empty-e1', { __emptyId: 'e1', realPosition: 0 });

    expect(mockSB.addToPool).toHaveBeenCalledWith(7, 'Track 7');
  });

  it('tracklist-source drag onto tracklist-empty with realPosition calls reorderTracklist instead of addToTracklistAtPosition', async () => {
    await renderApp();

    fireDragEnd('tracklist-track-5', { trackId: 5, title: 'Track 5', source: 'tracklist' }, 'drop-tracklist-empty-e1', { __emptyId: 'e1', realPosition: 2 });

    expect(mockSB.reorderTracklist).toHaveBeenCalledWith(5, 2);
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
  });

  it('self-drop guard: empty row dropped onto itself does not call reorderEmptyRow', async () => {
    await renderApp();

    const emptyPayload: DragPayload & { __persistedId?: number; __emptyId?: string } = {
      trackId: -1,
      title: '',
      source: 'tracklist',
      __emptyId: 'er-5',
      __persistedId: 5,
    };
    fireDragEnd(
      'tracklist-empty-er-5',
      emptyPayload as DragPayload,
      'drop-tracklist-empty-er-5',
      { __emptyId: 'er-5', __persistedId: 5, realPosition: 0 },
    );

    expect(mockSB.reorderEmptyRow).not.toHaveBeenCalled();
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
  });

  it('empty row dropped onto different empty row calls reorderEmptyRow', async () => {
    await renderApp();

    const emptyPayload: DragPayload & { __persistedId?: number; __emptyId?: string } = {
      trackId: -1,
      title: '',
      source: 'tracklist',
      __emptyId: 'er-5',
      __persistedId: 5,
    };
    fireDragEnd(
      'tracklist-empty-er-5',
      emptyPayload as DragPayload,
      'drop-tracklist-empty-er-6',
      { __emptyId: 'er-6', __persistedId: 6, realPosition: 2 },
    );

    expect(mockSB.reorderEmptyRow).toHaveBeenCalledWith(5, 2);
  });

  it('empty row dropped onto a track row calls reorderEmptyRow with display index', async () => {
    await renderApp();

    const emptyPayload: DragPayload & { __persistedId?: number; __emptyId?: string } = {
      trackId: -1,
      title: '',
      source: 'tracklist',
      __emptyId: 'er-7',
      __persistedId: 7,
    };
    fireDragEnd(
      'tracklist-empty-er-7',
      emptyPayload as DragPayload,
      'drop-tracklist-row-3',
      { index: 3, trackId: 30 },
    );

    expect(mockSB.reorderEmptyRow).toHaveBeenCalledWith(7, 3);
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
  });

  it('empty row dropped onto a different empty row reorders (not a no-op)', async () => {
    await renderApp();

    const emptyPayload: DragPayload & { __persistedId?: number; __emptyId?: string } = {
      trackId: -1,
      title: '',
      source: 'tracklist',
      __emptyId: 'er-10',
      __persistedId: 10,
    };
    fireDragEnd(
      'tracklist-empty-er-10',
      emptyPayload as DragPayload,
      'drop-tracklist-empty-er-11',
      { __emptyId: 'er-11', __persistedId: 11, realPosition: 4 },
    );

    expect(mockSB.reorderEmptyRow).toHaveBeenCalledTimes(1);
    expect(mockSB.reorderEmptyRow).toHaveBeenCalledWith(10, 4);
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
  });
});

describe('DnD integration: collision detection → handleDragEnd for all three drag-fill sources', () => {
  function makeCollisionArgs(source: DragPayload['source']) {
    return {
      active: { id: `${source}-1`, data: { current: { trackId: 1, title: 'Track 1', source } } },
      collisionRect: { top: 0, left: 0, bottom: 10, right: 10, width: 10, height: 10 },
      droppableRects: new Map(),
      droppableContainers: [],
      pointerCoordinates: { x: 5, y: 5 },
    };
  }

  function col(id: string, data?: Record<string, unknown>) {
    return { id, data: { droppableContainer: { id }, ...data } };
  }

  let collisionDetection: typeof import('./App').dndCollisionDetection;

  beforeEach(async () => {
    const mod = await import('./App');
    collisionDetection = mod.dndCollisionDetection;
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [],
        tracklist: [
          { id: 1, set_id: 1, track_id: 1, position: 0, note: '', starred: false, track: { id: 1, title: 'Track 1', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
        ],
        explorer_trees: [],
        explorer_nodes: [],
        explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
  });

  it('browse-source: collision resolves empty row from rect, handleDragEnd calls addToTracklistAtPosition', async () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-empty-e1')]);

    const result = collisionDetection(makeCollisionArgs('browse') as never);
    expect(result).toEqual([col('drop-tracklist-empty-e1')]);

    await renderApp();
    fireDragEnd('browse-track-3', { trackId: 3, title: 'Track 3', source: 'browse' }, 'drop-tracklist-empty-e1', { __emptyId: 'e1', realPosition: 1 });

    expect(mockSB.addToTracklistAtPosition).toHaveBeenCalledWith(3, 1, 'Track 3');
  });

  it('pool-source: collision resolves empty row from rect, handleDragEnd calls addToTracklistAtPosition', async () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-empty-e2')]);

    const result = collisionDetection(makeCollisionArgs('pool') as never);
    expect(result).toEqual([col('drop-tracklist-empty-e2')]);

    await renderApp();
    fireDragEnd('pool-track-2', { trackId: 2, title: 'Track 2', source: 'pool' }, 'drop-tracklist-empty-e2', { __emptyId: 'e2', realPosition: 0 });

    expect(mockSB.addToTracklistAtPosition).toHaveBeenCalledWith(2, 0, 'Track 2');
  });

  it('tracklist-source: collision resolves empty row from rect, handleDragEnd calls reorderTracklist', async () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-row-0')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-row-0'), col('drop-tracklist-empty-e3')]);

    const result = collisionDetection(makeCollisionArgs('tracklist') as never);
    expect(result).toEqual([col('drop-tracklist-empty-e3')]);

    await renderApp();
    fireDragEnd('tracklist-track-1', { trackId: 1, title: 'Track 1', source: 'tracklist' }, 'drop-tracklist-empty-e3', { __emptyId: 'e3', realPosition: 2 });

    expect(mockSB.reorderTracklist).toHaveBeenCalledWith(1, 2);
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
  });

  it('browse-source: collision resolves empty row from pointer directly', async () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-empty-e4')]);
    mockRectIntersection.mockReturnValueOnce([]);

    const result = collisionDetection(makeCollisionArgs('browse') as never);
    expect(result).toEqual([col('drop-tracklist-empty-e4')]);

    await renderApp();
    fireDragEnd('browse-track-5', { trackId: 5, title: 'Track 5', source: 'browse' }, 'drop-tracklist-empty-e4', { __emptyId: 'e4', realPosition: 3 });

    expect(mockSB.addToTracklistAtPosition).toHaveBeenCalledWith(5, 3, 'Track 5');
  });

  it('tracklist-source: collision does not return empty when only container is in pointer', async () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist')]);

    const result = collisionDetection(makeCollisionArgs('tracklist') as never);
    expect(result.length).toBeGreaterThan(0);
  });

  it('tracklist-source: collision recognizes alt-prefixed row targets', async () => {
    mockPointerWithin.mockReturnValueOnce([col('alt-drop-tracklist'), col('alt-drop-tracklist-row-1')]);
    mockRectIntersection.mockReturnValueOnce([col('alt-drop-tracklist'), col('alt-drop-tracklist-row-1')]);

    const result = collisionDetection(makeCollisionArgs('tracklist') as never);
    expect(result).toEqual([col('alt-drop-tracklist-row-1')]);
  });

  it('self-drop: collision filters out the source empty row droppable', async () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-empty-er-5')]);
    mockRectIntersection.mockReturnValueOnce([col('drop-tracklist'), col('drop-tracklist-empty-er-5')]);

    const args = {
      active: { id: 'tracklist-empty-er-5', data: { current: { trackId: -1, title: '', source: 'tracklist', __emptyId: 'er-5' } } },
      collisionRect: { top: 0, left: 0, bottom: 10, right: 10, width: 10, height: 10 },
      droppableRects: new Map(),
      droppableContainers: [],
      pointerCoordinates: { x: 5, y: 5 },
    };

    const result = collisionDetection(args as never);
    const emptyIds = result.filter((c: { id: string }) => String(c.id).includes('drop-tracklist-empty-er-5'));
    expect(emptyIds).toHaveLength(0);
  });

  it('self-drop: collision allows other empty rows when dragging an empty row', async () => {
    mockPointerWithin.mockReturnValueOnce([col('drop-tracklist-empty-er-5'), col('drop-tracklist-empty-er-6')]);
    mockRectIntersection.mockReturnValueOnce([]);

    const args = {
      active: { id: 'tracklist-empty-er-5', data: { current: { trackId: -1, title: '', source: 'tracklist', __emptyId: 'er-5' } } },
      collisionRect: { top: 0, left: 0, bottom: 10, right: 10, width: 10, height: 10 },
      droppableRects: new Map(),
      droppableContainers: [],
      pointerCoordinates: { x: 5, y: 5 },
    };

    const result = collisionDetection(args as never);
    expect(result).toEqual([col('drop-tracklist-empty-er-6')]);
  });
});

describe('DnD: mixed-row track-to-track reorder with interspersed empty rows', () => {
  it('uses target trackId-based position lookup, not display index, when empty rows shift indices', async () => {
    const tracklist = [
      { id: 1, set_id: 1, track_id: 10, position: 0, note: '', starred: false, track: { id: 10, title: 'Track 10', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
      { id: 2, set_id: 1, track_id: 20, position: 10, note: '', starred: false, track: { id: 20, title: 'Track 20', artist_names: [], bpm: 130, key: 'D', camelot_code: '10B', genre: null, label: null, energy: null } },
    ];
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [], tracklist, explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
        empty_rows: [
          { id: 100, set_id: 1, surface: 'tracklist', position: 1, added_at: '2026-01-01T00:00:00Z' },
        ],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    // Display order with the interspersed empty row:
    //   index 0 → Track 10 (position 0)
    //   index 1 → empty row  (position 1)
    //   index 2 → Track 20 (position 10)
    // The droppable ID carries the display index (2); the overData carries
    // the trackId (20). The handler must resolve the target via trackId
    // lookup (position 10), not by parsing the display index (2).
    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'tracklist' };
    fireDragEnd('tracklist-track-10', reorderPayload, 'drop-tracklist-row-2', { trackId: 20 });

    expect(mockSB.reorderTracklist).toHaveBeenCalledWith(10, 10);
  });
});

describe('DnD: graceful degradation — missing trackId in overData', () => {
  beforeEach(() => {
    const tracklist = [
      { id: 1, set_id: 1, track_id: 10, position: 0, note: '', starred: false, track: { id: 10, title: 'Track 10', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
      { id: 2, set_id: 1, track_id: 20, position: 1, note: '', starred: false, track: { id: 20, title: 'Track 20', artist_names: [], bpm: 130, key: 'D', camelot_code: '10B', genre: null, label: null, energy: null } },
    ];
    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [], tracklist, explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
  });

  it('no-ops when over.data.current has no trackId property', async () => {
    await renderApp();
    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'tracklist' };
    fireDragEnd('tracklist-track-10', reorderPayload, 'drop-tracklist-row-1', {});

    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
  });

  it('no-ops when over.data is entirely absent', async () => {
    await renderApp();
    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'tracklist' };
    fireDragEnd('tracklist-track-10', reorderPayload, 'drop-tracklist-row-1');

    expect(mockSB.reorderTracklist).not.toHaveBeenCalled();
    expect(mockSB.addToTracklist).not.toHaveBeenCalled();
    expect(mockSB.addToTracklistAtPosition).not.toHaveBeenCalled();
  });
});

describe('DnD: droppable data contract coupling', () => {
  it('inspects the real droppable data shape from the rendered component and uses it for reorder', async () => {
    const tracklist = [
      { id: 1, set_id: 1, track_id: 10, position: 0, note: '', starred: false, track: { id: 10, title: 'Track 10', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
      { id: 2, set_id: 1, track_id: 20, position: 1, note: '', starred: false, track: { id: 20, title: 'Track 20', artist_names: [], bpm: 130, key: 'D', camelot_code: '10B', genre: null, label: null, energy: null } },
    ];

    mockUseDroppable.mockClear();
    const { SetTracklist } = await import('./components/SetTracklist');
    const { DndContext: MockDndContext } = await import('@dnd-kit/core');
    const noop = () => {};
    const { unmount } = render(
      <MockDndContext>
        <SetTracklist
          tracklist={tracklist as import('./types').TracklistEntry[]}
          emptyRows={[]}
          onRemove={noop}
          onMoveToPool={noop}
          onReorder={noop}
          onUpdateNote={noop}
          onAddTrack={noop}
          onInsertEmptyRows={noop}
          onDeleteEmptyRow={noop}
          onReorderEmptyRow={noop}
        />
      </MockDndContext>,
    );

    const rowCalls = mockUseDroppable.mock.calls
      .filter((args: unknown[]) => {
        const opts = args[0] as { id?: string } | undefined;
        return String(opts?.id ?? '').startsWith('drop-tracklist-row-');
      });
    expect(rowCalls.length).toBeGreaterThan(0);

    const targetOpts = rowCalls[rowCalls.length - 1][0] as { id: string; data: Record<string, unknown> };
    expect(targetOpts.data).toEqual(expect.objectContaining({ trackId: expect.any(Number) }));

    unmount();

    mockSB = makeSetBuilderMock({
      activeSetId: 1,
      activeSet: {
        set: { id: 1, name: 'Test' },
        pool: [], tracklist, explorer_trees: [],
        explorer_nodes: [], explorer_edges: [],
      },
    });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);
    await renderApp();

    const reorderPayload: DragPayload = { trackId: 10, title: 'Track 10', source: 'tracklist' };
    fireDragEnd('tracklist-track-10', reorderPayload, String(targetOpts.id), targetOpts.data);

    expect(mockSB.reorderTracklist).toHaveBeenCalledWith(10, 1);
  });
});

/* ─────────────────────────────────────────────── */

describe('DnD: empty-row insertion vs fill (BUG-02)', () => {
  it('fills an isolated empty row (deletes it after inserting the track)', async () => {
    const activeSet = {
      set: { id: 1, name: 'S' },
      pool: [],
      tracklist: [
        { track_id: 5, position: 0, starred: false },
      ],
      explorer_trees: [],
      explorer_nodes: [],
      explorer_edges: [],
      empty_rows: [
        { id: 100, set_id: 1, surface: 'tracklist', position: 1 },
      ],
    };
    mockSB = makeSetBuilderMock({ activeSetId: 1, activeSet });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);

    const tracklistLengthBefore = activeSet.tracklist.length;
    const emptyRowCountBefore = activeSet.empty_rows.filter(r => r.surface === 'tracklist').length;
    expect(tracklistLengthBefore).toBe(1);
    expect(emptyRowCountBefore).toBe(1);

    await renderApp();

    fireDragEnd('browse-track-1', browsePayload, 'drop-tracklist-empty-e100', {
      __emptyId: 'e100',
      __persistedId: 100,
      realPosition: 1,
    });

    expect(mockSB.addToTracklistAtPosition).toHaveBeenCalledWith(1, 1, 'Track 1');
    expect(mockSB.deleteEmptyRow).toHaveBeenCalledWith(100);

    const trackAdds = mockSB.addToTracklistAtPosition.mock.calls.length + mockSB.addToTracklist.mock.calls.length;
    const emptyDeletes = mockSB.deleteEmptyRow.mock.calls.length;
    const tracklistLengthAfter = tracklistLengthBefore + trackAdds;
    const emptyRowCountAfter = emptyRowCountBefore - emptyDeletes;
    expect(tracklistLengthAfter).toBe(2);
    expect(emptyRowCountAfter).toBe(0);
  });

  it('inserts between adjacent empty rows (preserves both placeholders, no deleteEmptyRow)', async () => {
    const activeSet = {
      set: { id: 1, name: 'S' },
      pool: [],
      tracklist: [] as { track_id: number; position: number; starred: boolean }[],
      explorer_trees: [],
      explorer_nodes: [],
      explorer_edges: [],
      empty_rows: [
        { id: 200, set_id: 1, surface: 'tracklist', position: 2 },
        { id: 201, set_id: 1, surface: 'tracklist', position: 3 },
      ],
    };
    mockSB = makeSetBuilderMock({ activeSetId: 1, activeSet });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);

    const tracklistLengthBefore = activeSet.tracklist.length;
    const emptyRowCountBefore = activeSet.empty_rows.filter(r => r.surface === 'tracklist').length;
    expect(tracklistLengthBefore).toBe(0);
    expect(emptyRowCountBefore).toBe(2);

    await renderApp();

    fireDragEnd('browse-track-2', { trackId: 2, title: 'Track 2', source: 'browse' }, 'drop-tracklist-empty-e200', {
      __emptyId: 'e200',
      __persistedId: 200,
      realPosition: 2,
    });

    expect(mockSB.addToTracklistAtPosition).toHaveBeenCalledWith(2, 2, 'Track 2');
    expect(mockSB.deleteEmptyRow).not.toHaveBeenCalled();

    const trackAdds = mockSB.addToTracklistAtPosition.mock.calls.length + mockSB.addToTracklist.mock.calls.length;
    const emptyDeletes = mockSB.deleteEmptyRow.mock.calls.length;
    const tracklistLengthAfter = tracklistLengthBefore + trackAdds;
    const emptyRowCountAfter = emptyRowCountBefore - emptyDeletes;
    expect(tracklistLengthAfter).toBe(1);
    expect(emptyRowCountAfter).toBe(2);
  });

  it('adjacent empty rows always insert (never fill), regardless of pointer position', async () => {
    const activeSet = {
      set: { id: 1, name: 'S' },
      pool: [],
      tracklist: [] as { track_id: number; position: number; starred: boolean }[],
      explorer_trees: [],
      explorer_nodes: [],
      explorer_edges: [],
      empty_rows: [
        { id: 200, set_id: 1, surface: 'tracklist', position: 2 },
        { id: 201, set_id: 1, surface: 'tracklist', position: 3 },
      ],
    };
    mockSB = makeSetBuilderMock({ activeSetId: 1, activeSet });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);

    const tracklistLengthBefore = activeSet.tracklist.length;
    const emptyRowCountBefore = activeSet.empty_rows.filter(r => r.surface === 'tracklist').length;
    expect(tracklistLengthBefore).toBe(0);
    expect(emptyRowCountBefore).toBe(2);

    await renderApp();

    fireDragEnd('browse-track-2', { trackId: 2, title: 'Track 2', source: 'browse' }, 'drop-tracklist-empty-e200', {
      __emptyId: 'e200',
      __persistedId: 200,
      realPosition: 2,
    });

    expect(mockSB.addToTracklistAtPosition).toHaveBeenCalledWith(2, 2, 'Track 2');
    expect(mockSB.deleteEmptyRow).not.toHaveBeenCalled();

    const trackAdds = mockSB.addToTracklistAtPosition.mock.calls.length + mockSB.addToTracklist.mock.calls.length;
    const emptyDeletes = mockSB.deleteEmptyRow.mock.calls.length;
    const tracklistLengthAfter = tracklistLengthBefore + trackAdds;
    const emptyRowCountAfter = emptyRowCountBefore - emptyDeletes;
    expect(tracklistLengthAfter).toBe(1);
    expect(emptyRowCountAfter).toBe(2);
  });

  it('fills an empty row when no adjacent empty neighbours exist on the same surface', async () => {
    const activeSet = {
      set: { id: 1, name: 'S' },
      pool: [],
      tracklist: [
        { track_id: 5, position: 0, starred: false },
        { track_id: 6, position: 2, starred: false },
      ],
      explorer_trees: [],
      explorer_nodes: [],
      explorer_edges: [],
      empty_rows: [
        { id: 300, set_id: 1, surface: 'tracklist', position: 1 },
        { id: 301, set_id: 1, surface: 'pool', position: 0 },
      ],
    };
    mockSB = makeSetBuilderMock({ activeSetId: 1, activeSet });
    vi.mocked(useSetBuilder).mockReturnValue(mockSB as ReturnType<typeof useSetBuilder>);

    const tracklistLengthBefore = activeSet.tracklist.length;
    const emptyRowCountBefore = activeSet.empty_rows.filter(r => r.surface === 'tracklist').length;
    expect(tracklistLengthBefore).toBe(2);
    expect(emptyRowCountBefore).toBe(1);

    await renderApp();

    fireDragEnd('browse-track-3', { trackId: 3, title: 'Track 3', source: 'browse' }, 'drop-tracklist-empty-e300', {
      __emptyId: 'e300',
      __persistedId: 300,
      realPosition: 1,
    });

    expect(mockSB.addToTracklistAtPosition).toHaveBeenCalledWith(3, 1, 'Track 3');
    expect(mockSB.deleteEmptyRow).toHaveBeenCalledWith(300);

    const trackAdds = mockSB.addToTracklistAtPosition.mock.calls.length + mockSB.addToTracklist.mock.calls.length;
    const emptyDeletes = mockSB.deleteEmptyRow.mock.calls.length;
    const tracklistLengthAfter = tracklistLengthBefore + trackAdds;
    const emptyRowCountAfter = emptyRowCountBefore - emptyDeletes;
    expect(tracklistLengthAfter).toBe(3);
    expect(emptyRowCountAfter).toBe(0);
  });
});
