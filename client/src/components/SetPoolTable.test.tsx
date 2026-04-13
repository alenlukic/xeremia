import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SetPoolTable } from './SetPoolTable';
import type { PoolEntry } from '../types';

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

function makePoolEntry(overrides: Partial<PoolEntry> & { id: number; track_id: number }): PoolEntry {
  return {
    set_id: 1,
    insertion_order: 0,
    starred: false,
    track: {
      id: overrides.track_id,
      title: `Pool Track ${overrides.track_id}`,
      artist_names: [],
      bpm: 130,
      key: 'Cminor',
      camelot_code: '5A',
      genre: null,
      label: null,
      energy: null,
    },
    ...overrides,
  };
}

const noop = () => {};

function renderPool(entries: PoolEntry[]) {
  return render(
    <DndContext>
      <SetPoolTable
        pool={entries}
        onRemove={noop}
        onMoveToTracklist={noop}
        onToggleStar={noop}
        onAddTrack={noop}
      />
    </DndContext>,
  );
}

describe('SetPoolTable', () => {
  it('renders a semantic HTML table', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    expect(container.querySelector('table.set-pool-table')).toBeTruthy();
    expect(container.querySelector('thead')).toBeTruthy();
    expect(container.querySelector('tbody')).toBeTruthy();
  });

  it('uses shared set-ws-th class on headers', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    const thElements = container.querySelectorAll('th.set-ws-th');
    expect(thElements.length).toBeGreaterThanOrEqual(5);
  });

  it('renders key and BPM in dedicated cells', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    const row = container.querySelector('tbody tr')!;
    expect(row.querySelector('.set-ws-cell-key')?.textContent).toBe('5A');
    expect(row.querySelector('.set-ws-cell-bpm')?.textContent).toBe('130');
  });

  it('uses colgroup for column widths', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    expect(container.querySelector('col.set-ws-col-num')).toBeTruthy();
    expect(container.querySelector('col.set-ws-col-title')).toBeTruthy();
    expect(container.querySelector('col.set-ws-col-key')).toBeTruthy();
    expect(container.querySelector('col.set-ws-col-bpm')).toBeTruthy();
    expect(container.querySelector('col.set-ws-col-actions-pool')).toBeTruthy();
  });

  it('renders actions with shared set-ws-actions-group class', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    expect(container.querySelector('.set-ws-actions-group')).toBeTruthy();
  });

  it('shows empty message when pool is empty', () => {
    renderPool([]);
    expect(screen.getByText(/pool is empty/i)).toBeTruthy();
  });
});

describe('SetPoolTable multi-sort', () => {
  function makeEntries(): PoolEntry[] {
    return [
      makePoolEntry({
        id: 1, track_id: 10, insertion_order: 0,
        track: { id: 10, title: 'Beta', artist_names: [], bpm: 120, key: 'C', camelot_code: '5A', genre: null, label: null, energy: null },
      }),
      makePoolEntry({
        id: 2, track_id: 20, insertion_order: 1,
        track: { id: 20, title: 'Alpha', artist_names: [], bpm: 130, key: 'D', camelot_code: '3B', genre: null, label: null, energy: null },
      }),
      makePoolEntry({
        id: 3, track_id: 30, insertion_order: 2,
        track: { id: 30, title: 'Alpha', artist_names: [], bpm: 120, key: 'E', camelot_code: '8A', genre: null, label: null, energy: null },
      }),
    ];
  }

  function getTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.set-pool-table tbody .set-ws-cell-title'))
      .map(el => el.textContent ?? '');
  }

  it('single click sorts by one column ascending then toggles to descending', () => {
    const { container } = renderPool(makeEntries());
    const titleTh = screen.getByText('Title');

    fireEvent.click(titleTh);
    expect(getTitles(container)).toEqual(['Alpha', 'Alpha', 'Beta']);

    fireEvent.click(titleTh);
    expect(getTitles(container)).toEqual(['Beta', 'Alpha', 'Alpha']);
  });

  it('shift-click adds second sort column and shows precedence indicators', () => {
    const { container } = renderPool(makeEntries());
    const titleTh = screen.getByText('Title');
    const bpmTh = screen.getByText('BPM');

    fireEvent.click(titleTh);
    let indicators = container.querySelectorAll('.sort-indicator');
    expect(indicators.length).toBe(1);
    expect(container.querySelectorAll('.sort-precedence').length).toBe(0);

    fireEvent.click(bpmTh, { shiftKey: true });
    indicators = container.querySelectorAll('.sort-indicator');
    expect(indicators.length).toBe(2);
    const precedences = container.querySelectorAll('.sort-precedence');
    expect(precedences.length).toBe(2);
    expect(precedences[0].textContent).toBe('1');
    expect(precedences[1].textContent).toBe('2');
  });

  it('multi-sort applies the full sort stack to row order (title then bpm)', () => {
    const { container } = renderPool(makeEntries());
    const titleTh = screen.getByText('Title');
    const bpmTh = screen.getByText('BPM');

    fireEvent.click(titleTh);
    fireEvent.click(bpmTh, { shiftKey: true });

    const titles = getTitles(container);
    expect(titles).toEqual(['Alpha', 'Alpha', 'Beta']);

    const bpms = Array.from(container.querySelectorAll('.set-pool-table tbody .set-ws-cell-bpm'))
      .map(el => el.textContent ?? '');
    expect(bpms).toEqual(['120', '130', '120']);
  });

  it('click without shift replaces multi-sort with single column', () => {
    const { container } = renderPool(makeEntries());
    const titleTh = screen.getByText('Title');
    const bpmTh = screen.getByText('BPM');
    const keyTh = screen.getByText('Key');

    fireEvent.click(titleTh);
    fireEvent.click(bpmTh, { shiftKey: true });
    expect(container.querySelectorAll('.sort-indicator').length).toBe(2);

    fireEvent.click(keyTh);
    expect(container.querySelectorAll('.sort-indicator').length).toBe(1);
    expect(container.querySelectorAll('.sort-precedence').length).toBe(0);
  });
});
