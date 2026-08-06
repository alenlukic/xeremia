import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import * as http from '../api/http'
import {
  BLOCK_DRAG_MIME,
  DEFAULT_LANE_NAME,
  FALLBACK_LEN_MIN,
  PLAY_FRACTION,
  buildOverrideMap,
  deriveLanes,
  effectivePlayedBpm,
  entryOverride,
  hasMeasuredDuration,
  layoutBench,
  layoutCommitted,
  readBlockDrag,
  snapMinutes,
  trackLengthMinutes,
  useSequencer,
  writeBlockDrag,
} from './useSequencer'
import { TRACK_DRAG_MIME } from '../utils'
import { DUR_MAX, DUR_MIN } from '../utils/harmonic'
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

  it('shortens a block when the played BPM is raised', () => {
    const list = [entry(1, 0, track(1, 100, 600), { bpm_override: 105 })]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    expect(blocks[0].dur).toBeCloseTo(7 * (100 / 105), 5)
  })

  it('clamps a played BPM to the pitch window', () => {
    const wild = [entry(1, 0, track(1, 100, 600), { bpm_override: 500 })]
    const blocks = layoutCommitted(wild, buildOverrideMap(wild), START)
    expect(blocks[0].dur).toBeCloseTo(7 / DUR_MAX, 5)
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

  it('lets the pitch window beat a pin it cannot reach', () => {
    // A 2-minute window for one 7-minute block is far below the lower bound.
    const list = [entry(1, 0, track(1, 124, 600), { pinned_end_minutes: 362 })]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    expect(blocks[0].dur).toBeCloseTo(7 * DUR_MIN, 5)
    expect(blocks[0].t + blocks[0].dur).toBeGreaterThan(362)
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

  it('leaves no gap when the clamp keeps a run short of its pin', () => {
    // 400 needs 40 minutes from one 7-minute block, far past the upper bound.
    const list = [
      entry(1, 0, track(1, 124, 600), { pinned_end_minutes: 400 }),
      entry(2, 1, track(2, 124, 600)),
    ]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    const clampedEnd = blocks[0].t + blocks[0].dur
    expect(blocks[0].dur).toBeCloseTo(7 * DUR_MAX, 5)
    expect(clampedEnd).toBeLessThan(400)
    expect(blocks[1].t).toBeCloseTo(clampedEnd, 6)
  })

  it('leaves no overlap when the clamp overshoots its pin', () => {
    // 362 needs 2 minutes from one 7-minute block, far below the lower bound.
    const list = [
      entry(1, 0, track(1, 124, 600), { pinned_end_minutes: 362 }),
      entry(2, 1, track(2, 124, 600)),
    ]
    const blocks = layoutCommitted(list, buildOverrideMap(list), START)
    const clampedEnd = blocks[0].t + blocks[0].dur
    expect(blocks[0].dur).toBeCloseTo(7 * DUR_MIN, 5)
    expect(clampedEnd).toBeGreaterThan(362)
    expect(blocks[1].t).toBeCloseTo(clampedEnd, 6)
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
    const blocks = layoutBench(entries, { 1: 425.5 }, {}, START)
    expect(blocks[0].t).toBe(425.5)
    expect(blocks[1].t).toBeCloseTo(425.5 + blocks[0].dur, 5)
  })

  it('uses the preview play length and flags a missing duration', () => {
    const noDuration: PoolEntry = {
      ...poolEntry(12, 3),
      track: { ...poolEntry(12, 3).track!, duration_seconds: null },
    }
    const blocks = layoutBench([noDuration], {}, { 3: { durOv: 3 } }, START)
    expect(blocks[0].dur).toBe(3)
    expect(blocks[0].fallback).toBe(true)
  })
})

describe('effectivePlayedBpm', () => {
  it('returns the original BPM when nothing was overridden', () => {
    const list = [entry(1, 0, track(1, 124, 600))]
    const ov = buildOverrideMap(list)
    const block = layoutCommitted(list, ov, START)[0]
    expect(effectivePlayedBpm(block, ov)).toBeCloseTo(124, 5)
  })

  it('rises when a pin compresses the block', () => {
    const list = [
      entry(1, 0, track(1, 124, 600)),
      entry(2, 1, track(2, 124, 600), { pinned_end_minutes: 372 }),
    ]
    const ov = buildOverrideMap(list)
    const blocks = layoutCommitted(list, ov, START)
    expect(effectivePlayedBpm(blocks[0], ov)!).toBeGreaterThan(124)
  })

  it('returns null for a track without a BPM', () => {
    const list = [entry(1, 0, track(1, null, 600))]
    const ov = buildOverrideMap(list)
    expect(
      effectivePlayedBpm(layoutCommitted(list, ov, START)[0], ov),
    ).toBeNull()
  })
})

describe('deriveLanes', () => {
  const pool = [poolEntry(10, 1), poolEntry(11, 2)]

  it('renders exactly one alternative lane when no subgroup exists', () => {
    const lanes = deriveLanes(pool, [], [])
    expect(lanes).toHaveLength(1)
    expect(lanes[0].group).toBeNull()
    expect(lanes[0].name).toBe(DEFAULT_LANE_NAME)
    expect(lanes[0].entries).toHaveLength(2)
  })

  it('replaces the default lane with one lane per subgroup', () => {
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

  it('lays out the committed lane and derives the default lane', () => {
    const { result } = mount()
    expect(result.current.blocks).toHaveLength(1)
    expect(result.current.lanes).toHaveLength(1)
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

  it('keeps benched free times and preview lengths as view state', () => {
    const { result } = mount()
    expect(result.current.benchLanes).toHaveLength(1)
    expect(result.current.benchLanes[0].blocks[0].t).toBe(START)

    act(() => {
      result.current.setBenchTime(2, 420.3)
    })
    // A lane drag lands on the half-minute grid.
    expect(result.current.benchLanes[0].blocks[0].t).toBe(420.5)

    act(() => {
      result.current.patchBenchOverride(2, { durOv: 3 })
    })
    expect(result.current.benchLanes[0].blocks[0].dur).toBe(3)
    expect(http.tracklistSetOverrides).not.toHaveBeenCalled()

    act(() => {
      result.current.resetBenchOverride(2)
    })
    expect(result.current.benchLanes[0].blocks[0].dur).toBeCloseTo(4.2, 5)
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
