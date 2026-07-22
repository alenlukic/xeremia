import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  render,
  screen,
  act,
  waitFor,
  within,
  fireEvent,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import type { Track, TransitionMatch } from './types'
import { useCollectionCache } from './hooks/useCollectionCache'

vi.mock('./hooks/useCollectionCache', () => ({
  useCollectionCache: vi.fn().mockReturnValue({
    allTracks: [],
    traitMap: new Map(),
    loading: false,
    tracksError: null,
    traitsError: null,
  }),
}))

vi.mock('./api/http', () => ({
  fetchTracks: vi.fn().mockResolvedValue([]),
  fetchTrackTraits: vi.fn().mockResolvedValue([]),
  searchTracks: vi.fn().mockResolvedValue([]),
  fetchCacheStats: vi.fn().mockResolvedValue({
    used: 0,
    capacity: 100,
    usage_ratio: 0,
    hits: 0,
    misses: 0,
    hit_rate: 0,
    hit_rate_numerator: 0,
    hit_rate_denominator: 0,
    hit_rate_basis: 'n/a',
    key_distribution: [],
    bpm_distribution: [],
    recent_entries: [],
    recent_exits: [],
  }),
  fetchWeights: vi.fn().mockResolvedValue({
    raw_weights: {},
    effective_weights: {},
    raw_sum: 1,
    target_sum: 1,
    is_sum_valid: true,
    message: null,
  }),
  fetchDefaultWeights: vi.fn().mockResolvedValue({}),
  fetchMatches: vi.fn().mockResolvedValue([]),
  fetchMatchDetail: vi.fn().mockResolvedValue({}),
  updateWeights: vi.fn().mockResolvedValue({}),
  fetchTransitionScores: vi.fn().mockResolvedValue({ scores: [] }),
  exportSetM3u8: vi.fn().mockResolvedValue({ content: '', filename: '' }),
  fetchSets: vi.fn().mockResolvedValue([]),
  createSet: vi.fn().mockResolvedValue({
    id: 1,
    name: 'Test',
    created_at: '',
    updated_at: '',
    pool_count: 0,
    tracklist_count: 0,
  }),
  fetchHydratedSet: vi.fn().mockResolvedValue({
    set: {
      id: 1,
      name: 'Test',
      created_at: '',
      updated_at: '',
      pool_count: 0,
      tracklist_count: 0,
    },
    pool: [],
    tracklist: [],
    explorer_nodes: [],
    explorer_edges: [],
  }),
  deleteSet: vi.fn().mockResolvedValue(undefined),
  poolAdd: vi.fn().mockResolvedValue(undefined),
  poolRemove: vi.fn().mockResolvedValue(undefined),
  poolReorder: vi.fn().mockResolvedValue(undefined),
  poolMoveToTracklist: vi.fn().mockResolvedValue(undefined),
  tracklistAdd: vi.fn().mockResolvedValue(undefined),
  tracklistRemove: vi.fn().mockResolvedValue(undefined),
  tracklistReorder: vi.fn().mockResolvedValue(undefined),
  tracklistMoveToPool: vi.fn().mockResolvedValue(undefined),
  explorerAddNode: vi
    .fn()
    .mockResolvedValue({ ok: true, node_id: 'n1', track_id: 1, level: 0 }),
  explorerDeleteNode: vi.fn().mockResolvedValue(undefined),
  explorerSwap: vi.fn().mockResolvedValue(undefined),
  explorerNodeToTracklist: vi.fn().mockResolvedValue(undefined),
  explorerEdgeScores: vi.fn().mockResolvedValue({ scores: [] }),
  fetchTablePreferences: vi.fn().mockResolvedValue({ preferences: [] }),
  updateTablePreferences: vi.fn().mockResolvedValue({
    table_id: 'search',
    column_order: ['title'],
    column_visibility: { title: true },
    column_widths: { title: 220 },
  }),
  updateSet: vi.fn().mockResolvedValue({}),
}))

function makeTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => {
    const id = i + 1
    return {
      id,
      title: `Track ${id}`,
      artist_names: [`Artist ${id}`],
      bpm: id <= count / 2 ? 120 : 130,
      key: 'C',
      camelot_code: id <= count / 2 ? '01A' : '02A',
      genre: 'Electronic',
      label: 'Label',
      energy: 0.5,
      date_added: new Date(
        Date.UTC(2026, 0, 1) + id * 86_400_000,
      ).toISOString(),
    }
  })
}

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  localStorage.clear()
  vi.mocked(useCollectionCache).mockReturnValue({
    allTracks: makeTracks(600),
    traitMap: new Map(),
    loading: false,
    tracksError: null,
    traitsError: null,
  })
})

