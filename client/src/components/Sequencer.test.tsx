import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  render,
  screen,
  act,
  createEvent,
  fireEvent,
  within,
} from '@testing-library/react'
import { Sequencer } from './Sequencer'
import { SequencerBlock } from './SequencerBlock'
import { DETAIL_TIERS } from '../hooks/useSequencer'
import type {
  HydratedSet,
  PoolEntry,
  PoolSubgroup,
  PoolSubgroupMembership,
  Track,
  TracklistEntry,
} from '../types'

vi.mock('../api/http', () => ({
  exportSetM3u8: vi
    .fn()
    .mockResolvedValue({ content: '#EXTM3U', filename: 'set.m3u8' }),
  tracklistSetOverrides: vi.fn().mockResolvedValue(undefined),
}))

function makeTrack(id: number, camelot: string, bpm: number): Track {
  return {
    id,
    title: `Track ${id}`,
    artist_names: [`Artist ${id}`],
    bpm,
    key: 'C',
    camelot_code: camelot,
    genre: null,
    label: null,
    energy: null,
    date_added: null,
    // 7 minutes of audio plays 4.9 minutes at the 0.7 play fraction.
    duration_seconds: 420,
  }
}

function makeEntry(
  track: Track,
  position: number,
  overrides: Partial<TracklistEntry> = {},
): TracklistEntry {
  return {
    id: 100 + track.id,
    set_id: 1,
    track_id: track.id,
    position,
    track,
    play_minutes: null,
    pinned_end_minutes: null,
    bpm_override: null,
    ...overrides,
  }
}

function makePoolEntry(track: Track, position: number): PoolEntry {
  return {
    id: 200 + track.id,
    set_id: 1,
    track_id: track.id,
    insertion_order: position,
    highlight_color: null,
    track,
  }
}

function makeSet(
  tracklist: TracklistEntry[],
  pool: PoolEntry[] = [],
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
      tracklist_count: tracklist.length,
    },
    pool,
    tracklist,
    explorer_nodes: [],
    explorer_edges: [],
    pool_subgroups: subgroups,
    pool_subgroup_memberships: memberships,
  }
}

function makeHandlers() {
  return {
    onPromote: vi.fn(),
    onReorder: vi.fn(),
    onBenchToLane: vi.fn(),
    onMoveBench: vi.fn(),
    onRemove: vi.fn(),
    onRemoveBenched: vi.fn(),
    onAddLane: vi.fn(),
    onDeleteLane: vi.fn(),
  }
}

const NOOPS = makeHandlers()

function renderSequencer(activeSet: HydratedSet | null, props = {}) {
  const handlers = { ...makeHandlers(), ...props }
  const view = render(<Sequencer activeSet={activeSet} {...handlers} />)
  return { ...view, ...handlers }
}

