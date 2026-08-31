import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { PoolWidget } from './PoolWidget'
import { testPoolTableProps } from '../test/tablePreferenceHelpers'
import type {
  HydratedSet,
  PoolEntry,
  PoolSubgroup,
  PoolSubgroupMembership,
} from '../types'

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
}))

const noop = () => {}
const asyncTrue = () => Promise.resolve(true)
const asyncNull = () => Promise.resolve(null)

function makePoolEntry(id: number, color: string | null = null): PoolEntry {
  return {
    id,
    set_id: 1,
    track_id: id,
    insertion_order: id,
    highlight_color: color,
    track: {
      id,
      title: `Pool Track ${id}`,
      artist_names: [],
      bpm: 130,
      key: 'Cminor',
      camelot_code: '05A',
      genre: null,
      label: null,
      energy: null,
      date_added: null,
    },
  }
}

function makeSet(
  pool: PoolEntry[],
  subgroups: PoolSubgroup[] = [],
  memberships: PoolSubgroupMembership[] = [],
): HydratedSet {
  return {
    set: {
      id: 1,
      name: 'Night Set',
      created_at: '',
      updated_at: '',
      pool_count: pool.length,
      tracklist_count: 0,
    },
    pool,
    tracklist: [],
    explorer_nodes: [],
    explorer_edges: [],
    pool_subgroups: subgroups,
    pool_subgroup_memberships: memberships,
  }
}

function renderWidget(
  activeSet: HydratedSet | null,
  extra: Partial<React.ComponentProps<typeof PoolWidget>> = {},
) {
  return render(
    <PoolWidget
      allTracks={[]}
      activeSet={activeSet}
      onRemove={noop}
      onReorder={noop}
      onSetHighlight={noop}
      onAddTrack={noop}
      onCreateSubgroup={asyncNull}
      onRenameSubgroup={asyncTrue}
      onDeleteSubgroup={asyncTrue}
      onReorderSubgroups={asyncTrue}
      onReorderSubgroupMember={asyncTrue}
      onAddSubgroupMember={asyncTrue}
      onRemoveSubgroupMember={asyncTrue}
      onDropTrackToSubgroup={() => Promise.resolve()}
      onDropFromTracklist={noop}
      {...testPoolTableProps}
      {...extra}
    />,
  )
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('PoolWidget', () => {
  it('asks for an active set before it shows a pool', () => {
    renderWidget(null)

    expect(screen.getByText(/create or select one/i)).toBeInTheDocument()
  })

  it('renders pool rows with a remove control and the highlight flag', () => {
    const { container } = renderWidget(
      makeSet([makePoolEntry(1, '#ff8800'), makePoolEntry(2)]),
    )

    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(screen.getByText('Pool Track 1')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Remove from pool')).toHaveLength(2)
    const flag = (rows[0] as HTMLElement).querySelector(
      '.pool-highlight-flag',
    ) as HTMLElement
    expect(flag.style.backgroundColor).toBe('rgb(255, 136, 0)')
  })

  it('lists pool subgroups with their counts in the groups menu', async () => {
    const pool = [makePoolEntry(1), makePoolEntry(2)]
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Peak', display_order: 0 },
    ]
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 7, pool_entry_id: 1, display_order: 0 },
    ]
    const { container } = renderWidget(makeSet(pool, subgroups, memberships))

    await act(async () => {
      container
        .querySelector<HTMLElement>('.pool-group-menu-trigger')!
        .click()
    })
    // The panel is portalled to <body>, so query the document.
    const panel = document.querySelector<HTMLElement>(
      '.pool-group-menu-panel',
    )!
    expect(within(panel).getByText('Peak')).toBeInTheDocument()
    expect(within(panel).getByText('1')).toBeInTheDocument()
    expect(
      within(within(panel).getByLabelText('Pool view')).getByText('All'),
    ).toBeInTheDocument()
  })

  it('rails grouped rows with their subgroup color', () => {
    const pool = [makePoolEntry(1), makePoolEntry(2)]
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Peak', display_order: 0 },
    ]
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 7, pool_entry_id: 1, display_order: 0 },
    ]
    const { container } = renderWidget(makeSet(pool, subgroups, memberships))

    const rows = container.querySelectorAll('tbody tr')
    const railed = (rows[0] as HTMLElement).querySelector(
      '.set-ws-cell-remove',
    ) as HTMLElement
    expect(railed.style.boxShadow).toBe('inset 2px 0 0 0 var(--dot-1)')
    const plain = (rows[1] as HTMLElement).querySelector(
      '.set-ws-cell-remove',
    ) as HTMLElement
    expect(plain.style.boxShadow).toBe('')
  })

  it('creates a pool subgroup from the group menu', async () => {
    const onCreateSubgroup = vi.fn().mockResolvedValue({
      id: 9,
      set_id: 1,
      name: 'New group',
      display_order: 0,
    })
    const { container } = renderWidget(makeSet([makePoolEntry(1)]), {
      onCreateSubgroup,
    })

    await act(async () => {
      container
        .querySelector<HTMLElement>('.pool-group-menu-trigger')!
        .click()
    })
    await act(async () => {
      screen.getByLabelText('Create group').click()
    })
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Name…'), {
        target: { value: 'Peak hour' },
      })
    })
    await act(async () => {
      fireEvent.keyDown(screen.getByPlaceholderText('Name…'), {
        key: 'Enter',
      })
    })

    expect(onCreateSubgroup).toHaveBeenCalledWith('Peak hour')
  })
})
