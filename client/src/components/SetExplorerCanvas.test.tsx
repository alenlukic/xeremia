import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rawRender, screen, fireEvent, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { SetExplorerCanvas } from './SetExplorerCanvas';
import type { ExplorerNode, ExplorerEdge } from '../types';
import { edgeColorForColumn } from '../utils/explorer';

function render(ui: React.ReactElement, options?: RenderOptions) {
  return rawRender(<DndContext>{ui}</DndContext>, options);
}

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    track: null,
    playing: false,
    loading: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    error: null,
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    togglePlayPause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([
    { id: 99, title: 'Search Result', artist_names: [], bpm: 130, key: 'A', camelot_code: '11B' },
  ]),
  fetchMatches: vi.fn().mockResolvedValue([
    { candidate_id: 99, title: 'Match Result', overall_score: 0.85, bucket: 'same_key', camelot_score: 1, bpm_score: 0.9, energy_score: 0.8, similarity_score: 0.7, freshness_score: 1, genre_similarity_score: 0.6, mood_continuity_score: 0.5, vocal_clash_score: 1, instrument_similarity_score: 0.4 },
  ]),
}));

function makeNode(overrides: Partial<ExplorerNode> & { node_id: string; track_id: number; level: number }): ExplorerNode {
  return {
    id: 1,
    set_id: 1,
    tree_id: 1,
    col_index: 0,
    track: { id: overrides.track_id, title: `Track ${overrides.track_id}`, artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null },
    ...overrides,
  };
}

