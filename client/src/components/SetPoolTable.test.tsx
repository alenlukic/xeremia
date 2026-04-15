import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SetPoolTable } from './SetPoolTable';
import type { PoolEntry, PoolSubgroup, PoolSubgroupMembership } from '../types';

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
      date_added: null,
    },
    ...overrides,
  };
}

const noopAsync = () => Promise.resolve(true);
const noopAsyncNull = () => Promise.resolve(null);
const noop = () => {};

function renderPool(
  entries: PoolEntry[],
  subgroups: PoolSubgroup[] = [],
  memberships: PoolSubgroupMembership[] = [],
) {
  return render(
    <DndContext>
      <SetPoolTable
        pool={entries}
        subgroups={subgroups}
        subgroupMemberships={memberships}
        onRemove={noop}
        onMoveToTracklist={noop}
        onToggleStar={noop}
        onAddTrack={noop}
        onCreateSubgroup={noopAsyncNull}
        onRenameSubgroup={noopAsync}
        onDeleteSubgroup={noopAsync}
        onReorderSubgroups={noopAsync}
        onAddSubgroupMember={noopAsync}
        onRemoveSubgroupMember={noopAsync}
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

  it('wraps table in a scroll shell container', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    const scrollShell = container.querySelector('.set-table-scroll-shell');
    expect(scrollShell).toBeTruthy();
    expect(scrollShell!.querySelector('table.set-pool-table')).toBeTruthy();
  });

  it('places header outside the scroll shell', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    const pool = container.querySelector('.set-pool')!;
    const header = pool.querySelector('.set-pool-header')!;
    expect(header.closest('.set-table-scroll-shell')).toBeNull();
  });
});

describe('SetPoolTable multi-sort', () => {
  function makeEntries(): PoolEntry[] {
    return [
      makePoolEntry({
        id: 1, track_id: 10, insertion_order: 0,
        track: { id: 10, title: 'Beta', artist_names: [], bpm: 120, key: 'C', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
      }),
      makePoolEntry({
        id: 2, track_id: 20, insertion_order: 1,
        track: { id: 20, title: 'Alpha', artist_names: [], bpm: 130, key: 'D', camelot_code: '3B', genre: null, label: null, energy: null, date_added: null },
      }),
      makePoolEntry({
        id: 3, track_id: 30, insertion_order: 2,
        track: { id: 30, title: 'Alpha', artist_names: [], bpm: 120, key: 'E', camelot_code: '8A', genre: null, label: null, energy: null, date_added: null },
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

describe('SetPoolTable subgroup features', () => {
  const subgroups: PoolSubgroup[] = [
    { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
  ];

  function makeEntries(): PoolEntry[] {
    return [
      makePoolEntry({ id: 10, track_id: 100, insertion_order: 0 }),
      makePoolEntry({ id: 20, track_id: 200, insertion_order: 1 }),
    ];
  }

  it('renders the subgroup bar', () => {
    const { container } = renderPool(makeEntries(), subgroups);
    expect(container.querySelector('.subgroup-bar')).toBeTruthy();
  });

  it('renders "All" and subgroup filter buttons', () => {
    const { container } = renderPool(makeEntries(), subgroups);
    const bar = container.querySelector('.subgroup-bar')!;
    const btnTexts = Array.from(bar.querySelectorAll('.subgroup-filter-btn')).map(b => b.textContent);
    expect(btnTexts).toContain('All');
    expect(btnTexts).toContain('Warmup');
    expect(btnTexts).toContain('Peak');
  });

  it('renders create subgroup button', () => {
    const { container } = renderPool(makeEntries(), subgroups);
    expect(container.querySelector('.subgroup-add-btn')).toBeTruthy();
  });

  it('shows subgroup chips on rows when subgroups exist', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
    ];
    const { container } = renderPool(makeEntries(), subgroups, memberships);
    const chips = container.querySelectorAll('.subgroup-chip');
    expect(chips.length).toBeGreaterThan(0);
  });

  it('marks active chip for memberships', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
    ];
    const { container } = renderPool(makeEntries(), subgroups, memberships);
    const activeChips = container.querySelectorAll('.subgroup-chip.active');
    expect(activeChips.length).toBe(1);
    expect(activeChips[0].textContent).toBe('Warmup');
  });

  it('clicking subgroup filter shows only filtered tracks', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
    ];
    const { container } = renderPool(makeEntries(), subgroups, memberships);
    const filterBtns = container.querySelectorAll('.subgroup-bar .subgroup-filter-btn');
    fireEvent.click(filterBtns[1]); // Warmup

    const rows = container.querySelectorAll('.set-pool-table tbody tr');
    expect(rows.length).toBe(1);
  });

  it('clicking All filter shows all tracks', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
    ];
    const { container } = renderPool(makeEntries(), subgroups, memberships);
    const filterBtns = container.querySelectorAll('.subgroup-bar .subgroup-filter-btn');

    fireEvent.click(filterBtns[1]); // Warmup
    expect(container.querySelectorAll('.set-pool-table tbody tr').length).toBe(1);

    fireEvent.click(filterBtns[0]); // All
    expect(container.querySelectorAll('.set-pool-table tbody tr').length).toBe(2);
  });

  it('clicking create subgroup button shows input', () => {
    const { container } = renderPool(makeEntries(), subgroups);
    const addBtn = container.querySelector('.subgroup-add-btn')!;
    fireEvent.click(addBtn);
    expect(container.querySelector('.subgroup-new-input')).toBeTruthy();
  });

  it('renders Groups column header when subgroups exist', () => {
    renderPool(makeEntries(), subgroups);
    expect(screen.getByText('Groups')).toBeTruthy();
  });

  it('does not render Groups column header when no subgroups', () => {
    renderPool(makeEntries(), []);
    expect(screen.queryByText('Groups')).toBeNull();
  });

  it('colgroup, thead, and tbody column counts match when no subgroups', () => {
    const { container } = renderPool(makeEntries(), []);
    const cols = container.querySelectorAll('colgroup col');
    const ths = container.querySelectorAll('thead th');
    const firstRowTds = container.querySelectorAll('tbody tr:first-child td');
    expect(cols.length).toBe(ths.length);
    expect(cols.length).toBe(firstRowTds.length);
    expect(container.querySelector('.set-ws-col-subgroups')).toBeNull();
    expect(container.querySelector('.set-ws-cell-subgroups')).toBeNull();
  });

  it('colgroup, thead, and tbody column counts match when subgroups exist', () => {
    const { container } = renderPool(makeEntries(), subgroups);
    const cols = container.querySelectorAll('colgroup col');
    const ths = container.querySelectorAll('thead th');
    const firstRowTds = container.querySelectorAll('tbody tr:first-child td');
    expect(cols.length).toBe(ths.length);
    expect(cols.length).toBe(firstRowTds.length);
    expect(container.querySelector('.set-ws-col-subgroups')).toBeTruthy();
    expect(container.querySelector('.set-ws-cell-subgroups')).toBeTruthy();
  });
});
