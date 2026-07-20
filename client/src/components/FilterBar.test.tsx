import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBar } from './FilterBar'
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

const baseProps = {
  camelotCodes: [],
  bpm: undefined,
  bpmMin: undefined,
  bpmMax: undefined,
  setCamelotCodes: vi.fn(),
  setBpm: vi.fn(),
  setBpmMin: vi.fn(),
  setBpmMax: vi.fn(),
}

describe('FilterBar add-filter flow', () => {
  it('opens a menu with Key and BPM options', async () => {
    render(<FilterBar {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Add filter/ }))
    expect(screen.getByRole('button', { name: 'Key' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BPM' })).toBeInTheDocument()
  })

  it('selecting Key opens the camelot popover and toggles codes', async () => {
    const setCamelotCodes = vi.fn()
    render(<FilterBar {...baseProps} setCamelotCodes={setCamelotCodes} />)
    await userEvent.click(screen.getByRole('button', { name: /Add filter/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Key' }))
    await userEvent.click(screen.getByRole('button', { name: '01A' }))
    expect(setCamelotCodes).toHaveBeenCalledWith(['01A'])
  })

  it('selecting BPM opens the popover with exact and range inputs', async () => {
    render(<FilterBar {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Add filter/ }))
    await userEvent.click(screen.getByRole('button', { name: 'BPM' }))
    expect(screen.getByPlaceholderText('Exact')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Min')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Max')).toBeInTheDocument()
  })
})

describe('FilterBar pills', () => {
  it('shows no pills row when no filters are active', () => {
    render(<FilterBar {...baseProps} />)
    expect(document.querySelector('.filter-pills')).not.toBeInTheDocument()
  })

  it('renders a key pill listing selected codes', () => {
    render(<FilterBar {...baseProps} camelotCodes={['01A', '02B']} />)
    expect(
      screen.getByRole('button', { name: 'Key: 01A, 02B' }),
    ).toBeInTheDocument()
  })

  it('renders BPM pill labels for exact, range, and open-ended filters', () => {
    const { rerender } = render(<FilterBar {...baseProps} bpm={124} />)
    expect(screen.getByRole('button', { name: 'BPM: 124' })).toBeInTheDocument()

    rerender(<FilterBar {...baseProps} bpmMin={120} bpmMax={140} />)
    expect(
      screen.getByRole('button', { name: 'BPM: 120–140' }),
    ).toBeInTheDocument()

    rerender(<FilterBar {...baseProps} bpmMin={120} />)
    expect(
      screen.getByRole('button', { name: 'BPM: ≥ 120' }),
    ).toBeInTheDocument()

    rerender(<FilterBar {...baseProps} bpmMax={140} />)
    expect(
      screen.getByRole('button', { name: 'BPM: ≤ 140' }),
    ).toBeInTheDocument()
  })

  it('removes the key filter via the pill remove button', async () => {
    const setCamelotCodes = vi.fn()
    render(
      <FilterBar
        {...baseProps}
        camelotCodes={['01A']}
        setCamelotCodes={setCamelotCodes}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove key filter' }),
    )
    expect(setCamelotCodes).toHaveBeenCalledWith([])
  })

  it('clears exact and range values via the BPM pill remove button', async () => {
    const setBpm = vi.fn()
    const setBpmMin = vi.fn()
    const setBpmMax = vi.fn()
    render(
      <FilterBar
        {...baseProps}
        bpm={124}
        setBpm={setBpm}
        setBpmMin={setBpmMin}
        setBpmMax={setBpmMax}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove BPM filter' }),
    )
    expect(setBpm).toHaveBeenCalledWith(undefined)
    expect(setBpmMin).toHaveBeenCalledWith(undefined)
    expect(setBpmMax).toHaveBeenCalledWith(undefined)
  })

  it('opens the popover for editing when a pill body is clicked', async () => {
    render(<FilterBar {...baseProps} camelotCodes={['01A']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Key: 01A' }))
    expect(screen.getByRole('button', { name: '03A' })).toBeInTheDocument()
  })
})

describe('FilterBar column configurator', () => {
  it('does not render the removed Columns menu', () => {
    render(<FilterBar {...baseProps} />)
    expect(
      screen.queryByRole('button', { name: /Columns/ }),
    ).not.toBeInTheDocument()
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
      <TrackTable
        tracks={[{ ...sampleTrack, bpm: 128.7 }]}
        {...trackTableProps}
      />,
    )
    const cells = screen.getAllByRole('cell')
    const bpmCell = cells.find((c) => c.textContent === '129')
    expect(bpmCell).toBeTruthy()
    const fractionalCell = cells.find((c) => c.textContent?.includes('128.7'))
    expect(fractionalCell).toBeFalsy()
  })

  it('renders BPM as integer with no trailing decimal for whole numbers', () => {
    render(
      <TrackTable
        tracks={[{ ...sampleTrack, bpm: 130.0 }]}
        {...trackTableProps}
      />,
    )
    const cells = screen.getAllByRole('cell')
    const bpmCell = cells.find((c) => c.textContent === '130')
    expect(bpmCell).toBeTruthy()
  })
})
