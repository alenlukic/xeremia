import { describe, it, expect, vi } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import { ExplorerMatrix } from './ExplorerMatrix'
import { CELL_WIDTH_PX } from '../hooks/useExplorerMatrix'
import {
  CAMELOT_ROWS,
  MATRIX_COLS,
  bucketLoBpm,
  colForBpm,
} from '../utils/harmonic'
import { POOL_ROW_MIME, TRACK_DRAG_MIME, TRACK_MULTI_MIME } from '../utils'
import { AudioPlayerContext } from '../hooks/useAudioPlayer'
import type { ExplorerCrate, ExplorerCrateMembership, Track } from '../types'

function makeTrack(id: number, camelot: string, bpm: number): Track {
  return {
    id,
    title: `Track ${id}`,
    artist_names: [`Artist ${id}`],
    bpm,
    key: 'C',
    camelot_code: camelot,
    genre: null,
    label: null,
    energy: null,
    date_added: null,
  }
}

function cellFor(camelot: string, bpm: number, count: number): HTMLElement {
  const row = CAMELOT_ROWS.indexOf(camelot)
  const col = colForBpm(bpm)
  return screen.getByLabelText(
    `bucket ${col + 1} ${CAMELOT_ROWS[row]}, ${count} tracks`,
  )
}

function renderMatrix(tracks: Track[]) {
  return render(<ExplorerMatrix tracks={tracks} />)
}

it('lights the grid for a track focused elsewhere in the workspace', () => {
  const tracks = [
    makeTrack(1, '08A', 128),
    makeTrack(2, '09A', 128),
    makeTrack(3, '03B', 128),
  ]
  const { rerender } = render(<ExplorerMatrix tracks={tracks} focus={null} />)

  // Nothing is lit until a tile elsewhere is selected.
  expect(cellFor('09A', 128, 1).className).not.toContain('xm-cell--dim')

  rerender(
    <ExplorerMatrix
      tracks={tracks}
      focus={{ camelot_code: '08A', bpm: 128 }}
    />,
  )

  // Same lighting as clicking that cell: relatives paint, the rest dim.
  const related = cellFor('09A', 128, 1)
  expect(related.className).not.toContain('xm-cell--dim')
  expect(related.style.backgroundColor).not.toBe('')
  expect(cellFor('03B', 128, 1).className).toContain('xm-cell--dim')

  // Clearing the focus puts the grid back.
  rerender(<ExplorerMatrix tracks={tracks} focus={null} />)
  expect(cellFor('03B', 128, 1).className).not.toContain('xm-cell--dim')
})

it('scrolls a focus-lit cohort into view, but not one clicked by hand', () => {
  const tracks = [makeTrack(1, '08A', 128), makeTrack(2, '03B', 128)]
  // jsdom has no layout and so no scrollIntoView; the component guards on it.
  const scrollIntoView = vi.fn()
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: scrollIntoView,
    configurable: true,
    writable: true,
  })
  try {
    const { rerender } = render(
      <ExplorerMatrix tracks={tracks} focus={null} />,
    )
    expect(scrollIntoView).not.toHaveBeenCalled()

    // A tile click in the Sequencer arrives here as a focus change.
    rerender(
      <ExplorerMatrix tracks={tracks} focus={{ camelot_code: '08A', bpm: 128 }} />,
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    // Clicking a cell already puts it under the pointer, so the grid stays put.
    scrollIntoView.mockClear()
    fireEvent.click(cellFor('03B', 128, 1))
    expect(scrollIntoView).not.toHaveBeenCalled()
  } finally {
    delete (Element.prototype as Partial<Element>).scrollIntoView
  }
})

