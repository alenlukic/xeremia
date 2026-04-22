import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { SearchModal } from './SearchModal';

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

vi.mock('../api/http', () => ({
  fetchTracks: vi.fn().mockResolvedValue([
    { id: 1, title: 'Alpha Track', artist_names: ['ArtistA'], bpm: 120, key: 'Am', camelot_code: '01A', genre: 'House', label: 'LabelX', energy: 0.7, date_added: '2025-01-01' },
    { id: 2, title: 'Beta Track', artist_names: ['ArtistB'], bpm: 128, key: 'Cm', camelot_code: '05A', genre: 'Techno', label: 'LabelY', energy: 0.8, date_added: '2025-02-01' },
    { id: 3, title: 'Gamma Track', artist_names: ['ArtistC'], bpm: 135, key: 'Em', camelot_code: '09A', genre: 'Trance', label: 'LabelZ', energy: 0.9, date_added: '2025-03-01' },
  ]),
  fetchMatches: vi.fn().mockResolvedValue([
    { candidate_id: 10, title: 'Match One', overall_score: 85, bucket: 'same_key', camelot_score: 0.9, bpm_score: 0.8, energy_score: 0.7, similarity_score: 0.6, freshness_score: 0.5, genre_similarity_score: 0.4, mood_continuity_score: 0.3, vocal_clash_score: 0.2, instrument_similarity_score: 0.1 },
    { candidate_id: 11, title: 'Match Two', overall_score: 72, bucket: 'higher_key', camelot_score: 0.8, bpm_score: 0.7, energy_score: 0.6, similarity_score: 0.5, freshness_score: 0.4, genre_similarity_score: 0.3, mood_continuity_score: 0.2, vocal_clash_score: 0.1, instrument_similarity_score: 0.9 },
  ]),
  searchTracks: vi.fn().mockResolvedValue([]),
  candidateAdd: vi.fn().mockResolvedValue({ id: 99, slot_id: 10, track_id: 1, is_selected: false }),
  slotCreate: vi.fn().mockResolvedValue({ id: 50, version_id: 100, position: 5, note: '', is_inherited: false, candidates: [] }),
  slotReorder: vi.fn().mockResolvedValue(undefined),
}));

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

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  localStorage.clear();
  mockAudioPlayerState.track = null;
  mockAudioPlayerState.playing = false;
});

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  activeSetId: 1,
  activeSet: null,
  onAddToTracklist: vi.fn(),
  onAddToPool: vi.fn(),
  slots: undefined as { id: number; version_id: number; position: number; note: string; is_inherited: boolean; candidates: { id: number; slot_id: number; track_id: number; is_selected: boolean; track?: { id: number; title: string; artist_names: string[]; bpm: number | null; key: string | null; camelot_code: string | null; genre: string | null; label: string | null; energy: number | null; date_added: string | null } | null }[] }[] | undefined,
  activeVersionId: undefined as number | undefined | null,
  onSlotsChanged: undefined as (() => Promise<void>) | undefined,
};

function makeSlots() {
  return [
    { id: 10, version_id: 100, position: 0, note: '', is_inherited: false, candidates: [
      { id: 101, slot_id: 10, track_id: 42, is_selected: true, track: { id: 42, title: 'Slot-1 Track', artist_names: ['DJ A'], bpm: 126, key: 'Am', camelot_code: '01A', genre: 'House', label: null, energy: null, date_added: null } },
      { id: 102, slot_id: 10, track_id: 43, is_selected: false, track: null },
    ] },
    { id: 11, version_id: 100, position: 1, note: '', is_inherited: false, candidates: [
      { id: 201, slot_id: 11, track_id: 44, is_selected: true, track: { id: 44, title: 'Slot-2 Track', artist_names: ['DJ B'], bpm: 128, key: 'Cm', camelot_code: '05A', genre: 'Techno', label: null, energy: null, date_added: null } },
      { id: 202, slot_id: 11, track_id: 45, is_selected: false, track: null },
      { id: 203, slot_id: 11, track_id: 46, is_selected: false, track: null },
      { id: 204, slot_id: 11, track_id: 47, is_selected: false, track: null },
      { id: 205, slot_id: 11, track_id: 48, is_selected: false, track: null },
    ] },
  ];
}

async function renderModal(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides, onClose: overrides.onClose ?? vi.fn(), onAddToTracklist: overrides.onAddToTracklist ?? vi.fn(), onAddToPool: overrides.onAddToPool ?? vi.fn() };
  render(<SearchModal {...props} />);
  await act(async () => {});
  return props;
}