function getRowCount(): number {
  return document.querySelectorAll('.track-table tbody tr').length
}

// The browse table is always visible in the top region; rendering the app is
// all it takes. Kept as a helper so browse-centric tests read naturally.
async function openBrowseTab() {
  await act(async () => {
    render(<App />)
  })
}

async function openAdminOverlay() {
  await act(async () => {
    screen.getByRole('button', { name: 'Admin' }).click()
  })
}

async function openKeyFilterPopover() {
  await act(async () => {
    screen.getByRole('button', { name: /Add filter/ }).click()
  })
  await act(async () => {
    screen.getByRole('menuitem', { name: 'Key' }).click()
  })
}

async function openBpmFilterPopover() {
  await act(async () => {
    screen.getByRole('button', { name: /Add filter/ }).click()
  })
  await act(async () => {
    screen.getByRole('menuitem', { name: 'BPM' }).click()
  })
}

// Filters are staged in the popover and only applied to the search when it
// closes, so tests close the popover (Escape) to commit their edits.
async function closeFilterPopover() {
  await act(async () => {
    fireEvent.keyDown(document, { key: 'Escape' })
  })
}

describe('Reset Weights', () => {
  it('renders a Reset Weights button in the Admin overlay', async () => {
    const httpMod = await import('./api/http')
    vi.mocked(httpMod.fetchWeights).mockResolvedValue({
      raw_weights: { BPM: 50, CAMELOT: 50 },
      effective_weights: { BPM: 50, CAMELOT: 50 },
      raw_sum: 100,
      target_sum: 100,
      is_sum_valid: true,
      message: null,
    })

    await act(async () => {
      render(<App />)
    })
    await openAdminOverlay()

    expect(
      screen.getByRole('button', { name: 'Reset Weights' }),
    ).toBeInTheDocument()
  })

  it('calls fetchDefaultWeights and persists via debounced updateWeights on click', async () => {
    vi.useFakeTimers()
    const httpMod = await import('./api/http')
    const defaults = { BPM: 10, CAMELOT: 90 }
    vi.mocked(httpMod.fetchWeights).mockResolvedValue({
      raw_weights: { BPM: 50, CAMELOT: 50 },
      effective_weights: { BPM: 50, CAMELOT: 50 },
      raw_sum: 100,
      target_sum: 100,
      is_sum_valid: true,
      message: null,
    })
    vi.mocked(httpMod.fetchDefaultWeights).mockResolvedValue(defaults)
    vi.mocked(httpMod.updateWeights).mockResolvedValue({
      raw_weights: defaults,
      effective_weights: defaults,
      raw_sum: 100,
      target_sum: 100,
      is_sum_valid: true,
      message: null,
    })

    await act(async () => {
      render(<App />)
    })
    await openAdminOverlay()

    await act(async () => {
      screen.getByRole('button', { name: 'Reset Weights' }).click()
    })

    expect(httpMod.fetchDefaultWeights).toHaveBeenCalled()
    expect(httpMod.updateWeights).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(httpMod.updateWeights).toHaveBeenCalledWith(defaults)

    vi.useRealTimers()
  })

  it('shows "Saving…" immediately when weights change', async () => {
    vi.useFakeTimers()
    try {
      const httpMod = await import('./api/http')
      vi.mocked(httpMod.fetchWeights).mockResolvedValue({
        raw_weights: { BPM: 50, CAMELOT: 50 },
        effective_weights: { BPM: 50, CAMELOT: 50 },
        raw_sum: 100,
        target_sum: 100,
        is_sum_valid: true,
        message: null,
      })
      vi.mocked(httpMod.fetchDefaultWeights).mockResolvedValue({
        BPM: 10,
        CAMELOT: 90,
      })
      vi.mocked(httpMod.updateWeights).mockReturnValue(new Promise(() => {}))

      await act(async () => {
        render(<App />)
      })
      await openAdminOverlay()

      await act(async () => {
        screen.getByRole('button', { name: 'Reset Weights' }).click()
      })

      expect(screen.getByText('Saving…')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Quadrant collapse', () => {
  it('renders dividers with collapse buttons for both axes when split', async () => {
    await openBrowseTab()
    expect(screen.getByLabelText('Collapse track browser')).toBeInTheDocument()
    expect(screen.getByLabelText('Collapse matches')).toBeInTheDocument()
    expect(screen.getByLabelText('Collapse top panels')).toBeInTheDocument()
    expect(screen.getByLabelText('Collapse bottom panels')).toBeInTheDocument()
  })

  it('collapsing the browser hides it behind an expand bar', async () => {
    await openBrowseTab()
    await act(async () => {
      screen.getByLabelText('Collapse track browser').click()
    })

    expect(document.querySelector('.browse-quadrant')).not.toBeVisible()
    expect(screen.getByLabelText('Expand track browser')).toBeInTheDocument()

    await act(async () => {
      screen.getByLabelText('Expand track browser').click()
    })
    expect(document.querySelector('.browse-quadrant')).toBeVisible()
  })

  it('collapsing the matches quadrant hides it behind an expand bar', async () => {
    await openBrowseTab()
    await act(async () => {
      screen.getByLabelText('Collapse matches').click()
    })

    expect(document.querySelector('.matches-quadrant')).not.toBeVisible()
    expect(screen.getByLabelText('Expand matches')).toBeInTheDocument()

    await act(async () => {
      screen.getByLabelText('Expand matches').click()
    })
    expect(document.querySelector('.matches-quadrant')).toBeVisible()
  })

  it('collapsing the top row hides both top quadrants behind an expand bar', async () => {
    await openBrowseTab()
    await act(async () => {
      screen.getByLabelText('Collapse top panels').click()
    })

    expect(document.querySelector('.browse-quadrant')).not.toBeVisible()
    expect(document.querySelector('.matches-quadrant')).not.toBeVisible()
    expect(screen.getByLabelText('Expand top panels')).toBeInTheDocument()

    await act(async () => {
      screen.getByLabelText('Expand top panels').click()
    })
    expect(document.querySelector('.browse-quadrant')).toBeVisible()
  })

  it('collapsing the bottom row hides the set workspace behind an expand bar', async () => {
    await openBrowseTab()
    await act(async () => {
      screen.getByLabelText('Collapse bottom panels').click()
    })

    expect(document.querySelector('.quad-row--bottom')).not.toBeVisible()
    expect(screen.getByLabelText('Expand bottom panels')).toBeInTheDocument()

    await act(async () => {
      screen.getByLabelText('Expand bottom panels').click()
    })
    expect(document.querySelector('.quad-row--bottom')).toBeVisible()
  })
})

describe('Browse table', () => {
  it('renders the entire collection', async () => {
    await openBrowseTab()
    expect(getRowCount()).toBe(600)
  })

  it('filters by camelot code across the entire collection', async () => {
    await openBrowseTab()

    await openKeyFilterPopover()
    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click()
    })
    await closeFilterPopover()

    await waitFor(() => {
      expect(getRowCount()).toBe(300)
    })
  })

  it('filters by search text across the entire collection', async () => {
    await openBrowseTab()

    const searchInput = screen.getByPlaceholderText('Search tracks…')
    await userEvent.type(searchInput, 'Track 60')

    await waitFor(() => {
      // "Track 60" matches Track 60 and Track 600.
      expect(getRowCount()).toBe(2)
    })
  })

  // Regression: sorting used to apply only to the currently loaded page of
  // filtered results, so a date-sorted, BPM-filtered view surfaced a stale
  // slice instead of the newest matching tracks in the whole collection.
  it('sorts the full filtered collection, not just a page', async () => {
    await openBrowseTab()

    await openBpmFilterPopover()
    const minInput = screen.getByPlaceholderText('Min')
    await userEvent.type(minInput, '125')
    await closeFilterPopover()

    await waitFor(() => {
      expect(getRowCount()).toBe(300)
    })

    const dateHeader = screen.getByText('Date Added')
    await act(async () => {
      fireEvent.click(dateHeader)
    })
    await act(async () => {
      fireEvent.click(dateHeader)
    })

    const firstRow = document.querySelector('.track-table tbody tr')
    expect(firstRow?.textContent).toContain('Track 600')
  })

  it('restores filters, sorting, and scroll after search selection is cleared', async () => {
    await openBrowseTab()

    await openKeyFilterPopover()
    await userEvent.click(screen.getByRole('button', { name: '01A' }))
    await closeFilterPopover()

    const dateHeader = screen.getByText('Date Added')
    await userEvent.click(dateHeader)
    await userEvent.click(dateHeader)

    const wrapper = document.querySelector<HTMLElement>('.track-table-wrapper')!
    Object.defineProperties(wrapper, {
      scrollHeight: { configurable: true, value: 1_200 },
      clientHeight: { configurable: true, value: 200 },
    })
    wrapper.scrollTop = 440
    fireEvent.scroll(wrapper)

    const searchInput = screen.getByPlaceholderText('Search tracks…')
    await userEvent.type(searchInput, 'Track 30')
    const suggestionTitle = await screen.findByText('Track 30', {
      selector: '.search-item-title',
    })
    fireEvent.mouseDown(suggestionTitle.closest('li')!)

    await waitFor(() => {
      expect(getRowCount()).toBe(1)
    })
    wrapper.scrollTop = 0
    fireEvent.scroll(wrapper)

    await userEvent.click(
      document.querySelector<HTMLButtonElement>('.clear-btn--search')!,
    )

    await waitFor(() => {
      expect(getRowCount()).toBe(300)
      expect(
        document.querySelector('.track-table tbody tr')?.textContent,
      ).toContain('Track 300')
    })
    expect(document.querySelector('.filter-pill-body')?.textContent).toContain(
      '01A',
    )
    expect(wrapper.scrollTop).toBe(440)
  })

  it('restores scroll after quadrant collapses and expands', async () => {
    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: makeTracks(10),
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: null,
    })
    await openBrowseTab()

    const wrapper = document.querySelector<HTMLElement>('.track-table-wrapper')!
    const geometry = { scrollHeight: 1_200, clientHeight: 200 }
    Object.defineProperties(wrapper, {
      scrollHeight: {
        configurable: true,
        get: () => geometry.scrollHeight,
      },
      clientHeight: {
        configurable: true,
        get: () => geometry.clientHeight,
      },
    })
    wrapper.scrollTop = 700
    fireEvent.scroll(wrapper)

    // Collapsing matches gives the browser more room, so the browser's
    // content clamps to a smaller scroll range in this simulation.
    geometry.clientHeight = 600
    await userEvent.click(screen.getByLabelText('Collapse matches'))
    wrapper.scrollTop = 600
    fireEvent.scroll(wrapper)

    geometry.clientHeight = 200
    await userEvent.click(screen.getByLabelText('Expand matches'))
    expect(wrapper.scrollTop).toBe(700)

    geometry.scrollHeight = 0
    geometry.clientHeight = 0
    await userEvent.click(screen.getByLabelText('Collapse track browser'))
    wrapper.scrollTop = 0
    fireEvent.scroll(wrapper)

    geometry.scrollHeight = 1_200
    geometry.clientHeight = 200
    await userEvent.click(screen.getByLabelText('Expand track browser'))
    expect(wrapper.scrollTop).toBe(700)
  })
})

