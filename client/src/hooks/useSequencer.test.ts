import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import * as http from '../api/http'
import {
  BLOCK_DRAG_MIME,
  BENCH_BLOCK_GAP_MIN,
  BPM_CLUSTER_GAP_MIN,
  FALLBACK_LEN_MIN,
  PLAY_FRACTION,
  arrangeLaneBlocks,
  benchPlacementKey,
  blocksInMinuteRange,
  buildOverrideMap,
  committedReorderMoves,
  deriveLanes,
  displayBpm,
  entryOverride,
  hasMeasuredDuration,
  layoutBench,
  layoutCommitted,
  planBenchDrop,
  readBlockDrag,
  snapMinutes,
  trackLengthMinutes,
  useSequencer,
  writeBlockDrag,
} from './useSequencer'
import type { BenchBlock } from './useSequencer'
import { TRACK_DRAG_MIME } from '../utils'
import { colForBpm } from '../utils/harmonic'
import type {
  PoolEntry,
  PoolSubgroup,
  PoolSubgroupMembership,
  Track,
  TracklistEntry,
} from '../types'

function track(
  id: number,
  bpm: number | null,
  durationSeconds?: number,
): Track {
  return {
    id,
    title: `Track ${id}`,
    artist_names: [],
    bpm,
    key: null,
    camelot_code: '08A',
    genre: null,
    label: null,
    energy: null,
    date_added: null,
    duration_seconds: durationSeconds ?? null,
  }
}

function entry(
  id: number,
  position: number,
  t: Track,
  overrides: Partial<TracklistEntry> = {},
): TracklistEntry {
  return {
    id,
    set_id: 1,
    track_id: t.id,
    position,
    track: t,
    ...overrides,
  }
}

function poolEntry(id: number, trackId: number): PoolEntry {
  return {
    id,
    set_id: 1,
    track_id: trackId,
    insertion_order: id,
    highlight_color: null,
    track: track(trackId, 124, 360),
  }
}

const START = 360

describe('trackLengthMinutes', () => {
  it('uses the measured duration when present', () => {
    expect(trackLengthMinutes(track(1, 124, 390))).toBeCloseTo(6.5, 5)
    expect(hasMeasuredDuration(track(1, 124, 390))).toBe(true)
  })

  it('falls back to five minutes when the duration is missing or invalid', () => {
    expect(FALLBACK_LEN_MIN).toBe(5)
    expect(trackLengthMinutes(track(1, 124))).toBe(FALLBACK_LEN_MIN)
    expect(trackLengthMinutes(track(1, 124, 0))).toBe(FALLBACK_LEN_MIN)
    expect(trackLengthMinutes(null)).toBe(FALLBACK_LEN_MIN)
    expect(hasMeasuredDuration(track(1, 124))).toBe(false)
  })

  it('flags a committed block that rests on the fallback', () => {
    const list = [entry(1, 0, track(1, 124)), entry(2, 1, track(2, 124, 600))]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    expect(blocks[0].fallback).toBe(true)
    expect(blocks[0].dur).toBeCloseTo(PLAY_FRACTION * FALLBACK_LEN_MIN, 5)
    expect(blocks[1].fallback).toBe(false)
  })
})

describe('block drag payload', () => {
  function dataTransfer() {
    const store = new Map<string, string>()
    return {
      setData: (k: string, v: string) => void store.set(k, v),
      getData: (k: string) => store.get(k) ?? '',
    }
  }

  it('carries the source lane alongside the standard track id', () => {
    const dt = dataTransfer()
    writeBlockDrag(dt, { trackId: 4, poolEntryId: 9, from: 7 })
    expect(dt.getData(TRACK_DRAG_MIME)).toBe('4')
    expect(readBlockDrag(dt)).toEqual({
      trackId: 4,
      poolEntryId: 9,
      from: 7,
    })
  })

  it('reads nothing from a plain track drag or a corrupt payload', () => {
    const plain = dataTransfer()
    plain.setData(TRACK_DRAG_MIME, '4')
    expect(readBlockDrag(plain)).toBeNull()

    const broken = dataTransfer()
    broken.setData(BLOCK_DRAG_MIME, '{oops')
    expect(readBlockDrag(broken)).toBeNull()
  })
})

