import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetExplorerCanvas } from './SetExplorerCanvas';
import type { ExplorerNode, ExplorerEdge } from '../types';

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([
    { id: 99, title: 'Search Result', artist_names: [], bpm: 130, key: 'A', camelot_code: '11B' },
  ]),
}));

function makeNode(overrides: Partial<ExplorerNode> & { node_id: string; track_id: number; level: number }): ExplorerNode {
  return {
    id: 1,
    set_id: 1,
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
  });

  describe('action row rendering', () => {
    it('renders a consolidated action row with all expected actions per node', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      expect(screen.getAllByLabelText('Delete node').length).toBe(1);
      expect(screen.getAllByLabelText('Swap with another node').length).toBe(1);
      expect(screen.getAllByTestId('sibling-add-btn').length).toBe(1);
      expect(screen.getAllByTestId('child-add-btn').length).toBe(1);
      expect(screen.getAllByLabelText('Add to Tracklist').length).toBe(1);
    });

    it('hides +TL action when track is already in tracklist', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes, tracklistTrackIds: new Set([10]) })} />);

      expect(screen.queryByLabelText('Add to Tracklist')).toBeNull();
      expect(screen.getAllByLabelText('Delete node').length).toBe(1);
    });

    it('uses ⇄ glyph for swap with descriptive title', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const swapBtns = screen.getAllByLabelText('Swap with another node');
      expect(swapBtns.length).toBe(1);
      expect(swapBtns[0].querySelector('title')?.textContent).toBe('Swap with another node');
      expect(swapBtns[0].textContent).toContain('⇄');
    });

    it('uses +Sibling and +Child labels instead of +Sib/+Ch', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const sibBtns = screen.getAllByLabelText('Add sibling node');
      expect(sibBtns[0].textContent).toContain('+Sibling');

      const childBtns = screen.getAllByLabelText('Add child node');
      expect(childBtns[0].textContent).toContain('+Child');
    });

    it('uses →TL label for tracklist add action', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const tlBtns = screen.getAllByLabelText('Add to Tracklist');
      expect(tlBtns[0].textContent).toContain('→TL');
    });

    it('action buttons have role="button" and are keyboard-focusable', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const deleteBtn = screen.getAllByLabelText('Delete node')[0];
      expect(deleteBtn).toHaveAttribute('role', 'button');
      expect(deleteBtn).toHaveAttribute('tabindex', '0');
    });

    it('action buttons activate on Enter and Space key', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      const props = defaultProps({ nodes });
      render(<SetExplorerCanvas {...props} />);

      const tlBtn = screen.getAllByLabelText('Add to Tracklist')[0];
      fireEvent.keyDown(tlBtn, { key: 'Enter' });
      expect(props.onNodeToTracklist).toHaveBeenCalledWith('n1');

      props.onNodeToTracklist.mockClear();
      fireEvent.keyDown(tlBtn, { key: ' ' });
      expect(props.onNodeToTracklist).toHaveBeenCalledWith('n1');
    });

    it('action controls carry an explicit title attribute for hover text', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const deleteBtn = screen.getAllByLabelText('Delete node')[0];
      expect(deleteBtn).toHaveAttribute('title', 'Delete node');

      const swapBtn = screen.getAllByLabelText('Swap with another node')[0];
      expect(swapBtn).toHaveAttribute('title', 'Swap with another node');

      const sibBtn = screen.getAllByLabelText('Add sibling node')[0];
      expect(sibBtn).toHaveAttribute('title', 'Add sibling node');

      const childBtn = screen.getAllByLabelText('Add child node')[0];
      expect(childBtn).toHaveAttribute('title', 'Add child node');

      const tlBtn = screen.getAllByLabelText('Add to Tracklist')[0];
      expect(tlBtn).toHaveAttribute('title', 'Add to Tracklist');
    });

    it('action fills reference CSS variable tokens not raw hex', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const deleteBtn = screen.getAllByLabelText('Delete node')[0];
      const deleteRect = deleteBtn.querySelector('rect');
      expect(deleteRect).toBeTruthy();

      const sibBtn = screen.getAllByLabelText('Add sibling node')[0];
      const sibText = sibBtn.querySelector('text');
      expect(sibText?.getAttribute('fill')).toBe('var(--success)');
    });

    it('action buttons use 24px height baseline', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const deleteBtn = screen.getAllByLabelText('Delete node')[0];
      const rect = deleteBtn.querySelector('rect');
      expect(rect?.getAttribute('height')).toBe('24');

      const sibBtn = screen.getAllByLabelText('Add sibling node')[0];
      const sibRect = sibBtn.querySelector('rect');
      expect(sibRect?.getAttribute('height')).toBe('24');
    });

    it('worst-case 5-action row does not overflow node width', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const actionRow = screen.getAllByLabelText('Delete node')[0]
        .closest('.explorer-action-row');
      expect(actionRow).toBeTruthy();

      const transform = actionRow!.getAttribute('transform');
      const match = transform?.match(/translate\(([^,]+),/);
      expect(match).toBeTruthy();
      const xOffset = parseFloat(match![1]);
      expect(xOffset).toBeGreaterThanOrEqual(0);
    });

    it('renders multiple action rows for multiple nodes', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ];
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ];
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />);

      expect(screen.getAllByLabelText('Delete node').length).toBe(2);
      expect(screen.getAllByTestId('child-add-btn').length).toBe(2);
    });
  });

  describe('delete action', () => {
    it('opens delete modal when delete action is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const deleteBtns = screen.getAllByLabelText('Delete node');
      await userEvent.click(deleteBtns[0]);

      expect(screen.getByText('Delete Node')).toBeInTheDocument();
    });
  });

  describe('child-add flow', () => {
    it('opens child-add modal when child-add button is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />);

      const childBtns = screen.getAllByTestId('child-add-btn');
      await userEvent.click(childBtns[0]);

      expect(screen.getByTestId('child-add-modal')).toBeInTheDocument();
      expect(screen.getByText('Add Child')).toBeInTheDocument();
      expect(screen.getByTestId('child-search-input')).toBeInTheDocument();
    });

    it('invokes onAddNode with parent context when a child search result is selected', async () => {
      const { searchTracks } = await import('../api/http');
      (searchTracks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 99, title: 'Child Track', artist_names: [], bpm: 130, key: 'A', camelot_code: '11B' },
      ]);

      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      const props = defaultProps({ nodes });
      render(<SetExplorerCanvas {...props} />);

      const childBtns = screen.getAllByTestId('child-add-btn');
      await userEvent.click(childBtns[0]);

      const searchInput = screen.getByTestId('child-search-input');
      await userEvent.type(searchInput, 'child');

      const resultItem = await screen.findByText('Child Track');
      fireEvent.mouseDown(resultItem);

      expect(props.onAddNode).toHaveBeenCalledWith(99, 'n1', 1);
    });

    it('closes child-add modal after selection', async () => {
      const { searchTracks } = await import('../api/http');
      (searchTracks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 99, title: 'Child Track', artist_names: [], bpm: 130, key: 'A', camelot_code: '11B' },
      ]);

      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      const props = defaultProps({ nodes });
      render(<SetExplorerCanvas {...props} />);

      await userEvent.click(screen.getAllByTestId('child-add-btn')[0]);
      await userEvent.type(screen.getByTestId('child-search-input'), 'child');
      fireEvent.mouseDown(await screen.findByText('Child Track'));

      expect(screen.queryByTestId('child-add-modal')).toBeNull();
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

      const swapBtns = screen.getAllByLabelText('Swap with another node');
      await userEvent.click(swapBtns[0]);

      expect(screen.getByText('Click another node to swap')).toBeInTheDocument();
    });
  });

  describe('tracklist-add action', () => {
    it('calls onNodeToTracklist when +TL action is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })];
      const props = defaultProps({ nodes });
      render(<SetExplorerCanvas {...props} />);

      const tlBtns = screen.getAllByLabelText('Add to Tracklist');
      await userEvent.click(tlBtns[0]);

      expect(props.onNodeToTracklist).toHaveBeenCalledWith('n1');
    });
  });

  describe('empty state', () => {
    it('shows empty message when no nodes exist', () => {
      render(<SetExplorerCanvas {...defaultProps()} />);
      expect(screen.getByText(/Explorer is empty/)).toBeInTheDocument();
    });
  });
});
