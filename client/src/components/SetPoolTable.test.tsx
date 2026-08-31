import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetPoolTable } from './SetPoolTable'
import {
  TRACKLIST_ROW_MIME,
  POOL_ROW_MIME,
  TRACK_DRAG_MIME,
  TRACK_MULTI_MIME,
} from '../utils'
import type { PoolEntry, PoolSubgroup, PoolSubgroupMembership } from '../types'
import {
  testPoolTableProps,
  columnHeaderLabel,
} from '../test/tablePreferenceHelpers'
import { MIN_COL_WIDTH } from '../tablePreferences'

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
}))

beforeEach(() => {
  sessionStorage.clear()
})

function makePoolEntry(
  overrides: Partial<PoolEntry> & { id: number; track_id: number },
): PoolEntry {
  return {
    set_id: 1,
    insertion_order: 0,
    highlight_color: null,
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
  }
}

const noop = () => {}
const asyncTrue = () => Promise.resolve(true)
const asyncNull = () => Promise.resolve(null)

function renderPool(
  entries: PoolEntry[],
  subgroups: PoolSubgroup[] = [],
  memberships: PoolSubgroupMembership[] = [],
  extra?: Partial<React.ComponentProps<typeof SetPoolTable>>,
) {
  return render(
    <SetPoolTable
      allTracks={[]}
      pool={entries}
      subgroups={subgroups}
      subgroupMemberships={memberships}
      onRemove={noop}
      onReorder={noop}
      onReorderSubgroupMember={asyncTrue}
      onSetHighlight={noop}
      onAddTrack={noop}
      onCreateSubgroup={asyncNull}
      onRenameSubgroup={asyncTrue}
      onDeleteSubgroup={asyncTrue}
      onReorderSubgroups={asyncTrue}
      onAddSubgroupMember={asyncTrue}
      onRemoveSubgroupMember={asyncTrue}
      onDropTrackToSubgroup={noop}
      onDropFromTracklist={noop}
      {...testPoolTableProps}
      {...extra}
    />,
  )
}

/**
 * Toggle the group-navigation dropdown in the pool header and return the tab
 * buttons inside the revealed panel. Call only while the menu is closed.
 */
function openGroupMenu(container: HTMLElement) {
  fireEvent.click(container.querySelector('.pool-group-menu-trigger')!)
  // The panel is portalled to <body>, so query the document, not the
  // render container.
  return document.querySelectorAll('.pool-tab-bar .pool-tab')
}

/**
 * Open the group menu and click the tab at `index` (0 = All, 1 = Groups,
 * 2+ = subgroups). Selecting a tab closes the menu on a short delay (so a
 * double-click rename can cancel it), so wait for the panel to disappear
 * before returning.
 */
async function selectPoolTab(container: HTMLElement, index: number) {
  const tabs = openGroupMenu(container)
  fireEvent.click(tabs[index])
  await waitFor(() =>
    expect(document.querySelector('.pool-group-menu-panel')).toBeNull(),
  )
}

describe('SetPoolTable', () => {
  it('renders a semantic HTML table', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })])
    expect(container.querySelector('table.set-pool-table')).toBeTruthy()
    expect(container.querySelector('thead')).toBeTruthy()
    expect(container.querySelector('tbody')).toBeTruthy()
  })

  it('uses shared set-ws-th class on headers', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })])
    const thElements = container.querySelectorAll('th.set-ws-th')
    expect(thElements.length).toBeGreaterThanOrEqual(5)
  })

  it('renders key and BPM in dedicated cells', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })])
    const row = container.querySelector('tbody tr')!
    expect(row.querySelector('.set-ws-cell-key')?.textContent).toBe('5A')
    expect(row.querySelector('.set-ws-cell-bpm')?.textContent).toBe('130')
  })

  it('uses colgroup for column widths and a left-side row remove control', () => {
    const onRemove = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      [],
      [],
      { onRemove },
    )
    expect(container.querySelector('col.set-ws-col-remove')).toBeTruthy()
    expect(container.querySelector('col.set-ws-col-num')).toBeTruthy()
    expect(container.querySelector('col.set-ws-col-title')).toBeTruthy()
    expect(container.querySelector('col.set-ws-col-key')).toBeTruthy()
    expect(container.querySelector('col.set-ws-col-bpm')).toBeTruthy()
    expect(container.querySelector('col.set-ws-col-actions-pool')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from pool' }))
    expect(onRemove).toHaveBeenCalledWith(10)
  })

  it('shows empty message when pool is empty', () => {
    renderPool([])
    expect(screen.getByText(/pool is empty/i)).toBeTruthy()
  })
})

describe('SetPoolTable multi-sort', () => {
  function makeEntries(): PoolEntry[] {
    return [
      makePoolEntry({
        id: 1,
        track_id: 10,
        insertion_order: 0,
        track: {
          id: 10,
          title: 'Bravo',
          artist_names: [],
          bpm: 140,
          key: null,
          camelot_code: '5A',
          genre: null,
          label: null,
          energy: null,
          date_added: null,
        },
      }),
      makePoolEntry({
        id: 2,
        track_id: 20,
        insertion_order: 1,
        track: {
          id: 20,
          title: 'Alpha',
          artist_names: [],
          bpm: 120,
          key: null,
          camelot_code: '6A',
          genre: null,
          label: null,
          energy: null,
          date_added: null,
        },
      }),
    ]
  }

  function rowTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.set-ws-cell-title')).map(
      (td) => td.textContent ?? '',
    )
  }

  it('single click sorts by one column ascending then toggles descending', () => {
    const { container } = renderPool(makeEntries())
    const titleHeader = screen.getByRole('columnheader', { name: /title/i })
    fireEvent.click(titleHeader)
    expect(rowTitles(container)).toEqual(['Alpha', 'Bravo'])
    fireEvent.click(titleHeader)
    expect(rowTitles(container)).toEqual(['Bravo', 'Alpha'])
  })

  it('shift-click adds a second sort column with precedence indicators', () => {
    const { container } = renderPool(makeEntries())
    const titleHeader = screen.getByRole('columnheader', { name: /title/i })
    fireEvent.click(titleHeader)
    const bpmHeader = screen.getByRole('columnheader', { name: /^bpm/i })
    fireEvent.click(bpmHeader, { shiftKey: true })
    const precedence = container.querySelectorAll('.sort-precedence')
    expect(precedence.length).toBe(2)
  })

  it('click without shift replaces multi-sort with single column', () => {
    const { container } = renderPool(makeEntries())
    const titleHeader = screen.getByRole('columnheader', { name: /title/i })
    fireEvent.click(titleHeader)
    const bpmHeader = screen.getByRole('columnheader', { name: /^bpm/i })
    fireEvent.click(bpmHeader, { shiftKey: true })
    fireEvent.click(bpmHeader)
    expect(container.querySelectorAll('.sort-precedence').length).toBe(0)
    expect(rowTitles(container)).toEqual(['Alpha', 'Bravo'])
  })
})