/** A DataTransfer stand-in that behaves like the browser's key/value store. */
function dataTransfer(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed))
  return {
    setData: (k: string, v: string) => void store.set(k, v),
    getData: (k: string) => store.get(k) ?? '',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Sequencer lanes', () => {
  it('packs the committed lane end to end from the start time', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '09A', 128), 1),
    ]
    renderSequencer(makeSet(tracklist))

    const lane = screen.getByLabelText('Committed lane')
    const blocks = lane.querySelectorAll('.sq-block')
    expect(blocks).toHaveLength(2)
    // 4.9 minutes at 6px per minute is 29.4px wide, so block 2 starts there.
    const first = blocks[0] as HTMLElement
    const second = blocks[1] as HTMLElement
    expect(Number.parseFloat(second.style.left)).toBeCloseTo(
      Number.parseFloat(first.style.left) +
        Number.parseFloat(first.style.width),
      3,
    )
  })

  it('renders a sticky ruler whose ticks follow the tick pill', () => {
    const { container } = renderSequencer(
      makeSet([makeEntry(makeTrack(1, '08A', 128), 0)]),
    )

    const ruler = container.querySelector('.sq-ruler') as HTMLElement
    expect(within(ruler).getByText('6:00')).toBeInTheDocument()
    expect(within(ruler).getByText('6:15')).toBeInTheDocument()

    act(() => {
      screen.getByRole('button', { name: '30m' }).click()
    })
    expect(within(ruler).queryByText('6:15')).toBeNull()
    expect(within(ruler).getByText('6:30')).toBeInTheDocument()
  })

  it('starts with exactly one alternative lane and no subgroups', () => {
    const pool = [makePoolEntry(makeTrack(5, '08A', 128), 0)]
    const { container } = renderSequencer(makeSet([], pool))

    const altLanes = container.querySelectorAll('.sq-lane--alt')
    expect(altLanes).toHaveLength(1)
    expect(screen.getByLabelText('Alt 1 lane')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Delete lane/)).toBeNull()
  })

  it('adds a lane through the pool subgroup handler', () => {
    const { onAddLane } = renderSequencer(makeSet([]))

    act(() => {
      screen.getByRole('button', { name: '+ lane' }).click()
    })

    expect(onAddLane).toHaveBeenCalledTimes(1)
  })

  it('replaces the default lane with one lane per subgroup', () => {
    const track = makeTrack(5, '08A', 128)
    const pool = [makePoolEntry(track, 0)]
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
    ]
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 7, pool_entry_id: pool[0].id, display_order: 0 },
    ]
    const { onDeleteLane, container } = renderSequencer(
      makeSet([], pool, subgroups, memberships),
    )

    expect(container.querySelectorAll('.sq-lane--alt')).toHaveLength(1)
    act(() => {
      screen.getByLabelText('Delete lane Alt 1').click()
    })

    expect(onDeleteLane).toHaveBeenCalledWith(7)
  })

  it('benches a dropped track onto the lane it was dropped on', () => {
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 2', display_order: 0 },
    ]
    const { onBenchToLane } = renderSequencer(makeSet([], [], subgroups))

    fireEvent.drop(screen.getByLabelText('Alt 2 lane'), {
      dataTransfer: dataTransfer({ 'text/track': '12' }),
    })

    expect(onBenchToLane).toHaveBeenCalledWith(12, 7, 'browse')
  })

  it('routes a drop on the default lane through the same lane key', () => {
    const { onBenchToLane } = renderSequencer(makeSet([]))

    fireEvent.drop(screen.getByLabelText('Alt 1 lane'), {
      dataTransfer: dataTransfer({ 'text/track': '12' }),
    })

    expect(onBenchToLane).toHaveBeenCalledWith(12, 'default', 'browse')
  })

  it('promotes a benched block from its promote control', () => {
    const track = makeTrack(5, '08A', 128)
    const { onPromote } = renderSequencer(
      makeSet([], [makePoolEntry(track, 0)]),
    )

    act(() => {
      screen.getByLabelText('Promote Track 5').click()
    })

    expect(onPromote).toHaveBeenCalledWith(5, 0)
  })
})

describe('Sequencer block drag', () => {
  const first = makeTrack(1, '08A', 128)
  const second = makeTrack(2, '09A', 128)

  /** 6px per minute from 6:00, after the 88px lane label. */
  function clientXFor(minute: number) {
    return 88 + (minute - 360) * 6
  }

  /**
   * jsdom has no DragEvent, so `fireEvent.drop` drops an init `clientX`. The
   * coordinate has to be defined on the event the component actually receives.
   */
  function dropAt(
    laneLabel: string,
    dt: ReturnType<typeof dataTransfer>,
    minute: number,
  ) {
    const lane = screen.getByLabelText(laneLabel)
    const event = createEvent.drop(lane, { dataTransfer: dt })
    Object.defineProperty(event, 'clientX', { value: clientXFor(minute) })
    act(() => {
      fireEvent(lane, event)
    })
  }

  function dragBlock(label: string, dt: ReturnType<typeof dataTransfer>) {
    fireEvent.dragStart(screen.getByLabelText(label), { dataTransfer: dt })
  }

  it('reorders a committed block dropped later on its own lane', () => {
    const tracklist = [makeEntry(first, 0), makeEntry(second, 1)]
    const { onReorder } = renderSequencer(makeSet(tracklist))
    const dt = dataTransfer()

    dragBlock('Track 1', dt)
    dropAt('Committed lane', dt, 372)

    expect(onReorder).toHaveBeenCalledWith(1, 1)
  })

  it('leaves the committed order alone for a drop on its own slot', () => {
    const tracklist = [makeEntry(first, 0), makeEntry(second, 1)]
    const { onReorder } = renderSequencer(makeSet(tracklist))
    const dt = dataTransfer()

    dragBlock('Track 1', dt)
    dropAt('Committed lane', dt, 361)

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('promotes a benched block dropped on the committed lane', () => {
    const tracklist = [makeEntry(first, 0)]
    const pool = [makePoolEntry(second, 0)]
    const { onPromote } = renderSequencer(makeSet(tracklist, pool))
    const dt = dataTransfer()

    dragBlock('Track 2', dt)
    dropAt('Committed lane', dt, 361)

    expect(onPromote).toHaveBeenCalledWith(2, 0)
  })

  it('benches a committed block dropped on an alternative lane', () => {
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
    ]
    const { onBenchToLane } = renderSequencer(
      makeSet([makeEntry(first, 0)], [], subgroups),
    )
    const dt = dataTransfer()

    dragBlock('Track 1', dt)
    dropAt('Alt 1 lane', dt, 380)

    expect(onBenchToLane).toHaveBeenCalledWith(1, 7, 'tracklist')
  })

  it('moves a benched block between two alternative lanes', () => {
    const pool = [makePoolEntry(second, 0)]
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
      { id: 8, set_id: 1, name: 'Alt 2', display_order: 1 },
    ]
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 7, pool_entry_id: pool[0].id, display_order: 0 },
    ]
    const { onMoveBench } = renderSequencer(
      makeSet([], pool, subgroups, memberships),
    )
    const dt = dataTransfer()

    dragBlock('Track 2', dt)
    dropAt('Alt 2 lane', dt, 390)

    expect(onMoveBench).toHaveBeenCalledWith(pool[0].id, 7, 8)
  })

  it('moves a benched block to a new snapped time inside its own lane', () => {
    const pool = [makePoolEntry(second, 0)]
    const { onMoveBench, onBenchToLane } = renderSequencer(makeSet([], pool))
    const dt = dataTransfer()

    dragBlock('Track 2', dt)
    dropAt('Alt 1 lane', dt, 390)

    expect(onMoveBench).not.toHaveBeenCalled()
    expect(onBenchToLane).not.toHaveBeenCalled()
    expect(
      Number.parseFloat(
        (screen.getByLabelText('Track 2') as HTMLElement).style.left,
      ),
    ).toBeCloseTo(clientXFor(390), 3)
  })
})

