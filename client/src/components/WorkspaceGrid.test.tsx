import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { WorkspaceGrid } from './WorkspaceGrid'
import type { WorkspacePanel } from './WorkspaceGrid'
import {
  PRESET_NAMES,
  UNIT_PX,
  overlaps,
  presetPlace,
  useWorkspaceLayout,
  type WidgetId,
  type WorkspaceLayout,
} from '../hooks/useWorkspaceLayout'

vi.mock('../api/http', () => ({
  fetchWorkspaceLayout: vi.fn().mockResolvedValue(null),
  saveWorkspaceLayout: vi.fn().mockResolvedValue(undefined),
}))

const PANELS: Partial<Record<WidgetId, WorkspacePanel>> = {
  browser: { node: <p>browser body</p> },
  matches: { node: <p>matches body</p> },
  pool: { node: <p>pool body</p> },
  explorer: { node: <p>explorer body</p> },
  sequencer: { node: <p>sequencer body</p> },
}

// The canvas is 1200x800, so it measures 150x100 units of 8px.
const UNIT = UNIT_PX
const BOUNDS = { cols: 150, rows: 100 }

// The grid is a pure view over the layout hook, so the tests drive the real
// hook through a host component and assert what the grid renders.
function Host({ onLayout }: { onLayout?: (l: WorkspaceLayout) => void }) {
  const layout = useWorkspaceLayout()
  onLayout?.(layout)
  return <WorkspaceGrid layout={layout} panels={PANELS} />
}

async function renderGrid() {
  let latest: WorkspaceLayout | null = null
  await act(async () => {
    render(<Host onLayout={(l) => (latest = l)} />)
  })
  const canvas = document.querySelector('.ws-canvas') as HTMLElement
  Object.defineProperty(canvas, 'clientWidth', { value: 1200 })
  Object.defineProperty(canvas, 'clientHeight', { value: 800 })
  await act(async () => {
    latest!.setBounds(BOUNDS)
  })
  return () => latest as unknown as WorkspaceLayout
}

function panel(label: string): HTMLElement {
  return screen.getByLabelText(label)
}

/** The rectangle a panel occupies, in units, read off its inline geometry. */
function rect(label: string) {
  const el = panel(label)
  const px = (value: string) => Number(value.replace('px', '')) / UNIT
  return {
    x: px(el.style.left),
    y: px(el.style.top),
    w: px(el.style.width),
    h: px(el.style.height),
  }
}

/** Drag an element by whole grid units via the pointer sequence the grid uses. */
async function drag(
  el: HTMLElement,
  units: { dx?: number; dy?: number; px?: { dx?: number; dy?: number } },
) {
  const dx = units.px ? (units.px.dx ?? 0) : (units.dx ?? 0) * UNIT
  const dy = units.px ? (units.px.dy ?? 0) : (units.dy ?? 0) * UNIT
  await act(async () => {
    fireEvent.pointerDown(el, { clientX: 400, clientY: 400, button: 0 })
  })
  await act(async () => {
    fireEvent.pointerMove(window, { clientX: 400 + dx, clientY: 400 + dy })
  })
  await act(async () => {
    fireEvent.pointerUp(window)
  })
}

function handle(label: string, edge: string): HTMLElement {
  return screen.getByLabelText(`Resize ${label} ${edge} edge`)
}

beforeEach(() => {
  localStorage.clear()
})

