import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DerivedExplorerView } from './DerivedExplorerView';
import type { DerivedExplorerNode, Track } from '../types';

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    track: null, playing: false, loading: false, currentTime: 0, duration: 0,
    volume: 0.8, error: null, play: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    togglePlayPause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), stop: vi.fn(),
  }),
}));

function makeTrack(id: number, overrides?: Partial<Track>): Track {
  return {
    id,
    title: `Track ${id}`,
    artist_names: [],
    bpm: 128,
    key: 'Aminor',
    camelot_code: '8A',
    genre: null,
    label: null,
    energy: null,
    date_added: null,
    ...overrides,
  };
}

function makeNode(overrides: Partial<DerivedExplorerNode> & { slot_id: number; candidate_id: number; track_id: number }): DerivedExplorerNode {
  return {
    level: 0,
    position: 0,
    col_index: 0,
    is_selected: false,
    track: makeTrack(overrides.track_id),
    ...overrides,
  };
}

function defaultProps(overrides?: Partial<React.ComponentProps<typeof DerivedExplorerView>>) {
  return {
    nodes: [] as DerivedExplorerNode[],
    trackMap: new Map<number, Track>(),
    versionId: 1,
    onSelectCandidate: vi.fn(),
    onRemoveCandidate: vi.fn(),
    onRemoveSlot: vi.fn(),
    ...overrides,
  };
}

describe('DerivedExplorerView', () => {
  it('renders empty message when no nodes', () => {
    render(<DerivedExplorerView {...defaultProps()} />);
    expect(screen.getByText(/no derived explorer nodes/i)).toBeTruthy();
  });

  it('renders derived nodes in a table', () => {
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, level: 0, col_index: 0, is_selected: true }),
      makeNode({ slot_id: 1, candidate_id: 11, track_id: 101, level: 0, col_index: 1, is_selected: false }),
      makeNode({ slot_id: 2, candidate_id: 20, track_id: 200, level: 1, col_index: 0, is_selected: true }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes })} />);
    const rows = screen.getAllByTestId('derived-explorer-row');
    expect(rows).toHaveLength(3);
  });

  it('distinguishes selected vs non-selected nodes with CSS classes', () => {
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, is_selected: true }),
      makeNode({ slot_id: 1, candidate_id: 11, track_id: 101, is_selected: false, col_index: 1 }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes })} />);
    const rows = screen.getAllByTestId('derived-explorer-row');

    expect(rows[0].classList.contains('derived-explorer-row--selected')).toBe(true);
    expect(rows[0].classList.contains('derived-explorer-row--candidate')).toBe(false);

    expect(rows[1].classList.contains('derived-explorer-row--candidate')).toBe(true);
    expect(rows[1].classList.contains('derived-explorer-row--selected')).toBe(false);
  });

  it('shows "selected" tag only for selected nodes', () => {
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, is_selected: true }),
      makeNode({ slot_id: 1, candidate_id: 11, track_id: 101, is_selected: false, col_index: 1 }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes })} />);
    const tags = screen.getAllByTestId('derived-selected-tag');
    expect(tags).toHaveLength(1);
  });

  it('shows Select button only for non-selected nodes', () => {
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, is_selected: true }),
      makeNode({ slot_id: 1, candidate_id: 11, track_id: 101, is_selected: false, col_index: 1 }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes })} />);

    expect(screen.queryByTestId('derived-select-10')).toBeNull();
    expect(screen.getByTestId('derived-select-11')).toBeTruthy();
  });

  it('calls onSelectCandidate when Select is clicked', () => {
    const onSelectCandidate = vi.fn();
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 11, track_id: 101, is_selected: false }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes, onSelectCandidate })} />);

    fireEvent.click(screen.getByTestId('derived-select-11'));
    expect(onSelectCandidate).toHaveBeenCalledWith(1, 11);
  });

  it('shows remove button for every node', () => {
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, is_selected: true }),
      makeNode({ slot_id: 1, candidate_id: 11, track_id: 101, is_selected: false, col_index: 1 }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes })} />);

    expect(screen.getByTestId('derived-remove-10')).toBeTruthy();
    expect(screen.getByTestId('derived-remove-11')).toBeTruthy();
  });

  it('calls onRemoveCandidate directly when slot has multiple candidates', () => {
    const onRemoveCandidate = vi.fn();
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, is_selected: true }),
      makeNode({ slot_id: 1, candidate_id: 11, track_id: 101, is_selected: false, col_index: 1 }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes, onRemoveCandidate })} />);

    fireEvent.click(screen.getByTestId('derived-remove-11'));
    expect(onRemoveCandidate).toHaveBeenCalledWith(1, 11);
  });

  it('shows confirmation when removing last candidate in a slot', () => {
    const onRemoveCandidate = vi.fn();
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, is_selected: true }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes, onRemoveCandidate })} />);

    fireEvent.click(screen.getByTestId('derived-remove-10'));
    expect(onRemoveCandidate).not.toHaveBeenCalled();
    expect(screen.getByTestId('derived-confirm-overlay')).toBeTruthy();
    expect(screen.getByText(/removing the last candidate will delete this slot/i)).toBeTruthy();
  });

  it('calls onRemoveSlot when confirming last-candidate deletion', () => {
    const onRemoveSlot = vi.fn();
    const nodes = [
      makeNode({ slot_id: 5, candidate_id: 10, track_id: 100, is_selected: true }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes, onRemoveSlot, versionId: 42 })} />);

    fireEvent.click(screen.getByTestId('derived-remove-10'));
    fireEvent.click(screen.getByTestId('derived-confirm-delete'));
    expect(onRemoveSlot).toHaveBeenCalledWith(42, 5);
  });

  it('dismisses confirmation on cancel without removing', () => {
    const onRemoveCandidate = vi.fn();
    const onRemoveSlot = vi.fn();
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, is_selected: true }),
    ];
    render(<DerivedExplorerView {...defaultProps({ nodes, onRemoveCandidate, onRemoveSlot })} />);

    fireEvent.click(screen.getByTestId('derived-remove-10'));
    fireEvent.click(screen.getByTestId('derived-cancel-delete'));
    expect(screen.queryByTestId('derived-confirm-overlay')).toBeNull();
    expect(onRemoveCandidate).not.toHaveBeenCalled();
    expect(onRemoveSlot).not.toHaveBeenCalled();
  });

  it('sorts nodes by level then col_index', () => {
    const nodes = [
      makeNode({ slot_id: 2, candidate_id: 20, track_id: 200, level: 1, col_index: 0, is_selected: true }),
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, level: 0, col_index: 1, is_selected: false }),
      makeNode({ slot_id: 1, candidate_id: 11, track_id: 101, level: 0, col_index: 0, is_selected: true }),
    ];
    const { container } = render(<DerivedExplorerView {...defaultProps({ nodes })} />);
    const rows = container.querySelectorAll('.derived-explorer-table tbody tr');
    const slotNums = Array.from(rows).map(r => r.querySelector('.set-ws-cell-num')?.textContent);
    expect(slotNums).toEqual(['1', '1', '2']);
  });

  it('resolves track from trackMap when node.track is null', () => {
    const track = makeTrack(100, { title: 'From Map' });
    const trackMap = new Map<number, Track>([[100, track]]);
    const nodes = [
      makeNode({ slot_id: 1, candidate_id: 10, track_id: 100, is_selected: true, track: null }),
    ];
    const { container } = render(<DerivedExplorerView {...defaultProps({ nodes, trackMap })} />);
    expect(container.querySelector('.set-ws-cell-title')?.textContent).toContain('From Map');
  });
});
