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
import { LANE_LABEL_PX } from './SequencerLanes'
import { BENCH_BLOCK_GAP_MIN } from '../hooks/useSequencer'
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
  updateTracklistNote: vi.fn().mockResolvedValue(undefined),
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

/** Titles of the currently selected blocks, in lane order. */
function selectedLabels(container: HTMLElement): Array<string | null> {
  return Array.from(container.querySelectorAll('.sq-block--sel')).map((el) =>
    el.getAttribute('aria-label'),
  )
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

  it('places and centers the insertion cursor from a timestamp-row click', () => {
    const { container } = renderSequencer(
      makeSet([makeEntry(makeTrack(1, '08A', 128), 0)]),
    )
    const main = container.querySelector('.sq-main') as HTMLElement
    Object.defineProperty(main, 'clientWidth', {
      configurable: true,
      value: 100,
    })
    Object.defineProperty(main, 'scrollWidth', {
      configurable: true,
      value: 1000,
    })

    fireEvent.pointerDown(screen.getByLabelText('Timeline ruler'), {
      clientX: LANE_LABEL_PX + 10 * 6,
      button: 0,
    })

    expect(screen.getByLabelText('Paste cursor at 6:10')).toBeInTheDocument()
    expect(main.scrollLeft).toBe(120)
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

  it('assigns distinct lane colors without using the reserved gold range', () => {
    const subgroups: PoolSubgroup[] = Array.from({ length: 6 }, (_, index) => ({
      id: 7 + index,
      set_id: 1,
      name: `Alt ${index + 1}`,
      display_order: index,
    }))
    const { container } = renderSequencer(makeSet([], [], subgroups))

    const lanes = Array.from(
      container.querySelectorAll<HTMLElement>('.sq-lane--alt'),
    )
    const hues = lanes.map((lane) =>
      Number(lane.style.getPropertyValue('--sq-alt-hue')),
    )
    expect(new Set(hues).size).toBe(hues.length)
    expect(hues.every((hue) => hue < 35 || hue > 70)).toBe(true)
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

  /** 6px per minute from 6:00, after the lane label. */
  /** Zoom is derived from the blocks now, so it is read back off the lanes. */
  function pxPerMin() {
    const lanes = document.querySelector('.sq-lanes') as HTMLElement
    return Number(lanes.dataset.pxPerMin)
  }

  function clientXFor(minute: number) {
    return LANE_LABEL_PX + (minute - 360) * pxPerMin()
  }

  /**
   * jsdom has no DragEvent, so `fireEvent.drop` drops an init `clientX`. The
   * coordinate has to be defined on the event the component actually receives.
   */
  function dropAt(
    laneLabel: string,
    dt: ReturnType<typeof dataTransfer>,
    minute: number,
    mods: Record<string, boolean> = {},
  ) {
    const lane = screen.getByLabelText(laneLabel)
    const event = createEvent.drop(lane, { dataTransfer: dt })
    Object.defineProperty(event, 'clientX', { value: clientXFor(minute) })
    for (const [key, value] of Object.entries(mods)) {
      Object.defineProperty(event, key, { value })
    }
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

  it('copies a committed block to an alternative lane with Option/Alt drag', () => {
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
    ]
    const { onBenchToLane } = renderSequencer(
      makeSet([makeEntry(first, 0)], [], subgroups),
    )
    const dt = dataTransfer()

    dragBlock('Track 1', dt)
    dropAt('Alt 1 lane', dt, 380, { altKey: true })

    expect(onBenchToLane).toHaveBeenCalledWith(1, 7, 'browse')
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

  it('copies a benched block between lanes with Option/Alt drag', () => {
    const pool = [makePoolEntry(second, 0)]
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
      { id: 8, set_id: 1, name: 'Alt 2', display_order: 1 },
    ]
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 7, pool_entry_id: pool[0].id, display_order: 0 },
    ]
    const { onMoveBench, onBenchToLane } = renderSequencer(
      makeSet([], pool, subgroups, memberships),
    )
    const dt = dataTransfer()

    dragBlock('Track 2', dt)
    dropAt('Alt 2 lane', dt, 390, { altKey: true })

    expect(onBenchToLane).toHaveBeenCalledWith(2, 8, 'pool')
    expect(onMoveBench).not.toHaveBeenCalled()
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

  it('copies a benched block to committed with Option/Alt drag', () => {
    const pool = [makePoolEntry(second, 0)]
    const tracklist = [makeEntry(first, 0)]
    const { onAddCommitted, onPromote } = renderSequencer(
      makeSet(tracklist, pool),
    )
    const dt = dataTransfer()

    dragBlock('Track 2', dt)
    dropAt('Committed lane', dt, 372, { altKey: true })

    expect(onAddCommitted).toHaveBeenCalledWith(2, 1)
    expect(onPromote).not.toHaveBeenCalled()
  })

  it('links edge-to-edge tiles after resolving an overlapping drop', () => {
    const pool = [
      makePoolEntry(makeTrack(1, '08A', 128), 0),
      makePoolEntry(makeTrack(2, '08A', 128), 1),
    ]
    const { container } = renderSequencer(makeSet([], pool))
    const dt = dataTransfer()

    dragBlock('Track 1', dt)
    dropAt('Alt 1 lane', dt, 365)

    expect(container.querySelector('.sq-lane-link')).not.toBeNull()
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
    // Only a one-pixel visibility floor remains, and padding stays inside it.
    const { container } = renderBlock(0.4)
    const block = container.querySelector('.sq-block') as HTMLElement
    expect(block.style.width).toBe('1px')
  })

  it('stars a tile without selecting it and toggles the gold state', () => {
    const { container } = renderSequencer(
      makeSet([makeEntry(makeTrack(1, '08A', 128), 0)]),
    )
    const block = screen.getByLabelText('Track 1')

    fireEvent.click(screen.getByLabelText('Star Track 1'))

    expect(block).toHaveClass('sq-block--starred')
    expect(selectedLabels(container)).toEqual([])
    fireEvent.click(screen.getByLabelText('Unstar Track 1'))
    expect(block).not.toHaveClass('sq-block--starred')
  })

  it('pins a benched tile in place when its lane is auto-arranged', () => {
    const pool = [
      makePoolEntry({ ...makeTrack(1, '08A', 128), title: 'Zulu' }, 0),
      makePoolEntry({ ...makeTrack(2, '08A', 128), title: 'Pinned' }, 1),
      makePoolEntry({ ...makeTrack(3, '08A', 128), title: 'Alpha' }, 2),
    ]
    const { container } = renderSequencer(makeSet([], pool))
    const block = screen.getByLabelText('Pinned')
    const initialLeft = block.style.left

    fireEvent.click(screen.getByLabelText('Pin Pinned'))
    expect(screen.getByLabelText('Unpin Pinned')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(selectedLabels(container)).toEqual([])

    fireEvent.click(screen.getByLabelText('Auto-arrange lane Alt 1'))
    expect(block.style.left).toBe(initialLeft)
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

  it('never exposes a timing multiplier on a block', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0, { pinned_end_minutes: 364 }),
      makeEntry(makeTrack(2, '09A', 128), 1),
    ]
    renderSequencer(makeSet(tracklist))

    const lane = screen.getByLabelText('Committed lane')
    expect(lane.textContent).not.toContain('×')
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

  it('does not inspect harmony matches for a multi-track selection', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '09A', 128), 1),
      makeEntry(makeTrack(3, '03B', 128), 2),
    ]
    const { container } = renderSequencer(makeSet(tracklist))
    const lane = container.querySelector('.sq-lane--committed') as HTMLElement

    act(() => {
      fireEvent.pointerDown(lane, {
        clientX: LANE_LABEL_PX + 6,
        button: 0,
      })
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: LANE_LABEL_PX + 36 })
      fireEvent.pointerUp(window, { clientX: LANE_LABEL_PX + 36 })
    })

    expect(selectedLabels(container)).toEqual(['Track 1', 'Track 2'])
    expect(screen.getByLabelText('Track 3').style.backgroundColor).toBe('')
    expect(screen.getByLabelText('Track 3').style.opacity).toBe('')
  })
})