describe('snapMinutes', () => {
  it('rounds a lane drag to the half minute', () => {
    expect(snapMinutes(6.24)).toBe(6)
    expect(snapMinutes(6.3)).toBe(6.5)
    expect(snapMinutes(6.8)).toBe(7)
  })
})

describe('entryOverride', () => {
  it('reads the values the server stored', () => {
    const e = entry(1, 0, track(1, 124, 600), {
      play_minutes: 5,
      pinned_end_minutes: 400,
      bpm_override: 126,
    })
    expect(entryOverride(e)).toEqual({
      durOv: 5,
      endPin: 400,
      bpmOv: 126,
    })
  })

  it('lets an unsaved edit win, including a cleared value', () => {
    const e = entry(1, 0, track(1, 124, 600), { play_minutes: 5 })
    expect(entryOverride(e, { durOv: null }).durOv).toBeNull()
    expect(entryOverride(e, { bpmOv: 130 })).toEqual({
      durOv: 5,
      endPin: null,
      bpmOv: 130,
    })
  })
})

describe('layoutCommitted', () => {
  const tracks = [
    entry(1, 0, track(1, 124, 600)),
    entry(2, 1, track(2, 124, 600)),
    entry(3, 2, track(3, 124, 600)),
  ]

  it('re-scales the closing run to reach the set end time', () => {
    const ov = buildOverrideMap(tracks)
    const natural = layoutCommitted(tracks, ov, START)
    const naturalEnd = natural[2].t + natural[2].dur

    // Ask for a shorter set: every block shrinks proportionally to fit.
    const target = START + (naturalEnd - START) * 0.95
    const tighter = layoutCommitted(tracks, ov, START, undefined, target)
    expect(tighter[2].t + tighter[2].dur).toBeCloseTo(target, 5)
    for (let i = 0; i < 3; i++) {
      expect(tighter[i].dur).toBeLessThan(natural[i].dur)
      expect(tighter[i].scale).toBeLessThan(1)
    }
  })

  it('reaches the end time however far it is from the natural run', () => {
    const ov = buildOverrideMap(tracks)
    const natural = layoutCommitted(tracks, ov, START)
    const naturalEnd = natural[2].t + natural[2].dur

    // Nothing is held back by a playable-pitch bound: the end time is a
    // target the run is expected to hit, not a suggestion.
    for (const fraction of [0.5, 2]) {
      const target = START + (naturalEnd - START) * fraction
      const blocks = layoutCommitted(tracks, ov, START, undefined, target)
      expect(blocks[2].t + blocks[2].dur).toBeCloseTo(target, 5)
    }
  })

  it('splits the difference in proportion to track length', () => {
    // 5 and 15 minutes long: the longer track absorbs three times as much of
    // the change as the shorter one.
    const list = [
      entry(1, 0, track(1, 124, 300)),
      entry(2, 1, track(2, 124, 900)),
    ]
    const ov = buildOverrideMap(list)
    const natural = layoutCommitted(list, ov, START)
    const naturalEnd = natural[1].t + natural[1].dur
    const extra = 4

    const blocks = layoutCommitted(list, ov, START, undefined, naturalEnd + extra)
    const gained = blocks.map((b, i) => b.dur - natural[i].dur)
    expect(gained[0] + gained[1]).toBeCloseTo(extra, 5)
    expect(gained[1] / gained[0]).toBeCloseTo(3, 5)
  })

  it('packs blocks end to end from the start time', () => {
    const blocks = layoutCommitted(tracks, buildOverrideMap(tracks), START)
    expect(blocks).toHaveLength(3)
    expect(blocks[0].t).toBe(START)
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].t).toBeCloseTo(blocks[i - 1].t + blocks[i - 1].dur, 6)
    }
  })

  it('plays the play fraction of the track length by default', () => {
    const blocks = layoutCommitted(tracks, buildOverrideMap(tracks), START)
    expect(blocks[0].dur).toBeCloseTo(PLAY_FRACTION * 10, 5)
    expect(blocks[0].scale).toBe(1)
  })

  it('sorts by position rather than array order', () => {
    const shuffled = [tracks[2], tracks[0], tracks[1]]
    const blocks = layoutCommitted(shuffled, buildOverrideMap(shuffled), START)
    expect(blocks.map((b) => b.entry.track_id)).toEqual([1, 2, 3])
  })

  it('honors a plays override', () => {
    const list = [entry(1, 0, track(1, 124, 600), { play_minutes: 4 })]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    expect(blocks[0].dur).toBeCloseTo(4, 5)
  })

  it('leaves timing alone when a BPM is set by hand', () => {
    // A hand-set BPM records where the mix goes, usually the BPM the track is
    // mixed out at. It is a note, not a tempo change, so it must not move the
    // blocks around it — play length has its own override for that.
    const plain = [entry(1, 0, track(1, 100, 600))]
    const noted = [entry(1, 0, track(1, 100, 600), { bpm_override: 105 })]
    const bare = layoutCommitted(plain, buildOverrideMap(plain), START)
    const blocks = layoutCommitted(noted, buildOverrideMap(noted), START)
    expect(blocks[0].dur).toBeCloseTo(bare[0].dur, 5)
  })

  it('scales the unpinned run before a pin in proportion', () => {
    // Three 7-minute blocks would end at 381; pin the third at 380 so the
    // proportional squeeze still lands inside every block's pitch window.
    const list = [
      entry(1, 0, track(1, 124, 600)),
      entry(2, 1, track(2, 124, 600)),
      entry(3, 2, track(3, 124, 600), { pinned_end_minutes: 380 }),
    ]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    const factor = 20 / 21
    expect(blocks[0].dur).toBeCloseTo(7 * factor, 5)
    expect(blocks[1].dur).toBeCloseTo(7 * factor, 5)
    expect(blocks[2].dur).toBeCloseTo(7 * factor, 5)
    expect(blocks[2].scale).toBeCloseTo(factor, 5)
    expect(blocks[2].pinned).toBe(true)
    expect(blocks[2].t + blocks[2].dur).toBeCloseTo(380, 5)
  })

  it('reaches a pin however tight it is', () => {
    const list = [entry(1, 0, track(1, 124, 600), { pinned_end_minutes: 362 })]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    expect(blocks[0].t + blocks[0].dur).toBeCloseTo(362, 5)
  })

  it('resumes the next run at a pin the window can reach', () => {
    // A 7-minute block reaches 367 comfortably inside its pitch window.
    const list = [
      entry(1, 0, track(1, 124, 600), { pinned_end_minutes: 367 }),
      entry(2, 1, track(2, 124, 600)),
    ]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    expect(blocks[0].t + blocks[0].dur).toBeCloseTo(367, 5)
    expect(blocks[1].t).toBeCloseTo(367, 5)
  })

  it('starts the next run exactly where a stretched pin lands', () => {
    // 400 asks 40 minutes of one 7-minute block; it stretches all the way.
    const list = [
      entry(1, 0, track(1, 124, 600), { pinned_end_minutes: 400 }),
      entry(2, 1, track(2, 124, 600)),
    ]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    expect(blocks[0].t + blocks[0].dur).toBeCloseTo(400, 5)
    expect(blocks[1].t).toBeCloseTo(400, 6)
  })

  it('packs every block end to end across several pins', () => {
    const list = [
      entry(1, 0, track(1, 124, 600), { pinned_end_minutes: 400 }),
      entry(2, 1, track(2, 124, 600)),
      entry(3, 2, track(3, 124, 600), { pinned_end_minutes: 362 }),
      entry(4, 3, track(4, 124, 600)),
    ]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    expect(blocks[0].t).toBe(START)
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].t).toBeCloseTo(blocks[i - 1].t + blocks[i - 1].dur, 6)
    }
  })
})

