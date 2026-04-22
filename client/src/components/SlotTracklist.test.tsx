import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { SlotTracklist } from './SlotTracklist';
import type { SetTracklistVersion, Track } from '../types';

vi.mock('../utils/trackTitle', () => ({
  cleanTitle: (track: { title: string }) => track.title,
}));

vi.mock('./PlayButton', () => ({
  PlayButton: () => <button data-testid="play-btn" />,
}));

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
}));

const mockAudioPlayerState = {
  track: null as { id: number; title: string } | null,
  playing: false, loading: false, currentTime: 0, duration: 0,
  volume: 0.8, error: null as string | null,
  play: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  togglePlayPause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), stop: vi.fn(),
};

vi.mock('../hooks/useAudioPlayer', () => ({
  AudioPlayerProvider: ({ children }: { children: React.ReactNode }) => children,
  useAudioPlayer: () => mockAudioPlayerState,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockAudioPlayerState.track = null;
  mockAudioPlayerState.playing = false;
});

function makeTrack(id: number, title: string, bpm = 120): Track {
  return { id, title, artist_names: [], bpm, key: null, camelot_code: '01A', genre: null, label: null, energy: 0.5, date_added: null };
}

function makeVersion(overrides: Partial<SetTracklistVersion> = {}): SetTracklistVersion {
  return {
    id: 1, set_id: 1, name: 'Main', display_order: 0,
    explorer_tree_id: null, derived_explorer_nodes: [],
    slots: [
      {
        id: 10, version_id: 1, position: 0, note: 'opener', is_inherited: false,
        candidates: [
          { id: 100, slot_id: 10, track_id: 1, is_selected: true },
          { id: 101, slot_id: 10, track_id: 2, is_selected: false },
        ],
      },
      {
        id: 11, version_id: 1, position: 1, note: '', is_inherited: false,
        candidates: [
          { id: 102, slot_id: 11, track_id: 3, is_selected: true },
        ],
      },
    ],
    ...overrides,
  };
}

const trackMap = new Map<number, Track>([
  [1, makeTrack(1, 'Alpha Track', 120)],
  [2, makeTrack(2, 'Beta Track', 128)],
  [3, makeTrack(3, 'Gamma Track', 135)],
]);

function defaultProps() {
  return {
    version: makeVersion(),
    trackMap,
    transitionScores: new Map<string, number | null>([['1-3', 0.72]]),
    scoresLoading: false,
    onBranchFromSlot: vi.fn(),
    onSelectCandidate: vi.fn().mockResolvedValue(undefined),
    onRemoveCandidate: vi.fn().mockResolvedValue(undefined),
    onAddCandidate: vi.fn().mockResolvedValue(undefined),
    onRemoveSlot: vi.fn().mockResolvedValue(undefined),
    onRefreshScores: vi.fn(),
  };
}

describe('SlotTracklist rendering', () => {
  it('renders a slot row for each slot', () => {
    render(<SlotTracklist {...defaultProps()} />);
    const rows = screen.getAllByTestId('slot-row');
    expect(rows).toHaveLength(2);
  });

  it('shows the selected candidate title as the canonical row', () => {
    render(<SlotTracklist {...defaultProps()} />);
    expect(screen.getByText('Alpha Track')).toBeInTheDocument();
    expect(screen.getByText('Gamma Track')).toBeInTheDocument();
  });

  it('shows slot count in header', () => {
    render(<SlotTracklist {...defaultProps()} />);
    expect(screen.getByText('Tracklist (2 slots)')).toBeInTheDocument();
  });
});

describe('Candidate badge', () => {
  it('shows badge when slot has multiple candidates', () => {
    render(<SlotTracklist {...defaultProps()} />);
    const badges = screen.getAllByTestId('candidate-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe('2');
  });

  it('does not show badge for single-candidate slot', () => {
    render(<SlotTracklist {...defaultProps()} />);
    const badges = screen.getAllByTestId('candidate-badge');
    expect(badges).toHaveLength(1);
  });

  it('applies full-slot class when slot has 5 candidates', () => {
    const fullSlotVersion = makeVersion({
      slots: [{
        id: 10, version_id: 1, position: 0, note: '', is_inherited: false,
        candidates: [
          { id: 100, slot_id: 10, track_id: 1, is_selected: true },
          { id: 101, slot_id: 10, track_id: 2, is_selected: false },
          { id: 102, slot_id: 10, track_id: 3, is_selected: false },
          { id: 103, slot_id: 10, track_id: 4, is_selected: false },
          { id: 104, slot_id: 10, track_id: 5, is_selected: false },
        ],
      }],
    });
    render(<SlotTracklist {...defaultProps()} version={fullSlotVersion} />);
    const badge = screen.getByTestId('candidate-badge');
    expect(badge.classList.contains('candidate-badge--full')).toBe(true);
  });
});

describe('Transition interstitial', () => {
  it('renders a transition row between adjacent slots', () => {
    render(<SlotTracklist {...defaultProps()} />);
    const interstitials = screen.getAllByTestId('slot-transition-row');
    expect(interstitials).toHaveLength(1);
  });

  it('shows the score value', () => {
    render(<SlotTracklist {...defaultProps()} />);
    const score = screen.getByTestId('transition-score');
    expect(score.textContent).toBe('72');
  });

  it('shows dash when no score available', () => {
    render(<SlotTracklist {...defaultProps()} transitionScores={new Map()} />);
    const score = screen.getByTestId('transition-score');
    expect(score.textContent).toBe('–');
  });

  it('shows loading indicator when fetching', () => {
    render(<SlotTracklist {...defaultProps()} transitionScores={new Map()} scoresLoading={true} />);
    const score = screen.getByTestId('transition-score');
    expect(score.textContent).toBe('…');
  });
});

describe('Inherited slot', () => {
  it('shows inherited tag for inherited slots', () => {
    const version = makeVersion({
      slots: [
        {
          id: 10, version_id: 1, position: 0, note: '', is_inherited: true,
          candidates: [{ id: 100, slot_id: 10, track_id: 1, is_selected: true }],
        },
      ],
    });
    render(<SlotTracklist {...defaultProps()} version={version} />);
    expect(screen.getByTestId('inherited-tag')).toBeInTheDocument();
  });

  it('inherited slot row has accent class', () => {
    const version = makeVersion({
      slots: [
        {
          id: 10, version_id: 1, position: 0, note: '', is_inherited: true,
          candidates: [{ id: 100, slot_id: 10, track_id: 1, is_selected: true }],
        },
      ],
    });
    render(<SlotTracklist {...defaultProps()} version={version} />);
    const row = screen.getByTestId('slot-row');
    expect(row.classList.contains('slot-row--inherited')).toBe(true);
  });
});

describe('Branch from slot', () => {
  it('clicking Branch opens branch bar, Enter commits', () => {
    const props = defaultProps();
    render(<SlotTracklist {...props} />);
    fireEvent.click(screen.getByTestId('branch-btn-10'));
    expect(screen.getByTestId('branch-bar')).toBeInTheDocument();

    const input = screen.getByDisplayValue('Main (branch)');
    fireEvent.change(input, { target: { value: 'New Branch' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onBranchFromSlot).toHaveBeenCalledWith(1, 0, 'New Branch');
  });

  it('Escape cancels branch', () => {
    const props = defaultProps();
    render(<SlotTracklist {...props} />);
    fireEvent.click(screen.getByTestId('branch-btn-10'));
    const input = screen.getByDisplayValue('Main (branch)');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('branch-bar')).not.toBeInTheDocument();
    expect(props.onBranchFromSlot).not.toHaveBeenCalled();
  });
});

describe('Empty version', () => {
  it('shows empty state when no slots', () => {
    const emptyVersion = makeVersion({ slots: [] });
    render(<SlotTracklist {...defaultProps()} version={emptyVersion} />);
    expect(screen.getByText('No slots in this version.')).toBeInTheDocument();
  });
});

describe('Slot management popover', () => {
  it('opens popover when clicking badge', () => {
    render(<SlotTracklist {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('candidate-badge'));
    expect(screen.getByTestId('slot-popover')).toBeInTheDocument();
  });

  it('opens popover when clicking Manage button', () => {
    render(<SlotTracklist {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('manage-btn-10'));
    expect(screen.getByTestId('slot-popover')).toBeInTheDocument();
  });

  it('lists all candidates for the slot', () => {
    render(<SlotTracklist {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('candidate-badge'));
    const list = screen.getByTestId('popover-candidate-list');
    expect(within(list).getByText('Alpha Track')).toBeInTheDocument();
    expect(within(list).getByText('Beta Track')).toBeInTheDocument();
  });

  it('marks the selected candidate as Active', () => {
    render(<SlotTracklist {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('candidate-badge'));
    expect(screen.getByTestId('popover-active-100')).toBeInTheDocument();
  });

  it('shows Select button for non-selected candidates', () => {
    render(<SlotTracklist {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('candidate-badge'));
    expect(screen.getByTestId('popover-select-101')).toBeInTheDocument();
  });

  it('calls onSelectCandidate and onRefreshScores when selecting', async () => {
    const props = defaultProps();
    render(<SlotTracklist {...props} />);
    fireEvent.click(screen.getByTestId('candidate-badge'));
    fireEvent.click(screen.getByTestId('popover-select-101'));
    await waitFor(() => {
      expect(props.onSelectCandidate).toHaveBeenCalledWith(10, 101);
    });
    expect(props.onRefreshScores).toHaveBeenCalled();
  });

  it('calls onRemoveCandidate for non-last candidate', async () => {
    const props = defaultProps();
    render(<SlotTracklist {...props} />);
    fireEvent.click(screen.getByTestId('candidate-badge'));
    fireEvent.click(screen.getByTestId('popover-remove-101'));
    await waitFor(() => {
      expect(props.onRemoveCandidate).toHaveBeenCalledWith(10, 101);
    });
  });

  it('shows delete confirmation when removing last candidate', () => {
    const singleVersion = makeVersion({
      slots: [{
        id: 10, version_id: 1, position: 0, note: '', is_inherited: false,
        candidates: [{ id: 100, slot_id: 10, track_id: 1, is_selected: true }],
      }],
    });
    render(<SlotTracklist {...defaultProps()} version={singleVersion} />);
    fireEvent.click(screen.getByTestId('manage-btn-10'));
    fireEvent.click(screen.getByTestId('popover-remove-100'));
    expect(screen.getByTestId('popover-delete-confirm')).toBeInTheDocument();
  });

  it('calls onRemoveSlot when confirming last-candidate deletion', async () => {
    const singleVersion = makeVersion({
      slots: [{
        id: 10, version_id: 1, position: 0, note: '', is_inherited: false,
        candidates: [{ id: 100, slot_id: 10, track_id: 1, is_selected: true }],
      }],
    });
    const props = defaultProps();
    render(<SlotTracklist {...props} version={singleVersion} />);
    fireEvent.click(screen.getByTestId('manage-btn-10'));
    fireEvent.click(screen.getByTestId('popover-remove-100'));
    fireEvent.click(screen.getByTestId('popover-confirm-delete'));
    await waitFor(() => {
      expect(props.onRemoveSlot).toHaveBeenCalledWith(1, 10);
    });
  });

  it('cancels last-candidate deletion', () => {
    const singleVersion = makeVersion({
      slots: [{
        id: 10, version_id: 1, position: 0, note: '', is_inherited: false,
        candidates: [{ id: 100, slot_id: 10, track_id: 1, is_selected: true }],
      }],
    });
    const props = defaultProps();
    render(<SlotTracklist {...props} version={singleVersion} />);
    fireEvent.click(screen.getByTestId('manage-btn-10'));
    fireEvent.click(screen.getByTestId('popover-remove-100'));
    fireEvent.click(screen.getByTestId('popover-cancel-delete'));
    expect(screen.queryByTestId('popover-delete-confirm')).not.toBeInTheDocument();
    expect(props.onRemoveSlot).not.toHaveBeenCalled();
  });

  it('shows full-slot notice when slot has 5 candidates', () => {
    const fullSlotVersion = makeVersion({
      slots: [{
        id: 10, version_id: 1, position: 0, note: '', is_inherited: false,
        candidates: [
          { id: 100, slot_id: 10, track_id: 1, is_selected: true },
          { id: 101, slot_id: 10, track_id: 2, is_selected: false },
          { id: 102, slot_id: 10, track_id: 3, is_selected: false },
          { id: 103, slot_id: 10, track_id: 4, is_selected: false },
          { id: 104, slot_id: 10, track_id: 5, is_selected: false },
        ],
      }],
    });
    render(<SlotTracklist {...defaultProps()} version={fullSlotVersion} />);
    fireEvent.click(screen.getByTestId('candidate-badge'));
    expect(screen.getByTestId('popover-full-notice')).toBeInTheDocument();
  });

  it('shows search input when slot is not full', () => {
    render(<SlotTracklist {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('candidate-badge'));
    expect(screen.getByTestId('popover-search-input')).toBeInTheDocument();
  });

  it('closes popover when clicking close button', () => {
    render(<SlotTracklist {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('candidate-badge'));
    expect(screen.getByTestId('slot-popover')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('popover-close'));
    expect(screen.queryByTestId('slot-popover')).not.toBeInTheDocument();
  });

  it('only one popover at a time — toggling a different slot replaces', () => {
    const twoSlotVersion = makeVersion({
      slots: [
        {
          id: 10, version_id: 1, position: 0, note: '', is_inherited: false,
          candidates: [
            { id: 100, slot_id: 10, track_id: 1, is_selected: true },
            { id: 101, slot_id: 10, track_id: 2, is_selected: false },
          ],
        },
        {
          id: 11, version_id: 1, position: 1, note: '', is_inherited: false,
          candidates: [
            { id: 102, slot_id: 11, track_id: 3, is_selected: true },
            { id: 103, slot_id: 11, track_id: 4, is_selected: false },
          ],
        },
      ],
    });
    const extraTrackMap = new Map<number, Track>([
      ...trackMap,
      [4, makeTrack(4, 'Delta Track', 140)],
    ]);
    render(<SlotTracklist {...defaultProps()} version={twoSlotVersion} trackMap={extraTrackMap} />);

    fireEvent.click(screen.getByTestId('manage-btn-10'));
    const popover1 = screen.getByTestId('slot-popover');
    expect(popover1).toBeInTheDocument();
    expect(within(popover1).getByText('Alpha Track')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('manage-btn-11'));
    const popovers = screen.getAllByTestId('slot-popover');
    expect(popovers).toHaveLength(1);
    const popover2 = screen.getByTestId('slot-popover');
    expect(within(popover2).getByText('Gamma Track')).toBeInTheDocument();
  });
});
