import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBar } from './FilterBar'
import { TrackTable } from './TrackTable'
import type { Track } from '../types'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

const CONFIGURABLE_COLUMNS = [
  { id: 'camelot_code', label: 'Camelot' },
  { id: 'key', label: 'Key' },
  { id: 'bpm', label: 'BPM' },
  { id: 'energy', label: 'Energy' },
  { id: 'label', label: 'Label' },
  { id: 'genre', label: 'Genre' },
]

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
  it('renders Columns button when configurableColumns is provided', () => {
    render(
      <FilterBar
        {...baseProps}
        configurableColumns={CONFIGURABLE_COLUMNS}
        columnVisibility={{}}
        onToggleColumn={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Columns/ })).toBeInTheDocument()
  })

  it('does not render Columns button when configurableColumns is absent', () => {
    render(<FilterBar {...baseProps} />)
    expect(
      screen.queryByRole('button', { name: /Columns/ }),
    ).not.toBeInTheDocument()
  })

  it('opens popover with all configurable column checkboxes', async () => {
    render(
      <FilterBar
        {...baseProps}
        configurableColumns={CONFIGURABLE_COLUMNS}
        columnVisibility={{}}
        onToggleColumn={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Columns/ }))
    for (const col of CONFIGURABLE_COLUMNS) {
      expect(screen.getByLabelText(col.label)).toBeInTheDocument()
    }
  })

  it('does not list protected Title column', async () => {
    render(
      <FilterBar
        {...baseProps}
        configurableColumns={CONFIGURABLE_COLUMNS}
        columnVisibility={{}}
        onToggleColumn={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Columns/ }))
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
  })

  it('calls onToggleColumn when a checkbox is clicked', async () => {
    const onToggle = vi.fn()
    render(
      <FilterBar
        {...baseProps}
        configurableColumns={CONFIGURABLE_COLUMNS}
        columnVisibility={{}}
        onToggleColumn={onToggle}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Columns/ }))
    await userEvent.click(screen.getByLabelText('BPM'))
    expect(onToggle).toHaveBeenCalledWith('bpm')
  })

  it('shows unchecked state for hidden columns', async () => {
    render(
      <FilterBar
        {...baseProps}
        configurableColumns={CONFIGURABLE_COLUMNS}
        columnVisibility={{ bpm: false }}
        onToggleColumn={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Columns/ }))
    const bpmCheckbox = screen.getByLabelText('BPM') as HTMLInputElement
    expect(bpmCheckbox.checked).toBe(false)

    const energyCheckbox = screen.getByLabelText('Energy') as HTMLInputElement
    expect(energyCheckbox.checked).toBe(true)
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
        columnVisibility={{ bpm: false }}
      />,
    )
    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers).not.toContain('BPM')
    expect(headers).toContain('Title')
  })

  it('renders BPM as a rounded integer', () => {
    render(
      <TrackTable
        tracks={[{ ...sampleTrack, bpm: 128.7 }]}
        loading={false}
        selectedTrack={null}
        selectTrack={vi.fn()}
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
        loading={false}
        selectedTrack={null}
        selectTrack={vi.fn()}
      />,
    )
    const cells = screen.getAllByRole('cell')
    const bpmCell = cells.find((c) => c.textContent === '130')
    expect(bpmCell).toBeTruthy()
  })
})