describe('Sequencer tracklist view', () => {
  function openList(activeSet: HydratedSet, props = {}) {
    const view = renderSequencer(activeSet, props)
    act(() => {
      screen.getByRole('button', { name: 'Tracklist' }).click()
    })
    return view
  }

  it('renders Notes with the timing columns and no redundant Plays', () => {
    openList(makeSet([makeEntry(makeTrack(1, '08A', 128), 0)]))

    expect(
      screen.getAllByRole('columnheader').map((th) => th.textContent),
    ).toEqual(['', '#', 'Title', 'Key', 'BPM', 'In', 'Out', 'Length', 'Notes'])
    expect(screen.getByLabelText('Notes for Track 1')).toBeInTheDocument()
  })

  it('saves an edited track note on blur', async () => {
    const httpMod = await import('../api/http')
    openList(
      makeSet([
        makeEntry(makeTrack(1, '08A', 128), 0, { note: 'Mix after breakdown' }),
      ]),
    )

    const input = screen.getByLabelText('Notes for Track 1')
    expect(input).toHaveValue('Mix after breakdown')

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Loop intro' } })
      fireEvent.blur(input)
    })

    expect(vi.mocked(httpMod.updateTracklistNote)).toHaveBeenCalledWith(
      1,
      1,
      'Loop intro',
    )
  })

  it('saves an edited BPM and marks the edited cell', async () => {
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

  it('keeps timing mechanics hidden and formats Length as mm:ss', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0, { pinned_end_minutes: 364 }),
      makeEntry(makeTrack(2, '09A', 128), 1, { play_minutes: 4 }),
    ]
    const { container } = openList(makeSet(tracklist))

    const rows = container.querySelectorAll('.sq-list-row')
    expect(within(rows[0] as HTMLElement).getByText('pinned')).toBeVisible()
    expect(within(rows[1] as HTMLElement).getByText('manual')).toBeVisible()
    for (const row of rows) {
      expect(
        (row as HTMLElement).querySelector('.sq-col-length')?.textContent,
      ).toMatch(/^\d{2}:\d{2}$/)
    }
    expect(
      screen.getAllByRole('button', {
        name: /Remove Track \d+ from tracklist/,
      }),
    ).toHaveLength(2)
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

  it('reorders a tracklist row dropped onto another row', () => {
    const onReorder = vi.fn()
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '09A', 128), 1),
      makeEntry(makeTrack(3, '10A', 128), 2),
    ]
    const { container } = renderSequencer(makeSet(tracklist), { onReorder })
    act(() => {
      screen.getByRole('button', { name: 'Tracklist' }).click()
    })
    const rows = container.querySelectorAll('.sq-list-row')
    const dt = {
      setData: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
      types: [] as string[],
      getData: () => '',
    }
    fireEvent.dragStart(rows[0], { dataTransfer: dt })
    fireEvent.dragOver(rows[2], { dataTransfer: dt })
    fireEvent.drop(rows[2], { dataTransfer: dt })
    expect(onReorder).toHaveBeenCalledWith(1, 2)
  })

  it('inserts a browse track dropped onto a tracklist row', () => {
    const onAddCommitted = vi.fn()
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '09A', 128), 1),
    ]
    const { container } = renderSequencer(makeSet(tracklist), {
      onAddCommitted,
    })
    act(() => {
      screen.getByRole('button', { name: 'Tracklist' }).click()
    })
    const rows = container.querySelectorAll('.sq-list-row')
    fireEvent.drop(rows[1], {
      dataTransfer: {
        types: [TRACK_DRAG_MIME],
        getData: (m: string) => (m === TRACK_DRAG_MIME ? '99' : ''),
        setData: vi.fn(),
        effectAllowed: '',
        dropEffect: '',
      },
    })
    expect(onAddCommitted).toHaveBeenCalledWith(99, 1)
  })

  it('inserts a catalog track before a row from the + control', () => {
    const onAddCommitted = vi.fn()
    const catalogTrack = makeTrack(99, '07A', 126)
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '09A', 128), 1),
    ]
    openList(makeSet(tracklist), { onAddCommitted, allTracks: [catalogTrack] })

    fireEvent.click(
      screen.getByRole('button', { name: 'Insert track before Track 2' }),
    )
    fireEvent.change(screen.getByTestId('track-search-modal-input'), {
      target: { value: 'Track 99' },
    })
    fireEvent.mouseDown(screen.getByTestId('track-search-modal-item'))

    expect(onAddCommitted).toHaveBeenCalledWith(99, 1)
    expect(screen.queryByTestId('track-search-modal')).toBeNull()
  })

  it('removes a tracklist row from the × control', () => {
    const onRemove = vi.fn()
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '09A', 128), 1),
    ]
    openList(makeSet(tracklist), { onRemove })

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Track 2 from tracklist' }),
    )

    expect(onRemove).toHaveBeenCalledWith(2)
  })
})

