import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SetPoolTable } from './SetPoolTable'
import type { PoolEntry, PoolSubgroup, PoolSubgroupMembership } from '../types'

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
    const titleHeader = screen.getByText(/^Title/, { selector: 'th' })
    fireEvent.click(titleHeader)
    expect(rowTitles(container)).toEqual(['Alpha', 'Bravo'])
    fireEvent.click(titleHeader)
    expect(rowTitles(container)).toEqual(['Bravo', 'Alpha'])
  })

  it('shift-click adds a second sort column with precedence indicators', () => {
    const { container } = renderPool(makeEntries())
    const titleHeader = screen.getByText(/^Title/, { selector: 'th' })
    fireEvent.click(titleHeader)
    const bpmHeader = screen.getByText(/^BPM/, { selector: 'th' })
    fireEvent.click(bpmHeader, { shiftKey: true })
    const precedence = container.querySelectorAll('.sort-precedence')
    expect(precedence.length).toBe(2)
  })

  it('click without shift replaces multi-sort with single column', () => {
    const { container } = renderPool(makeEntries())
    const titleHeader = screen.getByText(/^Title/, { selector: 'th' })
    fireEvent.click(titleHeader)
    const bpmHeader = screen.getByText(/^BPM/, { selector: 'th' })
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
    fireEvent.click(screen.getByText(/^Title/, { selector: 'th' }))
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

  it('shows subgroup chips and marks active memberships', () => {
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 1, pool_entry_id: 10 },
    ]
    const { container } = renderPool(makeEntries(), subgroups, memberships)
    expect(container.querySelectorAll('.subgroup-chip').length).toBe(4)
    const activeChips = container.querySelectorAll('.subgroup-chip.active')
    expect(activeChips.length).toBe(1)
    expect(activeChips[0].textContent).toBe('Warmup')
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
        (th) => th.textContent === 'Groups',
      ),
    ).toBeTruthy()
    withGroups.unmount()

    const withoutGroups = renderPool(makeEntries(), [])
    expect(
      Array.from(withoutGroups.container.querySelectorAll('th.set-ws-th')).find(
        (th) => th.textContent === 'Groups',
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

  it('toggling a chip calls add or remove membership', () => {
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
    const chips = firstRow.querySelectorAll('.subgroup-chip')
    fireEvent.click(chips[0]) // active → remove from Warmup
    expect(onRemoveSubgroupMember).toHaveBeenCalledWith(1, 10)
    fireEvent.click(chips[1]) // inactive → add to Peak
    expect(onAddSubgroupMember).toHaveBeenCalledWith(2, 10)
  })
})