describe('SequencerBlock detail tiers', () => {
  const track = makeTrack(1, '08A', 128)

  function renderBlock(width: number) {
    return render(
      <SequencerBlock
        track={track}
        left={0}
        width={width}
        start={360}
        end={365}
        playMinutes={5}
        bpm={128}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
  }

  it('drops detail progressively as the block narrows', () => {
    const [range, bpm, title, code, dot] = DETAIL_TIERS

    const widest = renderBlock(range).container
    expect(widest.textContent).toContain('6:00–6:05')
    expect(widest.textContent).toContain('128.0')
    expect(widest.textContent).toContain('Track 1')
    widest.remove()

    const noRange = renderBlock(bpm).container
    expect(noRange.textContent).not.toContain('6:00–6:05')
    expect(noRange.textContent).toContain('128.0')
    noRange.remove()

    const noBpm = renderBlock(title).container
    expect(noBpm.textContent).not.toContain('128.0')
    expect(noBpm.textContent).toContain('Track 1')
    noBpm.remove()

    const noTitle = renderBlock(code).container
    expect(noTitle.textContent).not.toContain('Track 1')
    expect(noTitle.textContent).toContain('08A')
    noTitle.remove()

    const dotOnly = renderBlock(dot).container
    expect(dotOnly.textContent).not.toContain('08A')
    expect(dotOnly.querySelector('.key-dot')).not.toBeNull()
    dotOnly.remove()

    const bare = renderBlock(dot - 1).container
    expect(bare.querySelector('.key-dot')).toBeNull()
  })

  it('marks a benched block and offers the promote control', () => {
    const { container } = render(
      <SequencerBlock
        track={track}
        left={0}
        width={120}
        benched
        selected={false}
        onSelect={vi.fn()}
        onPromote={vi.fn()}
      />,
    )

    expect(container.querySelector('.sq-block--benched')).not.toBeNull()
    expect(screen.getByLabelText('Promote Track 1')).toBeInTheDocument()
  })

  it('never shows the auto-scale factor on a block', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0, { pinned_end_minutes: 364 }),
      makeEntry(makeTrack(2, '09A', 128), 1),
    ]
    const { container } = renderSequencer(makeSet(tracklist))

    const lane = screen.getByLabelText('Committed lane')
    expect(lane.textContent).not.toContain('×')
    expect(container.querySelector('.sq-block .sq-scale')).toBeNull()
  })
})