describe('Sequencer inspector footer', () => {
  const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]

  it('stays hidden until a block is selected', () => {
    const { container } = renderSequencer(makeSet(tracklist))

    expect(container.querySelector('.sq-inspector')).toBeNull()
  })

  it('shows BPM, In and Out controls for a committed block', () => {
    renderSequencer(makeSet(tracklist))

    act(() => {
      screen.getByLabelText('Track 1').click()
    })

    expect(screen.getByLabelText('Played BPM')).toBeInTheDocument()
    expect(screen.getByLabelText('In time')).toHaveValue('6:00')
    expect(screen.getByLabelText('In time')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Out time')).toBeInTheDocument()
    expect(screen.queryByText('overridden')).toBeNull()
    expect(screen.queryByText('plays')).toBeNull()
    expect(screen.queryByText('ends')).toBeNull()
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
    expect(screen.getByLabelText('In time')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Out time')).toBeInTheDocument()
    for (const name of ['Reset', 'Commit', 'Remove']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Bench' })).toBeNull()

    act(() => {
      screen.getByRole('button', { name: 'Commit' }).click()
    })
    expect(onPromote).toHaveBeenCalledWith(5, 0)
  })

  it('previews a benched Out edit without touching the server', async () => {
    const httpMod = await import('../api/http')
    const track = makeTrack(5, '08A', 128)
    renderSequencer(makeSet([], [makePoolEntry(track, 0)]))

    act(() => {
      screen.getByLabelText('Track 5').click()
    })
    await act(async () => {
      const out = screen.getByLabelText('Out time')
      fireEvent.change(out, { target: { value: '6:03' } })
      fireEvent.blur(out)
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

  it('persists an Out edit and resets it again', async () => {
    const httpMod = await import('../api/http')
    renderSequencer(makeSet(tracklist))

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    const out = screen.getByLabelText('Out time')
    await act(async () => {
      fireEvent.change(out, { target: { value: '6:06' } })
      fireEvent.blur(out)
    })

    expect(vi.mocked(httpMod.tracklistSetOverrides)).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ pinned_end_minutes: 366 }),
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

  it('jumps to the timeline end from the subtle arrow control', () => {
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

    const blocks = screen
      .getByLabelText('Committed lane')
      .querySelectorAll('.sq-block')
    const last = blocks[blocks.length - 1] as HTMLElement
    const sequenceEnd =
      Number.parseFloat(last.style.left) + Number.parseFloat(last.style.width)
    fireEvent.click(screen.getByLabelText('Jump to sequence end'))

    expect(main.scrollLeft).toBeCloseTo(
      Math.min(1200, Math.max(0, sequenceEnd - 400 + 24)),
      5,
    )
  })
})

describe('Sequencer bench lane defaults', () => {
  it('switches lane borders to dashed after the committed end', () => {
    const { container } = renderSequencer(
      makeSet([makeEntry(makeTrack(1, '08A', 128), 0)]),
    )
    const committed = screen.getByLabelText('Track 1')
    const committedEnd =
      Number.parseFloat(committed.style.left) +
      Number.parseFloat(committed.style.width)
    const borders = container.querySelectorAll<HTMLElement>('.sq-lane-post-end')

    expect(borders).toHaveLength(2)
    expect(Number.parseFloat(borders[0].style.left)).toBeCloseTo(
      committedEnd,
      6,
    )
    expect(Number.parseFloat(borders[0].style.width)).toBeGreaterThan(0)
  })

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

  it('auto-arranges a lane by BPM cluster, then by title', () => {
    // 100, 128 and 140 BPM each land in their own matrix column.
    const pool = [
      makePoolEntry({ ...makeTrack(3, '08A', 140), title: 'Zulu' }, 0),
      makePoolEntry({ ...makeTrack(4, '08A', 100), title: 'Mike' }, 1),
      makePoolEntry({ ...makeTrack(5, '08A', 128), title: 'Alpha' }, 2),
      makePoolEntry({ ...makeTrack(6, '08A', 100), title: 'Bravo' }, 3),
    ]
    renderSequencer(makeSet([], pool))

    act(() => {
      screen.getByLabelText('Auto-arrange lane Alt 1').click()
    })

    const at = (label: string) =>
      Number.parseFloat(screen.getByLabelText(label).style.left)
    // Slowest cluster first, and Bravo before Mike inside it.
    expect(at('Bravo')).toBeLessThan(at('Mike'))
    expect(at('Mike')).toBeLessThan(at('Alpha'))
    expect(at('Alpha')).toBeLessThan(at('Zulu'))
  })

  it('separates every auto-arranged tile from the committed end', () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const pool = [
      makePoolEntry({ ...makeTrack(3, '08A', 128), title: 'Bravo' }, 0),
      makePoolEntry({ ...makeTrack(4, '08A', 128), title: 'Alpha' }, 1),
    ]
    renderSequencer(makeSet(tracklist, pool))

    act(() => {
      screen.getByLabelText('Auto-arrange lane Alt 1').click()
    })

    const box = (label: string) => {
      const el = screen.getByLabelText(label)
      return {
        left: Number.parseFloat(el.style.left),
        width: Number.parseFloat(el.style.width),
      }
    }
    const committed = box('Track 1')
    const first = box('Alpha')
    const second = box('Bravo')
    expect(first.left).toBeCloseTo(committed.left + committed.width, 6)
    expect(second.left).toBeCloseTo(
      first.left + first.width + BENCH_BLOCK_GAP_MIN * 6,
      6,
    )
  })
})

describe('Sequencer lane drag selection', () => {
  // The lane maps a client x to a minute as
  // startMin + (x - laneLeft - LANE_LABEL_PX) / pxPerMin, and jsdom reports a
  // zero rect, so the label width is the set start and each 6px is one minute.
  const ORIGIN_PX = LANE_LABEL_PX
  const PX_PER_MIN = 6
  /** Client x for a minute offset from the set start. */
  const atMinute = (minute: number) => ORIGIN_PX + minute * PX_PER_MIN

  function laneEl(container: HTMLElement, selector: string) {
    return container.querySelector(selector) as HTMLElement
  }

  function dragAcross(lane: HTMLElement, from: number, to: number) {
    // The window listeners are attached by an effect, so the press has to be
    // committed before the move and the release are dispatched.
    act(() => {
      fireEvent.pointerDown(lane, { clientX: from, clientY: 10, button: 0 })
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: to, clientY: 10 })
      fireEvent.pointerUp(window, { clientX: to, clientY: 10 })
    })
  }

  it('selects every committed block the drag crosses', () => {
    // Blocks run 5.34 played minutes each once the closing run stretches to
    // the set end, so they span 0–5.34, 5.34–10.69 and 10.69–16.03.
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
      makeEntry(makeTrack(3, '08A', 128), 2),
    ]
    const { container } = renderSequencer(makeSet(tracklist))

    dragAcross(
      laneEl(container, '.sq-lane--committed'),
      atMinute(1),
      atMinute(6),
    )

    expect(selectedLabels(container)).toEqual(['Track 1', 'Track 2'])
  })

  it('selects exactly one block for a drag inside one span', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
    ]
    const { container } = renderSequencer(makeSet(tracklist))

    dragAcross(
      laneEl(container, '.sq-lane--committed'),
      atMinute(6),
      atMinute(8),
    )

    expect(selectedLabels(container)).toEqual(['Track 2'])
  })

  it('reads a right-to-left drag the same way', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
    ]
    const { container } = renderSequencer(makeSet(tracklist))

    dragAcross(
      laneEl(container, '.sq-lane--committed'),
      atMinute(6),
      atMinute(1),
    )

    expect(selectedLabels(container)).toEqual(['Track 1', 'Track 2'])
  })

  it('keeps a drag selection inside the lane it started in', () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const pool = [makePoolEntry(makeTrack(2, '08A', 128), 0)]
    const { container } = renderSequencer(makeSet(tracklist, pool))

    // The benched block queues after the committed spine, so the sweep covers
    // the minutes both lanes occupy.
    dragAcross(laneEl(container, '.sq-lane--alt'), atMinute(0), atMinute(20))

    expect(selectedLabels(container)).toEqual(['Track 2'])
  })

  it('draws a marquee while the drag is live and drops it on release', () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const { container } = renderSequencer(makeSet(tracklist))

    const lane = laneEl(container, '.sq-lane--committed')
    act(() => {
      fireEvent.pointerDown(lane, {
        clientX: atMinute(2),
        clientY: 10,
        button: 0,
      })
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: atMinute(7), clientY: 10 })
    })

    const marquee = container.querySelector('.sq-marquee') as HTMLElement
    expect(marquee).not.toBeNull()
    expect(Number.parseFloat(marquee.style.left)).toBeCloseTo(atMinute(2), 5)
    expect(Number.parseFloat(marquee.style.width)).toBeCloseTo(
      5 * PX_PER_MIN,
      5,
    )

    act(() => {
      fireEvent.pointerUp(window, { clientX: atMinute(7), clientY: 10 })
    })
    expect(container.querySelector('.sq-marquee')).toBeNull()
  })

  it('leaves a pointer-down on a block to the block drag', () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const { container } = renderSequencer(makeSet(tracklist))

    act(() => {
      fireEvent.pointerDown(screen.getByLabelText('Track 1'), {
        clientX: atMinute(1),
        clientY: 10,
        button: 0,
      })
    })

    expect(container.querySelector('.sq-marquee')).toBeNull()
  })

  it('leaves a click on a block as a single selection', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
    ]
    const { container } = renderSequencer(makeSet(tracklist))

    act(() => {
      screen.getByLabelText('Track 2').click()
    })

    expect(selectedLabels(container)).toEqual(['Track 2'])
  })

  it('clears the current selection with Escape', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
    ]
    const { container } = renderSequencer(makeSet(tracklist))

    fireEvent.click(screen.getByLabelText('Track 2'))
    expect(selectedLabels(container)).toEqual(['Track 2'])

    fireEvent.keyDown(container.querySelector('.sq-body') as HTMLElement, {
      key: 'Escape',
    })

    expect(selectedLabels(container)).toEqual([])
    expect(container.querySelector('.sq-inspector')).toBeNull()
  })
})

