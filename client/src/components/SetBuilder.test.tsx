import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetBuilder } from './SetBuilder';
import type { SetSummary, HydratedSet } from '../types';

vi.mock('../api/http', () => ({
  fetchTransitionScores: vi.fn().mockResolvedValue({ scores: [] }),
  exportSetM3u8: vi.fn().mockResolvedValue({ content: '#EXTM3U\n', filename: 'test.m3u8' }),
  searchTracks: vi.fn().mockResolvedValue([]),
  explorerEdgeScores: vi.fn().mockResolvedValue({ scores: [] }),
}));

function makeSetSummary(overrides: Partial<SetSummary> = {}): SetSummary {
  return {
    id: 1,
    name: 'My Set',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    pool_count: 0,
    tracklist_count: 0,
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

const noop = () => {};
const asyncNoop = async () => null;

function defaultProps() {
  return {
    sets: [] as SetSummary[],
    activeSetId: null as number | null,
    activeSet: null as HydratedSet | null,
    loading: false,
    error: null as string | null,
    pendingAdd: null,
    createSet: asyncNoop as (name: string) => Promise<SetSummary | null>,
    selectSet: noop,
    deleteSet: noop,
    removeFromPool: noop,
    movePoolToTracklist: noop,
    addToPool: noop,
    removeFromTracklist: noop,
    moveTracklistToPool: noop,
    reorderTracklist: noop,
    updateTracklistNote: noop,
    addToTracklist: noop,
    resolvePendingAdd: noop,
    clearPendingAdd: noop,
    clearError: noop,
  };
}

describe('SetBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state', () => {
    it('shows empty state when no sets exist', () => {
      render(<SetBuilder {...defaultProps()} />);
      expect(screen.getByText(/No sets yet/)).toBeInTheDocument();
      expect(screen.getByText('+ New Set')).toBeInTheDocument();
    });

    it('shows create input when "+ New Set" is clicked', async () => {
      render(<SetBuilder {...defaultProps()} />);
      await userEvent.click(screen.getByText('+ New Set'));
      expect(screen.getByPlaceholderText('Set name…')).toBeInTheDocument();
    });

    it('calls createSet with name on confirm', async () => {
      const createSet = vi.fn().mockResolvedValue(makeSetSummary());
      render(<SetBuilder {...defaultProps()} createSet={createSet} />);
      await userEvent.click(screen.getByText('+ New Set'));
      await userEvent.type(screen.getByPlaceholderText('Set name…'), 'Friday Night');
      await userEvent.click(screen.getByText('Create'));
      expect(createSet).toHaveBeenCalledWith('Friday Night');
    });
  });

  describe('workspace layout', () => {
    it('shows tracklist and collapsed pool when a set is active', () => {
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={makeHydratedSet()}
        />,
      );
      expect(screen.getByText('Tracklist (0)')).toBeInTheDocument();
      expect(screen.getByLabelText('Expand pool')).toBeInTheDocument();
    });

    it('collapsed expand tab shows a directional chevron', () => {
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={makeHydratedSet()}
        />,
      );
      const expandBtn = screen.getByLabelText('Expand pool');
      expect(expandBtn).toHaveAttribute('title', 'Expand pool');
      expect(expandBtn.textContent).toContain('›');
    });

    it('expands pool accordion via prop', () => {
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={makeHydratedSet()}
          poolExpanded={true}
        />,
      );
      expect(screen.getByText('Pool (0)')).toBeInTheDocument();
      expect(screen.getByLabelText('Collapse pool')).toBeInTheDocument();
    });

    it('calls onPoolExpandedChange when expand tab is clicked', async () => {
      const onPoolExpandedChange = vi.fn();
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={makeHydratedSet()}
          onPoolExpandedChange={onPoolExpandedChange}
        />,
      );
      await userEvent.click(screen.getByLabelText('Expand pool'));
      expect(onPoolExpandedChange).toHaveBeenCalledWith(true);
    });

    it('collapse handle has title text and visible chevron', () => {
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={makeHydratedSet()}
          poolExpanded={true}
        />,
      );
      const collapseBtn = screen.getByLabelText('Collapse pool');
      expect(collapseBtn).toHaveAttribute('title', 'Collapse pool');
      expect(collapseBtn.textContent).toContain('‹');
    });
  });

  describe('no-active-set prompt', () => {
    it('shows create form when pendingAdd is set with no active set', () => {
      render(
        <SetBuilder
          {...defaultProps()}
          pendingAdd={{ type: 'pool', trackId: 1, title: 'Test Track' }}
        />,
      );
      expect(screen.getByPlaceholderText('Set name…')).toBeInTheDocument();
      expect(screen.getByText(/Create a set to add/)).toBeInTheDocument();
    });
  });

  describe('set selector', () => {
    it('renders set selector when sets exist', () => {
      const sets = [
        makeSetSummary({ id: 1, name: 'Set A' }),
        makeSetSummary({ id: 2, name: 'Set B' }),
      ];
      render(
        <SetBuilder
          {...defaultProps()}
          sets={sets}
          activeSetId={1}
          activeSet={makeHydratedSet()}
        />,
      );
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('1');
    });

    it('calls selectSet when dropdown changes', async () => {
      const selectSet = vi.fn();
      const sets = [
        makeSetSummary({ id: 1, name: 'Set A' }),
        makeSetSummary({ id: 2, name: 'Set B' }),
      ];
      render(
        <SetBuilder
          {...defaultProps()}
          sets={sets}
          activeSetId={1}
          activeSet={makeHydratedSet()}
          selectSet={selectSet}
        />,
      );
      await userEvent.selectOptions(screen.getByRole('combobox'), '2');
      expect(selectSet).toHaveBeenCalledWith(2);
    });
  });

  describe('pool and tracklist move actions', () => {
    it('calls movePoolToTracklist when pool row action is clicked', async () => {
      const movePoolToTracklist = vi.fn();
      const hydrated = makeHydratedSet({
        pool: [{
          id: 1, set_id: 1, track_id: 10, insertion_order: 0,
          track: { id: 10, title: 'Pool Track', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null },
        }],
      });
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={hydrated}
          movePoolToTracklist={movePoolToTracklist}
          poolExpanded={true}
        />,
      );
      await userEvent.click(screen.getByTitle('Move to tracklist'));
      expect(movePoolToTracklist).toHaveBeenCalledWith(10);
    });

    it('calls moveTracklistToPool when tracklist row action is clicked', async () => {
      const moveTracklistToPool = vi.fn();
      const hydrated = makeHydratedSet({
        tracklist: [{
          id: 1, set_id: 1, track_id: 20, position: 0,
          track: { id: 20, title: 'TL Track', artist_names: [], bpm: 130, key: 'D', camelot_code: '9B', genre: null, label: null, energy: null },
        }],
      });
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={hydrated}
          moveTracklistToPool={moveTracklistToPool}
        />,
      );
      await userEvent.click(screen.getByTitle('Move to pool'));
      expect(moveTracklistToPool).toHaveBeenCalledWith(20);
    });
  });

  describe('delete set', () => {
    it('calls deleteSet when delete button is clicked', async () => {
      const deleteSet = vi.fn();
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={makeHydratedSet()}
          deleteSet={deleteSet}
        />,
      );
      await userEvent.click(screen.getByTitle('Delete set'));
      expect(deleteSet).toHaveBeenCalledWith(1);
    });
  });

  describe('error display', () => {
    it('shows error as a toast with alert role', () => {
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          error="Something went wrong"
        />,
      );
      const toast = screen.getByRole('alert');
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveTextContent('Something went wrong');
    });

    it('calls clearError when toast dismiss is clicked', async () => {
      const clearError = vi.fn();
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          error="Oops"
          clearError={clearError}
        />,
      );
      await userEvent.click(screen.getByLabelText('Dismiss'));
      expect(clearError).toHaveBeenCalled();
    });

    it('does not render toast when error is null', () => {
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={makeHydratedSet()}
          error={null}
        />,
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('tracklist column headers', () => {
    it('renders #, Title, Note, Actions headers when tracklist has entries', () => {
      const hydrated = makeHydratedSet({
        tracklist: [{
          id: 1, set_id: 1, track_id: 10, position: 0, note: '',
          track: { id: 10, title: 'Test Track', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null },
        }],
      });
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={hydrated}
        />,
      );
      expect(screen.getByText('#')).toBeInTheDocument();
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Note')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  describe('tracklist note input', () => {
    it('renders a note input for each tracklist entry', () => {
      const hydrated = makeHydratedSet({
        tracklist: [
          { id: 1, set_id: 1, track_id: 10, position: 0, note: 'hello',
            track: { id: 10, title: 'Track A', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null } },
          { id: 2, set_id: 1, track_id: 20, position: 1, note: '',
            track: { id: 20, title: 'Track B', artist_names: [], bpm: 130, key: 'D', camelot_code: '10A', genre: null, label: null, energy: null } },
        ],
      });
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={hydrated}
        />,
      );
      const noteInputs = screen.getAllByPlaceholderText('Add note…');
      expect(noteInputs).toHaveLength(2);
      expect(noteInputs[0]).toHaveValue('hello');
      expect(noteInputs[1]).toHaveValue('');
    });

    it('updates note input when hydrated data changes for the same track_id', () => {
      const track = { id: 10, title: 'Track A', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null };
      const entry = { id: 1, set_id: 1, track_id: 10, position: 0, note: 'old note', track };
      const props = {
        ...defaultProps(),
        sets: [makeSetSummary()],
        activeSetId: 1,
        activeSet: makeHydratedSet({ tracklist: [entry] }),
      };
      const { rerender } = render(<SetBuilder {...props} />);
      expect(screen.getByPlaceholderText('Add note…')).toHaveValue('old note');

      const updatedEntry = { ...entry, note: 'new note' };
      rerender(
        <SetBuilder
          {...props}
          activeSet={makeHydratedSet({ tracklist: [updatedEntry] })}
        />,
      );
      expect(screen.getByPlaceholderText('Add note…')).toHaveValue('new note');
    });

    it('calls updateTracklistNote on note blur with changed value', async () => {
      const updateTracklistNote = vi.fn();
      const hydrated = makeHydratedSet({
        tracklist: [{
          id: 1, set_id: 1, track_id: 10, position: 0, note: '',
          track: { id: 10, title: 'Track A', artist_names: [], bpm: 128, key: 'C', camelot_code: '8B', genre: null, label: null, energy: null },
        }],
      });
      render(
        <SetBuilder
          {...defaultProps()}
          sets={[makeSetSummary()]}
          activeSetId={1}
          activeSet={hydrated}
          updateTracklistNote={updateTracklistNote}
        />,
      );
      const noteInput = screen.getByPlaceholderText('Add note…');
      await userEvent.click(noteInput);
      await userEvent.type(noteInput, 'transition here');
      fireEvent.blur(noteInput);
      expect(updateTracklistNote).toHaveBeenCalledWith(10, 'transition here');
    });
  });
});