describe('Error state handling', () => {
  it('shows match fetch failure instead of empty-bucket message', async () => {
    const httpMod = await import('./api/http')
    vi.mocked(httpMod.fetchMatches).mockRejectedValue(
      new Error('Failed to fetch matches: 500'),
    )

    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: makeTracks(10),
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: null,
    })

    render(<App />)

    await act(async () => {
      screen.getByText('Track 1').click()
    })

    await waitFor(() => {
      expect(screen.getByText(/Failed to load matches/)).toBeInTheDocument()
      expect(
        screen.getByText(/Failed to fetch matches: 500/),
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByText('No matches for the active filters'),
    ).not.toBeInTheDocument()
  })

  it('shows successful zero-result message when match fetch returns empty', async () => {
    const httpMod = await import('./api/http')
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([])

    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: makeTracks(10),
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: null,
    })

    render(<App />)

    await act(async () => {
      screen.getByText('Track 1').click()
    })

    await waitFor(() => {
      expect(screen.getByText('No matches for the active filters')).toBeInTheDocument()
    })

    expect(screen.queryByText(/Failed to load matches/)).not.toBeInTheDocument()
  })

  it('shows browse track fetch failure instead of No tracks found', async () => {
    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: [],
      traitMap: new Map(),
      loading: false,
      tracksError: 'Failed to fetch tracks: 503',
      traitsError: null,
    })

    render(<App />)

    expect(screen.getByText(/Failed to load tracks/)).toBeInTheDocument()
    expect(screen.getByText(/Failed to fetch tracks: 503/)).toBeInTheDocument()
    expect(screen.queryByText('No tracks found')).not.toBeInTheDocument()
  })

  it('shows No tracks found when browse fetch succeeds with zero tracks', async () => {
    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: [],
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: null,
    })

    render(<App />)

    expect(screen.getByText('No tracks found')).toBeInTheDocument()
    expect(screen.queryByText(/Failed to load tracks/)).not.toBeInTheDocument()
  })

  it('shows traits fetch failure in Browse without hiding successfully loaded tracks', async () => {
    vi.mocked(useCollectionCache).mockReturnValue({
      allTracks: makeTracks(10),
      traitMap: new Map(),
      loading: false,
      tracksError: null,
      traitsError: 'Failed to fetch track traits: 502',
    })

    render(<App />)

    expect(screen.getByText(/Failed to load track traits/)).toBeInTheDocument()
    expect(
      screen.getByText(/Failed to fetch track traits: 502/),
    ).toBeInTheDocument()
    expect(screen.getByText('Track 1')).toBeInTheDocument()
    expect(screen.queryByText('No tracks found')).not.toBeInTheDocument()
  })
})