describe('WorkspaceGrid placement', () => {
  it('lays every widget out at its preset rectangle', async () => {
    await renderGrid()
    const expected = presetPlace('Explorer sandbox', BOUNDS)

    expect(screen.getAllByRole('region')).toHaveLength(5)
    expect(rect('Explorer')).toEqual(expected.explorer)
    expect(rect('Browser')).toEqual(expected.browser)
    expect(rect('Sequencer')).toEqual(expected.sequencer)
  })

  it('places every widget in every preset without an overlap', () => {
    for (const name of PRESET_NAMES) {
      const place = presetPlace(name, BOUNDS)
      const seen = Object.values(place)
      expect(seen, name).toHaveLength(5)
      for (let i = 0; i < seen.length; i++) {
        for (let j = i + 1; j < seen.length; j++) {
          expect(overlaps(seen[i], seen[j]), `${name} overlaps`).toBe(false)
        }
      }
    }
  })

  it('applies a preset chosen from the picker', async () => {
    const layout = await renderGrid()

    await act(async () => {
      screen.getByRole('button', { name: 'Layout preset' }).click()
    })
    await act(async () => {
      screen.getByRole('menuitemradio', { name: 'Pool curation' }).click()
    })

    expect(layout().place).toEqual(presetPlace('Pool curation', BOUNDS))
    expect(rect('Pool')).toEqual(presetPlace('Pool curation', BOUNDS).pool)
  })

  it('creates a named layout from the picker after an edit', async () => {
    const layout = await renderGrid()

    await drag(handle('Browser', 'left'), { dx: -1 })
    expect(
      screen.getByRole('button', { name: 'Layout preset' }),
    ).toHaveTextContent('Custom')

    await act(async () => {
      screen.getByRole('button', { name: 'Layout preset' }).click()
    })
    await act(async () => {
      screen.getByRole('menuitem', { name: 'New layout…' }).click()
    })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('New layout name'), {
        target: { value: 'My custom view' },
      })
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click()
    })

    expect(layout().presets['My custom view']).toEqual(layout().place)
    expect(layout().preset).toBe('My custom view')
  })

  it('creates and renames a layout while a built-in is active', async () => {
    const layout = await renderGrid()
    const picker = screen.getByRole('button', { name: 'Layout preset' })

    fireEvent.click(picker)
    fireEvent.click(screen.getByRole('menuitem', { name: 'New layout…' }))
    fireEvent.change(screen.getByLabelText('New layout name'), {
      target: { value: 'Morning set' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(layout().preset).toBe('Morning set')

    fireEvent.click(picker)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename layout…' }))
    fireEvent.change(screen.getByLabelText('Rename layout'), {
      target: { value: 'Evening set' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(layout().preset).toBe('Evening set')
    expect(layout().presets['Morning set']).toBeUndefined()
  })
})

describe('WorkspaceGrid resizing', () => {
  it('reserves a bottom gutter so resize handles do not cover widget controls', async () => {
    await renderGrid()

    const browser = panel('Browser')
    const body = browser.querySelector('.wf-body') as HTMLElement
    const bottom = handle('Browser', 'bottom')
    const bottomLeft = handle('Browser', 'bottom-left')
    const bottomRight = handle('Browser', 'bottom-right')

    expect(body).toHaveClass('wf-body--resize-safe')
    expect(bottom).toHaveClass('ws-handle--s')
    expect(bottomLeft).toHaveClass('ws-handle--sw')
    expect(bottomRight).toHaveClass('ws-handle--se')
  })

  it('offers a handle on every edge and corner', async () => {
    await renderGrid()

    for (const edge of [
      'top',
      'bottom',
      'left',
      'right',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]) {
      expect(handle('Browser', edge)).toBeInTheDocument()
    }
  })

  it('snaps an edge drag to the nearest 8px unit', async () => {
    await renderGrid()
    const P = presetPlace('Explorer sandbox', BOUNDS)
    expect(rect('Browser')).toEqual(P.browser)

    // Six pixels is past the halfway mark of an 8px unit, so it snaps out one.
    await drag(handle('Browser', 'left'), { px: { dx: 6 } })

    expect(rect('Browser')).toEqual({
      ...P.browser!,
      x: P.browser!.x + 1,
      w: P.browser!.w - 1,
    })
  })

  it('ignores a drag that has not reached the halfway mark', async () => {
    await renderGrid()
    const P = presetPlace('Explorer sandbox', BOUNDS)

    // Three pixels is under half a unit, so nothing moves.
    await drag(handle('Browser', 'left'), { px: { dx: 3 } })

    expect(rect('Browser')).toEqual(P.browser)
  })

  it('stops a left edge against the widget beside it', async () => {
    await renderGrid()
    const P = presetPlace('Explorer sandbox', BOUNDS)

    // Explorer ends where Browser begins, so Browser cannot grow leftwards.
    await drag(handle('Browser', 'left'), { dx: -4 })

    expect(rect('Browser')).toEqual(P.browser)
    expect(rect('Explorer')).toEqual(P.explorer)
  })

  it('resizes the bottom edge without touching any other widget', async () => {
    await renderGrid()
    const P = presetPlace('Explorer sandbox', BOUNDS)
    const before = rect('Sequencer')

    await drag(handle('Explorer', 'bottom'), { dy: -4 })

    expect(rect('Explorer')).toEqual({
      ...P.explorer!,
      h: P.explorer!.h - 4,
    })
    // The widget below keeps the size it had: rectangles are independent.
    expect(rect('Sequencer')).toEqual(before)
  })

  it('stops an edge against the neighbour instead of overlapping it', async () => {
    await renderGrid()
    const P = presetPlace('Explorer sandbox', BOUNDS)

    // Explorer's right edge would run straight through Browser.
    await drag(handle('Explorer', 'right'), { dx: 20 })

    expect(rect('Explorer')).toEqual(P.explorer)
    expect(rect('Browser')).toEqual(P.browser)
  })

  it('keeps a widget inside the canvas', async () => {
    await renderGrid()
    const P = presetPlace('Explorer sandbox', BOUNDS)

    await drag(handle('Browser', 'right'), { dx: 200 })

    expect(rect('Browser')).toEqual(P.browser)
  })
})

describe('WorkspaceGrid moving', () => {
  it('moves a widget by dragging its header into free space', async () => {
    const layout = await renderGrid()
    await act(async () => {
      layout().removeWidget('matches')
    })

    // Matches is gone, so the bottom-right block is free for Browser.
    const P = presetPlace('Explorer sandbox', BOUNDS)
    await drag(panel('Browser').querySelector('.wf-bar') as HTMLElement, {
      dy: P.matches!.y,
    })

    expect(rect('Browser')).toEqual({ ...P.browser!, y: P.matches!.y })
  })

  it('refuses a move that would land on another widget', async () => {
    await renderGrid()

    const P = presetPlace('Explorer sandbox', BOUNDS)
    await drag(panel('Browser').querySelector('.wf-bar') as HTMLElement, {
      dx: -4,
    })

    expect(rect('Browser')).toEqual(P.browser)
  })
})

describe('WorkspaceGrid widget controls', () => {
  it('locks a widget so it cannot be resized or moved', async () => {
    await renderGrid()

    await act(async () => {
      screen.getByLabelText('Lock Browser').click()
    })

    // A locked widget offers no handles at all.
    const P = presetPlace('Explorer sandbox', BOUNDS)
    expect(screen.queryByLabelText('Resize Browser left edge')).toBeNull()
    await drag(panel('Browser').querySelector('.wf-bar') as HTMLElement, {
      dy: 4,
    })
    expect(rect('Browser')).toEqual(P.browser)

    await act(async () => {
      screen.getByLabelText('Unlock Browser').click()
    })
    expect(
      screen.getByLabelText('Resize Browser left edge'),
    ).toBeInTheDocument()
  })

  it('never lets one widget lock block resizing another', async () => {
    await renderGrid()

    await act(async () => {
      screen.getByLabelText('Lock Browser').click()
    })
    const P = presetPlace('Explorer sandbox', BOUNDS)
    await drag(handle('Explorer', 'bottom'), { dy: -4 })

    expect(rect('Explorer')).toEqual({ ...P.explorer!, h: P.explorer!.h - 4 })
    expect(rect('Browser')).toEqual(P.browser)
  })

  it('removes a widget and offers it again from the header tray', async () => {
    await renderGrid()

    await act(async () => {
      screen.getByLabelText('Remove Matches').click()
    })
    expect(screen.queryByLabelText('Matches')).toBeNull()

    await act(async () => {
      screen.getByRole('button', { name: 'Add widget' }).click()
    })
    await act(async () => {
      screen.getByRole('menuitem', { name: 'Matches' }).click()
    })

    expect(screen.getByLabelText('Matches')).toBeInTheDocument()
  })

  it('hides the add control when every widget is on the canvas', async () => {
    await renderGrid()

    expect(screen.queryByRole('button', { name: 'Add widget' })).toBeNull()
  })
})
