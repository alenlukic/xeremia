import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  TableColumnControls,
  TableColumnEmptyRecovery,
} from './TableColumnControls'
import { MatchesPanel } from './MatchesPanel'
import { SetPoolTable } from './SetPoolTable'
import type { ColumnRegistryEntry } from '../tablePreferences'
import type { TransitionMatch, PoolEntry, PoolSubgroup } from '../types'
import {
  testMatchesPanelTableProps,
  testPoolTableProps,
} from '../test/tablePreferenceHelpers'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
}))

const inactive: ColumnRegistryEntry[] = [
  { id: 'label', label: 'Label', defaultVisible: false, defaultWidth: 90 },
  { id: 'genre', label: 'Genre', defaultVisible: false, defaultWidth: 90 },
]

const matchSource = {
  id: 1,
  title: 'On Deck',
  artist_names: ['A'],
  bpm: 128,
  key: 'C',
  camelot_code: '8B',
}

function makeMatch(overrides: Partial<TransitionMatch> = {}): TransitionMatch {
  return {
    candidate_id: 1,
    title: 'Test Track',
    overall_score: 85,
    bucket: 'same_key',
    camelot_score: 0.9,
    bpm_score: 0.85,
    energy_score: 0.7,
    similarity_score: 0.8,
    freshness_score: 0.6,
    genre_similarity_score: 0.75,
    mood_continuity_score: 0.65,
    vocal_clash_score: 0.5,
    instrument_similarity_score: 0.55,
    ...overrides,
  }
}

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

describe('TableColumnControls add-column affordance', () => {
  it('renders an add-column control when not inside a table header row', () => {
    render(
      <TableColumnControls
        label="Actions"
        inactiveColumns={inactive}
        onRemove={vi.fn()}
        onInsertAfter={vi.fn()}
      >
        ACTIONS
      </TableColumnControls>,
    )
    const addBtn = screen.getByRole('button', {
      name: 'Add column after Actions',
    })
    expect(addBtn.classList.contains('table-col-insert-btn')).toBe(true)
    expect(
      addBtn
        .closest('.table-col-controls')
        ?.querySelector('.table-col-insert-zone'),
    ).toBeTruthy()
  })

  it('renders add-column only on the rightmost th in a header row', async () => {
    render(
      <table>
        <thead>
          <tr>
            <th>
              <TableColumnControls
                label="Title"
                inactiveColumns={inactive}
                onRemove={vi.fn()}
                onInsertAfter={vi.fn()}
              >
                TITLE
              </TableColumnControls>
            </th>
            <th>
              <TableColumnControls
                label="BPM"
                inactiveColumns={inactive}
                onRemove={vi.fn()}
                onInsertAfter={vi.fn()}
              >
                BPM
              </TableColumnControls>
            </th>
            <th>
              <TableColumnControls
                label="Actions"
                inactiveColumns={inactive}
                onRemove={vi.fn()}
                onInsertAfter={vi.fn()}
              >
                ACTIONS
              </TableColumnControls>
            </th>
          </tr>
        </thead>
      </table>,
    )
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Add column after Title' }),
      ).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'Add column after BPM' }),
      ).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Add column after Actions' }),
      ).toBeTruthy()
    })
  })

  it('opens inactive-column menu with readable item class and inserts on selection', async () => {
    const onInsertAfter = vi.fn()
    render(
      <TableColumnControls
        label="Title"
        inactiveColumns={inactive}
        onRemove={vi.fn()}
        onInsertAfter={onInsertAfter}
      >
        TITLE
      </TableColumnControls>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Add column after Title' }),
    )
    expect(screen.getByRole('menu')).toBeTruthy()
    const genreItem = screen.getByRole('menuitem', { name: 'Genre' })
    expect(genreItem.classList.contains('table-col-insert-item')).toBe(true)
    await userEvent.click(genreItem)
    expect(onInsertAfter).toHaveBeenCalledWith('genre')
  })

  it('does not open a menu when there are no inactive columns', async () => {
    render(
      <TableColumnControls
        label="Score"
        inactiveColumns={[]}
        onRemove={vi.fn()}
        onInsertAfter={vi.fn()}
      >
        SCORE
      </TableColumnControls>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Add column after Score' }),
    )
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('removes the column when the remove control is clicked', async () => {
    const onRemove = vi.fn()
    render(
      <TableColumnControls
        label="BPM"
        inactiveColumns={inactive}
        onRemove={onRemove}
        onInsertAfter={vi.fn()}
      >
        BPM
      </TableColumnControls>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove BPM column' }),
    )
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('lets EmptyRecovery restore a hidden column', async () => {
    const onInsert = vi.fn()
    render(
      <TableColumnEmptyRecovery
        inactiveColumns={inactive}
        onInsert={onInsert}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add column' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Label' }))
    expect(onInsert).toHaveBeenCalledWith('label')
  })
})