describe('ExplorerMatrix axes', () => {
  it('renders 26 BPM rows and 24 literal Camelot columns whatever the library holds', () => {
    const { container } = renderMatrix([])

    expect(container.querySelectorAll('.xm-row-head')).toHaveLength(MATRIX_COLS)
    expect(container.querySelectorAll('.xm-col-heads .xm-head')).toHaveLength(
      24,
    )
    expect(container.querySelectorAll('.xm-cell')).toHaveLength(
      24 * MATRIX_COLS,
    )
  })

  it('puts Camelot codes in the column heads and BPM labels in the row heads', () => {
    const { container } = renderMatrix([])

    const colHeads = container.querySelectorAll('.xm-col-heads .xm-head')
    expect(Array.from(colHeads).map((el) => el.textContent)).toEqual([
      ...CAMELOT_ROWS,
    ])
    const rowHeads = container.querySelectorAll('.xm-row-head')
    expect(Array.from(rowHeads).map((el) => el.textContent)).toEqual(
      Array.from({ length: MATRIX_COLS }, (_, c) =>
        String(Math.round(bucketLoBpm(c))),
      ),
    )
  })

  it('ships the cell width as a developer constant with no user-facing control', () => {
    const { container } = renderMatrix([])

    expect(CELL_WIDTH_PX).toBeGreaterThanOrEqual(18)
    expect(CELL_WIDTH_PX).toBeLessThanOrEqual(34)
    const cell = container.querySelector('.xm-cell') as HTMLElement
    expect(cell.style.width).toBe(`${CELL_WIDTH_PX}px`)
    expect(screen.queryByLabelText(/cell width/i)).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
  })
})

describe('ExplorerMatrix cohorts', () => {
  it('buckets every library track and darkens a cell up to four tracks', () => {
    const crowd = [1, 2, 3, 4, 5].map((id) => makeTrack(id, '08A', 128))
    const { container } = renderMatrix([...crowd, makeTrack(9, '05B', 128)])

    const crowded = cellFor('08A', 128, 5)
    expect(crowded.textContent).toBe('5')
    // Darkness caps at the fourth track.
    expect(crowded.className).toContain('xm-cell--n4')
    expect(cellFor('05B', 128, 1).className).toContain('xm-cell--n1')
    expect(container.querySelectorAll('.xm-cell--n2')).toHaveLength(0)
  })

  it('says the library is empty when there are no tracks at all', () => {
    renderMatrix([])

    expect(screen.getByText(/No tracks in the library/)).toBeInTheDocument()
  })
})

