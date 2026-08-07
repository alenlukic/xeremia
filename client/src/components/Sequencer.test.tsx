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
import { POOL_ROW_MIME, TRACK_DRAG_MIME } from '../utils'
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
    onAddCommitted: vi.fn(),
    onPromote: vi.fn(),
    onReorder: vi.fn(),
    onBenchToLane: vi.fn(),
    onMoveBench: vi.fn(),
    onRemove: vi.fn(),
    onRemoveBenched: vi.fn(),
    onAddLane: vi.fn(),
    onDeleteLane: vi.fn(),
    onRenameLane: vi.fn(),
    onReorderLanes: vi.fn(),
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
    // Drag-over accept checks go by MIME, since the payload is unreadable
    // until the drop.
    get types() {
      return Array.from(store.keys())
    },
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

  it('renders a sticky ruler whose ticks follow the zoom', () => {
    const { container } = renderSequencer(
      makeSet([makeEntry(makeTrack(1, '08A', 128), 0)]),
    )

    const ruler = container.querySelector('.sq-ruler') as HTMLElement
    const labels = () =>
      Array.from(ruler.querySelectorAll('*'))
        .map((n) => n.textContent ?? '')
        .filter((t) => /^\d+:\d\d$/.test(t))

    // The spacing is chosen from the zoom, so the labels never crowd.
    const before = labels()
    expect(before[0]).toBe('6:00')
    expect(before.length).toBeGreaterThan(1)

    // Ctrl + wheel is the zoom control now.
    const zoom = () =>
      Number(
        (container.querySelector('.sq-lanes') as HTMLElement).dataset.pxPerMin,
      )
    const zoomBefore = zoom()
    act(() => {
      fireEvent.wheel(container.querySelector('.sq-main') as HTMLElement, {
        deltaY: 240,
        ctrlKey: true,
      })
    })

    // The zoom actually moved, and the ruler thinned out rather than crowding.
    expect(zoom()).toBeLessThan(zoomBefore)
    expect(labels().length).toBeLessThanOrEqual(before.length)
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
      screen.getByRole('button', { name: 'Add lane' }).click()
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

  it('draws the alt lane stretch past the committed end', () => {
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
    ]
    const committed = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const { container } = renderSequencer(makeSet(committed, [], subgroups))

    const tail = container.querySelector('.sq-lane-tail') as HTMLElement
    expect(tail).toBeTruthy()
    // Starts where the committed spine ends, never at the lane origin.
    expect(Number.parseFloat(tail.style.left)).toBeGreaterThan(0)
    expect(Number.parseFloat(tail.style.width)).toBeGreaterThan(0)
    // Committed lane keeps its solid frame.
    expect(
      container.querySelector('.sq-lane--committed .sq-lane-tail'),
    ).toBeNull()
  })

  it('renames a lane from its double-clicked label', () => {
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
    ]
    const { onRenameLane, container } = renderSequencer(
      makeSet([], [], subgroups),
    )

    const name = container.querySelector('.sq-lane-name') as HTMLElement
    fireEvent.doubleClick(name)
    const input = screen.getByLabelText('Rename lane Alt 1')
    fireEvent.change(input, { target: { value: 'Peak hour' } })
    fireEvent.blur(input)

    expect(onRenameLane).toHaveBeenCalledWith(7, 'Peak hour')
  })

  it('reorders lanes when one lane label is dragged onto another', () => {
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
      { id: 8, set_id: 1, name: 'Alt 2', display_order: 1 },
    ]
    const { onReorderLanes, container } = renderSequencer(
      makeSet([], [], subgroups),
    )

    const [first] = Array.from(container.querySelectorAll('.sq-lane-name'))
    expect(first).toHaveAttribute('draggable', 'true')

    const dt = dataTransfer()
    fireEvent.dragStart(first, { dataTransfer: dt })
    const target = screen.getByLabelText('Alt 2 lane')
    // The drop only lands if drag-over accepted the lane MIME.
    const over = fireEvent.dragOver(target, { dataTransfer: dt })
    expect(over).toBe(false)
    fireEvent.drop(target, { dataTransfer: dt })

    expect(onReorderLanes).toHaveBeenCalledWith([8, 7])
  })

  it('benches a dropped track onto the lane it was dropped on', () => {
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 2', display_order: 0 },
    ]
    const { onBenchToLane } = renderSequencer(makeSet([], [], subgroups))

    fireEvent.drop(screen.getByLabelText('Alt 2 lane'), {
      dataTransfer: dataTransfer({ [TRACK_DRAG_MIME]: '12' }),
    })

    expect(onBenchToLane).toHaveBeenCalledWith(12, 7, 'browse')
  })

  it('routes a drop on the default lane through the same lane key', () => {
    const { onBenchToLane } = renderSequencer(makeSet([]))

    fireEvent.drop(screen.getByLabelText('Alt 1 lane'), {
      dataTransfer: dataTransfer({ [TRACK_DRAG_MIME]: '12' }),
    })

    expect(onBenchToLane).toHaveBeenCalledWith(12, 'default', 'browse')
  })

  it('adds a browse track dropped on the committed lane', () => {
    const { onAddCommitted } = renderSequencer(makeSet([]))

    fireEvent.drop(screen.getByLabelText('Committed lane'), {
      dataTransfer: dataTransfer({ [TRACK_DRAG_MIME]: '12' }),
    })

    expect(onAddCommitted).toHaveBeenCalledWith(12, 0)
  })

  it('routes a pool row to its target alternative lane', () => {
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 2', display_order: 0 },
    ]
    const { onBenchToLane } = renderSequencer(makeSet([], [], subgroups))

    fireEvent.drop(screen.getByLabelText('Alt 2 lane'), {
      dataTransfer: dataTransfer({ [POOL_ROW_MIME]: '12' }),
    })

    expect(onBenchToLane).toHaveBeenCalledWith(12, 7, 'pool')
  })

  it('promotes a benched block from its promote control', () => {
    const track = makeTrack(5, '08A', 128)
    const { onPromote } = renderSequencer(
      makeSet([], [makePoolEntry(track, 0)]),
    )

    // The arrow appears on selection, so the block is clicked first.
    act(() => {
      screen.getByLabelText('Track 5').click()
    })
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
  /** Zoom is derived from the blocks now, so it is read back off the lanes. */
  function pxPerMin() {
    const lanes = document.querySelector('.sq-lanes') as HTMLElement
    return Number(lanes.dataset.pxPerMin)
  }

  function clientXFor(minute: number) {
    return 88 + (minute - 360) * pxPerMin()
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

describe('SequencerBlock sizing', () => {
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

  it('carries only the key and the BPM, with the title in the popover', () => {
    const { container } = renderBlock(120)

    // Both sit on the tile at the same size, left-aligned under each other.
    expect(container.querySelector('.sq-block-line')?.textContent).toContain(
      '08A',
    )
    expect(container.querySelector('.sq-block-sub')?.textContent).toBe('128')
    expect(
      container.querySelector('.sq-block-line')?.textContent,
    ).not.toContain('Track 1')

    // Nothing until hover, and then the full details, portalled out of the
    // block so its overflow clipping cannot hide them.
    expect(document.querySelector('.sq-block-pop')).toBeNull()
    act(() => {
      fireEvent.pointerEnter(
        container.querySelector('.sq-block') as HTMLElement,
      )
    })
    const popover = document.querySelector('.sq-block-pop') as HTMLElement
    expect(popover.textContent).toContain('Track 1')
    expect(popover.textContent).toContain('128 BPM')
    expect(popover.closest('.sq-block')).toBeNull()

    act(() => {
      fireEvent.pointerLeave(
        container.querySelector('.sq-block') as HTMLElement,
      )
    })
    expect(document.querySelector('.sq-block-pop')).toBeNull()
  })

  it('renders at the width the zoom gives it, however narrow', () => {
    // No artificial floor: a sliver stays a sliver and simply clips.
    const { container } = renderBlock(9)
    const block = container.querySelector('.sq-block') as HTMLElement
    expect(block.style.width).toBe('9px')
  })

  it('reveals the promote control only once the benched block is selected', () => {
    const onPromote = vi.fn()
    const { container, rerender } = render(
      <SequencerBlock
        track={track}
        left={0}
        width={120}
        benched
        selected={false}
        onSelect={vi.fn()}
        onPromote={onPromote}
      />,
    )

    // Unselected, the arrow stays out of the way of the key and the BPM.
    expect(container.querySelector('.sq-block--benched')).not.toBeNull()
    expect(screen.queryByLabelText('Promote Track 1')).toBeNull()

    rerender(
      <SequencerBlock
        track={track}
        left={0}
        width={120}
        benched
        selected
        onSelect={vi.fn()}
        onPromote={onPromote}
      />,
    )
    expect(screen.getByLabelText('Promote Track 1')).toBeInTheDocument()
  })

  it('promotes a benched block on a double click', () => {
    const onPromote = vi.fn()
    const { container } = render(
      <SequencerBlock
        track={track}
        left={0}
        width={120}
        benched
        selected={false}
        onSelect={vi.fn()}
        onPromote={onPromote}
      />,
    )

    fireEvent.doubleClick(container.querySelector('.sq-block') as HTMLElement)

    expect(onPromote).toHaveBeenCalled()
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

describe('Sequencer scrollbar', () => {
  it('replaces the native bar with a centred track above the lanes', () => {
    const tracklist = Array.from({ length: 6 }, (_, i) =>
      makeEntry(makeTrack(i + 1, '08A', 128), i),
    )
    const { container } = renderSequencer(makeSet(tracklist))

    const main = container.querySelector('.sq-main') as HTMLElement
    Object.defineProperty(main, 'clientWidth', {
      value: 400,
      configurable: true,
    })
    Object.defineProperty(main, 'scrollWidth', {
      value: 1600,
      configurable: true,
    })
    act(() => {
      fireEvent.scroll(main)
    })

    const bar = container.querySelector('.sq-scrollbar') as HTMLElement
    const track = container.querySelector('.sq-scrollbar-track') as HTMLElement
    const thumb = container.querySelector('.sq-scrollbar-thumb') as HTMLElement

    // It sits between the ruler and the first lane, not at the bottom.
    const lanes = container.querySelector('.sq-lanes') as HTMLElement
    const order = Array.from(lanes.children)
    expect(order.indexOf(bar)).toBe(
      order.indexOf(container.querySelector('.sq-ruler') as HTMLElement) + 1,
    )
    // Roughly 60% of the visible width, and the thumb is proportional.
    expect(Number.parseFloat(track.style.width)).toBeCloseTo(240, 5)
    expect(Number.parseFloat(thumb.style.width)).toBeCloseTo(60, 5)
  })

  it('scrolls the timeline when the thumb is dragged', () => {
    const tracklist = Array.from({ length: 6 }, (_, i) =>
      makeEntry(makeTrack(i + 1, '08A', 128), i),
    )
    const { container } = renderSequencer(makeSet(tracklist))

    const main = container.querySelector('.sq-main') as HTMLElement
    Object.defineProperty(main, 'clientWidth', {
      value: 400,
      configurable: true,
    })
    Object.defineProperty(main, 'scrollWidth', {
      value: 1600,
      configurable: true,
    })
    act(() => {
      fireEvent.scroll(main)
    })

    const thumb = container.querySelector('.sq-scrollbar-thumb') as HTMLElement
    act(() => {
      fireEvent.pointerDown(thumb, { clientX: 0, button: 0 })
      fireEvent.pointerMove(window, { clientX: 90 })
      fireEvent.pointerUp(window)
    })

    // 90px along a 180px travel is half of the 1200px of scrollable width.
    expect(main.scrollLeft).toBeCloseTo(600, 0)
  })
})

describe('Sequencer bench lane defaults', () => {
  it('queues a dropped track after the committed spine, not under the pointer', () => {
    // Two committed tracks, so the spine ends well after the start time.
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
    ]
    const pool = [makePoolEntry(makeTrack(12, '09A', 128), 0)]
    renderSequencer(makeSet(tracklist, pool))

    const committedEnd = screen
      .getByLabelText('Track 2')
      .style.left.replace('px', '')

    fireEvent.drop(screen.getByLabelText('Alt 1 lane'), {
      dataTransfer: dataTransfer({ [TRACK_DRAG_MIME]: '12' }),
    })

    // It lands past where the last committed block starts.
    const benched = screen.getByLabelText('Track 12')
    expect(Number.parseFloat(benched.style.left)).toBeGreaterThan(
      Number.parseFloat(committedEnd),
    )
  })

  it('sorts a lane alphabetically from the lane header', () => {
    const pool = [
      makePoolEntry({ ...makeTrack(3, '08A', 128), title: 'Zulu' }, 0),
      makePoolEntry({ ...makeTrack(4, '08A', 128), title: 'Alpha' }, 1),
      makePoolEntry({ ...makeTrack(5, '08A', 128), title: 'Mike' }, 2),
    ]
    renderSequencer(makeSet([], pool))

    act(() => {
      screen.getByLabelText('Sort lane Alt 1').click()
    })

    const at = (label: string) =>
      Number.parseFloat(screen.getByLabelText(label).style.left)
    expect(at('Alpha')).toBeLessThan(at('Mike'))
    expect(at('Mike')).toBeLessThan(at('Zulu'))
  })
})