describe('MatchesPanel header layout and column controls', () => {
  it('moves the add-column control out of the header (no inline per-column +)', () => {
    render(
      <MatchesPanel
        matchSource={matchSource}
        matches={[makeMatch()]}
        loading={false}
        {...testMatchesPanelTableProps}
      />,
    )
    const headers = screen.getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThan(1)
    // The inline rightmost `+` is gone so the rightmost column is resizable;
    // adding columns happens via the out-of-column insert rail instead.
    headers.forEach((header) => {
      expect(header.querySelector('.table-col-insert-btn')).toBeNull()
    })
  })

  it('exposes the add-column insert rail when a column is hidden', () => {
    const hiddenConfig = {
      ...testMatchesPanelTableProps.tableConfig,
      columnVisibility: {
        ...testMatchesPanelTableProps.tableConfig.columnVisibility,
        energy_score: false,
      },
    }
    const { container } = render(
      <MatchesPanel
        matchSource={matchSource}
        matches={[makeMatch()]}
        loading={false}
        {...testMatchesPanelTableProps}
        tableConfig={hiddenConfig}
      />,
    )
    expect(container.querySelector('.ds-col-insert-btn')).toBeTruthy()
  })

  it('renders the source title in the header and S/H/L toggles in the control panel', () => {
    const { container } = render(
      <MatchesPanel
        matchSource={matchSource}
        matches={[makeMatch()]}
        loading={false}
        {...testMatchesPanelTableProps}
      />,
    )
    expect(container.querySelector('.ds-table-header-title')?.textContent).toBe(
      matchSource.title,
    )
    const toggles = container.querySelectorAll('.ds-toggle-filter')
    expect(toggles.length).toBe(3)
    expect(toggles[0].textContent).toMatch(/Same/)
    expect(toggles[1].textContent).toMatch(/Higher/)
    expect(toggles[2].textContent).toMatch(/Lower/)
  })
})

describe('SetPoolTable header layout and column controls', () => {
  const subgroups: PoolSubgroup[] = [
    { id: 1, set_id: 1, name: 'Warmup', display_order: 0 },
    { id: 2, set_id: 1, name: 'Peak', display_order: 1 },
  ]

  function renderPool() {
    return render(
      <SetPoolTable
        allTracks={[]}
        pool={[makePoolEntry({ id: 1, track_id: 10 })]}
        subgroups={subgroups}
        subgroupMemberships={[]}
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
      />,
    )
  }

  it('keeps Pool title fixed, tabs in the middle, and sort controls on the right', () => {
    const { container } = renderPool()
    const header = container.querySelector('.set-pool-header--inline')!
    const children = Array.from(header.children)
    expect(children[0].classList.contains('set-pool-title')).toBe(true)
    expect(children[0].textContent).toMatch(/^Pool \(/)
    expect(children[1].classList.contains('set-pool-header-tabs')).toBe(true)
    expect(within(children[1] as HTMLElement).getByRole('tablist')).toBeTruthy()
    expect(children[2].classList.contains('set-pool-header-sort')).toBe(true)
    expect(
      children[2].querySelector('.sort-tier-bar[role="toolbar"]'),
    ).toBeTruthy()
  })

  it('surfaces an add-column control only on the rightmost Actions header', async () => {
    const { container } = renderPool()
    const headers = Array.from(container.querySelectorAll('thead th'))
    expect(headers.length).toBeGreaterThan(1)
    await waitFor(() => {
      headers.forEach((header, index) => {
        const insertBtn = header.querySelector(
          'button[aria-label^="Add column after"]',
        )
        if (index === headers.length - 1) {
          expect(insertBtn?.getAttribute('aria-label')).toBe(
            'Add column after Actions',
          )
        } else {
          expect(insertBtn).toBeNull()
        }
      })
    })
  })
})
