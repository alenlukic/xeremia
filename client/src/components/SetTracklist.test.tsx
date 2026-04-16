import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SetTracklist } from './SetTracklist';
import type { TracklistEntry } from '../types';

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    track: null, playing: false, loading: false, currentTime: 0, duration: 0,
    volume: 0.8, error: null, play: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    togglePlayPause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), stop: vi.fn(),
  }),
}));

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
}));

function makeEntry(overrides: Partial<TracklistEntry> & { id: number; track_id: number }): TracklistEntry {
  return {
    set_id: 1,
    position: 0,
    note: '',
    starred: false,
    track: {
      id: overrides.track_id,
      title: `Track ${overrides.track_id}`,
      artist_names: [],
      bpm: 128,
      key: 'Aminor',
      camelot_code: '8A',
      genre: null,
      label: null,
      energy: null,
      date_added: null,
    },
    ...overrides,
  };
}

const noop = () => {};

function renderTracklist(entries: TracklistEntry[], extra?: Partial<React.ComponentProps<typeof SetTracklist>>) {
  return render(
    <DndContext>
      <SetTracklist
        tracklist={entries}
        onRemove={extra?.onRemove ?? noop}
        onMoveToPool={noop}
        onReorder={noop}
        onUpdateNote={noop}
        onToggleStar={noop}
        onAddTrack={noop}
        {...extra}
      />
    </DndContext>,
  );
}

