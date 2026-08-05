import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { WorkspaceGrid } from './WorkspaceGrid'
import type { WorkspacePanel } from './WorkspaceGrid'
import {
  LAYOUT_PRESETS,
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
  return () => latest as unknown as WorkspaceLayout
}

function panel(label: string): HTMLElement {
  return screen.getByLabelText(label)
}

function gridArea(label: string): string {
  return panel(label).style.gridArea
}

beforeEach(() => {
  localStorage.clear()
})

describe('WorkspaceGrid placement', () => {
  it('renders all five widgets at their row, column and span', async () => {
    await renderGrid()

    // The default preset spans Explorer across two columns.
    expect(gridArea('Explorer')).toBe('1 / 1 / 2 / 3')
    expect(gridArea('Browser')).toBe('1 / 3 / 2 / 4')
    expect(gridArea('Sequencer')).toBe('2 / 1 / 3 / 2')
    expect(gridArea('Pool')).toBe('2 / 2 / 3 / 3')
    expect(gridArea('Matches')).toBe('2 / 3 / 3 / 4')
    expect(within(panel('Browser')).getByText('browser body')).toBeVisible()
  })

  it('places every widget in every preset without an overlap', async () => {
    for (const place of Object.values(LAYOUT_PRESETS)) {
      const cells = new Set<string>()
      for (const id of Object.keys(place) as WidgetId[]) {
        const p = place[id]!
        for (let i = 0; i < p.span; i++) {
          cells.add(`${p.r}:${p.c + i}`)
        }
      }
      expect(Object.keys(place).sort()).toEqual([
        'browser',
        'explorer',
        'matches',
        'pool',
        'sequencer',
      ])
      expect(cells.size).toBe(6)
    }
  })

  it('leaves a removed widget off the grid', async () => {
    const layout = await renderGrid()

    await act(async () => {
      layout().removeWidget('pool')
    })

    expect(screen.queryByLabelText('Pool')).toBeNull()
  })

  it('applies a preset and resets the fr allocations', async () => {
    const layout = await renderGrid()

    await act(async () => {
      layout().resize('col', 1, [1, 1, 1], 0.25)
    })
    expect(layout().cols).not.toEqual([1, 1, 1])

    await act(async () => {
      screen.getByRole('button', { name: 'Pool curation' }).click()
    })

    expect(layout().place).toEqual(LAYOUT_PRESETS['Pool curation'])
    expect(layout().cols).toEqual([1, 1, 1])
    expect(layout().rows).toEqual([1, 1])
    expect(gridArea('Pool')).toBe('1 / 1 / 2 / 3')
  })

  it('shows the Custom pill after an edit and saves it as a named preset', async () => {
    const layout = await renderGrid()

    await act(async () => {
      layout().swapWidgets('browser', 'matches')
    })
    expect(screen.getByRole('button', { name: 'Custom' })).toBeDisabled()

    await act(async () => {
      screen.getByRole('button', { name: 'Save as preset' }).click()
    })

    expect(screen.getByRole('button', { name: 'Custom 1' })).toBeInTheDocument()
    expect(layout().presets['Custom 1']).toEqual(layout().place)
  })
})

describe('WorkspaceGrid edit mode', () => {
  async function enterEditMode() {
    const layout = await renderGrid()
    await act(async () => {
      screen.getByRole('button', { name: 'Edit layout' }).click()
    })
    return layout
  }

  it('hides the edit controls until edit mode is on', async () => {
    await renderGrid()

    expect(screen.queryByLabelText('Move Browser')).toBeNull()
    expect(screen.queryByLabelText('Remove Browser')).toBeNull()
  })

  it('swaps two widgets through a grip drag', async () => {
    await enterEditMode()
    const before = gridArea('Browser')
    const target = gridArea('Matches')

    const data = new Map<string, string>()
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
    }
    await act(async () => {
      fireEvent.dragStart(screen.getByLabelText('Move Browser'), {
        dataTransfer,
      })
      fireEvent.drop(panel('Matches'), { dataTransfer })
    })

    expect(gridArea('Browser')).toBe(target)
    expect(gridArea('Matches')).toBe(before)
  })

  it('changes a widget span and re-seats what it covers', async () => {
    await enterEditMode()
    expect(gridArea('Browser')).toBe('1 / 3 / 2 / 4')

    await act(async () => {
      screen.getByLabelText('Set Browser span to 2').click()
    })

    // A span of 2 cannot start in the last column, so it shifts left. The
    // Explorer gives up the column it lost and keeps the free one.
    expect(gridArea('Browser')).toBe('1 / 2 / 2 / 4')
    expect(gridArea('Explorer')).toBe('1 / 1 / 2 / 2')
    expect(screen.getAllByRole('region')).toHaveLength(5)
  })

  it('removes a widget and offers it again from an empty cell tray', async () => {
    await enterEditMode()

    await act(async () => {
      screen.getByLabelText('Remove Matches').click()
    })
    expect(screen.queryByLabelText('Matches')).toBeNull()

    await act(async () => {
      screen.getByLabelText('Add widget to row 2 column 3').click()
    })
    const tray = screen.getByRole('menu')
    expect(
      within(tray)
        .getAllByRole('menuitem')
        .map((b) => b.textContent),
    ).toEqual(['Matches'])

    await act(async () => {
      within(tray).getByRole('menuitem', { name: 'Matches' }).click()
    })
    expect(gridArea('Matches')).toBe('2 / 3 / 3 / 4')
  })
})