describe('ExplorerMatrix selection', () => {
  it('paints relations and dims unrelated cells after a selection', () => {
    const tracks = [
      makeTrack(1, '08A', 128),
      makeTrack(2, '09A', 128),
      makeTrack(3, '03B', 128),
    ]
    renderMatrix(tracks)

    fireEvent.click(cellFor('08A', 128, 1))

    const related = cellFor('09A', 128, 1)
    expect(related.className).not.toContain('xm-cell--dim')
    expect(related.style.backgroundColor).not.toBe('')
    expect(cellFor('03B', 128, 1).className).toContain('xm-cell--dim')
  })

  it('opens the inspector on the far side and closes it again', () => {
    renderMatrix([makeTrack(1, '03A', 128)])

    fireEvent.click(cellFor('03A', 128, 1))

    // A low Camelot column sits in the left half, so the inspector opens right.
    expect(CAMELOT_ROWS.indexOf('03A')).toBeLessThan(CAMELOT_ROWS.length / 2)
    const inspector = screen.getByRole('dialog', { name: 'Cohort 03A' })
    expect(inspector.className).toContain('xm-inspector--right')
    expect(within(inspector).getByText(/Track 1/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Close inspector'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('removes the duplicate card metadata while retaining the track title', () => {
    renderMatrix([
      {
        ...makeTrack(1, '06A', 138),
        title: '[06A - Gm - 138.00] OceanLab – Breaking Ties',
      },
    ])

    fireEvent.click(cellFor('06A', 138, 1))

    const inspector = screen.getByRole('dialog', { name: 'Cohort 06A' })
    expect(
      within(inspector).getByText(
        '[06A - Gm - 138.00] OceanLab – Breaking Ties',
      ),
    ).toBeInTheDocument()
    expect(within(inspector).queryByText('[06A · 138]')).toBeNull()
  })

  it('opens the inspector on whichever side of the widget has more room', () => {
    // jsdom reports a zero rect, so the widget reads as hugging the left edge
    // and the whole viewport is free to its right.
    renderMatrix([makeTrack(1, '10B', 128)])
    fireEvent.click(cellFor('10B', 128, 1))

    expect(
      screen.getByRole('dialog', { name: 'Cohort 10B' }).className,
    ).toContain('xm-inspector--right')
  })

  it('flips the inspector left when the widget sits against the right edge', () => {
    const rect = {
      left: 800,
      right: 1000,
      top: 40,
      bottom: 500,
      width: 200,
      height: 460,
      x: 800,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(rect)
    try {
      renderMatrix([makeTrack(1, '10B', 128)])
      fireEvent.click(cellFor('10B', 128, 1))

      expect(
        screen.getByRole('dialog', { name: 'Cohort 10B' }).className,
      ).toContain('xm-inspector--left')
    } finally {
      spy.mockRestore()
    }
  })

  it('leaves the inspector closed for an empty cell and clears the selection', () => {
    renderMatrix([makeTrack(1, '08A', 128)])

    const empty = screen.getByLabelText('bucket 1 01A, 0 tracks')
    fireEvent.click(empty)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(empty).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByLabelText('bucket 1 01A, 0 tracks')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

describe('ExplorerMatrix tooltip and legend', () => {
  it('shows the cohort card on hover and adds the relation after a selection', () => {
    const tracks = [makeTrack(1, '08A', 128), makeTrack(2, '09A', 128)]
    renderMatrix(tracks)

    fireEvent.mouseEnter(cellFor('09A', 128, 1))
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain('09A')
    expect(tip.textContent).toContain('BPM')
    expect(tip.textContent).toContain('1 track in cohort')
    expect(tip.textContent).not.toContain('meet ≈')

    fireEvent.mouseLeave(cellFor('09A', 128, 1))
    fireEvent.click(cellFor('08A', 128, 1))
    fireEvent.mouseEnter(cellFor('09A', 128, 1))

    const relTip = screen.getByRole('tooltip')
    expect(relTip.textContent).toContain('meet ≈')
    // The meet row is the last thing on the card; the pitch-move rows are gone.
    expect(relTip.querySelectorAll('.xm-tip-move')).toHaveLength(0)
    expect(relTip.textContent).not.toContain('plays as-is')
  })

  it('shows no legend, keeping the row it used for the matrix', () => {
    renderMatrix([])

    expect(screen.queryByRole('button', { name: 'Legend' })).toBeNull()
    expect(screen.queryByLabelText('Harmony legend')).toBeNull()
  })
})

describe('ExplorerMatrix crates', () => {
  function makeCrate(id: number, name: string): ExplorerCrate {
    return { id, name, display_order: id }
  }

  function makeMembership(
    id: number,
    crateId: number,
    trackId: number,
  ): ExplorerCrateMembership {
    return { id, crate_id: crateId, track_id: trackId }
  }

  const tracks = [makeTrack(1, '08A', 128), makeTrack(2, '03B', 128)]

  function renderWithCrates({
    crates = [makeCrate(1, 'Warmup')],
    crateMemberships = [] as ExplorerCrateMembership[],
    library = tracks,
    ...handlers
  }: {
    crates?: ExplorerCrate[]
    crateMemberships?: ExplorerCrateMembership[]
    library?: Track[]
    onCreateCrate?: (name: string) => Promise<ExplorerCrate | null>
    onRenameCrate?: (crateId: number, name: string) => void
    onDeleteCrate?: (crateId: number) => void
    onAddTrackToCrate?: (crateId: number, trackId: number) => void
    onRemoveFromCrate?: (crateId: number, trackId: number) => void
  } = {}) {
    return render(
      <ExplorerMatrix
        tracks={library}
        crates={crates}
        crateMemberships={crateMemberships}
        {...handlers}
      />,
    )
  }

  function dragPayload(mime: string, trackId: number) {
    return {
      dataTransfer: {
        types: [mime],
        getData: (k: string) => (k === mime ? String(trackId) : ''),
      },
    }
  }

  it('hides the crate bar when the workspace passes no crate data', () => {
    renderMatrix(tracks)

    expect(screen.queryByRole('tablist', { name: 'Crates' })).toBeNull()
  })

  it('shows the immutable All crate active by default with a pill per crate', () => {
    renderWithCrates({ crates: [makeCrate(1, 'Warmup'), makeCrate(2, 'Peak')] })

    const bar = screen.getByRole('tablist', { name: 'Crates' })
    const all = within(bar).getByRole('tab', { name: 'All' })
    expect(all).toHaveAttribute('aria-selected', 'true')
    expect(
      within(bar).getByRole('tab', { name: 'Crate Warmup' }),
    ).toBeInTheDocument()
    expect(
      within(bar).getByRole('tab', { name: 'Crate Peak' }),
    ).toBeInTheDocument()
    // The global crate is immutable: no rename or delete while it is active.
    expect(screen.queryByRole('button', { name: /Rename crate/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete crate/ })).toBeNull()
  })

  it('filters the cohorts to the active crate and back', () => {
    renderWithCrates({ crateMemberships: [makeMembership(1, 1, 1)] })

    // Global crate: both cohorts populated.
    expect(cellFor('08A', 128, 1)).toBeInTheDocument()
    expect(cellFor('03B', 128, 1)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Crate Warmup' }))
    // Only the member track remains; the other cohort empties.
    expect(cellFor('08A', 128, 1)).toBeInTheDocument()
    expect(cellFor('03B', 128, 0)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(cellFor('03B', 128, 1)).toBeInTheDocument()
  })

  it('starts a custom crate empty and says how to fill it', () => {
    renderWithCrates()

    fireEvent.click(screen.getByRole('tab', { name: 'Crate Warmup' }))

    expect(screen.getByText(/Crate is empty/)).toBeInTheDocument()
    expect(cellFor('08A', 128, 0)).toBeInTheDocument()
  })

  it('creates a crate from the + affordance and activates it', async () => {
    const created = makeCrate(7, 'Closers')
    const onCreateCrate = vi.fn().mockResolvedValue(created)
    const { rerender } = renderWithCrates({
      crates: [],
      onCreateCrate,
    })

    fireEvent.click(screen.getByRole('button', { name: 'New crate' }))
    const input = screen.getByLabelText('New crate name')
    fireEvent.change(input, { target: { value: '  Closers  ' } })
    fireEvent.blur(input)

    await waitFor(() => expect(onCreateCrate).toHaveBeenCalledWith('Closers'))

    rerender(
      <ExplorerMatrix
        tracks={tracks}
        crates={[created]}
        crateMemberships={[]}
        onCreateCrate={onCreateCrate}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Crate Closers' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('does not create a crate from a blank name', async () => {
    const onCreateCrate = vi.fn()
    renderWithCrates({ crates: [], onCreateCrate })

    fireEvent.click(screen.getByRole('button', { name: 'New crate' }))
    const input = screen.getByLabelText('New crate name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(screen.queryByLabelText('New crate name')).toBeNull(),
    )
    expect(onCreateCrate).not.toHaveBeenCalled()
  })

  it('renames the active crate inline', () => {
    const onRenameCrate = vi.fn()
    renderWithCrates({ onRenameCrate })

    fireEvent.click(screen.getByRole('tab', { name: 'Crate Warmup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename crate Warmup' }))

    const input = screen.getByLabelText('Rename crate Warmup')
    expect(input).toHaveValue('Warmup')
    fireEvent.change(input, { target: { value: 'Openers' } })
    fireEvent.blur(input)

    expect(onRenameCrate).toHaveBeenCalledWith(1, 'Openers')
  })

  it('deletes the active crate after confirmation and falls back to All', () => {
    const onDeleteCrate = vi.fn()
    renderWithCrates({ onDeleteCrate })

    fireEvent.click(screen.getByRole('tab', { name: 'Crate Warmup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete crate Warmup' }))
    expect(screen.getByText('Delete crate?')).toBeInTheDocument()
    expect(onDeleteCrate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('Confirm crate delete'))

    expect(onDeleteCrate).toHaveBeenCalledWith(1)
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('changes nothing when the crate delete is cancelled', () => {
    const onDeleteCrate = vi.fn()
    renderWithCrates({ onDeleteCrate })

    fireEvent.click(screen.getByRole('tab', { name: 'Crate Warmup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete crate Warmup' }))
    fireEvent.click(screen.getByLabelText('Cancel crate delete'))

    expect(onDeleteCrate).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Crate Warmup' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('files a pool-row drag dropped on a crate pill', () => {
    const onAddTrackToCrate = vi.fn()
    renderWithCrates({ onAddTrackToCrate })

    fireEvent.drop(
      screen.getByRole('tab', { name: 'Crate Warmup' }),
      dragPayload(POOL_ROW_MIME, 2),
    )

    expect(onAddTrackToCrate).toHaveBeenCalledWith(1, 2)
  })

  it('accepts browse drags on a crate pill too', () => {
    const onAddTrackToCrate = vi.fn()
    renderWithCrates({ onAddTrackToCrate })

    fireEvent.drop(
      screen.getByRole('tab', { name: 'Crate Warmup' }),
      dragPayload(TRACK_DRAG_MIME, 42),
    )

    expect(onAddTrackToCrate).toHaveBeenCalledWith(1, 42)
  })

  it('files every track of a multi-track drag onto a crate pill', async () => {
    const onAddTrackToCrate = vi.fn()
    renderWithCrates({ onAddTrackToCrate })

    fireEvent.drop(screen.getByRole('tab', { name: 'Crate Warmup' }), {
      dataTransfer: {
        types: [POOL_ROW_MIME, TRACK_MULTI_MIME],
        getData: (k: string) =>
          k === TRACK_MULTI_MIME ? '[2,3]' : k === POOL_ROW_MIME ? '2' : '',
      },
    })

    // One at a time, in the dragged order: each add reloads the crate.
    await waitFor(() =>
      expect(onAddTrackToCrate.mock.calls).toEqual([
        [1, 2],
        [1, 3],
      ]),
    )
  })

  // The pill is an 18px target for a drag coming from another widget, so the
  // grid showing the crate accepts the drop too.
  it('drops the hover tooltip once the cohort is expanded', () => {
    renderMatrix(tracks)
    const cell = cellFor('08A', 128, 1)

    fireEvent.mouseEnter(cell)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    // The expanded panel lists the same cohort in full, so the tooltip is
    // only covering the grid it was summoned from.
    fireEvent.click(cell)
    expect(screen.queryByRole('tooltip')).toBeNull()

    // Neighbours keep theirs: that is what reads the relation against the
    // cohort now expanded.
    fireEvent.mouseLeave(cell)
    fireEvent.mouseEnter(cellFor('03B', 128, 1))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('files a drop anywhere on the grid into the crate on screen', () => {
    const onAddTrackToCrate = vi.fn()
    const { container } = renderWithCrates({ onAddTrackToCrate })
    fireEvent.click(screen.getByRole('tab', { name: 'Crate Warmup' }))

    const body = container.querySelector('.xm-body')!
    fireEvent.drop(body, dragPayload(TRACK_DRAG_MIME, 42))

    expect(onAddTrackToCrate).toHaveBeenCalledWith(1, 42)
  })

  it('takes no grid drop while the global crate is showing', () => {
    const onAddTrackToCrate = vi.fn()
    const { container } = renderWithCrates({ onAddTrackToCrate })

    const body = container.querySelector('.xm-body')!
    fireEvent.dragOver(body, dragPayload(TRACK_DRAG_MIME, 42))
    expect(body.classList.contains('xm-body--drop')).toBe(false)

    fireEvent.drop(body, dragPayload(TRACK_DRAG_MIME, 42))
    expect(onAddTrackToCrate).not.toHaveBeenCalled()
  })

  it('never files drops into the immutable All pill', () => {
    const onAddTrackToCrate = vi.fn()
    renderWithCrates({ onAddTrackToCrate })

    fireEvent.drop(
      screen.getByRole('tab', { name: 'All' }),
      dragPayload(TRACK_DRAG_MIME, 42),
    )

    expect(onAddTrackToCrate).not.toHaveBeenCalled()
  })

  it('adds a track to a crate through the inspector menu on the global crate', () => {
    const onAddTrackToCrate = vi.fn()
    renderWithCrates({
      crates: [makeCrate(1, 'Warmup'), makeCrate(2, 'Peak')],
      onAddTrackToCrate,
    })

    fireEvent.click(cellFor('08A', 128, 1))
    const inspector = screen.getByRole('dialog', { name: 'Cohort 08A' })
    fireEvent.click(
      within(inspector).getByRole('button', { name: 'Add Track 1 to a crate' }),
    )
    // The crate menu floats at <body> so the inspector's scroller cannot clip it.
    const menu = screen.getByRole('menu', { name: 'Crates for Track 1' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Peak' }))

    expect(onAddTrackToCrate).toHaveBeenCalledWith(2, 1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('removes a track from the active crate through the inspector', () => {
    const onRemoveFromCrate = vi.fn()
    renderWithCrates({
      crateMemberships: [makeMembership(1, 1, 1)],
      onRemoveFromCrate,
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Crate Warmup' }))
    fireEvent.click(cellFor('08A', 128, 1))

    const inspector = screen.getByRole('dialog', { name: 'Cohort 08A' })
    // The crate view offers remove, never the add-to-crate menu.
    expect(
      within(inspector).queryByRole('button', {
        name: 'Add Track 1 to a crate',
      }),
    ).toBeNull()
    fireEvent.click(
      within(inspector).getByRole('button', {
        name: 'Remove Track 1 from crate',
      }),
    )

    expect(onRemoveFromCrate).toHaveBeenCalledWith(1, 1)
  })
})

describe('ExplorerMatrix cohort inspector', () => {
  const tracks = [
    { ...makeTrack(1, '08A', 128), title: 'Aurora Skies' },
    { ...makeTrack(2, '08A', 128), title: 'Midnight Drive' },
  ]

  function openCohort() {
    render(<ExplorerMatrix tracks={tracks} />)
    fireEvent.click(cellFor('08A', 128, 2))
    return screen.getByRole('dialog', { name: 'Cohort 08A' })
  }

  it('clears the whole cohort selection on Escape, not just the panel', () => {
    openCohort()
    // Focus deliberately elsewhere: the handler is bound to the window, so the
    // cohort still closes.
    ;(document.body as HTMLElement).focus()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Cohort 08A' })).toBeNull()
    // The lit cell goes too, so the grid is back to neutral.
    expect(cellFor('08A', 128, 2)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull()
  })

  it('clears a selection on Escape after the panel was dismissed with ×', () => {
    openCohort()
    fireEvent.click(screen.getByLabelText('Close inspector'))
    // Dismissing the panel keeps the cell lit for reading relations off it.
    expect(cellFor('08A', 128, 2)).toHaveAttribute('aria-pressed', 'true')

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(cellFor('08A', 128, 2)).toHaveAttribute('aria-pressed', 'false')
  })

  it('clears an empty cell selection on Escape, which never opened a panel', () => {
    render(<ExplorerMatrix tracks={tracks} />)
    const empty = screen.getByLabelText('bucket 1 01A, 0 tracks')
    fireEvent.click(empty)
    expect(empty).toHaveAttribute('aria-pressed', 'true')

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByLabelText('bucket 1 01A, 0 tracks')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('keeps Escape scoped to the inner layer while one is open', () => {
    openCohort()
    fireEvent.click(screen.getByRole('button', { name: 'Filter cohort' }))

    // First Escape closes the filter and leaves the cohort up.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Cohort 08A' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Cohort 08A' })).toBeNull()
  })

  it('filters the cohort from the search affordance and restores it on close', () => {
    openCohort()
    expect(screen.getByText('Aurora Skies')).toBeInTheDocument()
    expect(screen.getByText('Midnight Drive')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filter cohort' }))
    // The search bar takes the title's place rather than adding a row.
    expect(screen.queryByText(/128\.0/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Filter cohort 08A'), {
      target: { value: 'midnight' },
    })
    expect(screen.queryByText('Aurora Skies')).toBeNull()
    expect(screen.getByText('Midnight Drive')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close filter' }))
    expect(screen.getByText('Aurora Skies')).toBeInTheDocument()
  })

  it('gives every cohort card a preview control that holds its place', () => {
    const dialog = openCohort()
    const card = within(dialog)
      .getByText('Aurora Skies')
      .closest('.xm-track-card') as HTMLElement

    // Rendered up front rather than injected on hover, so revealing it cannot
    // reflow the title next to it.
    const play = within(card).getByLabelText('Play Aurora Skies')
    expect(play).toBeInTheDocument()
    expect(play).toHaveClass('xm-card-play')
    // The preview sits before the title, matching the tables' Pre. column.
    expect(play.compareDocumentPosition(card)).toBe(
      Node.DOCUMENT_POSITION_CONTAINS + Node.DOCUMENT_POSITION_PRECEDING,
    )
  })

  it('previews the card track and shows pause while it plays', () => {
    const togglePlayPause = vi.fn()
    const ctx = {
      track: null as { id: number } | null,
      playing: false,
      loading: false,
      togglePlayPause,
    }
    const { rerender } = render(
      <AudioPlayerContext.Provider
        value={ctx as unknown as React.ContextType<typeof AudioPlayerContext>}
      >
        <ExplorerMatrix tracks={tracks} />
      </AudioPlayerContext.Provider>,
    )
    fireEvent.click(cellFor('08A', 128, 2))

    fireEvent.click(screen.getByLabelText('Play Aurora Skies'))
    expect(togglePlayPause).toHaveBeenCalledWith(1, 'Aurora Skies')

    // Once that track is the one playing, the same control becomes Pause.
    rerender(
      <AudioPlayerContext.Provider
        value={
          {
            ...ctx,
            track: { id: 1 },
            playing: true,
          } as unknown as React.ContextType<typeof AudioPlayerContext>
        }
      >
        <ExplorerMatrix tracks={tracks} />
      </AudioPlayerContext.Provider>,
    )
    const pause = screen.getByLabelText('Pause')
    expect(pause).toHaveClass('play-btn--playing')
    expect(screen.queryByLabelText('Play Aurora Skies')).toBeNull()
  })

  it('reports when a filter matches nothing', () => {
    openCohort()
    fireEvent.click(screen.getByRole('button', { name: 'Filter cohort' }))
    fireEvent.change(screen.getByLabelText('Filter cohort 08A'), {
      target: { value: 'nothing here' },
    })

    expect(screen.getByText('No tracks match.')).toBeInTheDocument()
  })

  it('offers other crates while showing a crate cohort, but not the crate itself', () => {
    const onAddTrackToCrate = vi.fn()
    render(
      <ExplorerMatrix
        tracks={tracks}
        crates={[
          { id: 1, name: 'Warmup', display_order: 1 },
          { id: 2, name: 'Closers', display_order: 2 },
        ]}
        crateMemberships={[
          { id: 1, crate_id: 1, track_id: 1 },
          { id: 2, crate_id: 1, track_id: 2 },
        ]}
        onAddTrackToCrate={onAddTrackToCrate}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Crate Warmup' }))
    fireEvent.click(cellFor('08A', 128, 2))

    fireEvent.click(
      screen.getByRole('button', { name: 'Add Aurora Skies to a crate' }),
    )
    // Filing into the crate already on screen would be a no-op, so it is gone.
    expect(screen.queryByRole('menuitem', { name: 'Warmup' })).toBeNull()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Closers' }))
    expect(onAddTrackToCrate).toHaveBeenCalledWith(2, 1)
  })

  it('toggles a track crate menu open and shut from its own + button', () => {
    render(
      <ExplorerMatrix
        tracks={tracks}
        crates={[{ id: 2, name: 'Closers', display_order: 2 }]}
        crateMemberships={[]}
        onAddTrackToCrate={vi.fn()}
      />,
    )
    fireEvent.click(cellFor('08A', 128, 2))
    const plus = screen.getByRole('button', {
      name: 'Add Aurora Skies to a crate',
    })

    fireEvent.click(plus)
    expect(screen.getByRole('menuitem', { name: 'Closers' })).toBeInTheDocument()

    // A mousedown on the trigger must not dismiss before the click toggles, or
    // the button would silently reopen the menu it just closed.
    fireEvent.mouseDown(plus)
    fireEvent.click(plus)
    expect(screen.queryByRole('menuitem', { name: 'Closers' })).toBeNull()
  })
})