function defaultProps(overrides: {
  nodes?: ExplorerNode[];
  edges?: ExplorerEdge[];
  tracklistTrackIds?: Set<number>;
} = {}) {
  return {
    nodes: overrides.nodes ?? [],
    edges: overrides.edges ?? [],
    onAddNode: vi.fn(),
    onDeleteNode: vi.fn(),
    onAddEdge: vi.fn().mockResolvedValue(undefined),
    onDeleteEdge: vi.fn().mockResolvedValue(undefined),
    onSwap: vi.fn(),
    onMoveNode: vi.fn(),
    onNodeToTracklist: vi.fn(),
    onAddSibling: vi.fn().mockResolvedValue(null),
    tracklistTrackIds: overrides.tracklistTrackIds ?? new Set<number>(),
    fetchEdgeScores: vi.fn().mockResolvedValue({ scores: [] }),
  };
}

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('SetExplorerCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(window.Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, width: 292, height: 36, right: 292, bottom: 36, x: 0, y: 0,
      toJSON() { return {}; },
    } as DOMRect);
  });

  describe('grid structure', () => {
    it('renders cells for each column at each level', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const cells = screen.getAllByTestId('explorer-cell');
      expect(cells.length).toBeGreaterThanOrEqual(5);
      expect(cells[0]).toHaveAttribute('data-level', '0');
    });

    it('renders add buttons in empty cells', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0, col_index: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const addBtns = screen.getAllByTestId('cell-add-btn');
      expect(addBtns.length).toBeGreaterThanOrEqual(4);
    });

    it('always renders exactly 100 level rows regardless of node count', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const levels = screen.getAllByTestId('explorer-level');
      expect(levels.length).toBe(100);
    });

    it('renders 100 levels even with no nodes', () => {
      render(<SetExplorerCanvas {...defaultProps()} />);

      const levels = screen.getAllByTestId('explorer-level');
      expect(levels.length).toBe(100);
    });

    it('opens sibling-add modal when add button in empty cell is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0, col_index: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const addBtns = screen.getAllByTestId('cell-add-btn');
      await userEvent.click(addBtns[0]);

      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument();
      expect(screen.getByTestId('sibling-search-input')).toBeInTheDocument();
    });

    it('renders populated node in correct cell', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0, col_index: 2 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeEl = screen.getByTestId('explorer-node');
      expect(nodeEl).toHaveAttribute('data-level', '0');
      expect(nodeEl).toHaveAttribute('data-col-index', '2');
    });
  });

  describe('node selection and control visibility', () => {
    it('renders action rows hidden by default', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const actionRow = screen.getByTestId('explorer-action-row');
      expect(actionRow.classList.contains('explorer-cell-action-row--visible')).toBe(false);
    });

    it('reveals action row when node is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeEl = screen.getByTestId('explorer-node');
      await userEvent.click(nodeEl);

      const actionRow = screen.getByTestId('explorer-action-row');
      expect(actionRow.classList.contains('explorer-cell-action-row--visible')).toBe(true);
    });

    it('selected node controls include delete, swap, +Child, →TL', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeEl = screen.getByTestId('explorer-node');
      await userEvent.click(nodeEl);

      expect(screen.getByLabelText('Delete node')).toBeInTheDocument();
      expect(screen.getByLabelText('Swap track IDs')).toBeInTheDocument();
      expect(screen.getByTestId('child-add-btn')).toBeInTheDocument();
      expect(screen.getByLabelText('Add to Tracklist')).toBeInTheDocument();
    });

    it('hides +TL when track is already in tracklist', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes, tracklistTrackIds: new Set([10]) })} />);

      const nodeEl = screen.getByTestId('explorer-node');
      await userEvent.click(nodeEl);

      expect(screen.queryByLabelText('Add to Tracklist')).toBeNull();
    });
  });

  describe('edge selection and deletion', () => {
    it('renders transparent hitbox over each edge', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox');
      expect(hitboxes.length).toBe(1);
    });

    it('shows delete affordance when edge is clicked', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);

      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument();
    });

    it('calls onDeleteEdge when delete affordance is clicked', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);

      const deleteBtn = screen.getByTestId('explorer-edge-delete-btn');
      await userEvent.click(deleteBtn);

      expect(props.onDeleteEdge).toHaveBeenCalledWith(1);
    });
  });

  describe('adjacent-level drag-connect gating', () => {
    function simulateDrag(container: HTMLElement, source: Element, target: Element) {
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;
      fireEvent.mouseDown(source, { bubbles: true, clientX: 0, clientY: 40 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 20, clientY: 60 });
      fireEvent.mouseUp(target, { bubbles: true });
    }

    it('calls onAddEdge when dragging between adjacent levels (0→1)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeEls[0], nodeEls[1]);

      expect(props.onAddEdge).toHaveBeenCalledWith('n1', 'n2');
    });

    it('does not call onAddEdge when dragging between non-adjacent levels (0→2)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 2 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
        { id: 2, set_id: 1, tree_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeEls[0], nodeEls[2]);

      expect(props.onAddEdge).not.toHaveBeenCalled();
    });

    it('does not call onAddEdge when dragging between same-level nodes', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeEls[0], nodeEls[1]);

      expect(props.onAddEdge).not.toHaveBeenCalled();
    });

    it('renders dashed preview line during connect-drag over valid target', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 40 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 280 });

      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument();
    });

    it('does not call onAddEdge when edge already exists', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeEls[0], nodeEls[1]);

      expect(props.onAddEdge).not.toHaveBeenCalled();
    });

    it('does not call onAddEdge when reverse-direction edge already exists', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeEls[1], nodeEls[0]);

      expect(props.onAddEdge).not.toHaveBeenCalled();
    });

    it('treats the drag source as parent regardless of level position', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeEls[1], nodeEls[0]);

      expect(props.onAddEdge).toHaveBeenCalledWith('n2', 'n1');
    });
  });

  describe('background click clears selection', () => {
    it('clicking grid background clears node and edge selection', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const { container } = render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const nodeEl = screen.getAllByTestId('explorer-node')[0];
      await userEvent.click(nodeEl);
      expect(screen.getAllByTestId('explorer-action-row')[0].classList.contains('explorer-cell-action-row--visible')).toBe(true);

      const gridContent = container.querySelector('.explorer-grid-content');
      if (gridContent) await userEvent.click(gridContent);

      const actionRows = screen.getAllByTestId('explorer-action-row');
      for (const row of actionRows) {
        expect(row.classList.contains('explorer-cell-action-row--visible')).toBe(false);
      }
    });
  });

  describe('node title display', () => {
    it('strips metadata prefix from track title display', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      nodes[0].track = { id: 10, title: '[8A - Aminor - 128] My Track', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null };
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const titleEl = document.querySelector('.explorer-cell-title');
      expect(titleEl?.textContent).not.toContain('[8A');
      expect(titleEl?.textContent).toContain('My Track');
    });

    it('node uses title attribute for full text', () => {
      const longTitle = 'A'.repeat(80);
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      nodes[0].track = { id: 10, title: longTitle, artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null };
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeEl = screen.getByTestId('explorer-node');
      expect(nodeEl.getAttribute('title')).toBe(longTitle);
    });
  });

  describe('swap action', () => {
    it('activates swap mode when swap button is clicked', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeEls[0]);

      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);

      expect(screen.getByText('Click another node to swap')).toBeInTheDocument();
    });
  });

  describe('child-add flow', () => {
    it('opens match-driven child picker when +Child is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      await userEvent.click(screen.getByTestId('explorer-node'));

      const childBtns = screen.getAllByTestId('child-add-btn');
      await userEvent.click(childBtns[0]);

      expect(screen.getByTestId('child-add-modal')).toBeInTheDocument();
      expect(screen.getByText('Add Child')).toBeInTheDocument();
    });

    it('invokes onAddNode when a match is selected from child picker', async () => {
      const { fetchMatches } = await import('../api/http');
      (fetchMatches as ReturnType<typeof vi.fn>).mockResolvedValue([
        { candidate_id: 42, title: 'Picked Match', overall_score: 0.9, bucket: 'same_key', camelot_score: 1, bpm_score: 0.95, energy_score: 0.85, similarity_score: 0.75, freshness_score: 1, genre_similarity_score: 0.7, mood_continuity_score: 0.6, vocal_clash_score: 1, instrument_similarity_score: 0.5 },
      ]);

      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      const props = defaultProps({ nodes });
      render(<SetExplorerCanvas {...props} />);

      await userEvent.click(screen.getByTestId('explorer-node'));
      const childBtns = screen.getAllByTestId('child-add-btn');
      await userEvent.click(childBtns[0]);

      const matchItem = await screen.findByText('Picked Match');
      await userEvent.click(matchItem);

      expect(props.onAddNode).toHaveBeenCalledWith(42, 'n1', 1, undefined);
    });

    it('renders playback button for each match in child picker', async () => {
      const { fetchMatches } = await import('../api/http');
      (fetchMatches as ReturnType<typeof vi.fn>).mockResolvedValue([
        { candidate_id: 42, title: 'Match A', overall_score: 0.9, bucket: 'same_key', camelot_score: 1, bpm_score: 0.95, energy_score: 0.85, similarity_score: 0.75, freshness_score: 1, genre_similarity_score: 0.7, mood_continuity_score: 0.6, vocal_clash_score: 1, instrument_similarity_score: 0.5 },
        { candidate_id: 43, title: 'Match B', overall_score: 0.8, bucket: 'same_key', camelot_score: 1, bpm_score: 0.9, energy_score: 0.8, similarity_score: 0.7, freshness_score: 1, genre_similarity_score: 0.6, mood_continuity_score: 0.5, vocal_clash_score: 1, instrument_similarity_score: 0.4 },
      ]);

      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      await userEvent.click(screen.getByTestId('explorer-node'));
      const childBtns = screen.getAllByTestId('child-add-btn');
      await userEvent.click(childBtns[0]);

      const playBtns = await screen.findAllByTestId('child-match-play-btn');
      expect(playBtns.length).toBe(2);
      expect(playBtns[0]).toHaveAttribute('aria-label', 'Play');
    });
  });

  describe('delete action', () => {
    it('opens delete modal when delete action is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      await userEvent.click(screen.getByTestId('explorer-node'));

      const deleteBtns = screen.getAllByLabelText('Delete node');
      await userEvent.click(deleteBtns[0]);

      expect(screen.getByText('Delete Node')).toBeInTheDocument();
    });
  });

  describe('tracklist-add action', () => {
    it('calls onNodeToTracklist when +TL action is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      const props = defaultProps({ nodes });
      render(<SetExplorerCanvas {...props} />);

      await userEvent.click(screen.getByTestId('explorer-node'));

      const tlBtns = screen.getAllByLabelText('Add to Tracklist');
      await userEvent.click(tlBtns[0]);

      expect(props.onNodeToTracklist).toHaveBeenCalledWith('n1');
    });
  });

  describe('interaction mode isolation', () => {
    it('selecting an edge clears a pending swap source', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeEls[0]);
      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);
      expect(screen.getByText('Click another node to swap')).toBeInTheDocument();

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);

      expect(screen.queryByText('Click another node to swap')).toBeNull();
    });

    it('Escape clears both swap source and selected edge', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeEls[0]);
      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);
      expect(screen.getByText('Click another node to swap')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByText('Click another node to swap')).toBeNull();
    });
  });

  describe('swap-on-self protection', () => {
    it('does not call onSwap when clicking the same node that is swap source', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeEls[0]);

      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);
      expect(screen.getByText('Click another node to swap')).toBeInTheDocument();

      await userEvent.click(nodeEls[0]);

      expect(props.onSwap).not.toHaveBeenCalled();
      expect(screen.queryByText('Click another node to swap')).toBeNull();
    });

    it('calls onSwap when clicking a different node during swap mode', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeEls[0]);

      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);

      await userEvent.click(nodeEls[1]);

      expect(props.onSwap).toHaveBeenCalledWith('n1', 'n2');
    });
  });

  describe('edge score caching', () => {
    it('fetches edge scores when edges are present', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.85] });
      render(<SetExplorerCanvas {...props} />);

      await vi.waitFor(() => {
        expect(props.fetchEdgeScores).toHaveBeenCalledWith([[10, 11]]);
      });
    });

    it('does not re-fetch scores for already-cached edges on re-render', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.85] });
      const { rerender } = render(<SetExplorerCanvas {...props} />);

      await vi.waitFor(() => {
        expect(props.fetchEdgeScores).toHaveBeenCalledTimes(1);
      });

      rerender(<DndContext><SetExplorerCanvas {...props} /></DndContext>);

      await new Promise(r => setTimeout(r, 50));
      expect(props.fetchEdgeScores).toHaveBeenCalledTimes(1);
    });

    it('displays numeric score on edge label', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [85] });
      render(<SetExplorerCanvas {...props} />);

      const label = await screen.findByTestId('explorer-edge-label');
      expect(label.textContent).toBe('85');
    });
  });

  describe('cross-mode interaction isolation', () => {
    it('node click during connect-drag does not trigger swap', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 40 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 280 });
      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument();

      expect(props.onSwap).not.toHaveBeenCalled();
    });

    it('edge selection clears node selection', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeEls[0]);
      expect(screen.getAllByTestId('explorer-action-row')[0].classList.contains('explorer-cell-action-row--visible')).toBe(true);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);

      const actionRows = screen.getAllByTestId('explorer-action-row');
      for (const row of actionRows) {
        expect(row.classList.contains('explorer-cell-action-row--visible')).toBe(false);
      }
    });

    it('node selection clears edge selection', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument();

      const nodeEls = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeEls[0]);

      expect(screen.queryByTestId('explorer-edge-delete-btn')).toBeNull();
    });
  });

  describe('empty state', () => {
    it('renders cell-add buttons when no nodes exist (at least one level)', () => {
      render(<SetExplorerCanvas {...defaultProps()} />);
      const addBtns = screen.getAllByTestId('cell-add-btn');
      expect(addBtns.length).toBeGreaterThanOrEqual(5);
    });

    it('opens sibling-add modal from an empty cell add button', async () => {
      render(<SetExplorerCanvas {...defaultProps()} />);
      const addBtns = screen.getAllByTestId('cell-add-btn');
      await userEvent.click(addBtns[0]);
      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument();
    });

    it('does not render "Search to add root node" prompt', () => {
      render(<SetExplorerCanvas {...defaultProps()} />);
      expect(screen.queryByPlaceholderText('Search to add root node…')).toBeNull();
    });
  });

  describe('keyboard edge deletion', () => {
    it('deletes selected edge on Delete key', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Delete' });

      expect(props.onDeleteEdge).toHaveBeenCalledWith(42);
    });

    it('does not delete edge when Delete is pressed inside an input', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);

      const addBtns = screen.getAllByTestId('cell-add-btn');
      await userEvent.click(addBtns[0]);
      const input = screen.getByTestId('sibling-search-input');
      fireEvent.keyDown(input, { key: 'Delete', bubbles: true });

      expect(props.onDeleteEdge).not.toHaveBeenCalled();
    });
  });

  describe('connect-drag off-node cancel', () => {
    it('cancels drag silently when mouseUp is on grid (not on a node)', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 40 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 280 });
      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument();

      fireEvent.mouseUp(gridScroll);

      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
      expect(props.onAddEdge).not.toHaveBeenCalled();
    });
  });

  describe('multi-parent DAG dedup', () => {
    it('renders each node exactly once even when it has two parents', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
        { id: 2, set_id: 1, tree_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const renderedNodes = screen.getAllByTestId('explorer-node');
      expect(renderedNodes.length).toBe(3);
    });
  });

  describe('edge score styling', () => {
    it('edge color is derived from the child column index', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.75] });
      render(<SetExplorerCanvas {...props} />);

      const label = await screen.findByTestId('explorer-edge-label');
      expect(label.getAttribute('fill')).toBe(edgeColorForColumn(0));
    });

    it('parent with 3 children produces 3 distinct stroke colors', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1, col_index: 1 }),
        makeNode({ id: 4, node_id: 'n4', track_id: 13, level: 1, col_index: 2 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
        { id: 2, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
        { id: 3, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n4' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox');
      expect(hitboxes.length).toBe(3);
      const visiblePaths = hitboxes.map(h => h.nextElementSibling!);
      const strokes = visiblePaths.map(p => p.getAttribute('stroke'));
      expect(strokes[0]).toBe(edgeColorForColumn(0));
      expect(strokes[1]).toBe(edgeColorForColumn(1));
      expect(strokes[2]).toBe(edgeColorForColumn(2));
    });
  });

  describe('edge score loading state', () => {
    it('shows spinner while scores are loading', async () => {
      let resolveScores: (val: { scores: (number | null)[] }) => void;
      const scorePromise = new Promise<{ scores: (number | null)[] }>(resolve => {
        resolveScores = resolve;
      });
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockReturnValue(scorePromise);
      render(<SetExplorerCanvas {...props} />);

      await vi.waitFor(() => {
        expect(screen.getByTestId('explorer-score-spinner')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('explorer-edge-label')).toBeNull();

      await vi.runAllTimersAsync().catch(() => {});
      resolveScores!({ scores: [0.85] });
      await vi.waitFor(() => {
        expect(screen.getByTestId('explorer-edge-label')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('explorer-score-spinner')).toBeNull();
    });

    it('shows em dash for null score after loading completes', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [null] });
      render(<SetExplorerCanvas {...props} />);

      const label = await screen.findByTestId('explorer-edge-label');
      expect(label.textContent).toBe('—');
    });
  });

  describe('sibling-add modal copy', () => {
    it('uses user-facing row language instead of Level/Column', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0, col_index: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const addBtns = screen.getAllByTestId('cell-add-btn');
      await userEvent.click(addBtns[0]);

      const modal = screen.getByTestId('sibling-add-modal');
      const heading = modal.querySelector('h3')!;
      expect(heading.textContent).toContain('Row');
      expect(heading.textContent).not.toContain('Level');
      expect(heading.textContent).not.toContain('Column');
    });

    it('displays 1-based row number (level 0 → Row 1)', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0, col_index: 1 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const addBtns = screen.getAllByTestId('cell-add-btn');
      await userEvent.click(addBtns[0]);

      const modal = screen.getByTestId('sibling-add-modal');
      const heading = modal.querySelector('h3')!;
      expect(heading.textContent).toContain('Row 1');
      expect(heading.textContent).not.toContain('Row 0');
    });
  });

  describe('tree creation: subtree_copy passes sourceNodeId', () => {
    it('passes selectedNodeId as sourceNodeId when mode is subtree_copy', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      const onCreateTree = vi.fn().mockResolvedValue({ id: 2, set_id: 1, name: 'Sub' });
      const trees = [{ id: 1, set_id: 1, name: 'Main' }];
      render(
        <SetExplorerCanvas
          {...defaultProps({ nodes })}
          trees={trees}
          activeTreeId={1}
          onSelectTree={vi.fn()}
          onCreateTree={onCreateTree}
        />,
      );

      const nodeEl = screen.getByTestId('explorer-node');
      await userEvent.click(nodeEl);

      await userEvent.click(screen.getByTitle('Create new tree'));

      const modeSelect = screen.getByDisplayValue('Empty');
      await userEvent.selectOptions(modeSelect, 'subtree_copy');

      const nameInput = screen.getByPlaceholderText('Tree name…');
      await userEvent.type(nameInput, 'SubCopy');
      await userEvent.click(screen.getByText('Create'));

      expect(onCreateTree).toHaveBeenCalledWith('SubCopy', 'subtree_copy', 1, 'n1');
    });
  });

  describe('node move-drag (top-zone drag)', () => {
    function simulateMoveDrag(container: HTMLElement, source: Element, targetClientX: number, targetClientY: number) {
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;
      fireEvent.mouseDown(source, { bubbles: true, clientX: 0, clientY: 10 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: targetClientX, clientY: targetClientY });
      fireEvent.mouseUp(gridScroll, { bubbles: true });
    }

    it('renders move-drag preview line during top-zone drag', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEl = screen.getAllByTestId('explorer-node')[0];
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEl, { bubbles: true, clientX: 0, clientY: 10 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 20, clientY: 20 });

      expect(screen.getByTestId('move-drag-line')).toBeInTheDocument();
      expect(screen.getByTestId('move-drag-target')).toBeInTheDocument();
    });

    it('does NOT render connect-drag line during top-zone drag', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEl = screen.getAllByTestId('explorer-node')[0];
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEl, { bubbles: true, clientX: 0, clientY: 10 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 20, clientY: 20 });

      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
      expect(screen.getByTestId('move-drag-line')).toBeInTheDocument();
    });

    it('calls onMoveNode with target position when top-zone drag to empty cell', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEl = screen.getAllByTestId('explorer-node')[0];
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEl, { bubbles: true, clientX: 0, clientY: 10 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 500, clientY: 50 });
      fireEvent.mouseUp(gridScroll, { bubbles: true });

      expect(props.onMoveNode).toHaveBeenCalledWith('n1', 0, 1);
    });

    it('calls onMoveNode with new_parent when top-zone drag onto another node', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 10 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 590, clientY: 50 });
      fireEvent.mouseUp(gridScroll, { bubbles: true });

      expect(props.onMoveNode).toHaveBeenCalledWith('n1', undefined, undefined, 'n2');
    });

    it('does not call onMoveNode when dropping on self', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEl = screen.getAllByTestId('explorer-node')[0];
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEl, { bubbles: true, clientX: 0, clientY: 10 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 50 });
      fireEvent.mouseUp(gridScroll, { bubbles: true });

      expect(props.onMoveNode).not.toHaveBeenCalled();
    });

    it('rejects move-drag onto own descendant (cycle prevention)', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 10 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 260 });
      fireEvent.mouseUp(gridScroll, { bubbles: true });

      expect(props.onMoveNode).not.toHaveBeenCalled();
    });

    it('cancels move-drag cleanly when mouseUp is on grid background', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEl = screen.getAllByTestId('explorer-node')[0];
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEl, { bubbles: true, clientX: 0, clientY: 10 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 20, clientY: 20 });
      expect(screen.getByTestId('move-drag-line')).toBeInTheDocument();

      fireEvent.mouseUp(gridScroll, { bubbles: true });

      expect(screen.queryByTestId('move-drag-line')).toBeNull();
    });

    it('bottom-zone drag produces connect-drag line when over valid target', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 40 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 280 });

      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument();
      expect(screen.queryByTestId('move-drag-line')).toBeNull();
    });

    it('existing node click still works after move-drag is cancelled', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEl = screen.getAllByTestId('explorer-node')[0];
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEl, { bubbles: true, clientX: 0, clientY: 10 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 20, clientY: 20 });
      fireEvent.mouseUp(gridScroll, { bubbles: true });

      await userEvent.click(nodeEl);
      const actionRow = screen.getByTestId('explorer-action-row');
      expect(actionRow.classList.contains('explorer-cell-action-row--visible')).toBe(true);
    });
  });

  describe('drag hit-zone boundary', () => {
    it('drag at exactly 2/3 boundary starts connect-drag (bottom zone)', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 24 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 280 });

      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument();
      expect(screen.queryByTestId('move-drag-line')).toBeNull();
    });

    it('drag just above 2/3 boundary starts move-drag (top zone)', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEl = screen.getAllByTestId('explorer-node')[0];
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEl, { bubbles: true, clientX: 0, clientY: 23 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 20, clientY: 43 });

      expect(screen.getByTestId('move-drag-line')).toBeInTheDocument();
      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
    });
  });

  describe('phantom connect-drag suppression', () => {
    it('does not render connect-drag-line when bottom-zone drag is over empty grid space', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEl = screen.getAllByTestId('explorer-node')[0];
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEl, { bubbles: true, clientX: 0, clientY: 40 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 20, clientY: 60 });

      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
      expect(screen.queryByTestId('move-drag-line')).toBeNull();
    });

    it('shows preview only when hovering a valid adjacent-level node, hides when leaving', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 40 });

      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 20, clientY: 60 });
      expect(screen.queryByTestId('connect-drag-line')).toBeNull();

      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 280 });
      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument();

      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 1200, clientY: 280 });
      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
    });

    it('still creates edge on drop even when preview was not visible at drag start', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const edges: ExplorerEdge[] = [];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 40 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 20, clientY: 60 });
      expect(screen.queryByTestId('connect-drag-line')).toBeNull();

      fireEvent.mouseUp(nodeEls[1], { bubbles: true });

      expect(props.onAddEdge).toHaveBeenCalledWith('n1', 'n2');
    });

    it('suppresses preview when dragging in reverse direction over already-connected node', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[1], { bubbles: true, clientX: 0, clientY: 40 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 50 });

      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
    });

    it('suppresses preview when dragging over a node with an existing edge', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeEls = screen.getAllByTestId('explorer-node');
      const gridScroll = container.querySelector('.explorer-grid-scroll')!;

      fireEvent.mouseDown(nodeEls[0], { bubbles: true, clientX: 0, clientY: 40 });
      fireEvent.mouseMove(gridScroll, { bubbles: true, clientX: 100, clientY: 280 });

      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
    });
  });
});