describe('SetPoolTable tiered sort bar', () => {
  it('renders the sort tier bar with the default # tier', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })])
    expect(container.querySelector('.sort-tier-bar')).toBeTruthy()
    const pill = container.querySelector('.sort-tier-pill')
    expect(pill?.querySelector('.sort-tier-label')?.textContent).toBe('#')
  })

  it('adds a tier via +Sort and applies it to row order', () => {
    const entries = [
      makePoolEntry({ id: 1, track_id: 10, insertion_order: 0 }),
      makePoolEntry({ id: 2, track_id: 20, insertion_order: 1 }),
    ]
    const { container } = renderPool(entries)
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }))
    fireEvent.mouseDown(screen.getByText('Title', { selector: 'li' }))
    const pills = container.querySelectorAll('.sort-tier-pill')
    expect(pills.length).toBe(2)
  })

  it('removes a tier from the bar', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })])
    fireEvent.click(screen.getByRole('button', { name: /remove # sort/i }))
    expect(container.querySelectorAll('.sort-tier-pill').length).toBe(0)
  })
})

describe('SetPoolTable per-group sorting', () => {
  const subgroups: PoolSubgroup[] = [
    { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
  ]

  function entryWithTitle(id: number, order: number, title: string): PoolEntry {
    const entry = makePoolEntry({
      id,
      track_id: id * 10,
      insertion_order: order,
    })
    entry.track = { ...entry.track!, title }
    return entry
  }

  // Insertion order Zulu → Mike → Alpha, so a title sort visibly reorders.
  // Warmup holds Zulu + Mike; Peak holds Mike + Alpha.
  function makeEntries(): PoolEntry[] {
    return [
      entryWithTitle(1, 0, 'Zulu'),
      entryWithTitle(2, 1, 'Mike'),
      entryWithTitle(3, 2, 'Alpha'),
    ]
  }

  const memberships: PoolSubgroupMembership[] = [
    { id: 1, subgroup_id: 1, pool_entry_id: 1, display_order: 0 },
    { id: 2, subgroup_id: 1, pool_entry_id: 2, display_order: 1 },
    { id: 3, subgroup_id: 2, pool_entry_id: 2, display_order: 0 },
    { id: 4, subgroup_id: 2, pool_entry_id: 3, display_order: 1 },
  ]

  function rowTitles(root: Element): string[] {
    return Array.from(root.querySelectorAll('.set-ws-cell-title')).map(
      (td) => td.textContent ?? '',
    )
  }

  it('sorting a group tab does not affect the All tab', async () => {
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    await selectPoolTab(container, 2) // Warmup
    fireEvent.click(screen.getByRole('columnheader', { name: /title/i }))
    expect(rowTitles(container)).toEqual(['Mike', 'Zulu'])

    await selectPoolTab(container, 0) // All
    expect(rowTitles(container)).toEqual(['Zulu', 'Mike', 'Alpha'])
  })

  it('each Groups-view section has its own sort controls and state', async () => {
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    await selectPoolTab(container, 1) // Groups

    const sections = container.querySelectorAll('.subgroup-section')
    expect(sections.length).toBe(2)
    // Each section gets its own tier bar; the global one is hidden.
    expect(container.querySelectorAll('.sort-tier-bar').length).toBe(2)

    fireEvent.click(
      within(sections[0] as HTMLElement).getByRole('columnheader', {
        name: /title/i,
      }),
    )
    expect(rowTitles(sections[0])).toEqual(['Mike', 'Zulu'])
    expect(rowTitles(sections[1])).toEqual(['Mike', 'Alpha'])
  })

  it("sorting a Groups-view section carries to that group's tab", async () => {
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    await selectPoolTab(container, 1) // Groups

    const sections = container.querySelectorAll('.subgroup-section')
    fireEvent.click(
      within(sections[0] as HTMLElement).getByRole('columnheader', {
        name: /title/i,
      }),
    )

    await selectPoolTab(container, 2) // Warmup tab shares the section's sort scope
    expect(rowTitles(container)).toEqual(['Mike', 'Zulu'])

    await selectPoolTab(container, 3) // Peak keeps its own default order
    expect(rowTitles(container)).toEqual(['Mike', 'Alpha'])
  })
})

describe('SetPoolTable drag-and-drop row reordering', () => {
  const dragData = () => ({
    dataTransfer: { setData: noop, effectAllowed: '', dropEffect: '' },
  })

  function makeEntries(): PoolEntry[] {
    return [
      makePoolEntry({ id: 1, track_id: 10, insertion_order: 0 }),
      makePoolEntry({ id: 2, track_id: 20, insertion_order: 1 }),
      makePoolEntry({ id: 3, track_id: 30, insertion_order: 2 }),
    ]
  }

  it('calls onReorder with dragged track and drop index on the All tab', () => {
    const onReorder = vi.fn()
    const { container } = renderPool(makeEntries(), [], [], { onReorder })
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[2], dragData())
    fireEvent.dragOver(rows[0], dragData())
    fireEvent.drop(rows[0], dragData())
    expect(onReorder).toHaveBeenCalledWith(30, 0)
  })

  it('marks the hovered row as drop target while dragging', () => {
    const { container } = renderPool(makeEntries(), [], [], {})
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    fireEvent.dragOver(rows[1], dragData())
    expect(rows[1].classList.contains('set-row-drop-target')).toBe(true)
    expect(rows[0].classList.contains('set-row-dragging')).toBe(true)
  })

  it('does not reorder when sorted by a column other than #', () => {
    const onReorder = vi.fn()
    const { container } = renderPool(makeEntries(), [], [], { onReorder })
    fireEvent.click(screen.getByRole('columnheader', { name: /title/i }))
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    fireEvent.dragOver(rows[2], dragData())
    fireEvent.drop(rows[2], dragData())
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('does not reorder when dropped on the source row', () => {
    const onReorder = vi.fn()
    const { container } = renderPool(makeEntries(), [], [], { onReorder })
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[1], dragData())
    fireEvent.dragOver(rows[1], dragData())
    fireEvent.drop(rows[1], dragData())
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('maps drop index to subgroup member position on a subgroup tab', async () => {
    const onReorder = vi.fn()
    const subgroups: PoolSubgroup[] = [
      { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    ]
    // Subgroup members are entries 1 (order 0) and 3 (order 2); entry 2 is
    // in the pool but not in the group.
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 1, display_order: 0 },
      { id: 2, subgroup_id: 1, pool_entry_id: 3, display_order: 1 },
    ]
    const onReorderSubgroupMember = vi.fn().mockResolvedValue(true)
    const { container } = renderPool(makeEntries(), subgroups, memberships, {
      onReorderSubgroupMember,
    })
    await selectPoolTab(container, 2) // Warmup
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)
    // Drag track 30 (group index 1) onto track 10 (group index 0).
    fireEvent.dragStart(rows[1], dragData())
    fireEvent.dragOver(rows[0], dragData())
    fireEvent.drop(rows[0], dragData())
    expect(onReorderSubgroupMember).toHaveBeenCalledWith(1, 3, 0)
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('orders subgroup tab rows by membership display_order after rehydrate', async () => {
    const subgroups: PoolSubgroup[] = [
      { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    ]
    const alpha = makePoolEntry({
      id: 10,
      track_id: 100,
      insertion_order: 0,
    })
    alpha.track = { ...alpha.track!, title: 'Alpha' }
    const beta = makePoolEntry({
      id: 20,
      track_id: 200,
      insertion_order: 1,
    })
    beta.track = { ...beta.track!, title: 'Beta' }
    const gamma = makePoolEntry({
      id: 30,
      track_id: 300,
      insertion_order: 2,
    })
    gamma.track = { ...gamma.track!, title: 'Gamma' }
    const entries = [alpha, beta, gamma]
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 2 },
      { id: 2, subgroup_id: 1, pool_entry_id: 20, display_order: 0 },
      { id: 3, subgroup_id: 1, pool_entry_id: 30, display_order: 1 },
    ]
    const { container, rerender } = renderPool(entries, subgroups, memberships)
    await selectPoolTab(container, 2) // Warmup
    const rowTitles = () =>
      Array.from(container.querySelectorAll('.set-ws-cell-title')).map(
        (cell) => cell.textContent ?? '',
      )
    expect(rowTitles()).toEqual(['Beta', 'Gamma', 'Alpha'])

    rerender(
      <SetPoolTable
        allTracks={[]}
        pool={entries}
        subgroups={subgroups}
        subgroupMemberships={[
          { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 0 },
          { id: 2, subgroup_id: 1, pool_entry_id: 20, display_order: 2 },
          { id: 3, subgroup_id: 1, pool_entry_id: 30, display_order: 1 },
        ]}
        onRemove={noop}
        onReorder={noop}
        onReorderSubgroupMember={asyncTrue}
        onSetHighlight={noop}
        onAddTrack={noop}
        onCreateSubgroup={asyncNull}
        onRenameSubgroup={asyncTrue}
        onDeleteSubgroup={asyncTrue}
        onReorderSubgroups={asyncTrue}
        onAddSubgroupMember={asyncTrue}
        onRemoveSubgroupMember={asyncTrue}
        onDropTrackToSubgroup={noop}
        onDropFromTracklist={noop}
        {...testPoolTableProps}
      />,
    )
    expect(rowTitles()).toEqual(['Alpha', 'Gamma', 'Beta'])
  })
})

describe('SetPoolTable tab bar and subgroup features', () => {
  const subgroups: PoolSubgroup[] = [
    { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
  ]

  function makeEntries(): PoolEntry[] {
    return [
      makePoolEntry({ id: 10, track_id: 100, insertion_order: 0 }),
      makePoolEntry({ id: 20, track_id: 200, insertion_order: 1 }),
    ]
  }

  it('renders the tab bar with tablist role inside the open menu only', () => {
    const { container } = renderPool(makeEntries(), subgroups)
    expect(document.querySelector('.pool-tab-bar')).toBeNull()
    openGroupMenu(container)
    const bar = document.querySelector('.pool-group-menu-panel .pool-tab-bar')
    expect(bar).toBeTruthy()
    expect(bar!.getAttribute('role')).toBe('tablist')
  })

  it('renders All, Groups, and subgroup tabs in order', () => {
    const { container } = renderPool(makeEntries(), subgroups)
    const tabs = Array.from(openGroupMenu(container)).map((b) => b.textContent)
    expect(tabs[0]).toBe('All')
    expect(tabs[1]).toBe('Groups')
    expect(tabs[2]).toMatch(/^Warmup/)
    expect(tabs[3]).toMatch(/^Peak/)
  })

  it('All tab is active by default', () => {
    const { container } = renderPool(makeEntries(), subgroups)
    const tabs = openGroupMenu(container)
    expect(tabs[0].classList.contains('pool-tab--active')).toBe(true)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  })

  it('shows member counts on subgroup tabs', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 0 },
      { id: 2, subgroup_id: 1, pool_entry_id: 20, display_order: 1 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    openGroupMenu(container)
    const counts = Array.from(document.querySelectorAll('.pool-tab-count')).map(
      (el) => el.textContent,
    )
    expect(counts).toEqual(['2', '0'])
  })

  it('shows a dot only for the groups a track actually belongs to', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 0 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    const rows = container.querySelectorAll('tbody tr')
    const cell10 = rows[0].querySelector('.set-ws-cell-subgroups')!
    const pills10 = cell10.querySelectorAll('.subgroup-dot-pill')
    expect(pills10.length).toBe(1)
    expect(pills10[0].textContent).toBe('Warmup')
    // A non-member row shows no dots (unlike the old always-expanded chips).
    const cell20 = rows[1].querySelector('.set-ws-cell-subgroups')!
    expect(cell20.querySelectorAll('.subgroup-dot-pill').length).toBe(0)
  })

  it('stacks a dot-pill per group a multi-group track is in', () => {
    const manyGroups: PoolSubgroup[] = [
      { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
      { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
      { id: 3, set_id: 1, name: 'Cooldown', display_order: 2 },
    ]
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 0 },
      { id: 2, subgroup_id: 2, pool_entry_id: 10, display_order: 0 },
      { id: 3, subgroup_id: 3, pool_entry_id: 10, display_order: 0 },
    ]
    const { container } = renderPool(makeEntries(), manyGroups, memberships)
    const cell = container.querySelector('td.set-ws-cell-subgroups')!
    const pills = cell.querySelectorAll('.subgroup-dots > .subgroup-dot-pill')
    expect(Array.from(pills).map((p) => p.textContent)).toEqual([
      'Warmup',
      'Peak',
      'Cooldown',
    ])
    // Each dot carries a color (assigned from the group palette).
    expect(
      Array.from(pills).every(
        (p) =>
          (p.querySelector('.subgroup-dot') as HTMLElement).style.background,
      ),
    ).toBe(true)
  })

  it('shows a blank clickable cell when a row has no memberships', () => {
    const { container } = renderPool(makeEntries(), subgroups, [])
    const cell = container.querySelector('td.set-ws-cell-subgroups')!
    expect(cell.querySelectorAll('.subgroup-dot-pill').length).toBe(0)
    expect(cell.querySelector('.subgroup-assign-input')).toBeNull()
    expect(cell.querySelector('.subgroup-cell-trigger--empty')).toBeTruthy()
  })

  it('clicking subgroup tab shows only filtered tracks', async () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 0 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    await selectPoolTab(container, 2) // Warmup
    expect(container.querySelectorAll('.set-pool-table tbody tr').length).toBe(
      1,
    )
    await selectPoolTab(container, 0) // All
    expect(container.querySelectorAll('.set-pool-table tbody tr').length).toBe(
      2,
    )
  })

  it('Groups tab renders one section per subgroup with counts', async () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 0 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    await selectPoolTab(container, 1) // Groups
    const sections = container.querySelectorAll('.subgroup-section')
    expect(sections.length).toBe(2)
    expect(
      sections[0].querySelector('.subgroup-section-title')?.textContent,
    ).toBe('Warmup')
    expect(
      sections[0].querySelector('.subgroup-section-count')?.textContent,
    ).toBe('1 track')
    expect(sections[1].textContent).toContain('No tracks in Peak.')
  })

  it('Groups tab shows guidance when no subgroups exist', async () => {
    const { container } = renderPool(makeEntries(), [])
    await selectPoolTab(container, 1) // Groups
    expect(screen.getByText(/no groups yet/i)).toBeTruthy()
  })

  it('clicking create group button shows input and submits on Enter', async () => {
    const onCreateSubgroup = vi.fn().mockResolvedValue({
      id: 3,
      set_id: 1,
      name: 'Cooldown',
      display_order: 2,
    })
    const { container } = renderPool(makeEntries(), subgroups, [], {
      onCreateSubgroup,
    })
    openGroupMenu(container)
    fireEvent.click(document.querySelector('.pool-tab-create')!)
    const input = document.querySelector('.subgroup-new-input')!
    fireEvent.change(input, { target: { value: 'Cooldown' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(onCreateSubgroup).toHaveBeenCalledWith('Cooldown')
    })
    // Creating a group keeps the menu open.
    expect(document.querySelector('.pool-group-menu-panel')).toBeTruthy()
  })

  it('double-clicking a subgroup tab opens rename input and keeps the menu open', async () => {
    const onRenameSubgroup = vi.fn().mockResolvedValue(true)
    const { container } = renderPool(makeEntries(), subgroups, [], {
      onRenameSubgroup,
    })
    const tabs = openGroupMenu(container)
    fireEvent.doubleClick(tabs[2])
    const input = document.querySelector('.subgroup-rename-input')!
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Openers' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(onRenameSubgroup).toHaveBeenCalledWith(1, 'Openers')
    })
    expect(document.querySelector('.pool-group-menu-panel')).toBeTruthy()
  })

  it('renders Groups column header only when subgroups exist', () => {
    const withGroups = renderPool(makeEntries(), subgroups)
    expect(
      Array.from(withGroups.container.querySelectorAll('th.set-ws-th')).find(
        (th) => columnHeaderLabel(th as HTMLElement) === 'Groups',
      ),
    ).toBeTruthy()
    withGroups.unmount()

    const withoutGroups = renderPool(makeEntries(), [])
    expect(
      Array.from(withoutGroups.container.querySelectorAll('th.set-ws-th')).find(
        (th) => columnHeaderLabel(th as HTMLElement) === 'Groups',
      ),
    ).toBeUndefined()
  })

  it('colgroup, thead, and tbody column counts stay aligned', () => {
    for (const sgs of [[], subgroups]) {
      const { container, unmount } = renderPool(makeEntries(), sgs)
      const cols = container.querySelectorAll('colgroup col')
      const ths = container.querySelectorAll('thead th')
      const firstRowTds = container.querySelectorAll('tbody tr:first-child td')
      expect(cols.length).toBe(ths.length)
      expect(cols.length).toBe(firstRowTds.length)
      unmount()
    }
  })

  it('toggling membership via the groups checklist calls add or remove', () => {
    const onAddSubgroupMember = vi.fn().mockResolvedValue(true)
    const onRemoveSubgroupMember = vi.fn().mockResolvedValue(true)
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 0 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships, {
      onAddSubgroupMember,
      onRemoveSubgroupMember,
    })
    const firstRow = container.querySelector('tbody tr')!
    fireEvent.click(firstRow.querySelector('.subgroup-cell-trigger')!)
    // The checklist floats at <body> so the table's scroller cannot clip it.
    const items = document.querySelectorAll('.subgroup-modal-item')
    fireEvent.click(items[0]) // Warmup active → remove
    expect(onRemoveSubgroupMember).toHaveBeenCalledWith(1, 10)
    fireEvent.click(items[1]) // Peak inactive → add
    expect(onAddSubgroupMember).toHaveBeenCalledWith(2, 10)
  })

  it('opens the filter popup from a filled cell without showing an inline input', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 0 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    const cell = container.querySelector('td.set-ws-cell-subgroups')!
    expect(cell.querySelector('.subgroup-dot-pill')).toBeTruthy()
    expect(cell.querySelector('.subgroup-assign-input')).toBeNull()
    fireEvent.click(cell.querySelector('.subgroup-cell-trigger')!)
    expect(
      document.querySelector('.subgroup-modal .subgroup-assign-input'),
    ).toBeTruthy()
    expect(
      (document.querySelector('.subgroup-assign-input') as HTMLInputElement)
        .placeholder,
    ).toBe('')
  })

  it('filters groups and offers Create new group for non-exact input', async () => {
    const onCreateSubgroup = vi.fn().mockResolvedValue({
      id: 9,
      set_id: 1,
      name: 'Warm',
      display_order: 2,
    })
    const onAddSubgroupMember = vi.fn().mockResolvedValue(true)
    const { container } = renderPool(makeEntries(), subgroups, [], {
      onCreateSubgroup,
      onAddSubgroupMember,
    })
    fireEvent.click(container.querySelector('.subgroup-cell-trigger')!)
    const input = document.querySelector('.subgroup-assign-input')!
    expect(
      document.querySelector('.subgroup-modal-create')?.textContent,
    ).toMatch(/Create new group/)
    fireEvent.change(input, { target: { value: 'Warm' } })
    const items = document.querySelectorAll('.subgroup-modal-item')
    expect(Array.from(items).map((el) => el.textContent)).toEqual(['Warmup'])
    fireEvent.click(document.querySelector('.subgroup-modal-create')!)
    await waitFor(() => {
      expect(onCreateSubgroup).toHaveBeenCalledWith('Warm')
      expect(onAddSubgroupMember).toHaveBeenCalledWith(9, 10)
    })
  })

  it('hides Create new group when input exactly matches an existing name', () => {
    const { container } = renderPool(makeEntries(), subgroups, [])
    fireEvent.click(container.querySelector('.subgroup-cell-trigger')!)
    const input = document.querySelector('.subgroup-assign-input')!
    fireEvent.change(input, { target: { value: 'Warmup' } })
    expect(document.querySelector('.subgroup-modal-create')).toBeNull()
  })
})