describe('Sequencer harmony highlighting', () => {
  it('paints related blocks and fades unrelated ones after a block click', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '09A', 128), 1),
      makeEntry(makeTrack(3, '03B', 128), 2),
    ]
    renderSequencer(makeSet(tracklist))

    act(() => {
      screen.getByLabelText('Track 1').click()
    })

    const related = screen.getByLabelText('Track 2')
    expect(related.style.backgroundColor).not.toBe('')
    expect(screen.getByLabelText('Track 3').style.opacity).toBe('0.35')
  })
})

describe('Sequencer tracklist view', () => {
  function openList(activeSet: HydratedSet) {
    const view = renderSequencer(activeSet)
    act(() => {
      screen.getByRole('button', { name: 'Tracklist' }).click()
    })
    return view
  }

  it('renders the eight declared columns', () => {
    openList(makeSet([makeEntry(makeTrack(1, '08A', 128), 0)]))

    expect(
      screen.getAllByRole('columnheader').map((th) => th.textContent),
    ).toEqual(['#', 'Title', 'Key', 'BPM', 'In', 'Out', 'Plays', 'Length'])
  })

  it('saves an edited BPM and marks the cell as overridden', async () => {
    const httpMod = await import('../api/http')
    openList(makeSet([makeEntry(makeTrack(1, '08A', 128), 0)]))

    const input = screen.getByLabelText('Played BPM for Track 1')
    expect(input.className).not.toContain('sq-bpm-input--ov')

    await act(async () => {
      fireEvent.change(input, { target: { value: '124.0' } })
      fireEvent.blur(input)
    })

    expect(vi.mocked(httpMod.tracklistSetOverrides)).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ bpm_override: 124 }),
    )
    expect(screen.getByLabelText('Played BPM for Track 1').className).toContain(
      'sq-bpm-input--ov',
    )
  })

  it('flags pinned, scaled and manual rows and shows the factor in Length', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0, { pinned_end_minutes: 364 }),
      makeEntry(makeTrack(2, '09A', 128), 1, { play_minutes: 4 }),
    ]
    const { container } = openList(makeSet(tracklist))

    const rows = container.querySelectorAll('.sq-list-row')
    expect(within(rows[0] as HTMLElement).getByText('pinned')).toBeVisible()
    expect(
      (rows[0] as HTMLElement).querySelector('.sq-flag--scale'),
    ).not.toBeNull()
    expect(
      (rows[0] as HTMLElement).querySelector('.sq-col-length .sq-scale'),
    ).not.toBeNull()
    expect(within(rows[1] as HTMLElement).getByText('manual')).toBeVisible()
  })

  it('exports the committed lane in order', async () => {
    const httpMod = await import('../api/http')
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '09A', 128), 1),
    ]
    URL.createObjectURL = vi.fn().mockReturnValue('blob:set')
    URL.revokeObjectURL = vi.fn()
    openList(makeSet(tracklist))

    await act(async () => {
      screen.getByRole('button', { name: 'Export' }).click()
    })

    expect(vi.mocked(httpMod.exportSetM3u8)).toHaveBeenCalledWith(
      [1, 2],
      'Night Set',
    )
  })
})

describe('Sequencer header chip', () => {
  it('reports the run range and turns red past the target end', () => {
    const tracklist = Array.from({ length: 3 }, (_, i) =>
      makeEntry(makeTrack(i + 1, '08A', 128), i),
    )
    renderSequencer(makeSet(tracklist))

    const chip = screen.getByRole('status')
    expect(chip.textContent).toContain('3 tracks')
    expect(chip.textContent).toContain('6:00→')
    expect(chip.className).not.toContain('sq-total--over')

    act(() => {
      const end = screen.getByLabelText('Set end time')
      fireEvent.change(end, { target: { value: '6:05' } })
      fireEvent.blur(end)
    })

    expect(screen.getByRole('status').className).toContain('sq-total--over')
  })

  it('accepts 390, 6:30 and 6h30 as the same start time', () => {
    renderSequencer(makeSet([]))
    const start = screen.getByLabelText('Set start time') as HTMLInputElement

    for (const raw of ['390', '6:30', '6h30']) {
      act(() => {
        fireEvent.change(start, { target: { value: raw } })
        fireEvent.blur(start)
      })
      expect(start.value).toBe('6:30')
    }
  })
})

