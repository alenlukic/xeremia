import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetTracklist } from './SetTracklist'
import type { TracklistEntry } from '../types'

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
}))

function makeEntry(
  overrides: Partial<TracklistEntry> & { id: number; track_id: number },
): TracklistEntry {
  return {
    set_id: 1,
    position: 0,
    note: '',
    track: {
      id: overrides.track_id,
      title: `Track ${overrides.track_id}`,
      artist_names: [],
      bpm: 128,
      key: 'Aminor',
      camelot_code: '8A',
      genre: null,
      label: null,
      energy: null,
    },
    ...overrides,
  }
}

const noop = () => {}

function renderTracklist(
  entries: TracklistEntry[],
  extra?: Partial<React.ComponentProps<typeof SetTracklist>>,
) {
  return render(
    <SetTracklist
      allTracks={[]}
      tracklist={entries}
      onRemove={noop}
      onMoveToPool={noop}
      onReorder={noop}
      onUpdateNote={noop}
      onAddTrack={noop}
      {...extra}
    />,
  )
}

const dragData = () => ({
  dataTransfer: { setData: noop, effectAllowed: '', dropEffect: '' },
})

describe('SetTracklist', () => {
  it('renders a semantic HTML table', () => {
    const entries = [makeEntry({ id: 1, track_id: 10 })]
    const { container } = renderTracklist(entries)
    expect(container.querySelector('table.set-tracklist-table')).toBeTruthy()
    expect(container.querySelector('thead')).toBeTruthy()
    expect(container.querySelector('tbody')).toBeTruthy()
  })

  it('renders dedicated Key and BPM column headers', () => {
    renderTracklist([makeEntry({ id: 1, track_id: 10 })])
    const headers = screen.getAllByRole('columnheader')
    const headerTexts = headers.map((h) => h.textContent)
    expect(headerTexts).toContain('Key')
    expect(headerTexts).toContain('BPM')
  })

  it('renders key and BPM in dedicated cells, not inside the title', () => {
    const entry = makeEntry({ id: 1, track_id: 10 })
    const { container } = renderTracklist([entry])
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(1)
    const row = rows[0]
    const titleCell = row.querySelector('.set-ws-cell-title')
    const keyCell = row.querySelector('.set-ws-cell-key')
    const bpmCell = row.querySelector('.set-ws-cell-bpm')

    expect(titleCell?.textContent).not.toContain('8A')
    expect(keyCell?.textContent).toBe('8A')
    expect(bpmCell?.textContent).toBe('128')
  })

  it('uses fixed-width actions column via colgroup', () => {
    const { container } = renderTracklist([makeEntry({ id: 1, track_id: 10 })])
    const col = container.querySelector('col.set-ws-col-actions-tracklist')
    expect(col).toBeTruthy()
  })

  it('renders Actions header with set-ws-th-actions class', () => {
    renderTracklist([makeEntry({ id: 1, track_id: 10 })])
    const actionsHeader = screen.getByRole('columnheader', { name: /actions/i })
    expect(actionsHeader.classList.contains('set-ws-th-actions')).toBe(true)
  })

  it('shows em-dash when key/bpm are missing', () => {
    const entry = makeEntry({ id: 2, track_id: 20 })
    entry.track = { ...entry.track!, bpm: null, camelot_code: null }
    const { container } = renderTracklist([entry])
    const row = container.querySelector('tbody tr')!
    expect(row.querySelector('.set-ws-cell-key')?.textContent).toBe('—')
    expect(row.querySelector('.set-ws-cell-bpm')?.textContent).toBe('—')
  })

  it('renders note input in a dedicated cell', () => {
    renderTracklist([makeEntry({ id: 1, track_id: 10 })])
    const noteInput = screen.getByPlaceholderText('Add note…')
    expect(noteInput).toBeTruthy()
    expect(
      noteInput.closest('td')?.classList.contains('set-ws-cell-note'),
    ).toBe(true)
  })

  it('shows empty message when tracklist is empty', () => {
    renderTracklist([])
    expect(screen.getByText(/tracklist is empty/i)).toBeTruthy()
  })
})

describe('SetTracklist drag-and-drop reordering', () => {
  function makeEntries(): TracklistEntry[] {
    return [
      makeEntry({ id: 1, track_id: 10, position: 0 }),
      makeEntry({ id: 2, track_id: 20, position: 1 }),
      makeEntry({ id: 3, track_id: 30, position: 2 }),
    ]
  }

  it('calls onReorder with dragged track and drop index', () => {
    const onReorder = vi.fn()
    const { container } = renderTracklist(makeEntries(), { onReorder })
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    fireEvent.dragOver(rows[2], dragData())
    fireEvent.drop(rows[2], dragData())
    expect(onReorder).toHaveBeenCalledWith(10, 2)
  })

  it('marks the hovered row as drop target while dragging', () => {
    const { container } = renderTracklist(makeEntries())
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    fireEvent.dragOver(rows[1], dragData())
    expect(rows[1].classList.contains('set-row-drop-target')).toBe(true)
    expect(rows[0].classList.contains('set-row-dragging')).toBe(true)
  })

  it('does not call onReorder when dropped on the source row', () => {
    const onReorder = vi.fn()
    const { container } = renderTracklist(makeEntries(), { onReorder })
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[1], dragData())
    fireEvent.dragOver(rows[1], dragData())
    fireEvent.drop(rows[1], dragData())
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('clears drag state on dragEnd', () => {
    const { container } = renderTracklist(makeEntries())
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    fireEvent.dragOver(rows[2], dragData())
    fireEvent.dragEnd(rows[0], dragData())
    expect(rows[2].classList.contains('set-row-drop-target')).toBe(false)
    expect(rows[0].classList.contains('set-row-dragging')).toBe(false)
  })
})