describe('BPM exclusivity', () => {
  it('typing exact BPM clears active BPM range fields', async () => {
    await openBrowseTab()

    await openBpmFilterPopover()
    const minInput = screen.getByPlaceholderText('Min')
    const maxInput = screen.getByPlaceholderText('Max')

    await userEvent.type(minInput, '100')
    await act(async () => {
      minInput.blur()
    })
    await userEvent.type(maxInput, '140')
    await act(async () => {
      maxInput.blur()
    })

    expect(minInput).toHaveValue(100)
    expect(maxInput).toHaveValue(140)

    const exactInput = screen.getByPlaceholderText('Exact')
    await userEvent.type(exactInput, '120')

    await waitFor(() => {
      expect(minInput).toHaveValue(null)
      expect(maxInput).toHaveValue(null)
    })
  })

  it('typing BPM range clears active exact BPM', async () => {
    await openBrowseTab()

    await openBpmFilterPopover()
    const exactInput = screen.getByPlaceholderText('Exact')
    await userEvent.type(exactInput, '120')
    expect(exactInput).toHaveValue(120)

    const minInput = screen.getByPlaceholderText('Min')
    await userEvent.type(minInput, '100')

    await waitFor(() => {
      expect(exactInput).toHaveValue(null)
    })
  })

  it('clearing exact BPM does not affect range fields', async () => {
    await openBrowseTab()

    await openBpmFilterPopover()
    const exactInput = screen.getByPlaceholderText('Exact')
    await userEvent.type(exactInput, '120')
    expect(exactInput).toHaveValue(120)

    await userEvent.clear(exactInput)
    expect(exactInput).toHaveValue(null)
    expect(screen.getByPlaceholderText('Min')).toHaveValue(null)
    expect(screen.getByPlaceholderText('Max')).toHaveValue(null)
  })
})

