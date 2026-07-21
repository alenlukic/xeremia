import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatchesPanel } from './MatchesPanel'
import type { TransitionMatch } from '../types'
import {
  testMatchesPanelTableProps,
  columnHeaderLabel,
} from '../test/tablePreferenceHelpers'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

function makeMatch(overrides: Partial<TransitionMatch> = {}): TransitionMatch {
  return {
    candidate_id: 1,
    title: 'Test Track',
    overall_score: 85,
    bucket: 'same_key',
    camelot_score: 0.9,
    bpm_score: 0.85,
    energy_score: 0.7,
    similarity_score: 0.8,
    freshness_score: 0.6,
    genre_similarity_score: 0.75,
    mood_continuity_score: 0.65,
    vocal_clash_score: 0.5,
    instrument_similarity_score: 0.55,
    ...overrides,
  }
}

const SCORE_HEADERS = [
  'SCORE',
  'Spectral',
  'Key',
  'BPM',
  'Genre',
  'Recency',
  'Energy (MIK)',
  'Mood',
  'Instruments',
  'Vocals',
]

const ALL_HEADERS = ['Actions', 'Track', ...SCORE_HEADERS, 'DETAILS']

function headerLabels(): string[] {
  return screen
    .getAllByRole('columnheader')
    .map((h) => columnHeaderLabel(h as HTMLElement))
}

const matchSource = {
  id: 1,
  title: 'On Deck',
  artist_names: ['A'],
  bpm: 128,
  key: 'C',
  camelot_code: '8B',
}

