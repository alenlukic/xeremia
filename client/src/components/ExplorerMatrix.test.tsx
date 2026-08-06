import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ExplorerMatrix } from './ExplorerMatrix'
import { CELL_WIDTH_PX } from '../hooks/useExplorerMatrix'
import { CAMELOT_ROWS, MATRIX_COLS, colForBpm } from '../utils/harmonic'
import { TRACK_DRAG_MIME } from '../utils'
import type { PoolEntry, Track } from '../types'

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

function makeEntry(track: Track, position: number): PoolEntry {
  return {
    id: track.id,
    set_id: 1,
    track_id: track.id,
    insertion_order: position,
    highlight_color: null,
    track,
  }
}

function cellFor(camelot: string, bpm: number, count: number): HTMLElement {
  const row = CAMELOT_ROWS.indexOf(camelot)
  const col = colForBpm(bpm)
  return screen.getByLabelText(
    `${CAMELOT_ROWS[row]} bucket ${col + 1}, ${count} tracks`,
  )
}

function renderMatrix(pool: PoolEntry[], onDropTrack = vi.fn()) {
  const view = render(<ExplorerMatrix pool={pool} onDropTrack={onDropTrack} />)
  return { ...view, onDropTrack }
}

describe('ExplorerMatrix axes', () => {
  it('renders 24 literal Camelot rows and 26 BPM columns whatever the pool holds', () => {
    const { container } = renderMatrix([])

    const rowHeads = container.querySelectorAll('.xm-row-head')
    expect(Array.from(rowHeads).map((el) => el.textContent)).toEqual([
      ...CAMELOT_ROWS,
    ])
    expect(rowHeads).toHaveLength(24)
    expect(container.querySelectorAll('.xm-col-heads .xm-head')).toHaveLength(
      MATRIX_COLS,
    )
    expect(container.querySelectorAll('.xm-cell')).toHaveLength(
      24 * MATRIX_COLS,
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
  it('badges a populated cell and darkens it up to four tracks', () => {
    const pool = [1, 2, 3, 4, 5].map((id) =>
      makeEntry(makeTrack(id, '08A', 128), id),
    )
    const { container } = renderMatrix([
      ...pool,
      makeEntry(makeTrack(9, '05B', 128), 9),
    ])

    const crowded = cellFor('08A', 128, 5)
    expect(crowded.textContent).toBe('5')
    // Darkness caps at the fourth track.
    expect(crowded.className).toContain('xm-cell--n4')
    expect(cellFor('05B', 128, 1).className).toContain('xm-cell--n1')
    expect(container.querySelectorAll('.xm-cell--n2')).toHaveLength(0)
  })

  it('files a dropped track into its own cohort regardless of drop position', () => {
    const onDropTrack = vi.fn()
    const { container } = renderMatrix([], onDropTrack)

    const data = new Map([[TRACK_DRAG_MIME, '42']])
    fireEvent.drop(container.querySelector('.xm-body') as HTMLElement, {
      dataTransfer: {
        types: [TRACK_DRAG_MIME],
        getData: (k: string) => data.get(k) ?? '',
      },
    })

    expect(onDropTrack).toHaveBeenCalledWith(42)
  })

  it('ignores a drop without the track payload', () => {
    const onDropTrack = vi.fn()
    const { container } = renderMatrix([], onDropTrack)

    fireEvent.drop(container.querySelector('.xm-body') as HTMLElement, {
      dataTransfer: { types: [], getData: () => '' },
    })

    expect(onDropTrack).not.toHaveBeenCalled()
  })
})

describe('ExplorerMatrix selection', () => {
  it('paints relations and dims unrelated cells after a selection', () => {
    const pool = [
      makeEntry(makeTrack(1, '08A', 128), 1),
      makeEntry(makeTrack(2, '09A', 128), 2),
      makeEntry(makeTrack(3, '03B', 128), 3),
    ]
    renderMatrix(pool)

    fireEvent.click(cellFor('08A', 128, 1))

    const related = cellFor('09A', 128, 1)
    expect(related.className).not.toContain('xm-cell--dim')
    expect(related.style.backgroundColor).not.toBe('')
    expect(cellFor('03B', 128, 1).className).toContain('xm-cell--dim')
  })

  it('opens the inspector on the far side and closes it again', () => {
    const pool = [makeEntry(makeTrack(1, '08A', 95), 1)]
    renderMatrix(pool)

    fireEvent.click(cellFor('08A', 95, 1))

    // A low-BPM column sits in the left half, so the inspector opens right.
    expect(colForBpm(95)).toBeLessThan(MATRIX_COLS / 2)
    const inspector = screen.getByRole('dialog', { name: 'Cohort 08A' })
    expect(inspector.className).toContain('xm-inspector--right')
    expect(within(inspector).getByText(/Track 1/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Close inspector'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the inspector on the left for a high BPM column', () => {
    const pool = [makeEntry(makeTrack(1, '08A', 150), 1)]
    renderMatrix(pool)

    expect(colForBpm(150)).toBeGreaterThanOrEqual(MATRIX_COLS / 2)
    fireEvent.click(cellFor('08A', 150, 1))

    expect(
      screen.getByRole('dialog', { name: 'Cohort 08A' }).className,
    ).toContain('xm-inspector--left')
  })

  it('leaves the inspector closed for an empty cell and clears the selection', () => {
    renderMatrix([])

    const empty = screen.getByLabelText('01A bucket 1, 0 tracks')
    fireEvent.click(empty)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(empty).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByLabelText('01A bucket 1, 0 tracks')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

describe('ExplorerMatrix tooltip and legend', () => {
  it('shows the cohort card on hover and adds the relation after a selection', () => {
    const pool = [
      makeEntry(makeTrack(1, '08A', 128), 1),
      makeEntry(makeTrack(2, '09A', 128), 2),
    ]
    renderMatrix(pool)

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
    expect(relTip.querySelectorAll('.xm-tip-move')).toHaveLength(2)
  })

  it('shows no legend, keeping the row it used for the matrix', () => {
    renderMatrix([])

    expect(screen.queryByRole('button', { name: 'Legend' })).toBeNull()
    expect(screen.queryByLabelText('Harmony legend')).toBeNull()
  })
})
