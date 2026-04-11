import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetExplorerCanvas } from './SetExplorerCanvas';
import type { ExplorerNode, ExplorerEdge } from '../types';
import { edgeColorForColumn } from '../utils/explorer';

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
    onNodeToTracklist: vi.fn(),
    onAddSibling: vi.fn().mockResolvedValue(null),
    tracklistTrackIds: overrides.tracklistTrackIds ?? new Set<number>(),
    fetchEdgeScores: vi.fn().mockResolvedValue({ scores: [] }),
  };
}

describe('SetExplorerCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('explorer-zoom');
  });

  describe('C1: per-level +Add Track control', () => {
    it('does not render per-node +Sibling button', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);
      expect(screen.queryByLabelText('Add sibling node')).toBeNull();
      expect(screen.queryByTestId('sibling-add-btn')).toBeNull();
    });

    it('renders one +Add Track per occupied level plus one extra for the next empty level', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const addBtns = screen.getAllByTestId('level-add-btn');
      expect(addBtns.length).toBe(3);
      expect(addBtns[0]).toHaveAttribute('data-level', '0');
      expect(addBtns[1]).toHaveAttribute('data-level', '1');
      expect(addBtns[2]).toHaveAttribute('data-level', '2');
    });

    it('renders two +Add Track buttons for a single root node (level 0 + extra level 1)', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const addBtns = screen.getAllByTestId('level-add-btn');
      expect(addBtns.length).toBe(2);
      expect(addBtns[0]).toHaveAttribute('data-level', '0');
      expect(addBtns[1]).toHaveAttribute('data-level', '1');
    });

    it('opens sibling-add modal when the extra deepest-level +Add Track is clicked', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const addBtns = screen.getAllByTestId('level-add-btn');
      const extraBtn = addBtns[addBtns.length - 1];
      expect(extraBtn).toHaveAttribute('data-level', '2');
      await userEvent.click(extraBtn);

      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument();
      expect(screen.getByTestId('sibling-search-input')).toBeInTheDocument();
    });

    it('opens sibling-add modal when +Add Track is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const addBtns = screen.getAllByTestId('level-add-btn');
      await userEvent.click(addBtns[0]);

      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument();
      expect(screen.getByTestId('sibling-search-input')).toBeInTheDocument();
    });
  });

  describe('C4: node selection and control visibility', () => {
    it('renders action rows hidden by default (no --visible class)', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const actionRow = screen.getByTestId('explorer-action-row');
      expect(actionRow.classList.contains('explorer-action-row--visible')).toBe(false);
    });

    it('reveals action row when node is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeGroup = screen.getByTestId('explorer-node');
      await userEvent.click(nodeGroup);

      const actionRow = screen.getByTestId('explorer-action-row');
      expect(actionRow.classList.contains('explorer-action-row--visible')).toBe(true);
    });

    it('selected node controls include delete, swap, +Child, →TL', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeGroup = screen.getByTestId('explorer-node');
      await userEvent.click(nodeGroup);

      expect(screen.getByLabelText('Delete node')).toBeInTheDocument();
      expect(screen.getByLabelText('Swap track IDs')).toBeInTheDocument();
      expect(screen.getByTestId('child-add-btn')).toBeInTheDocument();
      expect(screen.getByLabelText('Add to Tracklist')).toBeInTheDocument();
    });

    it('hides +TL when track is already in tracklist', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes, tracklistTrackIds: new Set([10]) })} />);

      const nodeGroup = screen.getByTestId('explorer-node');
      await userEvent.click(nodeGroup);

      expect(screen.queryByLabelText('Add to Tracklist')).toBeNull();
    });
  });

  describe('C3: edge selection and deletion', () => {
    it('renders transparent hitbox over each edge', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
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
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
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
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
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

  describe('C2: adjacent-level drag-connect gating', () => {
    function simulateDrag(container: HTMLElement, source: Element, target: Element) {
      const viewport = container.querySelector('.set-explorer-viewport')!;
      fireEvent.mouseDown(source, { bubbles: true, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 });
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

      const nodeGroups = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeGroups[0], nodeGroups[1]);

      expect(props.onAddEdge).toHaveBeenCalledWith('n1', 'n2');
    });

    it('does not call onAddEdge when dragging between non-adjacent levels (0→2)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 2 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
        { id: 2, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeGroups[0], nodeGroups[2]);

      expect(props.onAddEdge).not.toHaveBeenCalled();
    });

    it('does not call onAddEdge when dragging between same-level nodes', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeGroups[0], nodeGroups[1]);

      expect(props.onAddEdge).not.toHaveBeenCalled();
    });

    it('renders dashed preview line during connect-drag', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      const viewport = container.querySelector('.set-explorer-viewport')!;

      fireEvent.mouseDown(nodeGroups[0], { bubbles: true, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 });

      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument();
    });

    it('does not call onAddEdge when edge already exists (idempotent)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeGroups[0], nodeGroups[1]);

      expect(props.onAddEdge).not.toHaveBeenCalled();
    });

    it('repeated drag-connect to same target remains idempotent', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeGroups[0], nodeGroups[1]);
      simulateDrag(container, nodeGroups[0], nodeGroups[1]);
      simulateDrag(container, nodeGroups[0], nodeGroups[1]);

      expect(props.onAddEdge).not.toHaveBeenCalled();
    });

    it('treats the lower-level node as parent regardless of drag direction', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      simulateDrag(container, nodeGroups[1], nodeGroups[0]);

      expect(props.onAddEdge).toHaveBeenCalledWith('n1', 'n2');
    });
  });

  describe('interaction state isolation', () => {
    it('clicking SVG background clears node and edge selection', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const nodeGroup = screen.getAllByTestId('explorer-node')[0];
      await userEvent.click(nodeGroup);
      expect(screen.getAllByTestId('explorer-action-row')[0].classList.contains('explorer-action-row--visible')).toBe(true);

      const svg = document.querySelector('.set-explorer-svg');
      if (svg) await userEvent.click(svg);

      const actionRows = screen.getAllByTestId('explorer-action-row');
      for (const row of actionRows) {
        expect(row.classList.contains('explorer-action-row--visible')).toBe(false);
      }
    });
  });

  describe('preserved Contract 6 behavior', () => {
    it('displays raw track title without cleanTitle stripping', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      nodes[0].track = { id: 10, title: '[8A - Aminor - 128] My Track', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null };
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const titleEl = document.querySelector('.explorer-node-title');
      expect(titleEl?.textContent).toContain('[8A');
    });

    it('renders node rect at 360x48', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeGroup = screen.getAllByTestId('explorer-node')[0];
      const rects = nodeGroup.querySelectorAll('rect');
      const mainRect = Array.from(rects).find(r => r.getAttribute('width') === '360');
      expect(mainRect).toBeTruthy();
      expect(mainRect?.getAttribute('height')).toBe('48');
    });

    it('renders node title at fontSize 9', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const titleEl = document.querySelector('.explorer-node-title');
      expect(titleEl?.getAttribute('font-size')).toBe('9');
    });

    it('exposes full untruncated track title via SVG <title> element on each node', () => {
      const longTitle = 'A'.repeat(80);
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      nodes[0].track = { id: 10, title: longTitle, artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null };
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeGroup = screen.getByTestId('explorer-node');
      const svgTitle = nodeGroup.querySelector(':scope > title');
      expect(svgTitle).toBeTruthy();
      expect(svgTitle?.textContent).toBe(longTitle);

      const visibleText = document.querySelector('.explorer-node-title');
      expect(visibleText?.textContent).not.toBe(longTitle);
      expect(visibleText?.textContent?.endsWith('…')).toBe(true);
    });

    it('SVG <title> matches visible text when title is short enough', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      nodes[0].track = { id: 10, title: 'Short Title', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null };
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeGroup = screen.getByTestId('explorer-node');
      const svgTitle = nodeGroup.querySelector(':scope > title');
      expect(svgTitle?.textContent).toBe('Short Title');

      const visibleText = document.querySelector('.explorer-node-title');
      expect(visibleText?.textContent).toBe('Short Title');
    });
  });

  describe('swap action', () => {
    it('activates swap mode when swap button is clicked', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeGroups[0]);

      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);

      expect(screen.getByText('Click another node to swap')).toBeInTheDocument();
    });
  });

  describe('child-add flow (+Child match picker)', () => {
    it('opens match-driven child picker (not search) when +Child is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      await userEvent.click(screen.getByTestId('explorer-node'));

      const childBtns = screen.getAllByTestId('child-add-btn');
      await userEvent.click(childBtns[0]);

      expect(screen.getByTestId('child-add-modal')).toBeInTheDocument();
      expect(screen.getByText('Add Child')).toBeInTheDocument();
      expect(screen.queryByTestId('child-search-input')).toBeNull();
    });

    it('shows loading state then match results', async () => {
      const { fetchMatches } = await import('../api/http');
      (fetchMatches as ReturnType<typeof vi.fn>).mockResolvedValue([
        { candidate_id: 99, title: 'Match Track', overall_score: 0.85, bucket: 'same_key', camelot_score: 1, bpm_score: 0.9, energy_score: 0.8, similarity_score: 0.7, freshness_score: 1, genre_similarity_score: 0.6, mood_continuity_score: 0.5, vocal_clash_score: 1, instrument_similarity_score: 0.4 },
      ]);

      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      await userEvent.click(screen.getByTestId('explorer-node'));
      const childBtns = screen.getAllByTestId('child-add-btn');
      await userEvent.click(childBtns[0]);

      const matchItem = await screen.findByText('Match Track');
      expect(matchItem).toBeInTheDocument();
      expect(fetchMatches).toHaveBeenCalledWith(10);
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

      expect(props.onAddNode).toHaveBeenCalledWith(42, 'n1', 1);
    });

    it('shows empty message when no matches are returned', async () => {
      const { fetchMatches } = await import('../api/http');
      (fetchMatches as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      await userEvent.click(screen.getByTestId('explorer-node'));
      const childBtns = screen.getAllByTestId('child-add-btn');
      await userEvent.click(childBtns[0]);

      await screen.findByText('No matches found.');
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
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeGroups[0]);
      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);
      expect(screen.getByText('Click another node to swap')).toBeInTheDocument();

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);

      expect(screen.queryByText('Click another node to swap')).toBeNull();
    });

    it('starting swap mode clears a selected edge', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument();

      const nodeGroups = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeGroups[0]);
      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);

      expect(screen.queryByTestId('explorer-edge-delete-btn')).toBeNull();
    });

    it('opening level-add clears a selected edge', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument();

      const addBtns = screen.getAllByTestId('level-add-btn');
      await userEvent.click(addBtns[0]);

      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('explorer-edge-delete-btn')).toBeNull();
    });

    it('opening level-add clears a pending swap source', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeGroups[0]);
      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);
      expect(screen.getByText('Click another node to swap')).toBeInTheDocument();

      const addBtns = screen.getAllByTestId('level-add-btn');
      await userEvent.click(addBtns[0]);

      expect(screen.queryByText('Click another node to swap')).toBeNull();
    });

    it('Escape clears both swap source and selected edge', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      await userEvent.click(nodeGroups[0]);
      const swapBtns = screen.getAllByLabelText('Swap track IDs');
      await userEvent.click(swapBtns[0]);
      expect(screen.getByText('Click another node to swap')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByText('Click another node to swap')).toBeNull();
    });

    it('swap click on same node does not call onSwap', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
      ];
      const props = defaultProps({ nodes });
      render(<SetExplorerCanvas {...props} />);

      const nodeGroup = screen.getByTestId('explorer-node');
      await userEvent.click(nodeGroup);
      const swapBtn = screen.getByLabelText('Swap track IDs');
      await userEvent.click(swapBtn);

      await userEvent.click(nodeGroup);

      expect(props.onSwap).not.toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no nodes exist', () => {
      render(<SetExplorerCanvas {...defaultProps()} />);
      expect(screen.getByText(/Explorer is empty/)).toBeInTheDocument();
    });

    it('renders a level-0 +Add Track button even when explorer is empty', () => {
      render(<SetExplorerCanvas {...defaultProps()} />);
      const addBtn = screen.getByTestId('level-add-btn');
      expect(addBtn).toBeInTheDocument();
      expect(addBtn).toHaveAttribute('data-level', '0');
    });

    it('opens sibling-add modal from the empty-state add button', async () => {
      render(<SetExplorerCanvas {...defaultProps()} />);
      const addBtn = screen.getByTestId('level-add-btn');
      await userEvent.click(addBtn);
      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument();
    });
  });

  describe('keyboard edge deletion', () => {
    it('deletes selected edge on Delete key', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);

      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Delete' });

      expect(props.onDeleteEdge).toHaveBeenCalledWith(42);
    });

    it('deletes selected edge on Backspace key', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 7, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);

      fireEvent.keyDown(window, { key: 'Backspace' });

      expect(props.onDeleteEdge).toHaveBeenCalledWith(7);
    });

    it('does not delete edge when Delete is pressed inside an input', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument();

      const input = document.querySelector('.set-explorer-search') as HTMLInputElement;
      fireEvent.keyDown(input, { key: 'Delete', bubbles: true });

      expect(props.onDeleteEdge).not.toHaveBeenCalled();
    });

    it('does not delete edge when Backspace is pressed inside an input', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      render(<SetExplorerCanvas {...props} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);

      const input = document.querySelector('.set-explorer-search') as HTMLInputElement;
      fireEvent.keyDown(input, { key: 'Backspace', bubbles: true });

      expect(props.onDeleteEdge).not.toHaveBeenCalled();
    });

    it('does not delete edge when Delete/Backspace originates from a textarea', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      await userEvent.click(hitbox);
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument();

      const textarea = document.createElement('textarea');
      container.appendChild(textarea);

      fireEvent.keyDown(textarea, { key: 'Delete', bubbles: true });
      fireEvent.keyDown(textarea, { key: 'Backspace', bubbles: true });

      expect(props.onDeleteEdge).not.toHaveBeenCalled();

      container.removeChild(textarea);
    });
  });

  describe('connect-drag off-node cancel', () => {
    it('cancels drag silently when mouseUp is on viewport (not on a node)', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      const viewport = container.querySelector('.set-explorer-viewport')!;

      fireEvent.mouseDown(nodeGroups[0], { bubbles: true, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 });

      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument();

      fireEvent.mouseUp(viewport);

      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
      expect(props.onAddEdge).not.toHaveBeenCalled();
    });
  });

  describe('plain-click-no-drag behavior', () => {
    it('plain click selects node without showing connect-drag line', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeGroup = screen.getByTestId('explorer-node');
      await userEvent.click(nodeGroup);

      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
      expect(screen.getByTestId('explorer-action-row').classList.contains('explorer-action-row--visible')).toBe(true);
    });

    it('non-left-button mouseDown does not start connect-drag', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const props = defaultProps({ nodes });
      const { container } = render(<SetExplorerCanvas {...props} />);

      const nodeGroups = screen.getAllByTestId('explorer-node');
      const viewport = container.querySelector('.set-explorer-viewport')!;

      fireEvent.mouseDown(nodeGroups[0], { bubbles: true, button: 2, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 });

      expect(screen.queryByTestId('connect-drag-line')).toBeNull();
    });

    it('pan works immediately after a plain node click', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      const { container } = render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const nodeGroup = screen.getByTestId('explorer-node');
      await userEvent.click(nodeGroup);

      const svg = container.querySelector('.set-explorer-svg')!;
      fireEvent.mouseDown(svg, { bubbles: true, clientX: 100, clientY: 100 });
      fireEvent.mouseMove(container.querySelector('.set-explorer-viewport')!, { bubbles: true, clientX: 120, clientY: 120 });
      fireEvent.mouseUp(container.querySelector('.set-explorer-viewport')!);

      const transform = svg.getAttribute('style') ?? (svg as HTMLElement).style.transform;
      expect(transform).toBeTruthy();
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
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
        { id: 2, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const renderedNodes = screen.getAllByTestId('explorer-node');
      expect(renderedNodes.length).toBe(3);
    });
  });

  describe('C2: edge score styling and fixed-slot geometry', () => {
    const NODE_W = 360;
    const NODE_H = 48;
    const V_GAP = 176;
    const SLOT_W = 390;
    const TOP_PAD = 24 + 8;
    const EDGE_PAD = 40;
    const EDGE_SLOTS = 5;
    const LANE_STUB = 10;
    const LANE_S = 6;
    const SLOT_STEP = 10;
    const BUCKET_GAP = 8;

    function parentX(col: number) { return col * SLOT_W + (SLOT_W - NODE_W) / 2; }
    function parentCX(col: number) { return parentX(col) + NODE_W / 2; }
    function parentBottom(level: number) { return TOP_PAD + level * (NODE_H + V_GAP) + NODE_H; }
    function nodeSlotX25(nodeX: number, laneIndex: number) {
      const bucket = Math.floor(laneIndex / EDGE_SLOTS);
      const slot = laneIndex % EDGE_SLOTS;
      return nodeX + EDGE_PAD + bucket * (EDGE_SLOTS * SLOT_STEP + BUCKET_GAP) + slot * SLOT_STEP;
    }

    it('edge color is derived from the child column index', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.75] });
      render(<SetExplorerCanvas {...props} />);

      const label = await screen.findByTestId('explorer-edge-label');
      expect(label.getAttribute('fill')).toBe(edgeColorForColumn(0));
    });

    it('parent with 3 children produces 3 distinct stroke colors keyed off child columns', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1, col_index: 1 }),
        makeNode({ id: 4, node_id: 'n4', track_id: 13, level: 1, col_index: 2 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
        { id: 2, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
        { id: 3, set_id: 1, parent_node_id: 'n1', child_node_id: 'n4' },
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

    it('score label has explorer-edge-label class for opacity styling', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.85] });
      render(<SetExplorerCanvas {...props} />);

      const label = await screen.findByTestId('explorer-edge-label');
      expect(label.classList.contains('explorer-edge-label')).toBe(true);
    });

    it('score label is positioned just above child node entry slot (childTop - 8)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.85] });
      render(<SetExplorerCanvas {...props} />);

      const label = await screen.findByTestId('explorer-edge-label');
      const labelYVal = parseFloat(label.getAttribute('y')!);
      // childTop for level 1 = TOP_PAD + 1 * (NODE_H + V_GAP)
      const childTop = TOP_PAD + 1 * (NODE_H + V_GAP);
      expect(labelYVal).toBeCloseTo(childTop - 8, 0);
    });

    it('score label uses textAnchor=end, immediately left of the arrival vertical stub', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.85] });
      render(<SetExplorerCanvas {...props} />);

      const label = await screen.findByTestId('explorer-edge-label');
      expect(label.getAttribute('text-anchor')).toBe('end');
      // labelX = endX - 10, where endX = nodeSlotX(childX, laneIndex)
      const childX = parentX(0); // n2 is col 0
      const laneIndex = 0 * EDGE_SLOTS + 0;
      const endX = nodeSlotX25(childX, laneIndex);
      const labelXVal = parseFloat(label.getAttribute('x')!);
      expect(labelXVal).toBeCloseTo(endX - 10, 1);
    });

    it('edges from same parent to different children use distinct child-column-based slots', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1, col_index: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
        { id: 2, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox');
      expect(hitboxes.length).toBe(2);
      const d1 = hitboxes[0].getAttribute('d')!;
      const d2 = hitboxes[1].getAttribute('d')!;
      const startX1 = parseFloat(d1.split(' ')[1]);
      const startX2 = parseFloat(d2.split(' ')[1]);
      // parent col 0 → child col 0: laneIndex=0; parent col 0 → child col 1: laneIndex=1
      expect(startX1).toBeCloseTo(nodeSlotX25(parentX(0), 0), 1);
      expect(startX2).toBeCloseTo(nodeSlotX25(parentX(0), 1), 1);
      expect(startX1).not.toBe(startX2);
    });

    it('edge slot is determined by child column index', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1, col_index: 0 }),
        makeNode({ id: 4, node_id: 'n4', track_id: 13, level: 1, col_index: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
        { id: 2, set_id: 1, parent_node_id: 'n2', child_node_id: 'n4' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox');
      const d1 = hitboxes[0].getAttribute('d')!;
      const d2 = hitboxes[1].getAttribute('d')!;
      const startX1 = parseFloat(d1.split(' ')[1]);
      const startX2 = parseFloat(d2.split(' ')[1]);
      // n1(col 0)→n3(col 0): laneIndex=0*5+0=0; n2(col 1)→n4(col 1): laneIndex=1*5+1=6
      expect(startX1).toBeCloseTo(nodeSlotX25(parentX(0), 0), 1);
      expect(startX2).toBeCloseTo(nodeSlotX25(parentX(1), 6), 1);
    });

    it('child entry uses slot-aligned position, not child center', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      const d = hitbox.getAttribute('d')!;
      const parts = d.split(' ');
      const endX = parseFloat(parts[parts.length - 2]);
      const childNodeX = parentX(0);
      // n1(col 0)→n2(col 0): laneIndex=0, endX = nodeSlotX25(childNodeX, 0)
      const expectedEndX = nodeSlotX25(childNodeX, 0);
      expect(endX).toBeCloseTo(expectedEndX, 1);
    });

    it('edges from 5 different columns use all 5 distinct slot positions', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 0, col_index: 2 }),
        makeNode({ id: 4, node_id: 'n4', track_id: 13, level: 0, col_index: 3 }),
        makeNode({ id: 5, node_id: 'n5', track_id: 14, level: 0, col_index: 4 }),
        makeNode({ id: 6, node_id: 'n6', track_id: 15, level: 1, col_index: 0 }),
        makeNode({ id: 7, node_id: 'n7', track_id: 16, level: 1, col_index: 1 }),
        makeNode({ id: 8, node_id: 'n8', track_id: 17, level: 1, col_index: 2 }),
        makeNode({ id: 9, node_id: 'n9', track_id: 18, level: 1, col_index: 3 }),
        makeNode({ id: 10, node_id: 'n10', track_id: 19, level: 1, col_index: 4 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n6' },
        { id: 2, set_id: 1, parent_node_id: 'n2', child_node_id: 'n7' },
        { id: 3, set_id: 1, parent_node_id: 'n3', child_node_id: 'n8' },
        { id: 4, set_id: 1, parent_node_id: 'n4', child_node_id: 'n9' },
        { id: 5, set_id: 1, parent_node_id: 'n5', child_node_id: 'n10' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox');
      const starts = hitboxes.map(h => parseFloat(h.getAttribute('d')!.split(' ')[1]));
      const uniqueStarts = new Set(starts.map(s => Math.round(s)));
      expect(uniqueStarts.size).toBe(5);
    });

    it('endX uses laneIndex = parentColIdx * 5 + childColIdx (25-slot system)', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      const d = hitbox.getAttribute('d')!;
      const parts = d.split(' ');
      const endX = parseFloat(parts[10]);
      const childNodeX = parentX(0);
      // n2(col 1)→n3(col 0): laneIndex = 1*5+0 = 5
      const expectedEndX = nodeSlotX25(childNodeX, 5);
      expect(endX).toBeCloseTo(expectedEndX, 1);
    });

    it('laneY = parentBottom + LANE_STUB + laneIndex * LANE_S for a known edge', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0, col_index: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 0, col_index: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1, col_index: 0 }),
        makeNode({ id: 4, node_id: 'n4', track_id: 13, level: 1, col_index: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      const d = hitbox.getAttribute('d')!;
      const parts = d.split(' ');
      const laneYFromPath = parseFloat(parts[5]);
      const parentColIdx = 1;
      const childColIdx = 0;
      const laneIndex = parentColIdx * EDGE_SLOTS + childColIdx;
      const expectedLaneY = parentBottom(0) + LANE_STUB + laneIndex * LANE_S;
      expect(laneYFromPath).toBeCloseTo(expectedLaneY, 1);
    });

    it('same-column parent and child produce startX == endX (straight vertical)', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      const hitbox = screen.getByTestId('explorer-edge-hitbox');
      const d = hitbox.getAttribute('d')!;
      const parts = d.split(' ');
      const startX = parseFloat(parts[1]);
      const endX = parseFloat(parts[10]);
      expect(startX).toBe(endX);
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
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
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
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const props = defaultProps({ nodes, edges });
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [null] });
      render(<SetExplorerCanvas {...props} />);

      const label = await screen.findByTestId('explorer-edge-label');
      expect(label.textContent).toBe('—');
    });

    it('shows no spinner or label before fetch begins', () => {
      const nodes = [makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      expect(screen.queryByTestId('explorer-score-spinner')).toBeNull();
      expect(screen.queryByTestId('explorer-edge-label')).toBeNull();
    });
  });

  describe('edge score caching', () => {
    it('only fetches scores for uncached edges when new edges are added', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1, col_index: 0 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1, col_index: 1 }),
      ];
      const edges1: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const fetchScores = vi.fn()
        .mockResolvedValueOnce({ scores: [0.85] })
        .mockResolvedValueOnce({ scores: [0.72] });

      const props = { ...defaultProps({ nodes, edges: edges1 }), fetchEdgeScores: fetchScores };
      const { rerender } = render(<SetExplorerCanvas {...props} />);

      await screen.findByTestId('explorer-edge-label');
      expect(fetchScores).toHaveBeenCalledTimes(1);
      expect(fetchScores).toHaveBeenCalledWith([[10, 11]]);

      const edges2: ExplorerEdge[] = [
        ...edges1,
        { id: 2, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
      ];
      rerender(<SetExplorerCanvas {...{ ...props, edges: edges2 }} />);

      await vi.waitFor(() => {
        expect(fetchScores).toHaveBeenCalledTimes(2);
      });
      expect(fetchScores).toHaveBeenLastCalledWith([[10, 12]]);
    });

    it('starting a connect-drag does not trigger score refetch', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      const fetchScores = vi.fn().mockResolvedValue({ scores: [0.85] });
      const props = { ...defaultProps({ nodes, edges }), fetchEdgeScores: fetchScores };
      const { container } = render(<SetExplorerCanvas {...props} />);

      await screen.findByTestId('explorer-edge-label');
      const callCount = fetchScores.mock.calls.length;

      const nodeGroups = screen.getAllByTestId('explorer-node');
      const viewport = container.querySelector('.set-explorer-viewport')!;
      fireEvent.mouseDown(nodeGroups[0], { bubbles: true, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 });

      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument();
      expect(fetchScores.mock.calls.length).toBe(callCount);

      fireEvent.mouseUp(viewport);
    });
  });

  describe('zoom persistence', () => {
    it('restores zoom from localStorage on mount', () => {
      localStorage.setItem('explorer-zoom', '1.5');
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);
      const svg = document.querySelector('.set-explorer-svg') as HTMLElement;
      expect(svg.style.transform).toContain('scale(1.5)');
    });

    it('falls back to default zoom for invalid stored value', () => {
      localStorage.setItem('explorer-zoom', 'not-a-number');
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);
      const svg = document.querySelector('.set-explorer-svg') as HTMLElement;
      expect(svg.style.transform).toContain('scale(1)');
    });

    it('falls back to default zoom when value is out of range', () => {
      localStorage.setItem('explorer-zoom', '10');
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);
      const svg = document.querySelector('.set-explorer-svg') as HTMLElement;
      expect(svg.style.transform).toContain('scale(1)');
    });

    it('persists zoom to localStorage on ctrl+wheel', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      const { container } = render(<SetExplorerCanvas {...defaultProps({ nodes })} />);
      const viewport = container.querySelector('.set-explorer-viewport')!;
      fireEvent.wheel(viewport, { deltaY: -100, ctrlKey: true });
      const stored = localStorage.getItem('explorer-zoom');
      expect(stored).not.toBeNull();
      expect(parseFloat(stored!)).toBeCloseTo(1.1, 1);
    });
  });
});
