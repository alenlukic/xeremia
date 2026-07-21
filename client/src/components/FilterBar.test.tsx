import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowseFilterAddButton, BrowseFilterGroups } from './FilterBar'
import { matchesModel, type FilterModel } from '../hooks/useTrackFilters'
import { TrackTable } from './TrackTable'
import {
  testSearchConfig,
  noopTableCallbacks,
  columnHeaderLabel,
} from '../test/tablePreferenceHelpers'
import type { Track } from '../types'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

const filterProps = {
  model: [] as FilterModel,
  setModel: vi.fn(),
  genres: ['House', 'Techno'],
  labels: ['Anjuna', 'Drumcode'],
}

/** Resolve a `setModel(updater)` call to the model it would produce from `prev`. */
function applyLastSetModel(fn: ReturnType<typeof vi.fn>, prev: FilterModel) {
  const updater = fn.mock.calls.at(-1)?.[0] as (m: FilterModel) => FilterModel
  return updater(prev)
}

describe('BrowseFilterAddButton', () => {
  it('opens a menu with every filter kind', async () => {
    render(<BrowseFilterAddButton {...filterProps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    for (const name of ['Key', 'BPM', 'Genre', 'Label', 'Date Added']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('stages a key condition and commits it to the first group on close', async () => {
    const setModel = vi.fn()
    render(<BrowseFilterAddButton {...filterProps} setModel={setModel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Key' }))
    await userEvent.click(screen.getByRole('button', { name: '01A' }))
    // Staged only until the popover closes.
    expect(setModel).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    const next = applyLastSetModel(setModel, [])
    expect(next).toHaveLength(1)
    expect(next[0].conditions[0]).toMatchObject({
      kind: 'key',
      values: ['01A'],
    })
  })

  it('commits a genre condition from the multi-select', async () => {
    const setModel = vi.fn()
    render(<BrowseFilterAddButton {...filterProps} setModel={setModel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Genre' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'House' }))
    await userEvent.keyboard('{Escape}')
    const next = applyLastSetModel(setModel, [])
    expect(next[0].conditions[0]).toMatchObject({
      kind: 'genre',
      values: ['House'],
    })
  })
})

describe('BrowseFilterGroups', () => {
  const model: FilterModel = [
    {
      id: 'g1',
      conditions: [
        { id: 'c1', kind: 'key', values: ['01A'] },
        { id: 'c2', kind: 'bpm', min: 120, max: 130 },
      ],
    },
    { id: 'g2', conditions: [{ id: 'c3', kind: 'genre', values: ['House'] }] },
  ]

  it('renders nothing when the model is empty', () => {
    const { container } = render(<BrowseFilterGroups {...filterProps} />)
    expect(container.querySelector('.filter-groups')).toBeNull()
  })

  it('renders groups, pills and an OR divider', () => {
    const { container } = render(
      <BrowseFilterGroups {...filterProps} model={model} />,
    )
    expect(container.querySelectorAll('.filter-group')).toHaveLength(2)
    expect(container.querySelector('.filter-or-divider')?.textContent).toBe('OR')
    expect(
      screen.getByRole('button', { name: 'Key: 01A' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'BPM: 120–130' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Genre: House' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ OR' })).toBeInTheDocument()
  })

  it('removes a condition via its pill remove button', async () => {
    const setModel = vi.fn()
    render(
      <BrowseFilterGroups {...filterProps} model={model} setModel={setModel} />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Key filter' }),
    )
    const next = applyLastSetModel(setModel, model)
    expect(
      next.flatMap((g) => g.conditions).some((c) => c.id === 'c1'),
    ).toBe(false)
  })
})

describe('matchesModel', () => {
  const track = (over: Partial<Track>): Track => ({
    id: 1,
    title: 'T',
    artist_names: [],
    bpm: 128,
    key: 'Am',
    camelot_code: '01A',
    genre: 'House',
    label: 'Anjuna',
    energy: null,
    date_added: '2024-01-15',
    ...over,
  })

  it('passes everything when no group is active', () => {
    expect(matchesModel(track({}), [])).toBe(true)
  })

  it('ANDs conditions within a group', () => {
    const model: FilterModel = [
      {
        id: 'g',
        conditions: [
          { id: 'a', kind: 'key', values: ['01A'] },
          { id: 'b', kind: 'bpm', min: 130 },
        ],
      },
    ]
    // key matches but bpm (128) is below the 130 minimum → excluded.
    expect(matchesModel(track({ bpm: 128 }), model)).toBe(false)
    expect(matchesModel(track({ bpm: 132 }), model)).toBe(true)
  })

  it('ORs across groups', () => {
    const model: FilterModel = [
      { id: 'g1', conditions: [{ id: 'a', kind: 'genre', values: ['Techno'] }] },
      { id: 'g2', conditions: [{ id: 'b', kind: 'label', values: ['Anjuna'] }] },
    ]
    // Genre House fails group 1 but label Anjuna satisfies group 2.
    expect(matchesModel(track({ genre: 'House', label: 'Anjuna' }), model)).toBe(
      true,
    )
    expect(matchesModel(track({ genre: 'House', label: 'Other' }), model)).toBe(
      false,
    )
  })

  it('filters by date-added bounds inclusively', () => {
    const model: FilterModel = [
      {
        id: 'g',
        conditions: [
          { id: 'd', kind: 'dateAdded', after: '2024-01-01', before: '2024-01-31' },
        ],
      },
    ]
    expect(matchesModel(track({ date_added: '2024-01-15' }), model)).toBe(true)
    expect(matchesModel(track({ date_added: '2023-12-31' }), model)).toBe(false)
  })
})

describe('TrackTable column visibility', () => {
  const sampleTrack: Track = {
    id: 1,
    title: 'Test Title',
    artist_names: ['Artist'],
    bpm: 128,
    key: 'Am',
    camelot_code: '8A',
    genre: 'House',
    label: 'Toolroom',
    energy: 0.75,
    date_added: null,
  }

  it('hides a column when columnVisibility marks it false while Title remains', () => {
    render(
      <TrackTable
        tracks={[sampleTrack]}
        loading={false}
        selectedTrack={null}
        selectTrack={vi.fn()}
        tableConfig={{
          ...testSearchConfig,
          columnVisibility: {
            ...testSearchConfig.columnVisibility,
            bpm: false,
          },
        }}
        onToggleColumnVisibility={noopTableCallbacks.onToggleColumn}
        onReorderColumn={noopTableCallbacks.onReorderColumn}
        onInsertColumnAfter={noopTableCallbacks.onInsertColumnAfter}
        onColumnWidthChange={noopTableCallbacks.onColumnWidthChange}
        onColumnWidthFlush={noopTableCallbacks.onColumnWidthFlush}
      />,
    )
    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => columnHeaderLabel(h as HTMLElement))
    expect(headers).not.toContain('BPM')
    expect(headers).toContain('Title')
  })

  const trackTableProps = {
    loading: false as const,
    selectedTrack: null,
    selectTrack: vi.fn(),
    tableConfig: testSearchConfig,
    onToggleColumnVisibility: noopTableCallbacks.onToggleColumn,
    onReorderColumn: noopTableCallbacks.onReorderColumn,
    onInsertColumnAfter: noopTableCallbacks.onInsertColumnAfter,
    onColumnWidthChange: noopTableCallbacks.onColumnWidthChange,
    onColumnWidthFlush: noopTableCallbacks.onColumnWidthFlush,
  }

  it('renders BPM as a rounded integer', () => {
    render(
      <TrackTable tracks={[{ ...sampleTrack, bpm: 128.7 }]} {...trackTableProps} />,
    )
    const cells = screen.getAllByRole('cell')
    const bpmCell = cells.find((c) => c.textContent === '129')
    expect(bpmCell).toBeTruthy()
    const fractionalCell = cells.find((c) => c.textContent?.includes('128.7'))
    expect(fractionalCell).toBeFalsy()
  })

  it('renders BPM as integer with no trailing decimal for whole numbers', () => {
    render(
      <TrackTable tracks={[{ ...sampleTrack, bpm: 130.0 }]} {...trackTableProps} />,
    )
    const cells = screen.getAllByRole('cell')
    const bpmCell = cells.find((c) => c.textContent === '130')
    expect(bpmCell).toBeTruthy()
  })
})
