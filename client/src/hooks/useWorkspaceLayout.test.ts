import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import * as http from '../api/http'
import {
  DEFAULT_PRESET,
  MIN_H,
  PRESET_NAMES,
  MIN_W,
  WIDGET_IDS,
  firstFree,
  moveRect,
  normalizeLayout,
  overlaps,
  presetPlace,
  resizeRect,
  useWorkspaceLayout,
} from './useWorkspaceLayout'
import type { Bounds, LayoutPlace } from './useWorkspaceLayout'

const B: Bounds = { cols: 150, rows: 100 }

async function mounted() {
  const view = renderHook(() => useWorkspaceLayout())
  await vi.waitFor(() => expect(view.result.current.hydrated).toBe(true))
  return view
}

describe('useWorkspaceLayout', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(http, 'fetchWorkspaceLayout').mockResolvedValue(null)
    vi.spyOn(http, 'saveWorkspaceLayout').mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts on the default preset', async () => {
    const { result } = await mounted()
    expect(result.current.preset).toBe(DEFAULT_PRESET)
    expect(result.current.place).toEqual(
      presetPlace(DEFAULT_PRESET, result.current.bounds),
    )
    expect(result.current.shell).toBe('workspace')
    expect(result.current.missing).toEqual([])
  })

  it('hydrates the saved layout from the server', async () => {
    vi.mocked(http.fetchWorkspaceLayout).mockResolvedValue({
      preset: 'Pool curation',
      place: presetPlace('Pool curation', B),
      custom: {},
      shell: 'legacy',
    })
    const { result } = await mounted()
    expect(result.current.preset).toBe('Pool curation')
    expect(result.current.place).toEqual(presetPlace('Pool curation', B))
    expect(result.current.shell).toBe('workspace')
  })

  it('saves through the table-preference surface after a change', async () => {
    vi.useFakeTimers()
    try {
      const { result } = await mounted()
      act(() => {
        result.current.selectPreset('Pool curation')
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      await vi.waitFor(() =>
        expect(http.saveWorkspaceLayout).toHaveBeenCalledWith(
          expect.objectContaining({ preset: 'Pool curation' }),
        ),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('restores a saved preset with its locks', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.saveCustomPreset('Locked mix')
    })
    act(() => {
      result.current.toggleLock('pool')
    })
    // A lock belongs to the layout it was set in, so leaving for another one
    // drops it and coming back brings it with you.
    const untouched = PRESET_NAMES.find((name) => name !== DEFAULT_PRESET)!
    act(() => {
      result.current.selectPreset(untouched)
    })
    expect(result.current.locked).toEqual({})

    act(() => {
      result.current.selectPreset('Locked mix')
    })
    expect(result.current.locked).toEqual({ pool: true })
  })

  it('saves an edit into the layout being edited, not a placeholder', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.saveCustomPreset('Working set')
    })
    act(() => {
      result.current.removeWidget('pool')
    })

    // Editing a layout changes that layout. Dropping to an unnamed "Custom"
    // would quietly discard which layout the work belonged to.
    expect(result.current.preset).toBe('Working set')
    expect(result.current.presets['Working set']).toEqual(result.current.place)
    expect(result.current.presets['Working set'].pool).toBeUndefined()

    // It survives a round trip through another layout.
    act(() => {
      result.current.selectPreset(DEFAULT_PRESET)
    })
    act(() => {
      result.current.selectPreset('Working set')
    })
    expect(result.current.place.pool).toBeUndefined()
  })

  it('stores an edited built-in and gives it back on restore', async () => {
    const { result } = await mounted()
    const original = result.current.presets[DEFAULT_PRESET]

    act(() => {
      result.current.removeWidget('pool')
    })
    expect(result.current.preset).toBe(DEFAULT_PRESET)
    expect(result.current.presets[DEFAULT_PRESET].pool).toBeUndefined()

    // A built-in is generated from code, so the edit is an override that
    // restoring can lift.
    act(() => {
      result.current.restoreBuiltInPresets()
    })
    expect(result.current.presets[DEFAULT_PRESET]).toEqual(original)
  })

  it('keeps an edited built-in through a canvas resize', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.removeWidget('pool')
    })

    // The built-in's fractions would regenerate the pool right back; the
    // stored edit has to win, or every window resize undoes the user's work.
    act(() => {
      result.current.setBounds({ cols: 120, rows: 90 })
    })
    expect(result.current.preset).toBe(DEFAULT_PRESET)
    expect(result.current.place.pool).toBeUndefined()
  })

  it('branches a new layout off an existing one instead of the screen', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.saveCustomPreset('Source')
    })
    const source = result.current.presets['Source']
    act(() => {
      result.current.removeWidget('pool')
    })

    act(() => {
      result.current.saveCustomPreset('Branch', DEFAULT_PRESET)
    })

    // Copied from the named layout, not from the arrangement on screen.
    expect(result.current.presets['Branch']).toEqual(
      result.current.presets[DEFAULT_PRESET],
    )
    expect(result.current.presets['Branch'].pool).toBeDefined()
    // 'Source' kept the edit that was made while it was active, and did not
    // pick up anything from the branch taken off a different layout.
    expect(source.pool).toBeDefined()
    expect(result.current.presets['Source'].pool).toBeUndefined()
  })

  it('creates a named layout from any current preset', async () => {
    const { result } = await mounted()

    act(() => {
      result.current.saveCustomPreset('Festival view')
    })

    expect(result.current.preset).toBe('Festival view')
    expect(result.current.presets['Festival view']).toEqual(result.current.place)
  })

  it('renames custom layouts and snapshots built-ins under a new name', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.saveCustomPreset('First name')
    })
    act(() => {
      result.current.renamePreset('Second name')
    })
    expect(result.current.preset).toBe('Second name')
    expect(result.current.presets['First name']).toBeUndefined()

    // A built-in has no stored entry, so renaming snapshots its rectangles
    // under the new name. The old name goes away like any other rename —
    // leaving it behind would make this a copy, not a rename.
    act(() => {
      result.current.selectPreset(DEFAULT_PRESET)
    })
    const built = result.current.presets[DEFAULT_PRESET]
    act(() => {
      result.current.renamePreset('My explorer')
    })
    expect(result.current.preset).toBe('My explorer')
    expect(result.current.presets['My explorer']).toEqual(built)
    expect(result.current.presets[DEFAULT_PRESET]).toBeUndefined()
    expect(result.current.hiddenPresets).toContain(DEFAULT_PRESET)
  })

  it('renames a built-in that is not the one on screen', async () => {
    const { result } = await mounted()
    const other = PRESET_NAMES.find((name) => name !== result.current.preset)!
    const rects = result.current.presets[other]

    act(() => {
      result.current.renamePreset('Renamed in place', other)
    })

    // Its rectangles come from the built-in itself, not from whatever happens
    // to be on screen, so renaming one you are not using cannot capture the
    // wrong arrangement.
    expect(result.current.presets['Renamed in place']).toEqual(rects)
    expect(result.current.presets[other]).toBeUndefined()
    expect(result.current.preset).not.toBe('Renamed in place')
  })

  it('hides a deleted built-in until the set is restored', async () => {
    const { result } = await mounted()
    const target = PRESET_NAMES[0]

    act(() => {
      result.current.deletePreset(target)
    })
    expect(result.current.presets[target]).toBeUndefined()

    act(() => {
      result.current.restoreBuiltInPresets()
    })
    expect(result.current.presets[target]).toBeDefined()
    expect(result.current.hiddenPresets).toEqual([])
  })

  it('rejects empty, reserved, built-in and duplicate layout names', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.saveCustomPreset('Existing')
      result.current.saveCustomPreset('Another')
    })
    const before = result.current.presets

    act(() => {
      for (const name of ['', 'Custom', DEFAULT_PRESET, 'existing']) {
        result.current.saveCustomPreset(name)
        result.current.renamePreset(name)
      }
    })

    expect(result.current.preset).toBe('Another')
    expect(result.current.presets).toEqual(before)
  })

  it('takes a widget off the canvas and puts it back in free space', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.removeWidget('matches')
    })
    expect(result.current.missing).toEqual(['matches'])

    act(() => {
      result.current.addWidget('matches')
    })
    expect(result.current.missing).toEqual([])
    const back = result.current.place.matches!
    for (const id of WIDGET_IDS) {
      if (id === 'matches') {
        continue
      }
      expect(overlaps(back, result.current.place[id]!)).toBe(false)
    }
  })

  it('leaves a locked rectangle alone on a resize', async () => {
    const { result } = await mounted()
    const before = result.current.place.browser!
    act(() => {
      result.current.toggleLock('browser')
    })
    act(() => {
      result.current.resizeWidget('browser', 'w', before, -2, 0)
    })
    expect(result.current.place.browser).toEqual(before)
  })
})

