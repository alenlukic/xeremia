import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import * as http from '../api/http'
import {
  DEFAULT_PRESET,
  LAYOUT_PRESETS,
  MIN_COL_FR,
  MIN_ROW_FR,
  WIDGET_IDS,
  normalizeLayout,
  useWorkspaceLayout,
  withPlacement,
} from './useWorkspaceLayout'
import type { LayoutPlace } from './useWorkspaceLayout'

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

  it('starts on the default preset with even allocations', async () => {
    const { result } = await mounted()
    expect(result.current.preset).toBe(DEFAULT_PRESET)
    expect(result.current.place).toEqual(LAYOUT_PRESETS[DEFAULT_PRESET])
    expect(result.current.cols).toEqual([1, 1, 1])
    expect(result.current.rows).toEqual([1, 1])
    expect(result.current.shell).toBe('workspace')
  })

  it('hydrates the saved layout from the server', async () => {
    vi.mocked(http.fetchWorkspaceLayout).mockResolvedValue({
      preset: 'Pool curation',
      place: LAYOUT_PRESETS['Pool curation'],
      cols: [1.4, 0.8, 0.8],
      rows: [1.2, 0.8],
      custom: {},
      shell: 'legacy',
    })
    const { result } = await mounted()
    expect(result.current.preset).toBe('Pool curation')
    expect(result.current.cols).toEqual([1.4, 0.8, 0.8])
    expect(result.current.shell).toBe('legacy')
  })

  it('saves through the table-preference surface after a change', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.selectPreset('Pool curation')
    })
    await vi.waitFor(() =>
      expect(http.saveWorkspaceLayout).toHaveBeenCalledWith(
        expect.objectContaining({ preset: 'Pool curation' }),
      ),
    )
  })

  it('treats localStorage as a fast-start cache only', async () => {
    const { result, unmount } = await mounted()
    act(() => {
      result.current.setShell('legacy')
    })
    await vi.waitFor(() =>
      expect(localStorage.getItem('xeremia:workspace-layout:v1')).toContain(
        'legacy',
      ),
    )
    unmount()

    // The server answer wins over the cache on the next mount.
    vi.mocked(http.fetchWorkspaceLayout).mockResolvedValue({
      preset: DEFAULT_PRESET,
      place: LAYOUT_PRESETS[DEFAULT_PRESET],
      cols: [1, 1, 1],
      rows: [1, 1],
      custom: {},
      shell: 'workspace',
    })
    const second = await mounted()
    expect(second.result.current.shell).toBe('workspace')
  })

  it('does not write back the layout it just hydrated', async () => {
    vi.mocked(http.fetchWorkspaceLayout).mockResolvedValue({
      preset: 'Track DND fanout',
      place: LAYOUT_PRESETS['Track DND fanout'],
      cols: [1, 1, 1],
      rows: [1, 1],
      custom: {},
      shell: 'workspace',
    })
    const { result } = await mounted()
    expect(result.current.preset).toBe('Track DND fanout')
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(http.saveWorkspaceLayout).not.toHaveBeenCalled()
  })

  it('marks the layout Custom after an edit and can save it as a preset', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.swapWidgets('explorer', 'sequencer')
    })
    expect(result.current.preset).toBe('Custom')
    expect(result.current.place.explorer).toEqual(
      LAYOUT_PRESETS[DEFAULT_PRESET].sequencer,
    )

    act(() => {
      result.current.saveCustomPreset()
    })
    expect(result.current.preset).toBe('Custom 1')
    expect(result.current.presets['Custom 1']).toEqual(result.current.place)

    // Switching away and back restores the saved placement.
    const saved = result.current.place
    act(() => {
      result.current.selectPreset(DEFAULT_PRESET)
    })
    act(() => {
      result.current.selectPreset('Custom 1')
    })
    expect(result.current.place).toEqual(saved)
  })

  it('marks the layout Custom after a divider drag', async () => {
    const { result } = await mounted()
    expect(result.current.preset).toBe(DEFAULT_PRESET)

    act(() => {
      result.current.resize('col', 1, [1, 1, 1], 0.4)
    })

    expect(result.current.preset).toBe('Custom')
  })

  it('restores the allocations a saved preset captured', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.resize('col', 1, [1, 1, 1], 0.4)
    })
    act(() => {
      result.current.resize('row', 1, [1, 1], 0.2)
    })
    const cols = result.current.cols
    const rows = result.current.rows

    act(() => {
      result.current.saveCustomPreset()
    })
    act(() => {
      result.current.selectPreset(DEFAULT_PRESET)
    })
    expect(result.current.cols).toEqual([1, 1, 1])

    act(() => {
      result.current.selectPreset('Custom 1')
    })
    expect(result.current.cols).toEqual(cols)
    expect(result.current.rows).toEqual(rows)
  })

  it('resets allocations when a preset is chosen', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.resize('col', 1, [1, 1, 1], 0.4)
    })
    expect(result.current.cols).toEqual([1.4, 0.6, 1])
    act(() => {
      result.current.selectPreset('Pool curation')
    })
    expect(result.current.cols).toEqual([1, 1, 1])
    expect(result.current.rows).toEqual([1, 1])
  })

  it('stops a divider drag at the axis minimum', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.resize('col', 1, [1, 1, 1], 5)
    })
    expect(result.current.cols[1]).toBeCloseTo(MIN_COL_FR, 5)
    expect(result.current.cols[0]).toBeCloseTo(2 - MIN_COL_FR, 5)

    act(() => {
      result.current.resize('row', 1, [1, 1], -5)
    })
    expect(result.current.rows[0]).toBeCloseTo(MIN_ROW_FR, 5)
  })

  it('starts with every widget on the grid', async () => {
    const { result } = await mounted()
    expect(result.current.missing).toEqual([])
    expect(Object.keys(result.current.place).sort()).toEqual([
      'browser',
      'explorer',
      'matches',
      'pool',
      'sequencer',
    ])
  })

  it('tracks widgets that left the grid and puts them back', async () => {
    const { result } = await mounted()

    act(() => {
      result.current.removeWidget('matches')
    })
    expect(result.current.missing).toContain('matches')
    expect(result.current.place.matches).toBeUndefined()

    act(() => {
      result.current.addWidget('matches', { r: 1, c: 2 })
    })
    expect(result.current.place.matches).toEqual({ r: 1, c: 2, span: 1 })
    expect(result.current.missing).not.toContain('matches')
  })

  it('keeps a span-2 widget inside the three columns', async () => {
    const { result } = await mounted()
    act(() => {
      result.current.setSpan('matches', 2)
    })
    expect(result.current.place.matches).toEqual({ r: 1, c: 1, span: 2 })
  })
})

