import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { searchTracks } from '../api/http';
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

describe('SetPoolTable tiered sort bar', () => {
  function makeEntries(): PoolEntry[] {
    return [
      makePoolEntry({
        id: 1, track_id: 10, insertion_order: 0,
        track: { id: 10, title: 'Charlie', artist_names: [], bpm: 140, key: 'C', camelot_code: '8A', genre: null, label: null, energy: null, date_added: null },
      }),
      makePoolEntry({
        id: 2, track_id: 20, insertion_order: 1,
        track: { id: 20, title: 'Alpha', artist_names: [], bpm: 120, key: 'D', camelot_code: '3B', genre: null, label: null, energy: null, date_added: null },
      }),
      makePoolEntry({
        id: 3, track_id: 30, insertion_order: 2,
        track: { id: 30, title: 'Alpha', artist_names: [], bpm: 130, key: 'E', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
      }),
    ];
  }

  function getTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.set-pool-table tbody .set-ws-cell-title'))
      .map(el => el.textContent ?? '');
  }

  function clickMenuItem(container: HTMLElement, label: string) {
    const items = container.querySelectorAll('.sort-tier-menu-item');
    const target = Array.from(items).find(el => el.textContent === label);
    if (!target) throw new Error(`Menu item "${label}" not found`);
    fireEvent.mouseDown(target);
  }

  it('renders the sort tier bar', () => {
    const { container } = renderPool(makeEntries());
    expect(container.querySelector('.sort-tier-bar')).toBeTruthy();
  });

  it('shows default # sort tier on mount', () => {
    const { container } = renderPool(makeEntries());
    const pills = container.querySelectorAll('.sort-tier-pill');
    expect(pills.length).toBe(1);
    expect(pills[0].querySelector('.sort-tier-label')?.textContent).toBe('#');
  });

  it('adds a tier via +Sort and applies it as secondary sort', () => {
    const { container } = renderPool(makeEntries());
    fireEvent.click(screen.getByRole('button', { name: /remove # sort/i }));
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');
    expect(getTitles(container)).toEqual(['Alpha', 'Alpha', 'Charlie']);
  });

  it('appends a second tier via +Sort for sub-sorting', () => {
    const { container } = renderPool(makeEntries());
    fireEvent.click(screen.getByRole('button', { name: /remove # sort/i }));
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');

    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'BPM');

    const bpms = Array.from(container.querySelectorAll('.set-pool-table tbody .set-ws-cell-bpm'))
      .map(el => el.textContent ?? '');
    expect(getTitles(container)).toEqual(['Alpha', 'Alpha', 'Charlie']);
    expect(bpms).toEqual(['120', '130', '140']);
  });

  it('removes a tier and updates sort', () => {
    const { container } = renderPool(makeEntries());
    fireEvent.click(screen.getByRole('button', { name: /remove # sort/i }));
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');
    expect(getTitles(container)[0]).toBe('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /remove title sort/i }));
    expect(getTitles(container)).toEqual(['Charlie', 'Alpha', 'Alpha']);
  });

  it('reorders tiers to change effective sort order', () => {
    const { container } = renderPool(makeEntries());
    fireEvent.click(screen.getByRole('button', { name: /remove # sort/i }));
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'BPM');
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    clickMenuItem(container, 'Title');

    const bpmsBefore = Array.from(container.querySelectorAll('.set-pool-table tbody .set-ws-cell-bpm'))
      .map(el => el.textContent ?? '');
    expect(bpmsBefore).toEqual(['120', '130', '140']);

    fireEvent.click(screen.getByRole('button', { name: /move title sort up/i }));
    const titlesAfter = getTitles(container);
    expect(titlesAfter).toEqual(['Alpha', 'Alpha', 'Charlie']);
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

describe('SetPoolTable subgroup auto-activate on create', () => {
  const baseSubgroups: PoolSubgroup[] = [
    { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
  ];
  const entries = [
    makePoolEntry({ id: 10, track_id: 100, insertion_order: 0 }),
    makePoolEntry({ id: 20, track_id: 200, insertion_order: 1 }),
  ];

  it('creating a subgroup sets it as the active filter', async () => {
    const newSg: PoolSubgroup = { id: 3, set_id: 1, name: 'Cooldown', display_order: 2 };
    const onCreateSubgroup = vi.fn().mockResolvedValue(newSg);

    const { container, rerender } = render(
      <DndContext>
        <SetPoolTable
          pool={entries}
          subgroups={baseSubgroups}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={noop}
          onCreateSubgroup={onCreateSubgroup}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={noopAsync}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    fireEvent.click(container.querySelector('.subgroup-add-btn')!);
    const input = container.querySelector('.subgroup-new-input')!;
    fireEvent.change(input, { target: { value: 'Cooldown' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onCreateSubgroup).toHaveBeenCalledWith('Cooldown');
    });

    rerender(
      <DndContext>
        <SetPoolTable
          pool={entries}
          subgroups={[...baseSubgroups, newSg]}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={noop}
          onCreateSubgroup={onCreateSubgroup}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={noopAsync}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    const filterBtns = container.querySelectorAll('.subgroup-bar .subgroup-filter-btn');
    const cooldownBtn = Array.from(filterBtns).find(b => b.textContent === 'Cooldown')!;
    expect(cooldownBtn.classList.contains('active')).toBe(true);

    const allBtn = Array.from(filterBtns).find(b => b.textContent === 'All')!;
    expect(allBtn.classList.contains('active')).toBe(false);
  });

  it('active filter on new subgroup shows empty-subgroup message when no members assigned', async () => {
    const newSg: PoolSubgroup = { id: 3, set_id: 1, name: 'Cooldown', display_order: 2 };
    const onCreateSubgroup = vi.fn().mockResolvedValue(newSg);

    const { container, rerender } = render(
      <DndContext>
        <SetPoolTable
          pool={entries}
          subgroups={baseSubgroups}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={noop}
          onCreateSubgroup={onCreateSubgroup}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={noopAsync}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    fireEvent.click(container.querySelector('.subgroup-add-btn')!);
    const input = container.querySelector('.subgroup-new-input')!;
    fireEvent.change(input, { target: { value: 'Cooldown' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onCreateSubgroup).toHaveBeenCalledWith('Cooldown');
    });

    rerender(
      <DndContext>
        <SetPoolTable
          pool={entries}
          subgroups={[...baseSubgroups, newSg]}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={noop}
          onCreateSubgroup={onCreateSubgroup}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={noopAsync}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    expect(screen.getByText(/no tracks in this subgroup/i)).toBeTruthy();
  });

  it('failed creation (null return) does not change the active filter', async () => {
    const onCreateSubgroup = vi.fn().mockResolvedValue(null);

    const { container } = render(
      <DndContext>
        <SetPoolTable
          pool={entries}
          subgroups={baseSubgroups}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={noop}
          onCreateSubgroup={onCreateSubgroup}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={noopAsync}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    fireEvent.click(container.querySelector('.subgroup-add-btn')!);
    const input = container.querySelector('.subgroup-new-input')!;
    fireEvent.change(input, { target: { value: 'Bad' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onCreateSubgroup).toHaveBeenCalledWith('Bad');
    });

    const allBtn = Array.from(container.querySelectorAll('.subgroup-bar .subgroup-filter-btn'))
      .find(b => b.textContent === 'All')!;
    expect(allBtn.classList.contains('active')).toBe(true);
    expect(container.querySelectorAll('.set-pool-table tbody tr').length).toBe(2);
  });
});

describe('SetPoolTable subgroup auto-assign on search-add', () => {
  const subgroups: PoolSubgroup[] = [
    { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
  ];
  const entries = [
    makePoolEntry({ id: 10, track_id: 100, insertion_order: 0 }),
    makePoolEntry({ id: 20, track_id: 200, insertion_order: 1 }),
  ];

  it('search-added track is auto-assigned to the active subgroup', async () => {
    const onAddTrack = vi.fn();
    const onAddSubgroupMember = vi.fn().mockResolvedValue(true);
    vi.mocked(searchTracks).mockResolvedValue([
      { id: 300, title: 'New Track', artist_names: [], bpm: 128, key: 'Am', camelot_code: '1A' },
    ]);

    const { container, rerender } = render(
      <DndContext>
        <SetPoolTable
          pool={entries}
          subgroups={subgroups}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={onAddTrack}
          onCreateSubgroup={noopAsyncNull}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={onAddSubgroupMember}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    const filterBtns = container.querySelectorAll('.subgroup-bar .subgroup-filter-btn');
    fireEvent.click(filterBtns[1]); // Warmup

    const searchInput = container.querySelector('.set-pool-search')!;
    fireEvent.change(searchInput, { target: { value: 'New' } });

    await waitFor(() => {
      expect(container.querySelector('.set-pool-search-dropdown')).toBeTruthy();
    });

    fireEvent.mouseDown(container.querySelector('.set-pool-search-item')!);
    expect(onAddTrack).toHaveBeenCalledWith(300, 'New Track');

    const newEntry = makePoolEntry({ id: 30, track_id: 300, insertion_order: 2 });
    rerender(
      <DndContext>
        <SetPoolTable
          pool={[...entries, newEntry]}
          subgroups={subgroups}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={onAddTrack}
          onCreateSubgroup={noopAsyncNull}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={onAddSubgroupMember}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    await waitFor(() => {
      expect(onAddSubgroupMember).toHaveBeenCalledWith(1, 30);
    });
  });

  it('auto-assigned track appears in filtered view after membership update', async () => {
    const onAddTrack = vi.fn();
    const onAddSubgroupMember = vi.fn().mockResolvedValue(true);
    vi.mocked(searchTracks).mockResolvedValue([
      { id: 300, title: 'New Track', artist_names: [], bpm: 128, key: 'Am', camelot_code: '1A' },
    ]);

    const { container, rerender } = render(
      <DndContext>
        <SetPoolTable
          pool={entries}
          subgroups={subgroups}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={onAddTrack}
          onCreateSubgroup={noopAsyncNull}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={onAddSubgroupMember}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    const filterBtns = container.querySelectorAll('.subgroup-bar .subgroup-filter-btn');
    fireEvent.click(filterBtns[1]); // Warmup

    const searchInput = container.querySelector('.set-pool-search')!;
    fireEvent.change(searchInput, { target: { value: 'New' } });

    await waitFor(() => {
      expect(container.querySelector('.set-pool-search-dropdown')).toBeTruthy();
    });

    fireEvent.mouseDown(container.querySelector('.set-pool-search-item')!);

    const newEntry = makePoolEntry({ id: 30, track_id: 300, insertion_order: 2 });
    rerender(
      <DndContext>
        <SetPoolTable
          pool={[...entries, newEntry]}
          subgroups={subgroups}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={onAddTrack}
          onCreateSubgroup={noopAsyncNull}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={onAddSubgroupMember}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    await waitFor(() => {
      expect(onAddSubgroupMember).toHaveBeenCalledWith(1, 30);
    });

    const membership: PoolSubgroupMembership = { id: 1, subgroup_id: 1, pool_entry_id: 30 };
    rerender(
      <DndContext>
        <SetPoolTable
          pool={[...entries, newEntry]}
          subgroups={subgroups}
          subgroupMemberships={[membership]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={onAddTrack}
          onCreateSubgroup={noopAsyncNull}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={onAddSubgroupMember}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    const rows = container.querySelectorAll('.set-pool-table tbody tr');
    expect(rows.length).toBe(1);
    const titleCell = rows[0].querySelector('.set-ws-cell-title');
    expect(titleCell?.textContent).toContain('300');
  });

  it('search-added track is not assigned when no subgroup is active', async () => {
    const onAddTrack = vi.fn();
    const onAddSubgroupMember = vi.fn().mockResolvedValue(true);
    vi.mocked(searchTracks).mockResolvedValue([
      { id: 300, title: 'New Track', artist_names: [], bpm: 128, key: 'Am', camelot_code: '1A' },
    ]);

    const { container, rerender } = render(
      <DndContext>
        <SetPoolTable
          pool={entries}
          subgroups={subgroups}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={onAddTrack}
          onCreateSubgroup={noopAsyncNull}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={onAddSubgroupMember}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    const searchInput = container.querySelector('.set-pool-search')!;
    fireEvent.change(searchInput, { target: { value: 'New' } });

    await waitFor(() => {
      expect(container.querySelector('.set-pool-search-dropdown')).toBeTruthy();
    });

    fireEvent.mouseDown(container.querySelector('.set-pool-search-item')!);

    const newEntry = makePoolEntry({ id: 30, track_id: 300, insertion_order: 2 });
    rerender(
      <DndContext>
        <SetPoolTable
          pool={[...entries, newEntry]}
          subgroups={subgroups}
          subgroupMemberships={[]}
          onRemove={noop}
          onMoveToTracklist={noop}
          onToggleStar={noop}
          onAddTrack={onAddTrack}
          onCreateSubgroup={noopAsyncNull}
          onRenameSubgroup={noopAsync}
          onDeleteSubgroup={noopAsync}
          onReorderSubgroups={noopAsync}
          onAddSubgroupMember={onAddSubgroupMember}
          onRemoveSubgroupMember={noopAsync}
        />
      </DndContext>,
    );

    expect(onAddSubgroupMember).not.toHaveBeenCalled();
  });
});
