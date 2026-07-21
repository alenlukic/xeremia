import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  TableColumnControls,
  TableColumnEmptyRecovery,
} from './TableColumnControls'
import { MatchesPanel } from './MatchesPanel'
import { SetPoolTable } from './SetPoolTable'
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

describe('TableColumnControls', () => {
  it('renders the column label', () => {
    render(
      <TableColumnControls label="BPM" onRemove={vi.fn()}>
        BPM
      </TableColumnControls>,
    )
    expect(screen.getByText('BPM')).toBeTruthy()
  })

  it('removes the column when the remove control is clicked', async () => {
    const onRemove = vi.fn()
    render(
      <TableColumnControls label="BPM" onRemove={onRemove}>
        BPM
      </TableColumnControls>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove BPM column' }),
    )
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('has no in-table add-column affordance (managed in Admin → Preferences)', () => {
    const { container } = render(
      <TableColumnControls label="BPM" onRemove={vi.fn()}>
        BPM
      </TableColumnControls>,
    )
    expect(container.querySelector('.table-col-insert-btn')).toBeNull()
  })

  it('EmptyRecovery points to Preferences rather than adding inline', () => {
    render(<TableColumnEmptyRecovery />)
    expect(screen.queryByRole('button', { name: /Add column/ })).toBeNull()
    expect(screen.getByText(/Restore columns in Admin/)).toBeTruthy()
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

  function renderPool(
    extra?: Partial<React.ComponentProps<typeof SetPoolTable>>,
  ) {
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
        {...extra}
      />,
    )
  }

  it('renders the Pool title in the design-system header with tabs and controls beside it', () => {
    const { container } = renderPool()
    const header = container.querySelector('.ds-table-header')!
    expect(header.querySelector('.ds-table-header-title')?.textContent).toMatch(
      /^Pool \(/,
    )
    const primary = header.querySelector<HTMLElement>(
      '.ds-table-header-primary',
    )!
    expect(within(primary).getByRole('tablist')).toBeTruthy()
    expect(
      within(primary).getByRole('button', { name: 'Add filter' }),
    ).toBeTruthy()
  })

  it('moves the add-column control off the headers (no inline per-column +)', () => {
    const { container } = renderPool()
    const headers = Array.from(container.querySelectorAll('thead th'))
    expect(headers.length).toBeGreaterThan(1)
    // Actions is now resizable; the inline rightmost + is gone so its resize
    // handle is reachable. Adding columns happens via the out-of-column rail.
    headers.forEach((header) => {
      expect(header.querySelector('.table-col-insert-btn')).toBeNull()
    })
  })
})