describe('Modal open/close', () => {
  it('renders modal when open=true', async () => {
    await renderModal();
    expect(screen.getByTestId('search-modal')).toBeInTheDocument();
  });

  it('does not render modal when open=false', async () => {
    await renderModal({ open: false });
    expect(screen.queryByTestId('search-modal')).not.toBeInTheDocument();
  });

  it('close button calls onClose', async () => {
    const props = await renderModal();
    fireEvent.click(screen.getByTestId('search-modal-close'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('Escape key calls onClose', async () => {
    const props = await renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('scrim click calls onClose', async () => {
    const props = await renderModal();
    fireEvent.click(screen.getByTestId('search-modal-scrim'));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('State reset on close', () => {
  it('query input is empty after close and reopen', async () => {
    const { unmount } = render(
      <SearchModal {...defaultProps} onClose={vi.fn()} onAddToTracklist={vi.fn()} onAddToPool={vi.fn()} />,
    );
    await act(async () => {});

    const input = screen.getByTestId('search-modal-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test query' } });
    expect(input.value).toBe('test query');

    unmount();

    render(
      <SearchModal {...defaultProps} onClose={vi.fn()} onAddToTracklist={vi.fn()} onAddToPool={vi.fn()} />,
    );
    await act(async () => {});

    const newInput = screen.getByTestId('search-modal-input') as HTMLInputElement;
    expect(newInput.value).toBe('');
  });
});

describe('Row action affordances', () => {
  it('+ button on first row calls onAddToTracklist with correct track ID', async () => {
    const props = await renderModal();
    await waitFor(() => {
      expect(screen.getByText('Alpha Track')).toBeInTheDocument();
    });

    const addBtns = screen.getAllByTestId('row-add-btn');
    fireEvent.click(addBtns[0]);
    expect(props.onAddToTracklist).toHaveBeenCalledWith(1);
  });

  it('three-dot menu "Add to pool" calls onAddToPool', async () => {
    const props = await renderModal();
    await waitFor(() => {
      expect(screen.getByText('Alpha Track')).toBeInTheDocument();
    });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);

    const poolBtn = screen.getByTestId('menu-add-pool');
    fireEvent.click(poolBtn);
    expect(props.onAddToPool).toHaveBeenCalledWith(1);
  });

  it('three-dot menu "Add to tracklist" calls onAddToTracklist', async () => {
    const props = await renderModal();
    await waitFor(() => {
      expect(screen.getByText('Alpha Track')).toBeInTheDocument();
    });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);

    const tracklistBtn = screen.getByTestId('menu-add-tracklist');
    fireEvent.click(tracklistBtn);
    expect(props.onAddToTracklist).toHaveBeenCalledWith(1);
  });
});

describe('Column config persistence', () => {
  it('toggling a column off persists to localStorage', async () => {
    await renderModal();
    await waitFor(() => {
      expect(screen.getByText('Alpha Track')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('search-col-config-btn'));
    const bpmToggle = screen.getByTestId('col-toggle-bpm');
    fireEvent.click(bpmToggle);

    const stored = JSON.parse(localStorage.getItem('dj-tools-search-modal-column-config')!);
    expect(stored.columnVisibility.bpm).toBe(false);
  });

  it('hidden column remains hidden after reopen', async () => {
    localStorage.setItem('dj-tools-search-modal-column-config', JSON.stringify({
      columnVisibility: { bpm: false, label: false, energy: false, date_added: false },
    }));

    await renderModal();
    await waitFor(() => {
      expect(screen.getByText('Alpha Track')).toBeInTheDocument();
    });

    const headers = screen.getByTestId('search-results-table').querySelectorAll('th');
    const headerTexts = Array.from(headers).map(h => h.textContent?.trim());
    expect(headerTexts).not.toContain('BPM');
  });
});

describe('Source / transition chaining', () => {
  it('clicking Source shows breadcrumb and transition results', async () => {
    await renderModal();
    await waitFor(() => {
      expect(screen.getByText('Alpha Track')).toBeInTheDocument();
    });

    const sourceBtns = screen.getAllByTestId('source-btn');
    await act(async () => { fireEvent.click(sourceBtns[0]); });

    expect(screen.getByTestId('search-modal-breadcrumb')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-source').textContent).toBe('Alpha Track');

    await waitFor(() => {
      expect(screen.getByTestId('transition-results-table')).toBeInTheDocument();
    });
  });

  it('clicking Back returns to search view with query preserved', async () => {
    await renderModal();
    await waitFor(() => {
      expect(screen.getByText('Alpha Track')).toBeInTheDocument();
    });

    const input = screen.getByTestId('search-modal-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Alpha' } });

    const sourceBtns = screen.getAllByTestId('source-btn');
    await act(async () => { fireEvent.click(sourceBtns[0]); });
    expect(screen.getByTestId('search-modal-breadcrumb')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('breadcrumb-back'));
    });

    expect(screen.queryByTestId('search-modal-breadcrumb')).not.toBeInTheDocument();
    expect(screen.getByTestId('search-results-table')).toBeInTheDocument();
  });

  it('multi-level chaining builds a breadcrumb chain', async () => {
    const { fetchMatches } = await import('../api/http') as { fetchMatches: ReturnType<typeof vi.fn> };
    fetchMatches.mockResolvedValueOnce([
      { candidate_id: 10, title: 'Match One', overall_score: 85, bucket: 'same_key', camelot_score: 0.9, bpm_score: 0.8, energy_score: 0.7, similarity_score: 0.6, freshness_score: 0.5, genre_similarity_score: 0.4, mood_continuity_score: 0.3, vocal_clash_score: 0.2, instrument_similarity_score: 0.1 },
    ]);
    await renderModal();
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const sourceBtns = screen.getAllByTestId('source-btn');
    await act(async () => { fireEvent.click(sourceBtns[0]); });
    await waitFor(() => { expect(screen.getByTestId('transition-results-table')).toBeInTheDocument(); });

    fetchMatches.mockResolvedValueOnce([
      { candidate_id: 20, title: 'Deep Match', overall_score: 60, bucket: 'same_key', camelot_score: 0.5, bpm_score: 0.5, energy_score: 0.5, similarity_score: 0.5, freshness_score: 0.5, genre_similarity_score: 0.5, mood_continuity_score: 0.5, vocal_clash_score: 0.5, instrument_similarity_score: 0.5 },
    ]);
    const matchSourceBtns = screen.getAllByTestId('source-btn');
    await act(async () => { fireEvent.click(matchSourceBtns[0]); });

    expect(screen.getByTestId('breadcrumb-entry-0')).toHaveTextContent('Alpha Track');
    expect(screen.getByTestId('breadcrumb-source')).toHaveTextContent('Match One');

    await act(async () => { fireEvent.click(screen.getByTestId('breadcrumb-back')); });
    expect(screen.getByTestId('breadcrumb-source')).toHaveTextContent('Alpha Track');
    expect(screen.queryByTestId('breadcrumb-entry-0')).not.toBeInTheDocument();
  });
});

describe('Two-stage Escape', () => {
  it('Escape with filter tray expanded does not close modal', async () => {
    const props = await renderModal();
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const filterToggle = screen.getByLabelText('Toggle filters');
    fireEvent.click(filterToggle);

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('search-modal')).toBeInTheDocument();

    // FilterBar's own handler collapsed the tray on the first Escape
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('Escape with three-dot menu open closes menu first, then modal', async () => {
    const props = await renderModal();
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    expect(screen.getByTestId('row-menu-popover')).toBeInTheDocument();

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('search-modal')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('row-menu-popover')).not.toBeInTheDocument();
    });

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('Escape with column-config popover open closes popover first, then modal', async () => {
    const props = await renderModal();
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    fireEvent.click(screen.getByTestId('search-col-config-btn'));
    await waitFor(() => { expect(screen.getByTestId('search-col-config-popover')).toBeInTheDocument(); });

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('search-modal')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('search-col-config-popover')).not.toBeInTheDocument();
    });

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('State reset on close/reopen', () => {
  it('filters are reset after close and reopen', async () => {
    const { unmount } = render(
      <SearchModal {...defaultProps} onClose={vi.fn()} onAddToTracklist={vi.fn()} onAddToPool={vi.fn()} />,
    );
    await act(async () => {});
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const filterToggle = screen.getByLabelText('Toggle filters');
    fireEvent.click(filterToggle);
    expect(filterToggle).toHaveAttribute('aria-expanded', 'true');

    unmount();

    render(
      <SearchModal {...defaultProps} onClose={vi.fn()} onAddToTracklist={vi.fn()} onAddToPool={vi.fn()} />,
    );
    await act(async () => {});

    const newToggle = screen.getByLabelText('Toggle filters');
    expect(newToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('transition view is reset after close and reopen', async () => {
    const { unmount } = render(
      <SearchModal {...defaultProps} onClose={vi.fn()} onAddToTracklist={vi.fn()} onAddToPool={vi.fn()} />,
    );
    await act(async () => {});
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const sourceBtns = screen.getAllByTestId('source-btn');
    await act(async () => { fireEvent.click(sourceBtns[0]); });
    expect(screen.getByTestId('search-modal-breadcrumb')).toBeInTheDocument();

    unmount();

    render(
      <SearchModal {...defaultProps} onClose={vi.fn()} onAddToTracklist={vi.fn()} onAddToPool={vi.fn()} />,
    );
    await act(async () => {});

    expect(screen.queryByTestId('search-modal-breadcrumb')).not.toBeInTheDocument();
    expect(screen.getByTestId('search-modal-input')).toBeInTheDocument();
  });
});

describe('Corrupt localStorage resilience', () => {
  it('corrupt search column config does not crash the modal', async () => {
    localStorage.setItem('dj-tools-search-modal-column-config', '{{invalid');
    await renderModal();
    expect(screen.getByTestId('search-modal')).toBeInTheDocument();
  });

  it('corrupt match column config recovers on write', async () => {
    localStorage.setItem('dj-tools-matches-column-config', '{{invalid');
    await renderModal();
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const sourceBtns = screen.getAllByTestId('source-btn');
    await act(async () => { fireEvent.click(sourceBtns[0]); });
    await waitFor(() => { expect(screen.getByTestId('transition-results-table')).toBeInTheDocument(); });

    fireEvent.click(screen.getByTestId('match-col-config-btn'));
    const checkboxes = screen.getByTestId('match-col-config-popover').querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]);

    const stored = localStorage.getItem('dj-tools-matches-column-config');
    expect(stored).not.toBe('{{invalid');
    const parsed = JSON.parse(stored!);
    expect(parsed).toHaveProperty('columnVisibility');
  });
});

describe('Modal stays open after add', () => {
  it('clicking + does not close the modal', async () => {
    await renderModal();
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const addBtns = screen.getAllByTestId('row-add-btn');
    fireEvent.click(addBtns[0]);
    expect(screen.getByTestId('search-modal')).toBeInTheDocument();
  });

  it('three-dot "Add to pool" does not close the modal', async () => {
    await renderModal();
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    fireEvent.click(screen.getByTestId('menu-add-pool'));
    expect(screen.getByTestId('search-modal')).toBeInTheDocument();
  });
});

describe('Slot-targeting side panel', () => {
  const slotOverrides = () => ({
    slots: makeSlots(),
    activeVersionId: 100 as number | null,
    onSlotsChanged: vi.fn().mockResolvedValue(undefined),
  });

  it('three-dot "Add to tracklist…" opens slot side panel when slots are provided', async () => {
    await renderModal(slotOverrides());
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    expect(screen.getByTestId('menu-add-tracklist').textContent).toContain('\u2026');
    fireEvent.click(screen.getByTestId('menu-add-tracklist'));

    await waitFor(() => {
      expect(screen.getByTestId('slot-target-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('slot-target-track-name')).toHaveTextContent('Alpha Track');
  });

  it('slot list shows slots with candidate counts', async () => {
    await renderModal(slotOverrides());
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    fireEvent.click(screen.getByTestId('menu-add-tracklist'));

    await waitFor(() => { expect(screen.getByTestId('slot-target-panel')).toBeInTheDocument(); });

    expect(screen.getByTestId('slot-target-slot-10')).toBeInTheDocument();
    expect(screen.getByTestId('slot-target-slot-11')).toBeInTheDocument();

    const body = screen.getByTestId('slot-target-body');
    expect(body.textContent).toContain('2/5');
    expect(body.textContent).toContain('5/5');
  });

  it('"Add as candidate" calls candidateAdd', async () => {
    const overrides = slotOverrides();
    await renderModal(overrides);
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    fireEvent.click(screen.getByTestId('menu-add-tracklist'));
    await waitFor(() => { expect(screen.getByTestId('slot-target-panel')).toBeInTheDocument(); });

    await act(async () => { fireEvent.click(screen.getByTestId('slot-target-add-to-10')); });

    const { candidateAdd: mockAdd } = await import('../api/http') as { candidateAdd: ReturnType<typeof vi.fn> };
    expect(mockAdd).toHaveBeenCalledWith(1, 10, 1);
    expect(overrides.onSlotsChanged).toHaveBeenCalled();
  });

  it('full slot shows "Full" tag', async () => {
    await renderModal(slotOverrides());
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    fireEvent.click(screen.getByTestId('menu-add-tracklist'));
    await waitFor(() => { expect(screen.getByTestId('slot-target-panel')).toBeInTheDocument(); });

    expect(screen.getByTestId('slot-target-full-11')).toHaveTextContent('Full');
    expect(screen.queryByTestId('slot-target-add-to-11')).not.toBeInTheDocument();
  });

  it('"Append to end" triggers slot creation and candidate add', async () => {
    const overrides = slotOverrides();
    await renderModal(overrides);
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    fireEvent.click(screen.getByTestId('menu-add-tracklist'));
    await waitFor(() => { expect(screen.getByTestId('slot-target-panel')).toBeInTheDocument(); });

    await act(async () => { fireEvent.click(screen.getByTestId('slot-target-append')); });

    const { slotCreate: mockCreate, candidateAdd: mockAdd } = await import('../api/http') as { slotCreate: ReturnType<typeof vi.fn>; candidateAdd: ReturnType<typeof vi.fn> };
    expect(mockCreate).toHaveBeenCalledWith(1, 100);
    expect(mockAdd).toHaveBeenCalledWith(1, 50, 1);
    expect(overrides.onSlotsChanged).toHaveBeenCalled();
  });

  it('insert-between-slots calls slotCreate then slotReorder with correct position', async () => {
    const overrides = slotOverrides();
    await renderModal(overrides);
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    fireEvent.click(screen.getByTestId('menu-add-tracklist'));
    await waitFor(() => { expect(screen.getByTestId('slot-target-panel')).toBeInTheDocument(); });

    const { slotCreate: mockCreate, slotReorder: mockReorder, candidateAdd: mockAdd } = await import('../api/http') as { slotCreate: ReturnType<typeof vi.fn>; slotReorder: ReturnType<typeof vi.fn>; candidateAdd: ReturnType<typeof vi.fn> };
    mockCreate.mockClear();
    mockReorder.mockClear();
    mockAdd.mockClear();

    await act(async () => { fireEvent.click(screen.getByTestId('slot-target-insert-after-0')); });

    expect(mockCreate).toHaveBeenCalledWith(1, 100);
    expect(mockReorder).toHaveBeenCalledWith(1, 100, 50, 1);
    expect(mockAdd).toHaveBeenCalledWith(1, 50, 1);
    expect(overrides.onSlotsChanged).toHaveBeenCalled();
  });

  it('Escape closes slot panel but NOT the modal', async () => {
    const overrides = slotOverrides();
    const props = await renderModal(overrides);
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    fireEvent.click(screen.getByTestId('menu-add-tracklist'));
    await waitFor(() => { expect(screen.getByTestId('slot-target-panel')).toBeInTheDocument(); });

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });

    expect(screen.queryByTestId('slot-target-panel')).not.toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('search-modal')).toBeInTheDocument();

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('without slots prop, three-dot "Add to tracklist" calls onAddToTracklist directly', async () => {
    const props = await renderModal();
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    expect(screen.getByTestId('menu-add-tracklist').textContent).toBe('Add to tracklist');
    fireEvent.click(screen.getByTestId('menu-add-tracklist'));
    expect(props.onAddToTracklist).toHaveBeenCalledWith(1);
  });

  it('candidateAdd error shows inline error in panel', async () => {
    const { candidateAdd: mockAdd } = await import('../api/http') as { candidateAdd: ReturnType<typeof vi.fn> };
    mockAdd.mockRejectedValueOnce(new Error('Slot is full'));

    const overrides = slotOverrides();
    await renderModal(overrides);
    await waitFor(() => { expect(screen.getByText('Alpha Track')).toBeInTheDocument(); });

    const menuBtns = screen.getAllByTestId('row-menu-btn');
    fireEvent.click(menuBtns[0]);
    fireEvent.click(screen.getByTestId('menu-add-tracklist'));
    await waitFor(() => { expect(screen.getByTestId('slot-target-panel')).toBeInTheDocument(); });

    await act(async () => { fireEvent.click(screen.getByTestId('slot-target-add-to-10')); });

    await waitFor(() => {
      expect(screen.getByTestId('slot-target-error')).toHaveTextContent('Slot is full');
    });
    expect(screen.getByTestId('slot-target-panel')).toBeInTheDocument();
  });
});
