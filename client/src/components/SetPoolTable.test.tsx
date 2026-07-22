import { describe, it, expect, vi } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetPoolTable } from './SetPoolTable'
import { TRACKLIST_ROW_MIME, POOL_ROW_MIME } from '../utils'
import type { PoolEntry, PoolSubgroup, PoolSubgroupMembership } from '../types'
import {
  testPoolTableProps,
  columnHeaderLabel,
} from '../test/tablePreferenceHelpers'

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
}))

function makePoolEntry(
  overrides: Partial<PoolEntry> & { id: number; track_id: number },
): PoolEntry {
  return {
    set_id: 1,
    insertion_order: 0,
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
      onMoveToTracklist={noop}
      onReorder={noop}
      onAddTrack={noop}
      onCreateSubgroup={asyncNull}
      onRenameSubgroup={asyncTrue}
      onDeleteSubgroup={asyncTrue}
      onReorderSubgroups={asyncTrue}
      onAddSubgroupMember={asyncTrue}
      onRemoveSubgroupMember={asyncTrue}
      onDropFromTracklist={noop}
      {...testPoolTableProps}
      {...extra}
    />,
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

  it('uses colgroup for column widths', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })])
    expect(container.querySelector('col.set-ws-col-num')).toBeTruthy()
    expect(container.querySelector('col.set-ws-col-title')).toBeTruthy()
    expect(container.querySelector('col.set-ws-col-key')).toBeTruthy()
    expect(container.querySelector('col.set-ws-col-bpm')).toBeTruthy()
    expect(container.querySelector('col.set-ws-col-actions-pool')).toBeTruthy()
  })

  it('renders actions with shared set-ws-actions-group class', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })])
    expect(container.querySelector('.set-ws-actions-group')).toBeTruthy()
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
    { id: 1, subgroup_id: 1, pool_entry_id: 1 },
    { id: 2, subgroup_id: 1, pool_entry_id: 2 },
    { id: 3, subgroup_id: 2, pool_entry_id: 2 },
    { id: 4, subgroup_id: 2, pool_entry_id: 3 },
  ]

  function rowTitles(root: Element): string[] {
    return Array.from(root.querySelectorAll('.set-ws-cell-title')).map(
      (td) => td.textContent ?? '',
    )
  }

  it('sorting a group tab does not affect the All tab', () => {
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    const tabs = container.querySelectorAll('.pool-tab-bar .pool-tab')
    fireEvent.click(tabs[2]) // Warmup
    fireEvent.click(screen.getByRole('columnheader', { name: /title/i }))
    expect(rowTitles(container)).toEqual(['Mike', 'Zulu'])

    fireEvent.click(tabs[0]) // All
    expect(rowTitles(container)).toEqual(['Zulu', 'Mike', 'Alpha'])
  })

  it('each Groups-view section has its own sort controls and state', () => {
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    fireEvent.click(container.querySelectorAll('.pool-tab-bar .pool-tab')[1])

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

  it("sorting a Groups-view section carries to that group's tab", () => {
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    const tabs = container.querySelectorAll('.pool-tab-bar .pool-tab')
    fireEvent.click(tabs[1]) // Groups

    const sections = container.querySelectorAll('.subgroup-section')
    fireEvent.click(
      within(sections[0] as HTMLElement).getByRole('columnheader', {
        name: /title/i,
      }),
    )

    fireEvent.click(tabs[2]) // Warmup tab shares the section's sort scope
    expect(rowTitles(container)).toEqual(['Mike', 'Zulu'])

    fireEvent.click(tabs[3]) // Peak keeps its own default order
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

  it('maps drop index to full-pool position on a subgroup tab', () => {
    const onReorder = vi.fn()
    const subgroups: PoolSubgroup[] = [
      { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    ]
    // Subgroup members are entries 1 (order 0) and 3 (order 2); entry 2 is
    // in the pool but not in the group.
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 1 },
      { id: 2, subgroup_id: 1, pool_entry_id: 3 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships, {
      onReorder,
    })
    fireEvent.click(
      container.querySelectorAll('.pool-tab-bar .pool-tab')[2], // Warmup
    )
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)
    // Drag track 30 (full-pool rank 2) onto track 10 (full-pool rank 0).
    fireEvent.dragStart(rows[1], dragData())
    fireEvent.dragOver(rows[0], dragData())
    fireEvent.drop(rows[0], dragData())
    expect(onReorder).toHaveBeenCalledWith(30, 0)
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

  it('renders the pool tab bar with tablist role', () => {
    const { container } = renderPool(makeEntries(), subgroups)
    const bar = container.querySelector('.pool-tab-bar')
    expect(bar).toBeTruthy()
    expect(bar!.getAttribute('role')).toBe('tablist')
  })

  it('renders All, Groups, and subgroup tabs in order', () => {
    const { container } = renderPool(makeEntries(), subgroups)
    const bar = container.querySelector('.pool-tab-bar')!
    const tabs = Array.from(bar.querySelectorAll('.pool-tab')).map(
      (b) => b.textContent,
    )
    expect(tabs[0]).toBe('All')
    expect(tabs[1]).toBe('Groups')
    expect(tabs[2]).toMatch(/^Warmup/)
    expect(tabs[3]).toMatch(/^Peak/)
  })

  it('All tab is active by default', () => {
    const { container } = renderPool(makeEntries(), subgroups)
    const tabs = container.querySelectorAll('.pool-tab-bar .pool-tab')
    expect(tabs[0].classList.contains('pool-tab--active')).toBe(true)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  })

  it('shows member counts on subgroup tabs', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
      { id: 2, subgroup_id: 1, pool_entry_id: 20 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    const counts = Array.from(
      container.querySelectorAll('.pool-tab-count'),
    ).map((el) => el.textContent)
    expect(counts).toEqual(['2', '0'])
  })

  it('shows a dot only for the groups a track actually belongs to', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
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
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
      { id: 2, subgroup_id: 2, pool_entry_id: 10 },
      { id: 3, subgroup_id: 3, pool_entry_id: 10 },
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
        (p) => (p.querySelector('.subgroup-dot') as HTMLElement).style
          .background,
      ),
    ).toBe(true)
  })

  it('shows no dots but offers the "+" editor when a row has no memberships', () => {
    const { container } = renderPool(makeEntries(), subgroups, [])
    const cell = container.querySelector('td.set-ws-cell-subgroups')!
    expect(cell.querySelectorAll('.subgroup-dot-pill').length).toBe(0)
    expect(cell.querySelector('.subgroup-add-inline')).toBeTruthy()
  })

  it('clicking subgroup tab shows only filtered tracks', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    const tabs = container.querySelectorAll('.pool-tab-bar .pool-tab')
    fireEvent.click(tabs[2]) // Warmup
    expect(container.querySelectorAll('.set-pool-table tbody tr').length).toBe(
      1,
    )
    fireEvent.click(tabs[0]) // All
    expect(container.querySelectorAll('.set-pool-table tbody tr').length).toBe(
      2,
    )
  })

  it('Groups tab renders one section per subgroup with counts', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    const tabs = container.querySelectorAll('.pool-tab-bar .pool-tab')
    fireEvent.click(tabs[1]) // Groups
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

  it('Groups tab shows guidance when no subgroups exist', () => {
    const { container } = renderPool(makeEntries(), [])
    const tabs = container.querySelectorAll('.pool-tab-bar .pool-tab')
    fireEvent.click(tabs[1]) // Groups
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
    fireEvent.click(container.querySelector('.subgroup-add-btn')!)
    const input = container.querySelector('.subgroup-new-input')!
    fireEvent.change(input, { target: { value: 'Cooldown' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(onCreateSubgroup).toHaveBeenCalledWith('Cooldown')
    })
  })

  it('double-clicking a subgroup tab opens rename input', async () => {
    const onRenameSubgroup = vi.fn().mockResolvedValue(true)
    const { container } = renderPool(makeEntries(), subgroups, [], {
      onRenameSubgroup,
    })
    const tabs = container.querySelectorAll('.pool-tab-bar .pool-tab')
    fireEvent.doubleClick(tabs[2])
    const input = container.querySelector('.subgroup-rename-input')!
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Openers' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(onRenameSubgroup).toHaveBeenCalledWith(1, 'Openers')
    })
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

  it('toggling membership via the "+" modal calls add or remove', () => {
    const onAddSubgroupMember = vi.fn().mockResolvedValue(true)
    const onRemoveSubgroupMember = vi.fn().mockResolvedValue(true)
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships, {
      onAddSubgroupMember,
      onRemoveSubgroupMember,
    })
    const firstRow = container.querySelector('tbody tr')!
    fireEvent.click(firstRow.querySelector('.subgroup-add-inline')!)
    const items = firstRow.querySelectorAll('.subgroup-modal-item')
    fireEvent.click(items[0]) // Warmup active → remove
    expect(onRemoveSubgroupMember).toHaveBeenCalledWith(1, 10)
    fireEvent.click(items[1]) // Peak inactive → add
    expect(onAddSubgroupMember).toHaveBeenCalledWith(2, 10)
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

  function getWrappers(container: HTMLElement) {
    return container.querySelectorAll('.pool-tab-wrapper')
  }

  it('does not render move left/right arrow buttons', () => {
    renderPool([makePoolEntry({ id: 1, track_id: 10 })], subgroups)
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