describe('normalizeLayout', () => {
  it('re-seats a saved rectangle that overlaps one already placed', () => {
    const layout = normalizeLayout({
      preset: 'Custom',
      place: {
        browser: { x: 0, y: 0, w: 40, h: 40 },
        matches: { x: 0, y: 0, w: 40, h: 40 },
      },
      custom: {},
      shell: 'workspace',
    })
    expect(layout.place.browser).toEqual({ x: 0, y: 0, w: 40, h: 40 })
    expect(overlaps(layout.place.browser!, layout.place.matches!)).toBe(false)
  })

  it('clamps a rectangle that runs off the canvas', () => {
    const layout = normalizeLayout({
      preset: 'Custom',
      place: { pool: { x: 900, y: 900, w: 9000, h: 9000 } },
      custom: {},
      shell: 'workspace',
    })
    const pool = layout.place.pool!
    expect(pool.x + pool.w).toBeLessThanOrEqual(158)
    expect(pool.y + pool.h).toBeLessThanOrEqual(117)
  })

  it('drops an unknown widget and keeps the rest', () => {
    const layout = normalizeLayout({
      preset: 'Custom',
      place: {
        pool: { x: 0, y: 0, w: 40, h: 40 },
        ghost: { x: 40, y: 0, w: 40, h: 40 },
      },
      custom: {},
      shell: 'legacy',
    })
    expect(Object.keys(layout.place)).toEqual(['pool'])
    expect(layout.shell).toBe('workspace')
  })
})