describe('layoutBench', () => {
  const entries = [poolEntry(10, 1), poolEntry(11, 2)]

  it('lays untouched candidates out one after another from the start time', () => {
    const blocks = layoutBench(entries, {}, {}, START)
    expect(blocks[0].t).toBe(START)
    expect(blocks[0].dur).toBeCloseTo(PLAY_FRACTION * 6, 5)
    expect(blocks[1].t).toBeCloseTo(START + blocks[0].dur, 5)
  })

  it('keeps a dragged candidate at its own free time', () => {
    const blocks = layoutBench(entries, { 'default:1': 425.5 }, {}, START)
    expect(blocks[0].t).toBe(425.5)
    expect(blocks[0].placementKey).toBe('default:1')
    expect(blocks[1].t).toBeCloseTo(425.5 + blocks[0].dur, 5)
  })

  it('uses the preview play length and flags a missing duration', () => {
    const noDuration: PoolEntry = {
      ...poolEntry(12, 3),
      track: { ...poolEntry(12, 3).track!, duration_seconds: null },
    }
    const blocks = layoutBench(
      [noDuration],
      {},
      { 'default:3': { durOv: 3 } },
      START,
    )
    expect(blocks[0].dur).toBe(3)
    expect(blocks[0].fallback).toBe(true)
  })
})

