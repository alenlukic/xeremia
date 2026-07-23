import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetTracklist } from './SetTracklist'
import { TRACKLIST_ROW_MIME, POOL_ROW_MIME, TRACK_DRAG_MIME } from '../utils'
import type { TracklistEntry } from '../types'
import {
  testTracklistTableProps,
  columnHeaderLabel,
} from '../test/tablePreferenceHelpers'

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
      date_added: null,
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
      onReorder={noop}
      onUpdateNote={noop}
      onAddTrack={noop}
      onDropFromPool={noop}
      onExportM3u8={noop}
      {...testTracklistTableProps}
      {...extra}
    />,
  )
}

const dragData = () => ({
  dataTransfer: { setData: noop, effectAllowed: '', dropEffect: '' },
})

const crossDragData = (mime: string, trackId: number) => ({
  dataTransfer: {
    types: [mime],
    getData: (m: string) => (m === mime ? String(trackId) : ''),
    setData: noop,
    effectAllowed: '',
    dropEffect: '',
  },
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
    const headerTexts = screen
      .getAllByRole('columnheader')
      .map((h) => columnHeaderLabel(h as HTMLElement))
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

  it('renders a left-side row remove control', () => {
    const onRemove = vi.fn()
    const { container } = renderTracklist(
      [makeEntry({ id: 1, track_id: 10 })],
      {
        onRemove,
      },
    )
    expect(container.querySelector('col.set-ws-col-remove')).toBeTruthy()
    const btn = screen.getByRole('button', { name: 'Remove from tracklist' })
    fireEvent.click(btn)
    expect(onRemove).toHaveBeenCalledWith(10)
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

  it('does not render move up/down or move-to-pool buttons (reordering is drag-and-drop)', () => {
    renderTracklist([
      makeEntry({ id: 1, track_id: 10, position: 0 }),
      makeEntry({ id: 2, track_id: 20, position: 1 }),
    ])
    expect(screen.queryByTitle('Move up')).toBeNull()
    expect(screen.queryByTitle('Move down')).toBeNull()
    expect(screen.queryByTitle('Move to pool')).toBeNull()
    expect(
      screen.getAllByRole('button', { name: 'Remove from tracklist' }),
    ).toHaveLength(2)
  })
})

describe('SetTracklist column resizing', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders resize handles on resizable column headers', () => {
    const { container } = renderTracklist([makeEntry({ id: 1, track_id: 10 })])
    const titleTh = screen.getByRole('columnheader', { name: /title/i })
    expect(titleTh.querySelector('.col-resizer')).toBeTruthy()
    // num, title, key, bpm, note — remove chrome is not a preference column.
    expect(container.querySelectorAll('.col-resizer')).toHaveLength(5)
  })

  it('drag on a resize handle flushes the column width via callback', () => {
    const onColumnWidthFlush = vi.fn()
    renderTracklist([makeEntry({ id: 1, track_id: 10 })], {
      onColumnWidthFlush,
    })
    const noteTh = screen.getByRole('columnheader', { name: /note/i })
    const handle = noteTh.querySelector('.col-resizer')!

    fireEvent.mouseDown(handle, { clientX: 300 })
    fireEvent.mouseMove(document, { clientX: 240 })
    fireEvent.mouseUp(document)

    expect(onColumnWidthFlush).toHaveBeenCalledWith('note', 40)
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

describe('SetTracklist cross-panel drag-and-drop', () => {
  it('tags row drags with the tracklist row MIME type', () => {
    const setData = vi.fn()
    const { container } = renderTracklist([makeEntry({ id: 1, track_id: 10 })])
    const row = container.querySelector('tbody tr')!
    fireEvent.dragStart(row, {
      dataTransfer: { setData, effectAllowed: '', dropEffect: '' },
    })
    expect(setData).toHaveBeenCalledWith(TRACKLIST_ROW_MIME, '10')
  })

  it('moves a dropped pool row into the tracklist', () => {
    const onDropFromPool = vi.fn()
    const { container } = renderTracklist(
      [makeEntry({ id: 1, track_id: 10 })],
      {
        onDropFromPool,
      },
    )
    const panel = container.querySelector('.set-tracklist')!
    fireEvent.drop(panel, crossDragData(POOL_ROW_MIME, 20))
    expect(onDropFromPool).toHaveBeenCalledWith(20)
  })

  it('ignores drops of its own row MIME type', () => {
    const onDropFromPool = vi.fn()
    const onAddTrack = vi.fn()
    const { container } = renderTracklist(
      [makeEntry({ id: 1, track_id: 10 })],
      {
        onDropFromPool,
        onAddTrack,
      },
    )
    const panel = container.querySelector('.set-tracklist')!
    fireEvent.drop(panel, crossDragData(TRACKLIST_ROW_MIME, 10))
    expect(onDropFromPool).not.toHaveBeenCalled()
    expect(onAddTrack).not.toHaveBeenCalled()
  })

  it('does not let a stale row-drag steal an external browse drop', () => {
    const onReorder = vi.fn()
    const onAddTrack = vi.fn()
    const { container } = renderTracklist(
      [
        makeEntry({ id: 1, track_id: 10, position: 0 }),
        makeEntry({ id: 2, track_id: 20, position: 1 }),
      ],
      { onReorder, onAddTrack },
    )
    const rows = container.querySelectorAll('tbody tr')

    // Start an internal reorder, then abandon it without dragEnd (stale state).
    fireEvent.dragStart(rows[0], dragData())
    expect(rows[0].classList.contains('set-row-dragging')).toBe(true)

    // External browse drop on a row must bubble to the panel, not reorder.
    fireEvent.drop(rows[1], crossDragData(TRACK_DRAG_MIME, 99))

    expect(onReorder).not.toHaveBeenCalled()
    expect(onAddTrack).toHaveBeenCalledWith(99, undefined)
    expect(rows[0].classList.contains('set-row-dragging')).toBe(false)
  })

  it('clears the dragging class when the tracklist entries change', () => {
    const initial = [
      makeEntry({ id: 1, track_id: 10, position: 0 }),
      makeEntry({ id: 2, track_id: 20, position: 1 }),
    ]
    const { container, rerender } = renderTracklist(initial)
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    expect(rows[0].classList.contains('set-row-dragging')).toBe(true)

    rerender(
      <SetTracklist
        allTracks={[]}
        tracklist={[
          ...initial,
          makeEntry({ id: 3, track_id: 30, position: 2 }),
        ]}
        onRemove={noop}
        onReorder={noop}
        onUpdateNote={noop}
        onAddTrack={noop}
        onDropFromPool={noop}
        onExportM3u8={noop}
        {...testTracklistTableProps}
      />,
    )

    const nextRows = container.querySelectorAll('tbody tr')
    expect(nextRows[0].classList.contains('set-row-dragging')).toBe(false)
  })
})

describe('SetTracklist header controls', () => {
  it('exports directly from the header Export button (no ⋯ menu)', () => {
    const onExportM3u8 = vi.fn()
    renderTracklist([makeEntry({ id: 1, track_id: 10 })], { onExportM3u8 })

    // The old three-dot menu is gone; Export is a first-class header button.
    expect(screen.queryByLabelText('Tracklist menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(onExportM3u8).toHaveBeenCalledTimes(1)
  })

  it('hides the Export button when the tracklist is empty', () => {
    renderTracklist([])
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull()
  })

  it('offers Explorer in the header when onOpenExplorer is provided', () => {
    const onOpenExplorer = vi.fn()
    renderTracklist([makeEntry({ id: 1, track_id: 10 })], { onOpenExplorer })
    fireEvent.click(screen.getByRole('button', { name: 'Explorer' }))
    expect(onOpenExplorer).toHaveBeenCalledTimes(1)
  })
})

describe('SetTracklist title display', () => {
  it('shows the metadata prefix verbatim, matching the track browser', () => {
    const entry = makeEntry({ id: 1, track_id: 10 })
    entry.track = { ...entry.track!, title: '[08A - Am - 128.00] My Song' }
    const { container } = renderTracklist([entry])
    expect(container.querySelector('.set-ws-cell-title')?.textContent).toBe(
      '[08A - Am - 128.00] My Song',
    )
  })
})
