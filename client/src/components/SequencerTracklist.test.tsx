import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { SequencerTracklist } from './SequencerTracklist'
import type { LaidBlock } from '../hooks/useSequencer'
import type { Track, TracklistEntry } from '../types'
import { POOL_ROW_MIME, TRACK_DRAG_MIME, TRACKLIST_ROW_MIME } from '../utils'

function makeTrack(id: number): Track {
  return {
    id,
    title: `Track ${id}`,
    artist_names: [],
    bpm: 128,
    key: 'Aminor',
    camelot_code: '8A',
    genre: null,
    label: null,
    energy: null,
    date_added: null,
    duration_seconds: 300,
  }
}

function makeBlock(trackId: number, position: number): LaidBlock {
  const track = makeTrack(trackId)
  const entry: TracklistEntry = {
    id: 100 + trackId,
    set_id: 1,
    track_id: trackId,
    position,
    note: '',
    track,
    play_minutes: null,
    pinned_end_minutes: null,
    bpm_override: null,
  }
  return {
    entry,
    t: position * 5,
    dur: 5,
    scale: 1,
    pinned: false,
    fallback: false,
  }
}

const noop = () => {}

function renderList(
  blocks: LaidBlock[],
  extra?: Partial<React.ComponentProps<typeof SequencerTracklist>>,
) {
  return render(
    <SequencerTracklist
      blocks={blocks}
      overrides={{}}
      selectedTrackId={null}
      onSelect={noop}
      onBpmChange={noop}
      onNoteChange={noop}
      onReorder={noop}
      onAddCommitted={noop}
      onPromote={noop}
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

describe('SequencerTracklist drag-and-drop reordering', () => {
  function makeBlocks() {
    return [makeBlock(10, 0), makeBlock(20, 1), makeBlock(30, 2)]
  }

  it('calls onReorder with dragged track and drop index', () => {
    const onReorder = vi.fn()
    const { container } = renderList(makeBlocks(), { onReorder })
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    fireEvent.dragOver(rows[2], dragData())
    fireEvent.drop(rows[2], dragData())
    expect(onReorder).toHaveBeenCalledWith(10, 2)
  })

  it('does not call onReorder when dropped on the source row', () => {
    const onReorder = vi.fn()
    const { container } = renderList(makeBlocks(), { onReorder })
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[1], dragData())
    fireEvent.dragOver(rows[1], dragData())
    fireEvent.drop(rows[1], dragData())
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('marks the hovered row as drop target while dragging', () => {
    const { container } = renderList(makeBlocks())
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    fireEvent.dragOver(rows[1], dragData())
    expect(rows[1].classList.contains('set-row-drop-target')).toBe(true)
    expect(rows[0].classList.contains('set-row-dragging')).toBe(true)
  })

  it('clears drag state on dragEnd', () => {
    const { container } = renderList(makeBlocks())
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    fireEvent.dragOver(rows[2], dragData())
    fireEvent.dragEnd(rows[0], dragData())
    expect(rows[2].classList.contains('set-row-drop-target')).toBe(false)
    expect(rows[0].classList.contains('set-row-dragging')).toBe(false)
  })
})

describe('SequencerTracklist drag-to-add and inter-row insert', () => {
  it('tags row drags with the tracklist row MIME type', () => {
    const setData = vi.fn()
    const { container } = renderList([makeBlock(10, 0)])
    const row = container.querySelector('tbody tr')!
    fireEvent.dragStart(row, {
      dataTransfer: { setData, effectAllowed: '', dropEffect: '' },
    })
    expect(setData).toHaveBeenCalledWith(TRACKLIST_ROW_MIME, '10')
  })

  it('inserts a browse track at the hovered row index', () => {
    const onAddCommitted = vi.fn()
    const onReorder = vi.fn()
    const { container } = renderList([makeBlock(10, 0), makeBlock(20, 1)], {
      onAddCommitted,
      onReorder,
    })
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.drop(rows[1], crossDragData(TRACK_DRAG_MIME, 99))
    expect(onAddCommitted).toHaveBeenCalledWith(99, 1)
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('promotes a pool row at the hovered row index', () => {
    const onPromote = vi.fn()
    const { container } = renderList([makeBlock(10, 0), makeBlock(20, 1)], {
      onPromote,
    })
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.drop(rows[0], crossDragData(POOL_ROW_MIME, 55))
    expect(onPromote).toHaveBeenCalledWith(55, 0)
  })

  it('appends a browse drop on the empty list container', () => {
    const onAddCommitted = vi.fn()
    const { container } = renderList([], { onAddCommitted })
    const panel = container.querySelector('.sq-list')!
    fireEvent.drop(panel, crossDragData(TRACK_DRAG_MIME, 42))
    expect(onAddCommitted).toHaveBeenCalledWith(42, 0)
  })

  it('appends a pool drop on the list container when not on a row', () => {
    const onPromote = vi.fn()
    const { container } = renderList([makeBlock(10, 0)], { onPromote })
    const panel = container.querySelector('.sq-list')!
    fireEvent.drop(panel, crossDragData(POOL_ROW_MIME, 77))
    expect(onPromote).toHaveBeenCalledWith(77, 1)
  })

  it('does not let a stale row-drag steal an external browse drop', () => {
    const onReorder = vi.fn()
    const onAddCommitted = vi.fn()
    const { container } = renderList([makeBlock(10, 0), makeBlock(20, 1)], {
      onReorder,
      onAddCommitted,
    })
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    expect(rows[0].classList.contains('set-row-dragging')).toBe(true)

    fireEvent.drop(rows[1], crossDragData(TRACK_DRAG_MIME, 99))

    expect(onReorder).not.toHaveBeenCalled()
    expect(onAddCommitted).toHaveBeenCalledWith(99, 1)
    expect(rows[0].classList.contains('set-row-dragging')).toBe(false)
  })

  it('ignores drops of its own row MIME type on the panel', () => {
    const onAddCommitted = vi.fn()
    const onPromote = vi.fn()
    const { container } = renderList([makeBlock(10, 0)], {
      onAddCommitted,
      onPromote,
    })
    const panel = container.querySelector('.sq-list')!
    fireEvent.drop(panel, crossDragData(TRACKLIST_ROW_MIME, 10))
    expect(onAddCommitted).not.toHaveBeenCalled()
    expect(onPromote).not.toHaveBeenCalled()
  })

  it('clears the dragging class when the tracklist blocks change', () => {
    const initial = [makeBlock(10, 0), makeBlock(20, 1)]
    const { container, rerender } = renderList(initial)
    const rows = container.querySelectorAll('tbody tr')
    fireEvent.dragStart(rows[0], dragData())
    expect(rows[0].classList.contains('set-row-dragging')).toBe(true)

    rerender(
      <SequencerTracklist
        blocks={[...initial, makeBlock(30, 2)]}
        overrides={{}}
        selectedTrackId={null}
        onSelect={noop}
        onBpmChange={noop}
        onNoteChange={noop}
        onReorder={noop}
        onAddCommitted={noop}
        onPromote={noop}
      />,
    )

    const nextRows = container.querySelectorAll('tbody tr')
    expect(nextRows[0].classList.contains('set-row-dragging')).toBe(false)
  })
})