describe('blocksInMinuteRange', () => {
  // Spans of [360, 365], [365, 370] and [380, 385].
  const blocks = [
    { t: 360, dur: 5 },
    { t: 365, dur: 5 },
    { t: 380, dur: 5 },
  ]

  it('takes every block the dragged range meets', () => {
    expect(blocksInMinuteRange(blocks, 362, 366)).toEqual([
      blocks[0],
      blocks[1],
    ])
  })

  it('reads a right-to-left drag the same way', () => {
    expect(blocksInMinuteRange(blocks, 366, 362)).toEqual([
      blocks[0],
      blocks[1],
    ])
  })

  it('takes exactly one block for a drag inside one span', () => {
    expect(blocksInMinuteRange(blocks, 381, 383)).toEqual([blocks[2]])
  })

  it('takes nothing from a drag across empty lane space', () => {
    expect(blocksInMinuteRange(blocks, 372, 378)).toEqual([])
  })
})

describe('planBenchDrop', () => {
  function benchBlock(
    trackId: number,
    at: number,
    dur: number = 4,
    laneId: number = 5,
  ): BenchBlock {
    return {
      entry: poolEntry(trackId, trackId),
      placementKey: `${laneId}:${trackId}`,
      t: at,
      dur,
      fallback: false,
    }
  }

  it('keeps an exact fractional drop when no collision exists', () => {
    const first = benchBlock(1, 400, 4)
    expect(
      planBenchDrop([first], { placementKey: '5:9', dur: 3.2 }, 405.37),
    ).toEqual({
      '5:9': 405.37,
    })
  })

  it('pushes overlapping neighbors edge-to-edge', () => {
    const first = benchBlock(1, 404, 4)
    const second = benchBlock(2, 408, 4)
    expect(
      planBenchDrop([first, second], { placementKey: '5:9', dur: 4 }, 405),
    ).toEqual({
      '5:9': 405,
      '5:1': 409,
      '5:2': 413,
    })
  })

  it('keeps a tile put when the drop lands past its midpoint', () => {
    // Butting a track up against the one on its left says "play this next".
    // The left tile must stay left; it used to be shunted to the right of the
    // tile just dropped beside it, inverting the running order.
    const left = benchBlock(1, 404, 4)
    const right = benchBlock(2, 408, 4)

    expect(
      planBenchDrop([left, right], { placementKey: '5:9', dur: 4 }, 407),
    ).toEqual({
      // Snapped flush to the left tile's end rather than overlapping it.
      '5:9': 408,
      // The left tile is absent, so it never moved.
      '5:2': 412,
    })
  })

  it('snaps flush to the left neighbour without leaving a gap', () => {
    const left = benchBlock(1, 400, 4)

    // Dropped just past the midpoint and overlapping, so it closes up.
    expect(
      planBenchDrop([left], { placementKey: '5:9', dur: 3 }, 403),
    ).toEqual({ '5:9': 404 })
  })

  it('leaves a deliberate gap after the left neighbour alone', () => {
    const left = benchBlock(1, 400, 4)

    // Dropped clear of the tile, so free placement still wins.
    expect(
      planBenchDrop([left], { placementKey: '5:9', dur: 3 }, 410),
    ).toEqual({ '5:9': 410 })
  })

  it('routes shifted tiles around pinned spans', () => {
    const unpinned = benchBlock(1, 404, 4)
    const pinned = benchBlock(2, 410, 3)
    expect(
      planBenchDrop([unpinned, pinned], { placementKey: '5:9', dur: 4 }, 405, {
        '5:2': true,
      }),
    ).toEqual({
      '5:9': 405,
      '5:1': 413,
    })
  })
})