describe('MatchesPanel', () => {
  describe('column headers', () => {
    it('renders all column headers regardless of onAddToSet', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const headers = screen.getAllByRole('columnheader')
      expect(headers.map((h) => columnHeaderLabel(h as HTMLElement))).toEqual(
        ALL_HEADERS,
      )
    })

    it('renders same column headers when onAddToSet is provided', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
          {...testMatchesPanelTableProps}
        />,
      )
      const headers = screen.getAllByRole('columnheader')
      expect(headers.map((h) => columnHeaderLabel(h as HTMLElement))).toEqual(
        ALL_HEADERS,
      )
    })

    it('includes Track, SCORE, and score sub-columns', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const labels = headerLabels()
      expect(labels).toContain('Track')
      expect(labels).toContain('SCORE')
      expect(labels).toContain('DETAILS')
    })
  })

  describe('default column sizing', () => {
    it('score columns render at expected defaults (70px SCORE, 60px for most, 73px for energy/instruments)', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const headers = screen.getAllByRole('columnheader')
      const widths = headers.map((h) => (h as HTMLElement).style.width)
      expect(widths[0]).toBe('92px') // add_to_set
      expect(widths[2]).toBe('70px') // SCORE
      expect(widths[3]).toBe('60px') // Spectral
      expect(widths[4]).toBe('60px') // Key
      expect(widths[5]).toBe('60px') // BPM
      expect(widths[6]).toBe('60px') // Genre
      expect(widths[7]).toBe('60px') // Recency
      expect(widths[8]).toBe('73px') // Energy (MIK)
      expect(widths[9]).toBe('60px') // Mood
      expect(widths[10]).toBe('73px') // Instruments
      expect(widths[11]).toBe('60px') // Vocals
    })

    it('track column renders at its compact 260px default', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const headers = screen.getAllByRole('columnheader')
      expect((headers[1] as HTMLElement).style.width).toBe('260px')
    })

    it('add_to_set column is 92px and details column is 50px', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
          {...testMatchesPanelTableProps}
        />,
      )
      const headers = screen.getAllByRole('columnheader')
      expect((headers[0] as HTMLElement).style.width).toBe('92px') // add_to_set
      expect((headers[1] as HTMLElement).style.width).toBe('260px') // Track
      expect((headers[8] as HTMLElement).style.width).toBe('73px') // Energy (MIK)
      expect((headers[10] as HTMLElement).style.width).toBe('73px') // Instruments
      expect((headers[12] as HTMLElement).style.width).toBe('50px') // DETAILS
    })
  })

  describe('resize and reorder chrome', () => {
    it('renders a resize handle on Track and score headers', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
          {...testMatchesPanelTableProps}
        />,
      )
      const resizers = document.querySelectorAll('.col-resizer')
      expect(resizers.length).toBe(SCORE_HEADERS.length + 3) // add_to_set + Track + score columns + details

      const headers = document.querySelectorAll('.matches-table thead th')
      const trackTh = headers[1]
      expect(trackTh.querySelector('.col-resizer')).toBeTruthy()
    })

    it('renders draggable header content on all headers', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const draggables = document.querySelectorAll(
        '.th-content[draggable="true"]',
      )
      expect(draggables.length).toBeGreaterThanOrEqual(ALL_HEADERS.length - 1)
    })
  })

  describe('score formatting', () => {
    it('displays factor scores on 0-100 integer scale', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch({ overall_score: 85, similarity_score: 0.8 })]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const cells = document.querySelectorAll('.matches-table tbody td .mono')
      const values = Array.from(cells).map((c) => c.textContent)
      expect(values[0]).toBe('85') // overall_score (already 0-100)
      expect(values[1]).toBe('80') // similarity_score (0.8 * 100)
    })
  })

  describe('same/higher/lower toggles', () => {
    it('renders three persistent toggle filters, all on by default', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const toggles = document.querySelectorAll('.ds-toggle-filter')
      expect(toggles.length).toBe(3)
      expect(
        Array.from(toggles).map((t) => t.getAttribute('aria-pressed')),
      ).toEqual(['true', 'true', 'true'])
    })

    it('shows correct per-bucket counts', () => {
      const matches = [
        makeMatch({ candidate_id: 1, bucket: 'same_key' }),
        makeMatch({ candidate_id: 2, bucket: 'same_key' }),
        makeMatch({ candidate_id: 3, bucket: 'higher_key' }),
      ]
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={matches}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const counts = document.querySelectorAll('.ds-toggle-filter-count')
      expect(counts[0].textContent).toBe('2') // Same
      expect(counts[1].textContent).toBe('1') // Higher
      expect(counts[2].textContent).toBe('0') // Lower
    })

    it('shows all buckets in one table by default and hides a bucket when toggled off', async () => {
      const matches = [
        makeMatch({ candidate_id: 1, bucket: 'same_key' }),
        makeMatch({ candidate_id: 2, bucket: 'higher_key' }),
        makeMatch({ candidate_id: 3, bucket: 'higher_key' }),
      ]
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={matches}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      // All results live in the same table (no tabs): 1 same + 2 higher = 3.
      expect(document.querySelectorAll('.matches-table tbody tr').length).toBe(
        3,
      )

      // Toggling Higher off removes those rows, leaving only the same-key match.
      await userEvent.click(screen.getByRole('button', { name: /Higher/ }))
      expect(document.querySelectorAll('.matches-table tbody tr').length).toBe(
        1,
      )
    })
  })

  describe('design-system chrome', () => {
    it('renders Add sort and Add filter controls in the header', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      expect(
        screen.getByRole('button', { name: /add sort tier/i }),
      ).toBeInTheDocument()
      expect(screen.getByText('Add filter')).toBeInTheDocument()
    })

    it('tints score cells with an inline gradient background', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch({ overall_score: 90 })]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const scoreCell = document.querySelector(
        '.matches-table tbody td.ds-score-cell',
      ) as HTMLElement
      expect(scoreCell).toBeTruthy()
      expect(scoreCell.style.backgroundColor).not.toBe('')
      expect(scoreCell.style.backgroundImage).toContain(
        'repeating-linear-gradient',
      )
    })
  })

  describe('loading and empty states', () => {
    it('shows loading message when loading with no data', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[]}
          loading={true}
          {...testMatchesPanelTableProps}
        />,
      )
      expect(screen.getByText('Loading matches…')).toBeInTheDocument()
    })

    it('shows empty message when no matches pass the active filters', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      expect(
        screen.getByText('No matches for the active filters'),
      ).toBeInTheDocument()
    })

    it('shows placeholder when no track selected', () => {
      render(
        <MatchesPanel
          matchSource={null}
          matches={[]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      expect(
        screen.getByText('Select a track to see matches'),
      ).toBeInTheDocument()
    })

    it('dims rows during background reload', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={true}
          {...testMatchesPanelTableProps}
        />,
      )
      const row = document.querySelector(
        '.matches-table tbody tr',
      ) as HTMLElement
      expect(row.style.opacity).toBe('0.6')
    })
  })

  describe('match detail affordance', () => {
    it('renders a visible clickable track title for each match row', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[
            makeMatch({ title: 'Deep Blue' }),
            makeMatch({ candidate_id: 2, title: 'Red Sky' }),
          ]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const links = document.querySelectorAll('.match-track-link')
      expect(links.length).toBe(2)
      expect(links[0].textContent).toBe('Deep Blue')
      expect(links[1].textContent).toBe('Red Sky')
    })

    it('calls onViewDetail when detail icon button is clicked', async () => {
      const onViewDetail = vi.fn()
      const match = makeMatch({ title: 'Deep Blue' })
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[match]}
          loading={false}
          onViewDetail={onViewDetail}
          {...testMatchesPanelTableProps}
        />,
      )
      const detailBtns = document.querySelectorAll('.match-detail-btn')
      expect(detailBtns.length).toBe(1)
      await userEvent.click(detailBtns[0])
      expect(onViewDetail).toHaveBeenCalledWith(match)
    })

    it('has hover title and focus-accessible aria-label on each track link', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch({ title: 'Deep Blue' })]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const btns = document.querySelectorAll('.match-detail-btn')
      expect(btns.length).toBe(1)
      expect(btns[0].getAttribute('aria-label')).toBe(
        'View match detail for Deep Blue',
      )
    })

    it('track title click calls onUseAsSource, not onViewDetail', async () => {
      const onViewDetail = vi.fn()
      const onUseAsSource = vi.fn()
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch({ candidate_id: 7, title: 'Deep Blue' })]}
          loading={false}
          onViewDetail={onViewDetail}
          onUseAsSource={onUseAsSource}
          {...testMatchesPanelTableProps}
        />,
      )
      await userEvent.click(screen.getByText('Deep Blue'))
      expect(onUseAsSource).toHaveBeenCalledWith(7)
      expect(onViewDetail).not.toHaveBeenCalled()
    })
  })

  describe('use as source action', () => {
    it('track title acts as use-as-source trigger for each row', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch(), makeMatch({ candidate_id: 2 })]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      const links = screen.getAllByTitle('Use as source track')
      expect(links.length).toBe(2)
    })

    it('calls onUseAsSource with candidate_id when track title clicked', async () => {
      const onUseAsSource = vi.fn()
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch({ candidate_id: 42 })]}
          loading={false}
          onUseAsSource={onUseAsSource}
          {...testMatchesPanelTableProps}
        />,
      )
      await userEvent.click(screen.getByTitle('Use as source track'))
      expect(onUseAsSource).toHaveBeenCalledWith(42)
    })

    it('does not render a Use as source button in the actions column', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
          {...testMatchesPanelTableProps}
        />,
      )
      const actionsCells = document.querySelectorAll('.match-actions-cell')
      expect(actionsCells.length).toBe(1)
      expect(actionsCells[0].textContent).not.toContain('Use as source')
    })
  })

  describe('add to set action', () => {
    it('renders Add to Set button when onAddToSet is provided', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
          {...testMatchesPanelTableProps}
        />,
      )
      expect(screen.getByTitle('Add to set')).toBeInTheDocument()
    })

    it('does not render Add to set button when onAddToSet is not provided', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          {...testMatchesPanelTableProps}
        />,
      )
      expect(screen.queryByTitle('Add to set')).not.toBeInTheDocument()
      expect(document.querySelectorAll('.match-action-btn').length).toBe(0)
    })

    it('calls onAddToSet with candidate_id when clicked', async () => {
      const onAddToSet = vi.fn()
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch({ candidate_id: 99 })]}
          loading={false}
          onAddToSet={onAddToSet}
          {...testMatchesPanelTableProps}
        />,
      )
      await userEvent.click(screen.getByTitle('Add to set'))
      expect(onAddToSet).toHaveBeenCalledWith(99)
    })
  })

  describe('dual add-to-pool/tracklist actions', () => {
    it('renders dual buttons when onAddToPool and onAddToTracklist are provided', () => {
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch()]}
          loading={false}
          onAddToPool={vi.fn()}
          onAddToTracklist={vi.fn()}
          {...testMatchesPanelTableProps}
        />,
      )
      expect(screen.getByTitle('Add to Pool')).toBeInTheDocument()
      expect(screen.getByTitle('Add to Tracklist')).toBeInTheDocument()
    })

    it('calls onAddToPool with candidate_id when clicked', async () => {
      const onAddToPool = vi.fn()
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch({ candidate_id: 42 })]}
          loading={false}
          onAddToPool={onAddToPool}
          onAddToTracklist={vi.fn()}
          {...testMatchesPanelTableProps}
        />,
      )
      await userEvent.click(screen.getByTitle('Add to Pool'))
      expect(onAddToPool).toHaveBeenCalledWith(42)
    })

    it('calls onAddToTracklist with candidate_id when clicked', async () => {
      const onAddToTracklist = vi.fn()
      render(
        <MatchesPanel
          matchSource={matchSource}
          matches={[makeMatch({ candidate_id: 42 })]}
          loading={false}
          onAddToPool={vi.fn()}
          onAddToTracklist={onAddToTracklist}
          {...testMatchesPanelTableProps}
        />,
      )
      await userEvent.click(screen.getByTitle('Add to Tracklist'))
      expect(onAddToTracklist).toHaveBeenCalledWith(42)
    })
  })
})