describe('Sequencer cut and paste', () => {
  const body = (container: HTMLElement) =>
    container.querySelector('.sq-body') as HTMLElement

  function press(
    target: HTMLElement,
    key: string,
    mods: Record<string, boolean> = { metaKey: true },
  ) {
    act(() => {
      fireEvent.keyDown(target, { key, ...mods })
    })
  }

  async function pressAsync(target: HTMLElement, key: string) {
    await act(async () => {
      fireEvent.keyDown(target, { key, metaKey: true })
    })
  }

  function placeCursor(lane: HTMLElement, clientX: number) {
    act(() => {
      fireEvent.pointerDown(lane, { clientX, button: 0 })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX })
    })
  }

  it('captures every selected track without deleting any source row', () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
      makeEntry(makeTrack(3, '08A', 128), 2),
    ]
    const onRemove = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist), { onRemove })

    // A sweep over the first two blocks, then one cut for the pair. Client x
    // 94 and 124 are one and six minutes past the set start.
    const lane = container.querySelector('.sq-lane--committed') as HTMLElement
    act(() => {
      fireEvent.pointerDown(lane, { clientX: 94, clientY: 10, button: 0 })
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 124, clientY: 10 })
      fireEvent.pointerUp(window, { clientX: 124, clientY: 10 })
    })
    press(body(container), 'x')

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Track 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Track 2')).toBeInTheDocument()
    expect(selectedLabels(container)).toEqual([])
    expect(screen.getByLabelText('Paste cursor at 6:00')).toBeInTheDocument()
  })

  it('captures a cut with Ctrl as well as Cmd without removing it', () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const onRemove = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist), { onRemove })

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    press(body(container), 'x', { ctrlKey: true })

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Paste cursor at 6:00')).toBeInTheDocument()
  })

  it('keeps a copied selection available for repeated pastes', async () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
    ]
    const onBenchToLane = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist, [], subgroups), {
      onBenchToLane,
    })
    const lane = screen.getByLabelText('Alt 1 lane')

    fireEvent.click(screen.getByLabelText('Track 1'))
    press(body(container), 'c')
    placeCursor(lane, LANE_LABEL_PX + 12 * 6)
    await pressAsync(body(container), 'v')
    placeCursor(lane, LANE_LABEL_PX + 16 * 6)
    await pressAsync(body(container), 'v')

    expect(onBenchToLane).toHaveBeenCalledTimes(2)
    expect(onBenchToLane).toHaveBeenNthCalledWith(1, 1, 7, 'browse')
    expect(onBenchToLane).toHaveBeenNthCalledWith(2, 1, 7, 'browse')
  })

  it('copies a benched selection to another lane without moving the source lane', async () => {
    const pool = [makePoolEntry(makeTrack(2, '08A', 128), 0)]
    const subgroups: PoolSubgroup[] = [
      { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
      { id: 8, set_id: 1, name: 'Alt 2', display_order: 1 },
    ]
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 7, pool_entry_id: pool[0].id, display_order: 0 },
    ]
    const onBenchToLane = vi.fn()
    const onMoveBench = vi.fn()
    const { container } = renderSequencer(
      makeSet([], pool, subgroups, memberships),
      { onBenchToLane, onMoveBench },
    )

    fireEvent.click(screen.getByLabelText('Track 2'))
    press(body(container), 'c')
    placeCursor(screen.getByLabelText('Alt 2 lane'), LANE_LABEL_PX + 10 * 6)
    await pressAsync(body(container), 'v')

    expect(onBenchToLane).toHaveBeenCalledWith(2, 8, 'pool')
    expect(onMoveBench).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.sq-lane--alt')).toHaveLength(2)
  })

  it('moves a committed cut to the lane cursor without remove/add writes', async () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1, {
        play_minutes: 5,
        bpm_override: 130,
        note: 'drop at 32',
      }),
    ]
    const onAddCommitted = vi.fn()
    const onRemove = vi.fn()
    const onReorder = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist), {
      onAddCommitted,
      onRemove,
      onReorder,
    })
    const httpMod = await import('../api/http')

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    press(body(container), 'x')
    placeCursor(screen.getByLabelText('Committed lane'), LANE_LABEL_PX + 20 * 6)
    await pressAsync(body(container), 'v')

    expect(onReorder).toHaveBeenCalledWith(2, 0)
    expect(onRemove).not.toHaveBeenCalled()
    expect(onAddCommitted).not.toHaveBeenCalled()
    expect(vi.mocked(httpMod.tracklistSetOverrides)).not.toHaveBeenCalled()
    expect(vi.mocked(httpMod.updateTracklistNote)).not.toHaveBeenCalled()
  })

  it('defaults the paste cursor to the cut location', async () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
    ]
    const onReorder = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist), {
      onReorder,
    })

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    press(body(container), 'x')
    await pressAsync(body(container), 'v')

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('never starts a destructive cut write before paste', async () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const onRemove = vi.fn(() => new Promise<void>(() => {}))
    const onReorder = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist), {
      onRemove,
      onReorder,
    })

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    press(body(container), 'x')
    await pressAsync(body(container), 'v')

    expect(onRemove).not.toHaveBeenCalled()
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('empties the clipboard once it has been pasted', async () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
    ]
    const onReorder = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist), {
      onReorder,
    })

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    press(body(container), 'x')
    placeCursor(screen.getByLabelText('Committed lane'), LANE_LABEL_PX + 20 * 6)
    await pressAsync(body(container), 'v')
    await pressAsync(body(container), 'v')

    expect(onReorder).toHaveBeenCalledTimes(1)
  })

  it('keeps the clipboard when paste fails and empties it after a retry', async () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
    ]
    const onReorder = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    const { container } = renderSequencer(makeSet(tracklist), {
      onReorder,
    })

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    press(body(container), 'x')
    placeCursor(screen.getByLabelText('Committed lane'), LANE_LABEL_PX + 20 * 6)
    await pressAsync(body(container), 'v')

    expect(
      await screen.findByText('Could not paste the selection.'),
    ).toBeInTheDocument()

    await pressAsync(body(container), 'v')
    await pressAsync(body(container), 'v')

    expect(onReorder).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Could not paste the selection.')).toBeNull()
  })

  it('pastes a benched cut at an explicit cursor in its lane', async () => {
    const pool = [
      makePoolEntry(makeTrack(3, '08A', 128), 0),
      makePoolEntry(makeTrack(4, '08A', 128), 1),
    ]
    const onRemoveBenched = vi.fn()
    const onBenchToLane = vi.fn()
    const { container } = renderSequencer(makeSet([], pool), {
      onRemoveBenched,
      onBenchToLane,
    })

    const leftOf = (label: string) =>
      Number.parseFloat(screen.getByLabelText(label).style.left)

    act(() => {
      screen.getByLabelText('Track 3').click()
    })
    press(body(container), 'x')
    const targetX = LANE_LABEL_PX + 30 * 6
    placeCursor(screen.getByLabelText('Alt 1 lane'), targetX)
    await pressAsync(body(container), 'v')

    expect(onRemoveBenched).not.toHaveBeenCalled()
    expect(onBenchToLane).not.toHaveBeenCalled()
    expect(leftOf('Track 3')).toBeCloseTo(targetX, 5)
  })

  it('retries only the unmoved tracks after a partial cross-lane paste', async () => {
    const tracklist = [
      makeEntry(makeTrack(1, '08A', 128), 0),
      makeEntry(makeTrack(2, '08A', 128), 1),
    ]
    const onRemove = vi.fn()
    const onBenchToLane = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { container } = renderSequencer(makeSet(tracklist), {
      onRemove,
      onBenchToLane,
    })
    const committed = screen.getByLabelText('Committed lane')
    act(() => {
      fireEvent.pointerDown(committed, { clientX: LANE_LABEL_PX, button: 0 })
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 150 })
      fireEvent.pointerUp(window, { clientX: 150 })
    })
    press(body(container), 'x')
    placeCursor(screen.getByLabelText('Alt 1 lane'), LANE_LABEL_PX + 20 * 6)

    await pressAsync(body(container), 'v')
    expect(
      await screen.findByText('Could not paste the selection.'),
    ).toBeInTheDocument()
    await pressAsync(body(container), 'v')

    expect(onRemove).not.toHaveBeenCalled()
    expect(onBenchToLane.mock.calls.map((call) => call[0])).toEqual([1, 2, 2])
    expect(screen.queryByText('Could not paste the selection.')).toBeNull()
  })

  it('ignores cut while a text field has focus', () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const onRemove = vi.fn()
    renderSequencer(makeSet(tracklist), { onRemove })

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    press(screen.getByLabelText('Set start time'), 'x')

    expect(onRemove).not.toHaveBeenCalled()
  })

  it('ignores an unmodified x', () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const onRemove = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist), { onRemove })

    act(() => {
      screen.getByLabelText('Track 1').click()
    })
    press(body(container), 'x', {})

    expect(onRemove).not.toHaveBeenCalled()
  })

  it('does nothing on a cut with no selection', () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const onRemove = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist), { onRemove })

    press(body(container), 'x')

    expect(onRemove).not.toHaveBeenCalled()
  })

  it('does nothing on a paste with an empty clipboard', async () => {
    const tracklist = [makeEntry(makeTrack(1, '08A', 128), 0)]
    const onAddCommitted = vi.fn()
    const { container } = renderSequencer(makeSet(tracklist), {
      onAddCommitted,
    })

    await pressAsync(body(container), 'v')

    expect(onAddCommitted).not.toHaveBeenCalled()
  })
})