describe('arrangeLaneBlocks', () => {
  function benchBlock(
    trackId: number,
    title: string,
    bpm: number | null,
  ): BenchBlock {
    return {
      entry: {
        ...poolEntry(trackId, trackId),
        track: { ...track(trackId, bpm, 360), title },
      },
      placementKey: `5:${trackId}`,
      t: 0,
      dur: 4,
      fallback: false,
    }
  }

  it('orders BPM clusters low to high and each cluster by title', () => {
    const fast = benchBlock(3, 'Alpha', 150)
    const slowLater = benchBlock(1, 'Bravo', 100)
    const slowFirst = benchBlock(2, 'Alpha', 100)
    expect(colForBpm(100)).toBeLessThan(colForBpm(150))

    // Every tile gets a consistent gap, with an additional cohort break.
    expect(arrangeLaneBlocks([fast, slowLater, slowFirst], 400)).toEqual({
      '5:2': 400,
      '5:1': 404 + BENCH_BLOCK_GAP_MIN,
      '5:3': 408 + BENCH_BLOCK_GAP_MIN * 2 + BPM_CLUSTER_GAP_MIN,
    })
  })

  it('puts a track without a BPM last, in title order', () => {
    const withBpm = benchBlock(1, 'Zulu', 120)
    const unknownLater = benchBlock(2, 'Bravo', null)
    const unknownFirst = benchBlock(3, 'Alpha', null)

    expect(
      arrangeLaneBlocks([unknownLater, withBpm, unknownFirst], 400),
    ).toEqual({
      '5:1': 400,
      '5:3': 404 + BENCH_BLOCK_GAP_MIN + BPM_CLUSTER_GAP_MIN,
      '5:2': 408 + BENCH_BLOCK_GAP_MIN * 2 + BPM_CLUSTER_GAP_MIN,
    })
  })

  it('keeps a consistent gap between fractional block lengths', () => {
    const first = { ...benchBlock(1, 'Alpha', 120), dur: 3.7 }
    const second = { ...benchBlock(2, 'Bravo', 120), dur: 4.1 }

    expect(arrangeLaneBlocks([second, first], 400)).toEqual({
      '5:1': 400,
      '5:2': 403.7 + BENCH_BLOCK_GAP_MIN,
    })
  })

  it('keeps pinned tiles fixed and routes arranged tiles around them', () => {
    const first = benchBlock(1, 'Alpha', 120)
    const pinned = { ...benchBlock(2, 'Pinned', 120), t: 405 }
    const last = benchBlock(3, 'Zulu', 120)

    expect(
      arrangeLaneBlocks([last, pinned, first], 400, { '5:2': true }),
    ).toEqual({
      '5:1': 400,
      '5:3': 409.5,
    })
  })

  it('returns nothing for an empty lane', () => {
    expect(arrangeLaneBlocks([], 400)).toEqual({})
  })
})

describe('committedReorderMoves', () => {
  it('preserves a multi-track cut while moving it after the remaining tracks', () => {
    expect(committedReorderMoves([1, 2, 3, 4], [2, 3], 2)).toEqual([
      { trackId: 4, position: 1 },
    ])
  })

  it('preserves selected order when moving a non-contiguous selection', () => {
    expect(committedReorderMoves([1, 2, 3, 4, 5], [2, 4], 0)).toEqual([
      { trackId: 2, position: 0 },
      { trackId: 4, position: 1 },
    ])
  })
})

describe('displayBpm', () => {
  it('returns the track BPM when nothing was set', () => {
    const list = [entry(1, 0, track(1, 124, 600))]
    const ov = buildOverrideMap(list)
    expect(displayBpm(layoutCommitted(list, ov, START)[0], ov)).toBe(124)
  })

  it('holds still when a pin compresses the block', () => {
    // Scaling a run is a plan for the shape of the set, not an instruction to
    // play the track faster, so the BPM shown stays the track's own.
    const list = [
      entry(1, 0, track(1, 124, 600)),
      entry(2, 1, track(2, 124, 600), { pinned_end_minutes: 372 }),
    ]
    const ov = buildOverrideMap(list)
    const blocks = layoutCommitted(list, ov, START)
    expect(blocks[0].dur).toBeLessThan(7)
    expect(displayBpm(blocks[0], ov)).toBe(124)
  })

  it('returns the BPM the user set, when they set one', () => {
    const list = [entry(1, 0, track(1, 124, 600), { bpm_override: 130 })]
    const ov = buildOverrideMap(list)
    expect(displayBpm(layoutCommitted(list, ov, START)[0], ov)).toBe(130)
  })

  it('returns null for a track without a BPM', () => {
    const list = [entry(1, 0, track(1, null, 600))]
    const ov = buildOverrideMap(list)
    expect(displayBpm(layoutCommitted(list, ov, START)[0], ov)).toBeNull()
  })
})