describe('Sequencer inspector footer', () => {
  const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]

  it('stays hidden until a block is selected', () => {
    const { container } = renderSequencer(makeSet(tracklist))

    expect(container.querySelector('.sq-inspector')).toBeNull()
  })

  it('shows the meta, inputs and controls for a committed block', () => {
    renderSequencer(makeSet(tracklist))

    act(() => {
      screen.getByLabelText('Track 1').click()
    })

    expect(screen.getByLabelText('Played BPM')).toBeInTheDocument()
    expect(screen.getByLabelText('Play length in minutes')).toBeInTheDocument()
    expect(screen.getByLabelText('Pinned end time')).toBeInTheDocument()
    for (const name of ['Reset', 'Bench', 'Remove']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Commit' })).toBeNull()
  })

  it('gives a benched selection the same inputs with Commit', () => {
    const track = makeTrack(5, '08A', 128)
    const { onPromote } = renderSequencer(
      makeSet([], [makePoolEntry(track, 0)]),
    )

    act(() => {
      screen.getByLabelText('Track 5').click()
    })
    expect(screen.getByLabelText('Played BPM')).toBeInTheDocument()
    expect(screen.getByLabelText('Play length in minutes')).toBeInTheDocument()
    expect(screen.getByLabelText('Pinned end time')).toBeInTheDocument()
    for (const name of ['Reset', 'Commit', 'Remove']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Bench' })).toBeNull()

    act(() => {
      screen.getByRole('button', { name: 'Commit' }).click()
    })
    expect(onPromote).toHaveBeenCalledWith(5, 0)
  })

  it('previews a benched play length without touching the server', async () => {
    const httpMod = await import('../api/http')
    const track = makeTrack(5, '08A', 128)
    renderSequencer(makeSet([], [makePoolEntry(track, 0)]))

    act(() => {
      screen.getByLabelText('Track 5').click()
    })
    await act(async () => {
      const plays = screen.getByLabelText('Play length in minutes')
      fireEvent.change(plays, { target: { value: '3' } })
      fireEvent.blur(plays)
    })

    expect(vi.mocked(httpMod.tracklistSetOverrides)).not.toHaveBeenCalled()
    // 3 minutes at 6px per minute.
    expect(screen.getByLabelText('Track 5').style.width).toBe('18px')
  })

  it('removes a benched selection from the pool', () => {
    const track = makeTrack(5, '08A', 128)
    const { onRemoveBenched } = renderSequencer(
      makeSet([], [makePoolEntry(track, 0)]),
    )

    act(() => {
      screen.getByLabelText('Track 5').click()
    })
    act(() => {
      screen.getByRole('button', { name: 'Remove' }).click()
    })

    expect(onRemoveBenched).toHaveBeenCalledWith(5)
  })

  it('paints a benched selection as the relation source', () => {
    const benched = makeTrack(5, '08A', 128)
    const tracklist = [
      makeEntry(makeTrack(1, '09A', 128), 0),
      makeEntry(makeTrack(2, '03B', 128), 1),
    ]
    renderSequencer(makeSet(tracklist, [makePoolEntry(benched, 0)]))

    act(() => {
      screen.getByLabelText('Track 5').click()
    })

    expect(screen.getByLabelText('Track 1').style.backgroundColor).not.toBe('')
    expect(screen.getByLabelText('Track 2').style.opacity).toBe('0.35')
  })

  it('persists a play length edit and resets it again', async () => {
    const httpMod = await import('../api/http')
    renderSequencer(makeSet(tracklist))

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    const plays = screen.getByLabelText('Play length in minutes')
    await act(async () => {
      fireEvent.change(plays, { target: { value: '5.5' } })
      fireEvent.blur(plays)
    })

    expect(vi.mocked(httpMod.tracklistSetOverrides)).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ play_minutes: 5.5 }),
    )

    await act(async () => {
      screen.getByRole('button', { name: 'Reset' }).click()
    })

    expect(vi.mocked(httpMod.tracklistSetOverrides)).toHaveBeenLastCalledWith(
      1,
      1,
      {
        play_minutes: null,
        pinned_end_minutes: null,
        bpm_override: null,
      },
    )
  })

  it('benches the selected block onto the first lane', () => {
    const { onBenchToLane } = renderSequencer(makeSet(tracklist))

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    act(() => {
      screen.getByRole('button', { name: 'Bench' }).click()
    })

    expect(onBenchToLane).toHaveBeenCalledWith(1, 'default', 'tracklist')
  })
})

describe('Sequencer without a set', () => {
  it('explains that a set is required', () => {
    render(<Sequencer activeSet={null} {...NOOPS} />)

    expect(screen.getByText(/create or select one/i)).toBeInTheDocument()
  })
})