describe('SetPoolTable tab drag-and-drop reordering', () => {
  const subgroups: PoolSubgroup[] = [
    { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
    { id: 3, set_id: 1, name: 'Cooldown', display_order: 2 },
  ]

  const dragData = () => ({
    dataTransfer: { setData: noop, effectAllowed: '', dropEffect: '' },
  })

  /** Open the group menu (drag reordering lives in its panel) and return the
   * per-group tab wrappers. Reorder actions keep the menu open. */
  function getWrappers(container: HTMLElement) {
    openGroupMenu(container)
    return document.querySelectorAll('.pool-tab-wrapper')
  }

  it('does not render move left/right arrow buttons', () => {
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
    )
    openGroupMenu(container)
    expect(screen.queryByTitle('Move left')).toBeNull()
    expect(screen.queryByTitle('Move right')).toBeNull()
  })

  it('dropping a dragged tab on another tab reorders the subgroups', () => {
    const onReorderSubgroups = vi.fn().mockResolvedValue(true)
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
      [],
      { onReorderSubgroups },
    )
    const wrappers = getWrappers(container)
    fireEvent.dragStart(wrappers[0], dragData())
    fireEvent.dragOver(wrappers[2], dragData())
    fireEvent.drop(wrappers[2], dragData())
    expect(onReorderSubgroups).toHaveBeenCalledWith([2, 3, 1])
  })

  it('marks the hovered tab as drop target while dragging', () => {
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
    )
    const wrappers = getWrappers(container)
    fireEvent.dragStart(wrappers[0], dragData())
    fireEvent.dragOver(wrappers[1], dragData())
    expect(
      wrappers[1].classList.contains('pool-tab-wrapper--drop-target'),
    ).toBe(true)
    expect(wrappers[0].classList.contains('pool-tab-wrapper--dragging')).toBe(
      true,
    )
  })

  it('does not reorder when dropped on the source tab', () => {
    const onReorderSubgroups = vi.fn().mockResolvedValue(true)
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
      [],
      { onReorderSubgroups },
    )
    const wrappers = getWrappers(container)
    fireEvent.dragStart(wrappers[1], dragData())
    fireEvent.dragOver(wrappers[1], dragData())
    fireEvent.drop(wrappers[1], dragData())
    expect(onReorderSubgroups).not.toHaveBeenCalled()
  })

  it('clears drag state on dragEnd', () => {
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
    )
    const wrappers = getWrappers(container)
    fireEvent.dragStart(wrappers[0], dragData())
    fireEvent.dragOver(wrappers[2], dragData())
    fireEvent.dragEnd(wrappers[0], dragData())
    expect(
      wrappers[2].classList.contains('pool-tab-wrapper--drop-target'),
    ).toBe(false)
    expect(wrappers[0].classList.contains('pool-tab-wrapper--dragging')).toBe(
      false,
    )
  })
})