describe('deriveLanes', () => {
  const pool = [poolEntry(10, 1), poolEntry(11, 2)]

  it('renders no alternative lane when no subgroup exists', () => {
    const lanes = deriveLanes(pool, [], [])
    expect(lanes).toEqual([])
  })

  it('renders one lane per subgroup', () => {
    const subgroups: PoolSubgroup[] = [
      { id: 5, set_id: 1, name: 'Peak', display_order: 1 },
      { id: 4, set_id: 1, name: 'Openers', display_order: 0 },
    ]
    const memberships: PoolSubgroupMembership[] = [
      { id: 1, subgroup_id: 4, pool_entry_id: 10, display_order: 0 },
    ]
    const lanes = deriveLanes(pool, subgroups, memberships)
    expect(lanes.map((l) => l.name)).toEqual(['Openers', 'Peak'])
    expect(lanes.every((l) => l.group !== null)).toBe(true)
    expect(lanes[0].entries.map((e) => e.id)).toEqual([10])
    expect(lanes[1].entries).toEqual([])
  })

  it('shows a single subgroup as exactly one lane', () => {
    const lanes = deriveLanes(
      pool,
      [{ id: 4, set_id: 1, name: 'Openers', display_order: 0 }],
      [{ id: 1, subgroup_id: 4, pool_entry_id: 10, display_order: 0 }],
    )
    expect(lanes).toHaveLength(1)
    expect(lanes[0].name).toBe('Openers')
  })
})