describe('SetTracklist', () => {
  it('renders a semantic HTML table', () => {
    const entries = [makeEntry({ id: 1, track_id: 10 })];
    const { container } = renderTracklist(entries);
    expect(container.querySelector('table.set-tracklist-table')).toBeTruthy();
    expect(container.querySelector('thead')).toBeTruthy();
    expect(container.querySelector('tbody')).toBeTruthy();
  });

  it('renders dedicated Key and BPM column headers', () => {
    renderTracklist([makeEntry({ id: 1, track_id: 10 })]);
    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map(h => h.textContent);
    expect(headerTexts).toContain('Key');
    expect(headerTexts).toContain('BPM');
  });

  it('renders key and BPM in dedicated cells, not inside the title', () => {
    const entry = makeEntry({ id: 1, track_id: 10 });
    const { container } = renderTracklist([entry]);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    const titleCell = row.querySelector('.set-ws-cell-title');
    const keyCell = row.querySelector('.set-ws-cell-key');
    const bpmCell = row.querySelector('.set-ws-cell-bpm');

    expect(titleCell?.textContent).not.toContain('8A');
    expect(keyCell?.textContent).toBe('8A');
    expect(bpmCell?.textContent).toBe('128');
  });

  it('uses fixed-width actions column via colgroup', () => {
    const { container } = renderTracklist([makeEntry({ id: 1, track_id: 10 })]);
    const col = container.querySelector('col.set-ws-col-actions-tracklist');
    expect(col).toBeTruthy();
  });

  it('renders Actions header with set-ws-th-actions class', () => {
    renderTracklist([makeEntry({ id: 1, track_id: 10 })]);
    const actionsHeader = screen.getByRole('columnheader', { name: /actions/i });
    expect(actionsHeader.classList.contains('set-ws-th-actions')).toBe(true);
  });

  it('shows em-dash when key/bpm are missing', () => {
    const entry = makeEntry({ id: 2, track_id: 20 });
    entry.track = { ...entry.track!, bpm: null, camelot_code: null };
    const { container } = renderTracklist([entry]);
    const row = container.querySelector('tbody tr')!;
    expect(row.querySelector('.set-ws-cell-key')?.textContent).toBe('—');
    expect(row.querySelector('.set-ws-cell-bpm')?.textContent).toBe('—');
  });

  it('renders note input in a dedicated cell', () => {
    renderTracklist([makeEntry({ id: 1, track_id: 10 })]);
    const noteInput = screen.getByPlaceholderText('Add note…');
    expect(noteInput).toBeTruthy();
    expect(noteInput.closest('td')?.classList.contains('set-ws-cell-note')).toBe(true);
  });

  it('shows empty message when tracklist is empty', () => {
    renderTracklist([]);
    expect(screen.getByText(/tracklist is empty/i)).toBeTruthy();
  });

  it('wraps table in a scroll shell container', () => {
    const { container } = renderTracklist([makeEntry({ id: 1, track_id: 10 })]);
    const scrollShell = container.querySelector('.set-table-scroll-shell');
    expect(scrollShell).toBeTruthy();
    expect(scrollShell!.querySelector('table.set-tracklist-table')).toBeTruthy();
  });

  it('places header outside the scroll shell', () => {
    const { container } = renderTracklist([makeEntry({ id: 1, track_id: 10 })]);
    const tracklist = container.querySelector('.set-tracklist')!;
    const header = tracklist.querySelector('.set-tracklist-header')!;
    const scrollShell = tracklist.querySelector('.set-table-scroll-shell')!;
    expect(header.compareDocumentPosition(scrollShell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.closest('.set-table-scroll-shell')).toBeNull();
  });

  it('wraps empty message inside scroll shell', () => {
    const { container } = renderTracklist([]);
    const scrollShell = container.querySelector('.set-table-scroll-shell');
    expect(scrollShell).toBeTruthy();
    expect(scrollShell!.querySelector('.set-empty-tracks')).toBeTruthy();
  });
});

describe('SetTracklist tiered sort', () => {
  function makeSortEntries(): TracklistEntry[] {
    return [
      makeEntry({
        id: 1, track_id: 10, position: 0,
        track: { id: 10, title: 'Charlie', artist_names: [], bpm: 140, key: 'C', camelot_code: '8A', genre: null, label: null, energy: null, date_added: null },
      }),
      makeEntry({
        id: 2, track_id: 20, position: 1,
        track: { id: 20, title: 'Alpha', artist_names: [], bpm: 120, key: 'D', camelot_code: '3B', genre: null, label: null, energy: null, date_added: null },
      }),
      makeEntry({
        id: 3, track_id: 30, position: 2,
        track: { id: 30, title: 'Alpha', artist_names: [], bpm: 130, key: 'E', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
      }),
    ];
  }

  function getTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.set-tracklist-table tbody .set-ws-cell-title'))
      .map(el => el.textContent ?? '');
  }

  function clickMenuItem(container: HTMLElement, label: string) {
    const items = container.querySelectorAll('.sort-tier-menu-item');
    const target = Array.from(items).find(el => el.textContent === label);
    if (!target) throw new Error(`Menu item "${label}" not found`);
    fireEvent.mouseDown(target);
  }

  it('renders the sort tier bar', () => {
    const { container } = renderTracklist(makeSortEntries());
    expect(container.querySelector('.sort-tier-bar')).toBeTruthy();
  });

  it('shows default position order when no sort tiers are active', () => {
    const { container } = renderTracklist(makeSortEntries());
    expect(getTitles(container)).toEqual(['Charlie', 'Alpha', 'Alpha']);
  });

  it('adds a sort tier via +Sort and applies it', () => {
    const { container } = renderTracklist(makeSortEntries());
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');
    expect(getTitles(container)).toEqual(['Alpha', 'Alpha', 'Charlie']);
  });

  it('appends a second tier for sub-sorting', () => {
    const { container } = renderTracklist(makeSortEntries());
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');

    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'BPM');

    const bpms = Array.from(container.querySelectorAll('.set-tracklist-table tbody .set-ws-cell-bpm'))
      .map(el => el.textContent ?? '');
    expect(getTitles(container)).toEqual(['Alpha', 'Alpha', 'Charlie']);
    expect(bpms).toEqual(['120', '130', '140']);
  });

  it('removes a tier and reverts to position order', () => {
    const { container } = renderTracklist(makeSortEntries());
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');
    expect(getTitles(container)[0]).toBe('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /remove title sort/i }));
    expect(getTitles(container)).toEqual(['Charlie', 'Alpha', 'Alpha']);
  });

  it('reorders tiers to change effective sort', () => {
    const { container } = renderTracklist(makeSortEntries());
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'BPM');
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');

    const bpmsBefore = Array.from(container.querySelectorAll('.set-tracklist-table tbody .set-ws-cell-bpm'))
      .map(el => el.textContent ?? '');
    expect(bpmsBefore).toEqual(['120', '130', '140']);

    fireEvent.click(screen.getByRole('button', { name: /move title sort up/i }));
    const titlesAfter = getTitles(container);
    expect(titlesAfter).toEqual(['Alpha', 'Alpha', 'Charlie']);
  });

  it('disables reorder buttons when a sort tier is active', () => {
    const { container } = renderTracklist(makeSortEntries());
    const moveBtns = () => container.querySelectorAll<HTMLButtonElement>('.set-move-btn');

    const beforeBtns = moveBtns();
    const enabledBefore = Array.from(beforeBtns).filter(b => !b.disabled);
    expect(enabledBefore.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');

    const afterBtns = moveBtns();
    const enabledAfter = Array.from(afterBtns).filter(b => !b.disabled);
    expect(enabledAfter.length).toBe(0);
  });

  it('re-enables reorder buttons after removing all sort tiers', () => {
    const { container } = renderTracklist(makeSortEntries());

    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');
    const allDisabled = Array.from(container.querySelectorAll<HTMLButtonElement>('.set-move-btn'))
      .every(b => b.disabled);
    expect(allDisabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /remove title sort/i }));
    const enabledAfterClear = Array.from(container.querySelectorAll<HTMLButtonElement>('.set-move-btn'))
      .filter(b => !b.disabled);
    expect(enabledAfterClear.length).toBeGreaterThan(0);
  });

  it('disables drag cursor on rows when sort is active', () => {
    const { container } = renderTracklist(makeSortEntries());
    const rows = () => container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    expect(rows()[0].style.cursor).toBe('grab');

    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');

    expect(rows()[0].style.cursor).toBe('default');
  });
});