describe('SetPoolTable multi-selection', () => {
  function makeEntries(): PoolEntry[] {
    return [
      makePoolEntry({ id: 10, track_id: 100, insertion_order: 0 }),
      makePoolEntry({ id: 20, track_id: 200, insertion_order: 1 }),
      makePoolEntry({ id: 30, track_id: 300, insertion_order: 2 }),
    ]
  }

  it('removes every selected track from the pool, one at a time', async () => {
    const onRemove = vi.fn()
    const { container } = renderPool(makeEntries(), [], [], { onRemove })

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all the pool' }),
    )
    // Scoped to the selection bar: every row also has its own remove button.
    const bar = within(container.querySelector('.sel-bar') as HTMLElement)
    fireEvent.click(bar.getByRole('button', { name: 'Remove from pool' }))

    await waitFor(() =>
      expect(onRemove.mock.calls.map((call) => call[0])).toEqual([
        100, 200, 300,
      ]),
    )
    expect(container.querySelectorAll('tr.is-multi-selected')).toHaveLength(0)
  })

  it('offers removal from the group only on a group tab', async () => {
    const onRemoveSubgroupMember = vi.fn().mockResolvedValue(true)
    const { container } = renderPool(
      makeEntries(),
      [{ id: 7, set_id: 1, name: 'Warmup', display_order: 0 }],
      [{ id: 1, subgroup_id: 7, pool_entry_id: 20, display_order: 0 }],
      { onRemoveSubgroupMember },
    )

    // On the All tab a track's group is ambiguous, so the action is absent.
    fireEvent.click(container.querySelectorAll('tbody tr')[1])
    expect(
      screen.queryByRole('button', { name: 'Remove from group' }),
    ).toBeNull()

    await selectPoolTab(container, 2)
    fireEvent.click(container.querySelector('tbody tr')!)
    fireEvent.click(screen.getByRole('button', { name: 'Remove from group' }))

    // Membership is keyed by pool entry, not by track.
    await waitFor(() =>
      expect(onRemoveSubgroupMember).toHaveBeenCalledWith(7, 20),
    )
  })

  it('drags the whole selection when a selected row is grabbed', () => {
    const { container } = renderPool(makeEntries())
    const rows = container.querySelectorAll('tbody tr')

    fireEvent.click(rows[0])
    fireEvent.click(rows[2], { metaKey: true })

    const setData = vi.fn()
    fireEvent.dragStart(rows[0], {
      dataTransfer: { setData, effectAllowed: '', dropEffect: '' },
    })
    expect(setData).toHaveBeenCalledWith(TRACK_MULTI_MIME, '[100,300]')

    // A row outside the selection drags only itself.
    const soloSetData = vi.fn()
    fireEvent.dragStart(rows[1], {
      dataTransfer: { setData: soloSetData, effectAllowed: '', dropEffect: '' },
    })
    expect(soloSetData).toHaveBeenCalledWith(POOL_ROW_MIME, '200')
    expect(soloSetData).not.toHaveBeenCalledWith(
      TRACK_MULTI_MIME,
      expect.anything(),
    )
  })
})