describe('useSequencer', () => {
  const tracklist = [entry(1, 0, track(1, 124, 600))]

  beforeEach(() => {
    vi.spyOn(http, 'tracklistSetOverrides').mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mount(onSaved?: () => void) {
    return renderHook(() =>
      useSequencer({
        setId: 1,
        tracklist,
        pool: [poolEntry(10, 2)],
        subgroups: [],
        memberships: [],
        startMin: START,
        onSaved,
      }),
    )
  }

  it('lays out the committed lane without inventing an alternative lane', () => {
    const { result } = mount()
    expect(result.current.blocks).toHaveLength(1)
    expect(result.current.lanes).toHaveLength(0)
    expect(result.current.endMinutes).toBeCloseTo(START + 7, 5)
  })

  it('saves an override through the overrides endpoint', async () => {
    const onSaved = vi.fn()
    const { result } = mount(onSaved)
    act(() => {
      result.current.patchOverride(1, { durOv: 4 })
    })
    expect(result.current.blocks[0].dur).toBeCloseTo(4, 5)
    await vi.waitFor(() =>
      expect(http.tracklistSetOverrides).toHaveBeenCalledWith(1, 1, {
        play_minutes: 4,
        pinned_end_minutes: null,
        bpm_override: null,
      }),
    )
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('clears all three overrides on reset', async () => {
    const { result } = mount()
    act(() => {
      result.current.patchOverride(1, { durOv: 4, bpmOv: 126 })
    })
    act(() => {
      result.current.resetOverrides(1)
    })
    await vi.waitFor(() =>
      expect(http.tracklistSetOverrides).toHaveBeenLastCalledWith(1, 1, {
        play_minutes: null,
        pinned_end_minutes: null,
        bpm_override: null,
      }),
    )
    expect(result.current.blocks[0].dur).toBeCloseTo(7, 5)
  })

  it('reports benched free times and preview lengths for the caller to persist', () => {
    // Bench positions live on the set, so the hook is controlled: it reads the
    // stored values and reports edits rather than holding them itself.
    const onBenchChange = vi.fn()
    const { result, rerender } = renderHook(
      (props: {
        benchTimes?: Record<string, number>
        benchOverrides?: Record<string, { durOv?: number | null }>
      }) =>
        useSequencer({
          setId: 1,
          tracklist,
          pool: [poolEntry(10, 2)],
          subgroups: [
            { id: 7, set_id: 1, name: 'Alt 1', display_order: 0 },
          ],
          memberships: [
            { id: 1, subgroup_id: 7, pool_entry_id: 10, display_order: 0 },
          ],
          startMin: START,
          benchTimes: props.benchTimes,
          benchOverrides: props.benchOverrides,
          onBenchChange,
        }),
      { initialProps: {} },
    )

    expect(result.current.benchLanes[0].blocks[0].t).toBe(START)

    act(() => {
      result.current.setBenchTime(7, 2, 420.3)
    })
    // A lane drag lands on the half-minute grid, reported not stored.
    expect(onBenchChange).toHaveBeenCalledWith(
      expect.objectContaining({ times: { '7:2': 420.5 } }),
    )

    // Fed back in, it lays the block out at that time.
    rerender({ benchTimes: { '7:2': 420.5 } })
    expect(result.current.benchLanes[0].blocks[0].t).toBe(420.5)

    act(() => {
      result.current.patchBenchOverride(7, 2, { durOv: 3 })
    })
    expect(onBenchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        overrides: { '7:2': { durOv: 3 } },
      }),
    )
    expect(http.tracklistSetOverrides).not.toHaveBeenCalled()

    rerender({
      benchTimes: { '7:2': 420.5 },
      benchOverrides: { '7:2': { durOv: 3 } },
    })
    expect(result.current.benchLanes[0].blocks[0].dur).toBe(3)

    rerender({ benchTimes: { '7:2': 420.5 }, benchOverrides: {} })
    expect(result.current.benchLanes[0].blocks[0].dur).toBeCloseTo(4.2, 5)
  })

  it('writes pasted lane times and preview lengths in one bench update', () => {
    // Two separate writes in one tick would both read the stored bench state,
    // so the second one would drop the first.
    const onBenchChange = vi.fn()
    const { result } = renderHook(() =>
      useSequencer({
        setId: 1,
        tracklist,
        pool: [poolEntry(10, 2), poolEntry(11, 3)],
        subgroups: [],
        memberships: [],
        startMin: START,
        benchTimes: { 'default:2': 400 },
        benchOverrides: {},
        onBenchChange,
      }),
    )

    act(() => {
      result.current.applyBenchPlacements([
        {
          placementKey: benchPlacementKey('default', 2),
          minutes: 420.3,
          override: { durOv: 3 },
        },
        {
          placementKey: benchPlacementKey('default', 3),
          minutes: 425,
          override: null,
        },
      ])
    })

    expect(onBenchChange).toHaveBeenCalledTimes(1)
    expect(onBenchChange).toHaveBeenCalledWith({
      times: { 'default:2': 420.5, 'default:3': 425 },
      overrides: { 'default:2': { durOv: 3 } },
    })
  })

  it('keeps duplicate tracks in separate lanes completely independent', () => {
    const onBenchChange = vi.fn()
    const sharedPoolEntry = poolEntry(10, 2)
    const { result } = renderHook(() =>
      useSequencer({
        setId: 1,
        tracklist,
        pool: [sharedPoolEntry],
        subgroups: [
          { id: 11, set_id: 1, name: 'Warm', display_order: 0 },
          { id: 12, set_id: 1, name: 'Peak', display_order: 1 },
        ],
        memberships: [
          { id: 1, subgroup_id: 11, pool_entry_id: 10, display_order: 0 },
          { id: 2, subgroup_id: 12, pool_entry_id: 10, display_order: 0 },
        ],
        startMin: START,
        benchTimes: { '11:2': 400, '12:2': 430 },
        benchOverrides: {
          '11:2': { durOv: 3 },
          '12:2': { durOv: 6 },
        },
        onBenchChange,
      }),
    )

    expect(result.current.benchLanes[0].blocks[0]).toMatchObject({
      placementKey: '11:2',
      t: 400,
      dur: 3,
    })
    expect(result.current.benchLanes[1].blocks[0]).toMatchObject({
      placementKey: '12:2',
      t: 430,
      dur: 6,
    })

    act(() => {
      result.current.setBenchTime(11, 2, 410)
    })

    expect(onBenchChange).toHaveBeenCalledWith({
      times: { '11:2': 410, '12:2': 430 },
      overrides: {
        '11:2': { durOv: 3 },
        '12:2': { durOv: 6 },
      },
    })
  })

  it('surfaces a failed save without dropping the local edit', async () => {
    vi.mocked(http.tracklistSetOverrides).mockRejectedValue(
      new Error('overrides failed'),
    )
    const { result } = mount()
    act(() => {
      result.current.patchOverride(1, { durOv: 4 })
    })
    await vi.waitFor(() =>
      expect(result.current.saveError).toBe('overrides failed'),
    )
    expect(result.current.blocks[0].dur).toBeCloseTo(4, 5)
  })
})