describe('Key filter popover', () => {
  it('stays open after toggling a code', async () => {
    await openBrowseTab()

    await openKeyFilterPopover()

    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click()
    })

    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument()
  })

  it('allows selecting multiple codes in one session', async () => {
    await openBrowseTab()

    await openKeyFilterPopover()

    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click()
    })
    await act(async () => {
      screen.getByRole('button', { name: '02A' }).click()
    })

    const chip01 = screen.getByRole('button', { name: '01A' })
    const chip02 = screen.getByRole('button', { name: '02A' })
    expect(chip01.className).toContain('selected')
    expect(chip02.className).toContain('selected')
  })

  it('closes on Escape key', async () => {
    await openBrowseTab()

    await openKeyFilterPopover()

    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument()

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(
      screen.queryByRole('button', { name: '03A' }),
    ).not.toBeInTheDocument()
  })

  it('renders the active filter as a pill that can be removed', async () => {
    await openBrowseTab()

    await openKeyFilterPopover()
    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click()
    })
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    const pill = screen.getByRole('button', { name: /Key: 01A/ })
    expect(pill).toBeInTheDocument()
    await waitFor(() => {
      expect(getRowCount()).toBe(300)
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Remove Key filter' }).click()
    })
    expect(
      screen.queryByRole('button', { name: /Key: 01A/ }),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(getRowCount()).toBe(600)
    })
  })

  it('reopens the popover for editing when the pill is clicked', async () => {
    await openBrowseTab()

    await openKeyFilterPopover()
    await act(async () => {
      screen.getByRole('button', { name: '01A' }).click()
    })
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(
      screen.queryByRole('button', { name: '03A' }),
    ).not.toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: /Key: 01A/ }).click()
    })
    expect(screen.queryByRole('button', { name: '03A' })).toBeInTheDocument()
  })
})