describe('SetPoolTable cross-panel drag-and-drop', () => {
  const crossDragData = (mime: string, trackId: number) => ({
    dataTransfer: {
      types: [mime],
      getData: (m: string) => (m === mime ? String(trackId) : ''),
      setData: noop,
      effectAllowed: '',
      dropEffect: '',
    },
  })

  /** A drag out of a multi-selection: the grabbed row, plus the whole set. */
  const multiDragData = (mime: string, primary: number, ids: number[]) => ({
    dataTransfer: {
      types: [mime, TRACK_MULTI_MIME],
      getData: (m: string) =>
        m === TRACK_MULTI_MIME
          ? JSON.stringify(ids)
          : m === mime
            ? String(primary)
            : '',
      setData: noop,
      effectAllowed: '',
      dropEffect: '',
    },
  })

  it('tags row drags with the pool row MIME type', () => {
    const setData = vi.fn()
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })])
    const row = container.querySelector('tbody tr')!
    fireEvent.dragStart(row, {
      dataTransfer: { setData, effectAllowed: '', dropEffect: '' },
    })
    expect(setData).toHaveBeenCalledWith(POOL_ROW_MIME, '10')
  })

  it('moves a dropped tracklist row into the pool', () => {
    const onDropFromTracklist = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      [],
      [],
      { onDropFromTracklist },
    )
    const panel = container.querySelector('.set-pool')!
    fireEvent.drop(panel, crossDragData(TRACKLIST_ROW_MIME, 20))
    expect(onDropFromTracklist).toHaveBeenCalledWith(20)
  })

  it('ignores drops of its own row MIME type', () => {
    const onDropFromTracklist = vi.fn()
    const onAddTrack = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      [],
      [],
      { onDropFromTracklist, onAddTrack },
    )
    const panel = container.querySelector('.set-pool')!
    fireEvent.drop(panel, crossDragData(POOL_ROW_MIME, 10))
    expect(onDropFromTracklist).not.toHaveBeenCalled()
    expect(onAddTrack).not.toHaveBeenCalled()
  })

  // Each add waits for the one before it: appending concurrently would land
  // them in whatever order the requests happened to finish in.
  it('adds every track of a multi-track drag, in the dragged order', async () => {
    const onAddTrack = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      [],
      [],
      { onAddTrack },
    )
    const panel = container.querySelector('.set-pool')!
    fireEvent.drop(panel, multiDragData(TRACK_DRAG_MIME, 42, [42, 43, 44]))
    await waitFor(() =>
      expect(onAddTrack.mock.calls.map((call) => call[0])).toEqual([
        42, 43, 44,
      ]),
    )
  })

  // The group tab open is the list on screen, so a drop lands in it, not
  // merely in the pool behind it.
  it('files a drop into the open group rather than the bare pool', async () => {
    const onDropTrackToSubgroup = vi.fn()
    const onAddTrack = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      [{ id: 7, set_id: 1, name: 'Warmup', display_order: 0 }],
      [],
      { onDropTrackToSubgroup, onAddTrack },
    )
    await selectPoolTab(container, 2)

    const panel = container.querySelector('.set-pool')!
    fireEvent.drop(panel, crossDragData(TRACK_DRAG_MIME, 42))
    expect(onDropTrackToSubgroup).toHaveBeenCalledWith(7, 42, 'browse')
    expect(onAddTrack).not.toHaveBeenCalled()

    // A tracklist row moves into the group the same way, keeping its source
    // so the server pools it out of the tracklist rather than copying it.
    fireEvent.drop(panel, crossDragData(TRACKLIST_ROW_MIME, 55))
    expect(onDropTrackToSubgroup).toHaveBeenCalledWith(7, 55, 'tracklist')
  })

  it('still drops into the bare pool on the All tab', () => {
    const onDropTrackToSubgroup = vi.fn()
    const onAddTrack = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      [{ id: 7, set_id: 1, name: 'Warmup', display_order: 0 }],
      [],
      { onDropTrackToSubgroup, onAddTrack },
    )
    const panel = container.querySelector('.set-pool')!
    fireEvent.drop(panel, crossDragData(TRACK_DRAG_MIME, 42))
    expect(onAddTrack).toHaveBeenCalledWith(42, undefined)
    expect(onDropTrackToSubgroup).not.toHaveBeenCalled()
  })
})