describe('Sequencer block BPM alignment', () => {
  it('puts the BPM row beside the key line rather than inside it', () => {
    render(
      <SequencerBlock
        track={makeTrack(1, '08A', 128)}
        left={0}
        width={60}
        start={360}
        end={365}
        playMinutes={5}
        bpm={128}
        selected={false}
        pinned={false}
        fallback={false}
        relation={null}
        onSelect={() => {}}
        onDragStart={() => {}}
      />,
    )

    const block = screen.getByLabelText('Track 1')
    const line = block.querySelector('.sq-block-line') as HTMLElement
    const sub = block.querySelector('.sq-block-sub') as HTMLElement
    // Both rows start at the block's own content edge, so the BPM lines up
    // with the colour dot instead of the Camelot code.
    expect(sub.parentElement).toBe(block)
    expect(line.contains(sub)).toBe(false)
    expect(line.querySelector('.key-dot')).not.toBeNull()
  })

  it('carries no inline indent that would offset the BPM row', () => {
    // jsdom loads no stylesheet, so this only rules out a component-level
    // indent. Browser QA owns the rendered geometry.
    render(
      <SequencerBlock
        track={makeTrack(1, '08A', 128)}
        left={0}
        width={60}
        start={360}
        end={365}
        playMinutes={5}
        bpm={128}
        selected={false}
        pinned={false}
        fallback={false}
        relation={null}
        onSelect={() => {}}
        onDragStart={() => {}}
      />,
    )

    const sub = screen
      .getByLabelText('Track 1')
      .querySelector('.sq-block-sub') as HTMLElement
    expect(sub.style.paddingLeft).toBe('')
    expect(sub.style.marginLeft).toBe('')
  })
})