function makeTransitionMatch(
  overrides: Partial<TransitionMatch> = {},
): TransitionMatch {
  return {
    candidate_id: 2,
    title: 'Match Track',
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

async function selectTrackViaBrowse(trackTitle: string) {
  const row = screen.getByText(trackTitle).closest('tr')!
  await act(async () => {
    row.click()
  })

  await waitFor(() => {
    expect(
      screen.getByText(trackTitle, { selector: '.ds-table-header-title' }),
    ).toBeInTheDocument()
  })
}

describe('Transition chaining', () => {
  it('keeps browse search results stable across consecutive match links', async () => {
    const httpMod = await import('./api/http')
    const matchForTrack2 = makeTransitionMatch({
      candidate_id: 2,
      title: 'Track 2',
    })
    const matchForTrack3 = makeTransitionMatch({
      candidate_id: 3,
      title: 'Track 3',
    })
    vi.mocked(httpMod.fetchMatches)
      .mockResolvedValue([])
      .mockResolvedValueOnce([matchForTrack2])
      .mockResolvedValueOnce([matchForTrack3])

    await act(async () => {
      render(<App />)
    })

    await selectTrackViaBrowse('Track 1')
    const searchInput = screen.getByPlaceholderText('Search tracks…')
    await userEvent.clear(searchInput)
    await userEvent.type(searchInput, 'Track 60')

    await waitFor(() => {
      expect(searchInput).toHaveValue('Track 60')
      expect(getRowCount()).toBe(2)
      expect(screen.getByTitle('Use as source track')).toHaveTextContent(
        'Track 2',
      )
    })

    await userEvent.click(screen.getByTitle('Use as source track'))

    await waitFor(() => {
      // While a chain is active, the source title supplants the header name and
      // is rendered as the chain's current step.
      expect(
        screen.getByText('Track 2', { selector: '.chain-current' }),
      ).toBeInTheDocument()
      expect(screen.getByTitle('Use as source track')).toHaveTextContent(
        'Track 3',
      )
    })
    expect(searchInput).toHaveValue('Track 60')
    expect(getRowCount()).toBe(2)
    expect(document.querySelectorAll('.chain-entry')).toHaveLength(1)

    await userEvent.click(screen.getByTitle('Use as source track'))

    await waitFor(() => {
      expect(
        screen.getByText('Track 3', { selector: '.chain-current' }),
      ).toBeInTheDocument()
      expect(document.querySelectorAll('.chain-entry')).toHaveLength(2)
    })
    expect(searchInput).toHaveValue('Track 60')
    expect(getRowCount()).toBe(2)

    await userEvent.click(screen.getByRole('button', { name: 'Clear matches' }))

    expect(searchInput).toHaveValue('Track 60')
    expect(getRowCount()).toBe(2)
    expect(
      screen.getByText('Select a track to see matches'),
    ).toBeInTheDocument()
  })

  it('renders transition chain breadcrumb after Use as source', async () => {
    const httpMod = await import('./api/http')
    const matchForTrack2 = makeTransitionMatch({
      candidate_id: 2,
      title: 'Track 2',
    })
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([matchForTrack2])

    await act(async () => {
      render(<App />)
    })

    await selectTrackViaBrowse('Track 1')

    await waitFor(() => {
      expect(screen.getByTitle('Use as source track')).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByTitle('Use as source track').click()
    })

    await waitFor(() => {
      const chainEntries = document.querySelectorAll('.chain-entry')
      expect(chainEntries.length).toBe(1)
      expect(chainEntries[0].textContent).toBe('Track 1')
    })
  })

  it('navigates back through chain when back button is clicked', async () => {
    const httpMod = await import('./api/http')
    const matchForTrack2 = makeTransitionMatch({
      candidate_id: 2,
      title: 'Track 2',
    })
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([matchForTrack2])

    await act(async () => {
      render(<App />)
    })

    await selectTrackViaBrowse('Track 1')

    await waitFor(() => {
      expect(screen.getByTitle('Use as source track')).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByTitle('Use as source track').click()
    })

    await waitFor(() => {
      expect(document.querySelector('.chain-back-btn')).toBeInTheDocument()
    })

    await act(async () => {
      document.querySelector<HTMLButtonElement>('.chain-back-btn')!.click()
    })

    await waitFor(() => {
      expect(document.querySelector('.chain-back-btn')).not.toBeInTheDocument()
    })
  })

  it('clears chain on fresh track selection via browse', async () => {
    const httpMod = await import('./api/http')
    const matchForTrack2 = makeTransitionMatch({
      candidate_id: 2,
      title: 'Track 2',
    })
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([matchForTrack2])

    await act(async () => {
      render(<App />)
    })

    await selectTrackViaBrowse('Track 1')

    await waitFor(() => {
      expect(screen.getByTitle('Use as source track')).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByTitle('Use as source track').click()
    })

    await waitFor(() => {
      expect(document.querySelectorAll('.chain-entry').length).toBe(1)
    })

    // Match chaining no longer replaces browse selection. Clear the original
    // browse focus, then make a genuinely fresh selection from the browse table.
    await userEvent.click(
      document.querySelector<HTMLButtonElement>('.clear-btn--search')!,
    )
    const browseTable = document.querySelector<HTMLElement>('.track-table')!
    const row = within(browseTable).getByText('Track 2').closest('tr')!
    await act(async () => {
      row.click()
    })

    await waitFor(() => {
      expect(document.querySelectorAll('.chain-entry').length).toBe(0)
      expect(document.querySelector('.chain-back-btn')).not.toBeInTheDocument()
    })
  })
})

describe('Set workspace', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows set picker controls in the empty set state', async () => {
    await act(async () => {
      render(<App />)
    })
    expect(screen.getByText('+ New')).toBeInTheDocument()
  })

  it('does not offer the tracklist menu without an active set', async () => {
    await act(async () => {
      render(<App />)
    })
    expect(screen.queryByLabelText('Tracklist menu')).not.toBeInTheDocument()
  })

  it('renders dual add-to-pool/tracklist buttons in matches panel', async () => {
    const httpMod = await import('./api/http')
    const match = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' })
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([match])

    await act(async () => {
      render(<App />)
    })

    await selectTrackViaBrowse('Track 1')

    await waitFor(() => {
      const poolBtns = screen.getAllByTitle('Add to Pool')
      const tlBtns = screen.getAllByTitle('Add to Tracklist')
      expect(poolBtns.length).toBeGreaterThan(0)
      expect(tlBtns.length).toBeGreaterThan(0)
    })
  })

  it('renders dual add buttons in browse table', async () => {
    await openBrowseTab()

    const poolBtns = screen.getAllByTitle('Add to Pool')
    const tlBtns = screen.getAllByTitle('Add to Tracklist')
    expect(poolBtns.length).toBeGreaterThan(0)
    expect(tlBtns.length).toBeGreaterThan(0)
  })
})