describe('rectangle geometry', () => {
  const place: LayoutPlace = {
    explorer: { x: 0, y: 0, w: 100, h: 50 },
    browser: { x: 100, y: 0, w: 50, h: 50 },
  }

  it('stops a growing edge against the neighbour', () => {
    const start = place.explorer!
    expect(resizeRect(place, 'explorer', 'e', start, 20, 0, B)).toEqual(start)
  })

  it('grows an edge into space that is free', () => {
    const start = place.explorer!
    expect(resizeRect(place, 'explorer', 's', start, 0, 20, B)).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 70,
    })
  })

  it('never shrinks a widget below the minimum', () => {
    const start = place.browser!
    const out = resizeRect(place, 'browser', 'w', start, 400, 0, B)
    expect(out.w).toBeGreaterThanOrEqual(MIN_W)
    expect(out.h).toBeGreaterThanOrEqual(MIN_H)
  })

  it('refuses a move onto an occupied rectangle', () => {
    const start = place.browser!
    expect(moveRect(place, 'browser', start, 0, 0, B)).toEqual(start)
  })

  it('allows a move into free space', () => {
    const start = place.browser!
    expect(moveRect(place, 'browser', start, 100, 50, B)).toEqual({
      x: 100,
      y: 50,
      w: 50,
      h: 50,
    })
  })

  it('finds the first free spot scanning from the top left', () => {
    // Directly under Explorer, whose bottom edge is the first free row.
    expect(firstFree(place, 50, 50, B)).toEqual({ x: 0, y: 50, w: 50, h: 50 })
  })

  it('reports no spot when the canvas is full', () => {
    const full: LayoutPlace = {
      pool: { x: 0, y: 0, w: B.cols, h: B.rows },
    }
    expect(firstFree(full, MIN_W, MIN_H, B)).toBeNull()
  })
})