describe('SetPoolTable subgroup track drops', () => {
  const subgroups: PoolSubgroup[] = [
    { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
  ]

  const crossDragData = (mime: string, trackId: number) => ({
    dataTransfer: {
      types: [mime],
      getData: (m: string) => (m === mime ? String(trackId) : ''),
      setData: noop,
      effectAllowed: '',
      dropEffect: '',
    },
  })

  /** Group tabs are drop targets only while the menu panel is open. */
  function openTabWrappers(container: HTMLElement) {
    openGroupMenu(container)
    return document.querySelectorAll('.pool-tab-wrapper')
  }

  it('maps browse drag onto a subgroup tab to source browse', () => {
    const onDropTrackToSubgroup = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
      [],
      { onDropTrackToSubgroup },
    )
    const tabWrapper = openTabWrappers(container)[0]
    fireEvent.drop(tabWrapper, crossDragData(TRACK_DRAG_MIME, 42))
    expect(onDropTrackToSubgroup).toHaveBeenCalledWith(1, 42, 'browse')
  })

  it('maps tracklist drag onto a subgroup tab to source tracklist', () => {
    const onDropTrackToSubgroup = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
      [],
      { onDropTrackToSubgroup },
    )
    const tabWrapper = openTabWrappers(container)[0]
    fireEvent.drop(tabWrapper, crossDragData(TRACKLIST_ROW_MIME, 55))
    expect(onDropTrackToSubgroup).toHaveBeenCalledWith(1, 55, 'tracklist')
  })

  it('maps pool row drag onto a subgroup tab to source pool', () => {
    const onDropTrackToSubgroup = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
      [],
      { onDropTrackToSubgroup },
    )
    const tabWrapper = openTabWrappers(container)[0]
    fireEvent.drop(tabWrapper, crossDragData(POOL_ROW_MIME, 10))
    expect(onDropTrackToSubgroup).toHaveBeenCalledWith(1, 10, 'pool')
  })

  it('files every track of a multi-track drag onto a subgroup tab', async () => {
    const onDropTrackToSubgroup = vi.fn()
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
      [],
      { onDropTrackToSubgroup },
    )
    const tabWrapper = openTabWrappers(container)[0]
    fireEvent.drop(tabWrapper, {
      dataTransfer: {
        types: [TRACK_DRAG_MIME, TRACK_MULTI_MIME],
        getData: (m: string) =>
          m === TRACK_MULTI_MIME ? '[42,43]' : m === TRACK_DRAG_MIME ? '42' : '',
        setData: noop,
        effectAllowed: '',
        dropEffect: '',
      },
    })
    await waitFor(() =>
      expect(onDropTrackToSubgroup.mock.calls.map((call) => call[1])).toEqual([
        42, 43,
      ]),
    )
  })

  it('marks subgroup tab as track-drop target while hovering', () => {
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      subgroups,
      [],
      { onDropTrackToSubgroup: noop },
    )
    const tabWrapper = openTabWrappers(container)[0]
    fireEvent.dragOver(tabWrapper, crossDragData(TRACK_DRAG_MIME, 42))
    expect(
      tabWrapper.classList.contains('pool-tab-wrapper--track-drop-target'),
    ).toBe(true)
  })

  it('still reorders tabs when dragging text/plain without track MIME', () => {
    const onReorderSubgroups = vi.fn()
    const twoGroups: PoolSubgroup[] = [
      { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
      { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
    ]
    const { container } = renderPool(
      [makePoolEntry({ id: 1, track_id: 10 })],
      twoGroups,
      [],
      { onReorderSubgroups },
    )
    const wrappers = openTabWrappers(container)
    fireEvent.dragStart(wrappers[0], {
      dataTransfer: { setData: noop, effectAllowed: '', dropEffect: '' },
    })
    fireEvent.drop(wrappers[1], {
      dataTransfer: { setData: noop, effectAllowed: '', dropEffect: '' },
    })
    expect(onReorderSubgroups).toHaveBeenCalledWith([2, 1])
  })
})