describe('Admin overlay', () => {
  it('opens the admin dashboard from the gear button', async () => {
    await act(async () => {
      render(<App />)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openAdminOverlay()

    expect(
      screen.getByRole('dialog', { name: 'Admin dashboard' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /reset weights/i }),
      ).toBeInTheDocument()
    })
  })

  it('closes via the close button', async () => {
    await act(async () => {
      render(<App />)
    })
    await openAdminOverlay()

    await act(async () => {
      screen.getByRole('button', { name: 'Close admin' }).click()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    await act(async () => {
      render(<App />)
    })
    await openAdminOverlay()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Browse quadrant', () => {
  it('is always visible alongside the matches quadrant and set workspace', async () => {
    await openBrowseTab()

    expect(document.querySelector('.browse-quadrant')).toBeInTheDocument()
    expect(getRowCount()).toBe(600)
    expect(
      screen.getByText('Select a track to see matches'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add filter/ }),
    ).toBeInTheDocument()
  })

  it('selecting a browse row loads matches without disturbing the set workspace', async () => {
    const httpMod = await import('./api/http')
    vi.mocked(httpMod.fetchMatches).mockClear()

    await act(async () => {
      render(<App />)
    })
    expect(screen.getByText('+ New')).toBeInTheDocument()

    const row = screen.getByText('Track 1').closest('tr')!
    await act(async () => {
      row.click()
    })

    await waitFor(() => {
      expect(vi.mocked(httpMod.fetchMatches).mock.calls.at(-1)?.[0]).toBe(1)
    })
    expect(screen.getByText('+ New')).toBeInTheDocument()
  })
})

describe('Cross-region drag and drop', () => {
  const TRACK_MIME = 'application/x-xeremia-track'
  const TRACKLIST_ROW_MIME = 'application/x-xeremia-tracklist-row'

  function makeDataTransfer(data: Record<string, string> = {}) {
    const dt = {
      data,
      types: Object.keys(data),
      setData(type: string, value: string) {
        dt.data[type] = value
        dt.types = Object.keys(dt.data)
      },
      getData(type: string) {
        return dt.data[type] ?? ''
      },
      effectAllowed: '',
      dropEffect: '',
    }
    return dt
  }

  async function renderWithActiveSet() {
    const httpMod = await import('./api/http')
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      {
        id: 1,
        name: 'Test',
        created_at: '',
        updated_at: '',
        pool_count: 0,
        tracklist_count: 0,
      },
    ])
    localStorage.setItem('xeremia-active-set-id', '1')

    await act(async () => {
      render(<App />)
    })
    await waitFor(() => {
      expect(document.querySelector('.set-tracklist')).toBeInTheDocument()
    })
    return httpMod
  }

  it('dropping a matches row on the search bar re-searches with use-as-source semantics', async () => {
    const httpMod = await import('./api/http')
    const match = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' })
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([match])

    await act(async () => {
      render(<App />)
    })
    await selectTrackViaBrowse('Track 1')

    const matchesTable = document.querySelector<HTMLElement>('.matches-table')!
    const row = within(matchesTable).getByText('Track 2').closest('tr')!
    const dt = makeDataTransfer()
    fireEvent.dragStart(row, { dataTransfer: dt })
    expect(dt.getData(TRACK_MIME)).toBe('2')

    const searchBar = document.querySelector<HTMLElement>(
      '.search-bar-wrapper',
    )!
    fireEvent.dragOver(searchBar, { dataTransfer: dt })
    expect(searchBar.className).toContain('search-drop-active')

    await act(async () => {
      fireEvent.drop(searchBar, { dataTransfer: dt })
    })

    await waitFor(() => {
      const chainEntries = document.querySelectorAll('.chain-entry')
      expect(chainEntries.length).toBe(1)
      expect(chainEntries[0].textContent).toBe('Track 1')
    })
    expect(screen.getByPlaceholderText('Search tracks…')).toHaveValue('Track 2')
    expect(getRowCount()).toBe(1)
  })

  it('dropping a browse row adds to the tracklist and pool when Set view is active', async () => {
    const httpMod = await renderWithActiveSet()
    vi.mocked(httpMod.tracklistAdd).mockClear()
    vi.mocked(httpMod.poolAdd).mockClear()

    const browseTable = document.querySelector<HTMLElement>('.track-table')!
    const row3 = within(browseTable).getByText('Track 3').closest('tr')!
    const dt = makeDataTransfer()
    fireEvent.dragStart(row3, { dataTransfer: dt })
    expect(dt.getData(TRACK_MIME)).toBe('3')

    const tracklist = document.querySelector<HTMLElement>('.set-tracklist')!
    fireEvent.dragOver(tracklist, { dataTransfer: dt })
    expect(tracklist.className).toContain('set-drop-active')
    await act(async () => {
      fireEvent.drop(tracklist, { dataTransfer: dt })
    })
    await waitFor(() => {
      expect(httpMod.tracklistAdd).toHaveBeenCalledWith(1, 3)
    })

    const row4 = within(browseTable).getByText('Track 4').closest('tr')!
    const dt2 = makeDataTransfer()
    fireEvent.dragStart(row4, { dataTransfer: dt2 })

    const pool = document.querySelector<HTMLElement>('.set-pool')!
    fireEvent.dragOver(pool, { dataTransfer: dt2 })
    expect(pool.className).toContain('set-drop-active')
    await act(async () => {
      fireEvent.drop(pool, { dataTransfer: dt2 })
    })
    await waitFor(() => {
      expect(httpMod.poolAdd).toHaveBeenCalledWith(1, 4)
    })
  })

  it('dropping a tracklist row on the matches quadrant loads its matches', async () => {
    const httpMod = await import('./api/http')
    const [track3] = makeTracks(3).slice(2)
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: {
        id: 1,
        name: 'Test',
        created_at: '',
        updated_at: '',
        pool_count: 0,
        tracklist_count: 1,
      },
      pool: [],
      tracklist: [
        { id: 10, set_id: 1, track_id: 3, position: 0, track: track3 },
      ],
      explorer_nodes: [],
      explorer_edges: [],
    })
    await renderWithActiveSet()
    vi.mocked(httpMod.fetchMatches).mockClear()

    const tracklist = document.querySelector<HTMLElement>('.set-tracklist')!
    const row = within(tracklist).getByText('Track 3').closest('tr')!
    const dt = makeDataTransfer()
    fireEvent.dragStart(row, { dataTransfer: dt })
    expect(dt.getData(TRACKLIST_ROW_MIME)).toBe('3')

    const panel = document.querySelector<HTMLElement>('.matches-panel')!
    fireEvent.dragOver(panel, { dataTransfer: dt })
    expect(panel.className).toContain('set-drop-active')
    expect(dt.dropEffect).toBe('move')

    await act(async () => {
      fireEvent.drop(panel, { dataTransfer: dt })
    })

    await waitFor(() => {
      expect(vi.mocked(httpMod.fetchMatches).mock.calls.at(-1)?.[0]).toBe(3)
    })
  })

  it('ignores text/plain-only drags on the set drop targets', async () => {
    const httpMod = await renderWithActiveSet()
    vi.mocked(httpMod.tracklistAdd).mockClear()

    const tracklist = document.querySelector<HTMLElement>('.set-tracklist')!
    const dt = makeDataTransfer({ 'text/plain': '7' })
    fireEvent.dragOver(tracklist, { dataTransfer: dt })
    expect(tracklist.className).not.toContain('set-drop-active')
    await act(async () => {
      fireEvent.drop(tracklist, { dataTransfer: dt })
    })
    expect(httpMod.tracklistAdd).not.toHaveBeenCalled()
  })
})