describe('SetTracklist multi-select', () => {
  function makeEntries(): TracklistEntry[] {
    return [
      makeEntry({ id: 1, track_id: 10, position: 0 }),
      makeEntry({ id: 2, track_id: 20, position: 1 }),
      makeEntry({ id: 3, track_id: 30, position: 2 }),
    ];
  }

  it('Cmd+click toggles row selection', () => {
    const { container } = renderTracklist(makeEntries());
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { metaKey: true });
    expect(rows[0].classList.contains('row-multiselected')).toBe(true);

    fireEvent.click(rows[0], { metaKey: true });
    expect(rows[0].classList.contains('row-multiselected')).toBe(false);
  });

  it('Cmd+click selects multiple rows independently', () => {
    const { container } = renderTracklist(makeEntries());
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { metaKey: true });
    fireEvent.click(rows[2], { metaKey: true });
    expect(rows[0].classList.contains('row-multiselected')).toBe(true);
    expect(rows[1].classList.contains('row-multiselected')).toBe(false);
    expect(rows[2].classList.contains('row-multiselected')).toBe(true);
  });

  it('shows selection count when rows are selected', () => {
    const { container } = renderTracklist(makeEntries());
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    expect(container.querySelector('.tracklist-selection-count')).toBeNull();

    fireEvent.click(rows[0], { metaKey: true });
    expect(container.querySelector('.tracklist-selection-count')?.textContent).toBe('1 selected');

    fireEvent.click(rows[1], { metaKey: true });
    expect(container.querySelector('.tracklist-selection-count')?.textContent).toBe('2 selected');
  });

  it('shows Delete Selected button when multiple rows are selected', () => {
    const { container } = renderTracklist(makeEntries());
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { metaKey: true });
    fireEvent.click(rows[1], { metaKey: true });

    const deleteSelectedBtn = screen.getByText('Delete Selected');
    expect(deleteSelectedBtn).toBeTruthy();
  });

  it('plain click does not toggle selection', () => {
    const { container } = renderTracklist(makeEntries());
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0]);
    expect(rows[0].classList.contains('row-multiselected')).toBe(false);
  });

  it('Ctrl+click also toggles selection (Windows support)', () => {
    const { container } = renderTracklist(makeEntries());
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { ctrlKey: true });
    expect(rows[0].classList.contains('row-multiselected')).toBe(true);
  });
});

