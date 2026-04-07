import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetBuilder, WEAK_THRESHOLD } from './SetBuilder';
import type { DjSet, Track } from '../types';

vi.mock('../api/http', () => ({
  fetchTransitionScores: vi.fn().mockResolvedValue({ scores: [] }),
  exportSetM3u8: vi.fn().mockResolvedValue({ content: '#EXTM3U\n', filename: 'test.m3u8' }),
}));

function makeTrack(id: number, title?: string): Track {
  return {
    id,
    title: title ?? `Track ${id}`,
    artist_names: [`Artist ${id}`],
    bpm: 128,
    key: 'C',
    camelot_code: '8B',
    genre: 'Electronic',
    label: 'Label',
    energy: 5,
  };
}

function makeSet(overrides: Partial<DjSet> = {}): DjSet {
  return {
    id: 'set-1',
    name: 'My Set',
    tracks: [],
    ...overrides,
  };
}

const noop = () => {};

describe('SetBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create and select set', () => {
    it('shows empty state when no sets exist', () => {
      render(
        <SetBuilder
          sets={[]}
          activeSet={null}
          activeSetId={null}
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      expect(screen.getByText(/No sets yet/)).toBeInTheDocument();
      expect(screen.getByText('+ New Set')).toBeInTheDocument();
    });

    it('shows create input when "+ New Set" is clicked', async () => {
      render(
        <SetBuilder
          sets={[]}
          activeSet={null}
          activeSetId={null}
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      await userEvent.click(screen.getByText('+ New Set'));
      expect(screen.getByPlaceholderText('Set name…')).toBeInTheDocument();
    });

    it('calls createSet with name on confirm', async () => {
      const createSet = vi.fn();
      render(
        <SetBuilder
          sets={[]}
          activeSet={null}
          activeSetId={null}
          createSet={createSet}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      await userEvent.click(screen.getByText('+ New Set'));
      await userEvent.type(screen.getByPlaceholderText('Set name…'), 'Friday Night');
      await userEvent.click(screen.getByText('Create'));
      expect(createSet).toHaveBeenCalledWith('Friday Night');
    });

    it('renders set selector when sets exist', () => {
      const set1 = makeSet({ id: 's1', name: 'Set A' });
      const set2 = makeSet({ id: 's2', name: 'Set B' });
      render(
        <SetBuilder
          sets={[set1, set2]}
          activeSet={set1}
          activeSetId="s1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('s1');
      expect(screen.getAllByRole('option').length).toBe(2);
    });

    it('calls selectSet when dropdown changes', async () => {
      const selectSet = vi.fn();
      const set1 = makeSet({ id: 's1', name: 'Set A' });
      const set2 = makeSet({ id: 's2', name: 'Set B' });
      render(
        <SetBuilder
          sets={[set1, set2]}
          activeSet={set1}
          activeSetId="s1"
          createSet={noop}
          selectSet={selectSet}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      await userEvent.selectOptions(screen.getByRole('combobox'), 's2');
      expect(selectSet).toHaveBeenCalledWith('s2');
    });
  });

  describe('track ordering and display', () => {
    it('renders tracks in order with numbers', () => {
      const set = makeSet({
        tracks: [
          { track: makeTrack(1, 'Alpha') },
          { track: makeTrack(2, 'Beta') },
          { track: makeTrack(3, 'Gamma') },
        ],
      });
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
      expect(screen.getByText('Gamma')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows empty tracks message when set has no tracks', () => {
      const set = makeSet({ tracks: [] });
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      expect(screen.getByText(/No tracks in this set/)).toBeInTheDocument();
    });
  });

  describe('reorder', () => {
    it('calls moveTrack when up button is clicked', async () => {
      const moveTrack = vi.fn();
      const set = makeSet({
        tracks: [
          { track: makeTrack(1, 'Alpha') },
          { track: makeTrack(2, 'Beta') },
        ],
      });
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={moveTrack}
        />,
      );
      const upButtons = screen.getAllByTitle('Move up');
      await userEvent.click(upButtons[1]);
      expect(moveTrack).toHaveBeenCalledWith(1, 0);
    });

    it('calls moveTrack when down button is clicked', async () => {
      const moveTrack = vi.fn();
      const set = makeSet({
        tracks: [
          { track: makeTrack(1, 'Alpha') },
          { track: makeTrack(2, 'Beta') },
        ],
      });
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={moveTrack}
        />,
      );
      const downButtons = screen.getAllByTitle('Move down');
      await userEvent.click(downButtons[0]);
      expect(moveTrack).toHaveBeenCalledWith(0, 1);
    });

    it('disables up button on first track', () => {
      const set = makeSet({
        tracks: [
          { track: makeTrack(1, 'Alpha') },
          { track: makeTrack(2, 'Beta') },
        ],
      });
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      const upButtons = screen.getAllByTitle('Move up');
      expect(upButtons[0]).toBeDisabled();
    });

    it('disables down button on last track', () => {
      const set = makeSet({
        tracks: [
          { track: makeTrack(1, 'Alpha') },
          { track: makeTrack(2, 'Beta') },
        ],
      });
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      const downButtons = screen.getAllByTitle('Move down');
      expect(downButtons[1]).toBeDisabled();
    });
  });

  describe('remove track', () => {
    it('calls removeTrack when remove button is clicked', async () => {
      const removeTrack = vi.fn();
      const set = makeSet({
        tracks: [
          { track: makeTrack(1, 'Alpha') },
          { track: makeTrack(2, 'Beta') },
        ],
      });
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={removeTrack}
          moveTrack={noop}
        />,
      );
      const removeButtons = screen.getAllByTitle('Remove from set');
      await userEvent.click(removeButtons[0]);
      expect(removeTrack).toHaveBeenCalledWith(0);
    });
  });

  describe('weak transition highlighting', () => {
    it('renders transition indicators between adjacent tracks', async () => {
      const httpMod = await import('../api/http');
      vi.mocked(httpMod.fetchTransitionScores).mockResolvedValue({
        scores: [80],
      });
      const set = makeSet({
        tracks: [
          { track: makeTrack(1, 'Alpha') },
          { track: makeTrack(2, 'Beta') },
        ],
      });
      await act(async () => {
        render(
          <SetBuilder
            sets={[set]}
            activeSet={set}
            activeSetId="set-1"
            createSet={noop}
            selectSet={noop}
            deleteSet={noop}
            removeTrack={noop}
            moveTrack={noop}
          />,
        );
      });

      await waitFor(() => {
        const indicators = document.querySelectorAll('[data-testid="transition-indicator"]');
        expect(indicators.length).toBe(1);
        expect(indicators[0]).not.toHaveClass('set-transition--weak');
      });
    });

    it('highlights weak transitions below threshold', async () => {
      const httpMod = await import('../api/http');
      const weakScore = WEAK_THRESHOLD - 1;
      vi.mocked(httpMod.fetchTransitionScores).mockResolvedValue({
        scores: [weakScore],
      });
      const set = makeSet({
        tracks: [
          { track: makeTrack(1, 'Alpha') },
          { track: makeTrack(2, 'Beta') },
        ],
      });
      await act(async () => {
        render(
          <SetBuilder
            sets={[set]}
            activeSet={set}
            activeSetId="set-1"
            createSet={noop}
            selectSet={noop}
            deleteSet={noop}
            removeTrack={noop}
            moveTrack={noop}
          />,
        );
      });

      await waitFor(() => {
        const indicators = document.querySelectorAll('[data-testid="transition-indicator"]');
        expect(indicators.length).toBe(1);
        expect(indicators[0]).toHaveClass('set-transition--weak');
      });
    });
  });

  describe('export', () => {
    it('renders export button when set has tracks', () => {
      const set = makeSet({
        tracks: [{ track: makeTrack(1) }],
      });
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      expect(screen.getByText('Export m3u8')).toBeInTheDocument();
    });

    it('does not render export button when set is empty', () => {
      const set = makeSet({ tracks: [] });
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      expect(screen.queryByText('Export m3u8')).not.toBeInTheDocument();
    });

    it('calls exportSetM3u8 when export button is clicked', async () => {
      const httpMod = await import('../api/http');
      vi.mocked(httpMod.exportSetM3u8).mockResolvedValue({
        content: '#EXTM3U\n',
        filename: 'My Set.m3u8',
      });
      const set = makeSet({
        tracks: [{ track: makeTrack(1) }, { track: makeTrack(2) }],
      });

      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={noop}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );

      await userEvent.click(screen.getByText('Export m3u8'));

      await waitFor(() => {
        expect(httpMod.exportSetM3u8).toHaveBeenCalledWith([1, 2], 'My Set');
      });
    });
  });

  describe('delete set', () => {
    it('calls deleteSet when delete button is clicked', async () => {
      const deleteSet = vi.fn();
      const set = makeSet();
      render(
        <SetBuilder
          sets={[set]}
          activeSet={set}
          activeSetId="set-1"
          createSet={noop}
          selectSet={noop}
          deleteSet={deleteSet}
          removeTrack={noop}
          moveTrack={noop}
        />,
      );
      await userEvent.click(screen.getByTitle('Delete set'));
      expect(deleteSet).toHaveBeenCalledWith('set-1');
    });
  });
});