describe('SetPoolTable group menu', () => {
  const subgroups: PoolSubgroup[] = [
    { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
  ]

  function makeEntries(): PoolEntry[] {
    return [
      makePoolEntry({ id: 10, track_id: 100, insertion_order: 0 }),
      makePoolEntry({ id: 20, track_id: 200, insertion_order: 1 }),
    ]
  }

  it('renders the trigger in the header trailing slot', () => {
    const { container } = renderPool(makeEntries(), subgroups)
    expect(
      container.querySelector(
        '.ds-table-header-trailing .pool-group-menu-trigger',
      ),
    ).toBeTruthy()
  })

  it('trigger shows the active tab', async () => {
    const { container } = renderPool(makeEntries(), subgroups)
    const label = () =>
      container.querySelector('.pool-group-menu-label')?.textContent
    expect(label()).toBe('All')
    // No color dot while a non-group tab is active.
    expect(
      container.querySelector('.pool-group-menu-trigger .subgroup-dot'),
    ).toBeNull()

    await selectPoolTab(container, 2) // Warmup
    expect(label()).toBe('Warmup')
    const dot = container.querySelector<HTMLElement>(
      '.pool-group-menu-trigger .subgroup-dot',
    )
    expect(dot).toBeTruthy()
    expect(dot!.style.background).toBeTruthy()

    await selectPoolTab(container, 1) // Groups
    expect(label()).toBe('Groups')
  })

  it('opening the menu reveals the group tabs and Create new group', () => {
    const { container } = renderPool(makeEntries(), subgroups)
    expect(document.querySelector('.pool-group-menu-panel')).toBeNull()

    const tabs = openGroupMenu(container)
    expect(document.querySelector('.pool-group-menu-panel')).toBeTruthy()
    expect(Array.from(tabs).map((t) => t.textContent)).toEqual([
      'All',
      'Groups',
      expect.stringMatching(/^Warmup/),
      expect.stringMatching(/^Peak/),
    ])
    expect(
      screen.getByRole('button', { name: 'Create group' }).textContent,
    ).toBe('Create new group')
  })

  it('selecting a group switches the table contents and closes the menu', async () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10, display_order: 0 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    expect(container.querySelectorAll('tbody tr').length).toBe(2)

    await selectPoolTab(container, 2) // Warmup
    expect(container.querySelectorAll('tbody tr').length).toBe(1)
    expect(document.querySelector('.pool-group-menu-panel')).toBeNull()
  })

  it('closes on Escape and on outside click without changing the tab', () => {
    const { container } = renderPool(makeEntries(), subgroups)
    openGroupMenu(container)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.pool-group-menu-panel')).toBeNull()

    openGroupMenu(container)
    fireEvent.click(document.body)
    expect(document.querySelector('.pool-group-menu-panel')).toBeNull()
    // Still on All: both rows visible.
    expect(container.querySelectorAll('tbody tr').length).toBe(2)
  })

  it('creating a group from the menu calls the handler and keeps it open', async () => {
    const onCreateSubgroup = vi.fn().mockResolvedValue({
      id: 3,
      set_id: 1,
      name: 'Cooldown',
      display_order: 2,
    })
    const { container } = renderPool(makeEntries(), subgroups, [], {
      onCreateSubgroup,
    })
    openGroupMenu(container)
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
    const input = document.querySelector('.subgroup-new-input')!
    fireEvent.change(input, { target: { value: 'Cooldown' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(onCreateSubgroup).toHaveBeenCalledWith('Cooldown')
    })
    expect(document.querySelector('.pool-group-menu-panel')).toBeTruthy()
  })
})

describe('SetPoolTable title display', () => {
  it('shows the metadata prefix verbatim, matching the track browser', () => {
    const entry = makePoolEntry({ id: 1, track_id: 10 })
    entry.track = { ...entry.track!, title: '[05A - Cm - 130.00] Pool Song' }
    const { container } = renderPool([entry])
    expect(container.querySelector('.set-ws-cell-title')?.textContent).toBe(
      '[05A - Cm - 130.00] Pool Song',
    )
  })
})

describe('SetPoolTable filtering', () => {
  function keyedEntries(): PoolEntry[] {
    const a = makePoolEntry({ id: 1, track_id: 10 })
    const b = makePoolEntry({ id: 2, track_id: 20 })
    b.track = { ...b.track!, camelot_code: '9A' }
    return [a, b]
  }

  it('offers a Key filter alongside BPM', async () => {
    renderPool(keyedEntries())
    await userEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    const items = [...document.querySelectorAll('.filter-add-menu-item')].map(
      (el) => el.textContent,
    )
    expect(items).toEqual(['BPM', 'Key'])
  })

  it('narrows the pool to the selected camelot codes', async () => {
    const { container } = renderPool(keyedEntries())
    expect(container.querySelectorAll('.set-ws-cell-title').length).toBe(2)

    await userEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    await userEvent.click(screen.getByRole('button', { name: 'Key' }))
    const popover = screen.getByRole('dialog', { name: 'Value filter' })
    // Options come from the codes actually present in the pool.
    expect(
      [...popover.querySelectorAll('.filter-option')].map((el) =>
        el.textContent?.trim(),
      ),
    ).toEqual(['5A', '9A'])
    await userEvent.click(within(popover).getByLabelText('9A'))

    expect(
      [...container.querySelectorAll('.set-ws-cell-title')].map(
        (el) => el.textContent,
      ),
    ).toEqual(['Pool Track 20'])
  })
})

describe('SetPoolTable columns', () => {
  const entries = [makePoolEntry({ id: 1, track_id: 10 })]

  /** Column widths as the browser would apply them, read off the <colgroup>. */
  function colWidths(container: HTMLElement) {
    const table = container.querySelector('.set-pool-table') as HTMLElement
    const widths: Record<string, string> = {}
    table.querySelectorAll('col').forEach((col, i) => {
      widths[String(i)] = (col as HTMLElement).style.width
    })
    return widths
  }

  function headerFor(container: HTMLElement, label: string): HTMLElement {
    return within(container).getByLabelText(label).closest('th') as HTMLElement
  }

  function dragResizer(th: HTMLElement, dx: number) {
    const resizer = th.querySelector('.col-resizer') as HTMLElement
    // jsdom reports a zero rect, so the drag starts from 0 and the floor wins
    // unless dx clears it — which is exactly what the min-width case asserts.
    fireEvent.mouseDown(resizer, { clientX: 0 })
    fireEvent.mouseMove(document, { clientX: dx })
    fireEvent.mouseUp(document)
  }

  it('gives the Pre. column a resize handle and a drag handle like any other', () => {
    const { container } = renderPool(entries)
    const th = headerFor(container, 'Pre.')

    // It used to render as a bare cell, with neither affordance.
    expect(th.querySelector('.col-resizer')).not.toBeNull()
    expect(th.querySelector('[draggable="true"]')).not.toBeNull()
  })

  it('carries Pre. as the dragged column when its header starts a drag', () => {
    const { container } = renderPool(entries)
    const handle = headerFor(container, 'Pre.').querySelector(
      '[draggable="true"]',
    ) as HTMLElement
    const setData = vi.fn()

    fireEvent.dragStart(handle, {
      dataTransfer: { setData, effectAllowed: '', types: [] },
    })

    expect(setData).toHaveBeenCalledWith('text/plain', 'play')
  })

  it('resizes only the dragged column, leaving its neighbours alone', () => {
    const { container } = renderPool(entries)
    const before = colWidths(container)
    const resizer = headerFor(container, 'Key').querySelector(
      '.col-resizer',
    ) as HTMLElement

    // Asserted mid-drag: on mouse-up the width is handed to the parent, which
    // is a mock here and so never feeds a new config back in.
    fireEvent.mouseDown(resizer, { clientX: 0 })
    fireEvent.mouseMove(document, { clientX: 200 })
    const during = colWidths(container)
    fireEvent.mouseUp(document)

    // <col> order is: remove gutter, play, num, title, key, bpm.
    expect(during['4']).not.toBe(before['4'])
    for (const i of ['1', '2', '3', '5']) {
      expect(during[i]).toBe(before[i])
    }
  })

  it('lets a column go down to the shared 40px floor', () => {
    const onColumnWidthFlush = vi.fn()
    const { container } = renderPool(entries, [], [], { onColumnWidthFlush })

    dragResizer(headerFor(container, 'Title'), -500)

    expect(onColumnWidthFlush).toHaveBeenCalledWith('title', MIN_COL_WIDTH)
  })

  it('sizes the table to the sum of its columns rather than the container', () => {
    const { container } = renderPool(entries)
    const table = container.querySelector('.set-pool-table') as HTMLElement

    // An explicit total is what stops table-layout:fixed redistributing space
    // between columns on every resize.
    expect(table.style.width).toMatch(/^\d+px$/)
  })
})