describe('SetTracklist confirm-delete modal', () => {
  function makeEntries(): TracklistEntry[] {
    return [
      makeEntry({ id: 1, track_id: 10, position: 0 }),
      makeEntry({ id: 2, track_id: 20, position: 1 }),
      makeEntry({ id: 3, track_id: 30, position: 2 }),
    ];
  }

  it('shows confirm modal when deleting a row that is part of a multi-selection', () => {
    const onRemove = vi.fn();
    const { container } = renderTracklist(makeEntries(), { onRemove });
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { metaKey: true });
    fireEvent.click(rows[1], { metaKey: true });

    const deleteBtn = rows[0].querySelector('.set-action-btn--danger') as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    expect(container.querySelector('.tracklist-confirm-overlay')).toBeTruthy();
    expect(screen.getByText(/Delete 2 selected tracks/)).toBeTruthy();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('calls onRemove for each selected track on confirm', () => {
    const onRemove = vi.fn();
    const { container } = renderTracklist(makeEntries(), { onRemove });
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { metaKey: true });
    fireEvent.click(rows[2], { metaKey: true });

    const deleteBtn = rows[0].querySelector('.set-action-btn--danger') as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    const confirmBtn = screen.getByText('Delete');
    fireEvent.click(confirmBtn);

    expect(onRemove).toHaveBeenCalledTimes(2);
    const calledArgs = onRemove.mock.calls.map((c: number[]) => c[0]);
    expect(calledArgs.sort()).toEqual([10, 30]);
  });

  it('dismisses modal on cancel without deleting', () => {
    const onRemove = vi.fn();
    const { container } = renderTracklist(makeEntries(), { onRemove });
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { metaKey: true });
    fireEvent.click(rows[1], { metaKey: true });

    const deleteBtn = rows[0].querySelector('.set-action-btn--danger') as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    expect(container.querySelector('.tracklist-confirm-overlay')).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('calls onRemove directly when deleting a non-selected row', () => {
    const onRemove = vi.fn();
    const { container } = renderTracklist(makeEntries(), { onRemove });
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    const deleteBtn = rows[1].querySelector('.set-action-btn--danger') as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    expect(onRemove).toHaveBeenCalledWith(20);
    expect(container.querySelector('.tracklist-confirm-overlay')).toBeNull();
  });

  it('calls onRemove directly when only one row is selected and its delete is clicked', () => {
    const onRemove = vi.fn();
    const { container } = renderTracklist(makeEntries(), { onRemove });
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { metaKey: true });

    const deleteBtn = rows[0].querySelector('.set-action-btn--danger') as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    expect(onRemove).toHaveBeenCalledWith(10);
    expect(container.querySelector('.tracklist-confirm-overlay')).toBeNull();
  });

  it('clears selection after confirmed bulk delete', () => {
    const onRemove = vi.fn();
    const { container } = renderTracklist(makeEntries(), { onRemove });
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { metaKey: true });
    fireEvent.click(rows[1], { metaKey: true });

    fireEvent.click(screen.getByText('Delete Selected'));
    fireEvent.click(screen.getByText('Delete'));

    expect(container.querySelector('.tracklist-selection-count')).toBeNull();
  });

  it('dismisses modal when clicking the overlay backdrop', () => {
    const onRemove = vi.fn();
    const { container } = renderTracklist(makeEntries(), { onRemove });
    const rows = container.querySelectorAll<HTMLTableRowElement>('.set-tracklist-table tbody tr');

    fireEvent.click(rows[0], { metaKey: true });
    fireEvent.click(rows[1], { metaKey: true });

    const deleteBtn = rows[0].querySelector('.set-action-btn--danger') as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    const overlay = container.querySelector('.tracklist-confirm-overlay')!;
    fireEvent.click(overlay);

    expect(container.querySelector('.tracklist-confirm-overlay')).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });
});