describe('withPlacement', () => {
  const full: LayoutPlace = {
    explorer: { r: 0, c: 0, span: 2 },
    browser: { r: 0, c: 2, span: 1 },
    sequencer: { r: 1, c: 0, span: 1 },
    pool: { r: 1, c: 1, span: 1 },
    matches: { r: 1, c: 2, span: 1 },
  }

  function cells(place: LayoutPlace): string[] {
    const out: string[] = []
    for (const p of Object.values(place)) {
      for (let i = 0; i < p.span; i++) {
        out.push(`${p.r}:${p.c + i}`)
      }
    }
    return out
  }

  it('shrinks a span-2 neighbour rather than overlapping it', () => {
    const next = withPlacement(full, 'browser', { r: 0, c: 1, span: 2 })
    expect(next.browser).toEqual({ r: 0, c: 1, span: 2 })
    expect(next.explorer).toEqual({ r: 0, c: 0, span: 1 })
    expect(new Set(cells(next)).size).toBe(cells(next).length)
  })

  it('re-seats a displaced widget in the first free cell', () => {
    const gapped: LayoutPlace = { ...full }
    delete gapped.matches
    const next = withPlacement(gapped, 'sequencer', { r: 0, c: 2, span: 1 })
    expect(next.sequencer).toEqual({ r: 0, c: 2, span: 1 })
    expect(next.browser).toEqual({ r: 1, c: 0, span: 1 })
    expect(new Set(cells(next)).size).toBe(cells(next).length)
  })

  it('never produces an overlap for any single-cell move', () => {
    for (const id of WIDGET_IDS) {
      for (let r = 0 as 0 | 1; r <= 1; r++) {
        for (let c = 0 as 0 | 1 | 2; c <= 2; c++) {
          for (const span of [1, 2] as const) {
            if (c + span > 3) {
              continue
            }
            const next = withPlacement(full, id, { r, c, span })
            const placed = cells(next)
            expect(new Set(placed).size).toBe(placed.length)
            expect(placed.length).toBeLessThanOrEqual(6)
          }
        }
      }
    }
  })
})

describe('normalizeLayout', () => {
  it('falls back to defaults for a malformed row', () => {
    const layout = normalizeLayout({ preset: 7, place: { pool: 'nope' } })
    expect(layout.place).toEqual(LAYOUT_PRESETS[DEFAULT_PRESET])
    expect(layout.preset).toBe(DEFAULT_PRESET)
    expect(layout.shell).toBe('workspace')
  })

  it('drops unknown widgets and clamps allocations', () => {
    const layout = normalizeLayout({
      preset: 'Custom',
      place: { pool: { r: 0, c: 0, span: 1 }, ghost: { r: 0, c: 1, span: 1 } },
      cols: [0.05, 1, 1],
      rows: [1, 1],
      custom: {},
      shell: 'legacy',
    })
    expect(Object.keys(layout.place)).toEqual(['pool'])
    expect(layout.cols[0]).toBeCloseTo(MIN_COL_FR, 5)
    expect(layout.shell).toBe('legacy')
  })

  it('reads a saved preset with its allocations', () => {
    const layout = normalizeLayout({
      preset: 'Custom 1',
      place: LAYOUT_PRESETS[DEFAULT_PRESET],
      cols: [1, 1, 1],
      rows: [1, 1],
      custom: {
        'Custom 1': {
          place: LAYOUT_PRESETS['Pool curation'],
          cols: [1.4, 0.8, 0.8],
          rows: [1.2, 0.8],
        },
      },
      shell: 'workspace',
    })
    expect(layout.custom['Custom 1'].cols).toEqual([1.4, 0.8, 0.8])
    expect(layout.custom['Custom 1'].rows).toEqual([1.2, 0.8])
  })

  it('upgrades a saved preset written before allocations existed', () => {
    const layout = normalizeLayout({
      preset: 'Custom 1',
      place: LAYOUT_PRESETS[DEFAULT_PRESET],
      custom: { 'Custom 1': LAYOUT_PRESETS['Pool curation'] },
    })
    expect(layout.custom['Custom 1'].place).toEqual(
      LAYOUT_PRESETS['Pool curation'],
    )
    expect(layout.custom['Custom 1'].cols).toEqual([1, 1, 1])
  })
})
