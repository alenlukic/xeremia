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
import type {
  HydratedSet,
  PoolEntry,
  PoolSubgroup,
  PoolSubgroupMembership,
  Track,
  TransitionMatch,
} from './types'
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
  fetchWorkspaceLayout: vi.fn().mockResolvedValue(null),
  saveWorkspaceLayout: vi.fn().mockResolvedValue(undefined),
  tracklistSetOverrides: vi.fn().mockResolvedValue(undefined),
  subgroupCreate: vi.fn().mockResolvedValue({ id: 1, name: 'Alt 2' }),
  subgroupRename: vi.fn().mockResolvedValue(undefined),
  subgroupDelete: vi.fn().mockResolvedValue(undefined),
  subgroupReorder: vi.fn().mockResolvedValue(undefined),
  subgroupMemberReorder: vi.fn().mockResolvedValue(undefined),
  subgroupAddMember: vi.fn().mockResolvedValue(undefined),
  subgroupDropTrack: vi.fn().mockResolvedValue(undefined),
  updateTablePreferences: vi.fn().mockResolvedValue({
    table_id: 'search',
    column_order: ['title'],
    column_visibility: { title: true },
    column_widths: { title: 220 },
  }),
  updateSet: vi.fn().mockResolvedValue({}),
  updateSetSequencer: vi.fn().mockResolvedValue(undefined),
  updateTracklistNote: vi.fn().mockResolvedValue(undefined),
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

// The workspace shell is the default, so the quadrant suites below seed the
// layout cache with the legacy shell the toggle reaches.
const LAYOUT_CACHE_KEY = 'xeremia:workspace-layout:v2'

function seedShell(shell: 'workspace' | 'legacy') {
  localStorage.setItem(LAYOUT_CACHE_KEY, JSON.stringify({ shell }))
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  localStorage.clear()
  sessionStorage.clear()
  seedShell('legacy')
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
      expect(
        screen.getByText('No matches for the active filters'),
      ).toBeInTheDocument()
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

  it('does not render removed add-to-pool/tracklist buttons in matches panel', async () => {
    const httpMod = await import('./api/http')
    const match = makeTransitionMatch({ candidate_id: 2, title: 'Track 2' })
    vi.mocked(httpMod.fetchMatches).mockResolvedValue([match])

    await act(async () => {
      render(<App />)
    })

    await selectTrackViaBrowse('Track 1')

    await waitFor(() => {
      expect(screen.getByTitle('Use as source track')).toBeInTheDocument()
    })
    expect(screen.queryByTitle('Add to Pool')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Add to Tracklist')).not.toBeInTheDocument()
  })

  it('does not render removed add buttons in browse table', async () => {
    await openBrowseTab()

    expect(screen.queryByTitle('Add to Pool')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Add to Tracklist')).not.toBeInTheDocument()
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

describe('session table view state', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('restores browse search text after remount', async () => {
    const { TABLE_VIEW_STATE_KEY } = await import('./tableViewState')
    sessionStorage.setItem(
      TABLE_VIEW_STATE_KEY,
      JSON.stringify({
        version: 1,
        search: {
          searchText: 'alpha',
          filterModel: [],
          sorting: [{ id: 'title', desc: false }],
        },
        matches: {
          sorting: [],
          activeBuckets: ['same_key', 'higher_key', 'lower_key'],
          filters: {},
          filterModel: [],
        },
        pool: { sortingByScope: {}, filtersByScope: {} },
        tracklist: {},
      }),
    )

    const { unmount } = render(<App />)
    expect(
      (screen.getByPlaceholderText(/search/i) as HTMLInputElement).value,
    ).toBe('alpha')
    unmount()

    render(<App />)
    expect(
      (screen.getByPlaceholderText(/search/i) as HTMLInputElement).value,
    ).toBe('alpha')
  })
})

describe('Shell toggle', () => {
  it('mounts the workspace shell by default', async () => {
    localStorage.clear()
    await act(async () => {
      render(<App />)
    })

    expect(screen.getByLabelText('Workspace grid')).toBeInTheDocument()
    expect(screen.queryByLabelText('Collapse track browser')).toBeNull()
  })

  it('renders every workspace widget frame in the default preset', async () => {
    localStorage.clear()
    await act(async () => {
      render(<App />)
    })

    const grid = screen.getByLabelText('Workspace grid')
    for (const label of ['Explorer', 'Browser', 'Sequencer', 'Matches']) {
      expect(within(grid).getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('switches to the legacy quadrant shell and back', async () => {
    localStorage.clear()
    await act(async () => {
      render(<App />)
    })

    await act(async () => {
      screen.getByRole('button', { name: /legacy shell/i }).click()
    })
    expect(screen.getByLabelText('Collapse track browser')).toBeInTheDocument()
    expect(screen.queryByLabelText('Workspace grid')).toBeNull()

    await act(async () => {
      screen.getByRole('button', { name: /workspace shell/i }).click()
    })
    expect(screen.getByLabelText('Workspace grid')).toBeInTheDocument()
  })

  it('persists the shell choice through the layout preference row', async () => {
    vi.useFakeTimers()
    try {
      localStorage.clear()
      const httpMod = await import('./api/http')
      vi.mocked(httpMod.saveWorkspaceLayout).mockClear()

      await act(async () => {
        render(<App />)
      })
      await act(async () => {
        screen.getByRole('button', { name: /legacy shell/i }).click()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      const saved = vi.mocked(httpMod.saveWorkspaceLayout).mock.calls.at(-1)
      expect(saved?.[0].shell).toBe('legacy')
    } finally {
      vi.useRealTimers()
    }
  })

  it('wires the Explorer bulk actions to the pool', async () => {
    localStorage.clear()
    const httpMod = await import('./api/http')
    const [committed, benched] = makeTracks(2)
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      {
        id: 1,
        name: 'Test',
        created_at: '',
        updated_at: '',
        pool_count: 2,
        tracklist_count: 1,
      },
    ])
    vi.mocked(httpMod.fetchHydratedSet).mockResolvedValue({
      set: {
        id: 1,
        name: 'Test',
        created_at: '',
        updated_at: '',
        pool_count: 2,
        tracklist_count: 1,
      },
      pool: [
        {
          id: 20,
          set_id: 1,
          track_id: committed.id,
          insertion_order: 0,
          highlight_color: null,
          track: committed,
        },
        {
          id: 21,
          set_id: 1,
          track_id: benched.id,
          insertion_order: 1,
          highlight_color: null,
          track: benched,
        },
      ],
      tracklist: [
        {
          id: 10,
          set_id: 1,
          track_id: committed.id,
          position: 0,
          track: committed,
        },
      ],
      explorer_nodes: [],
      explorer_edges: [],
    })
    localStorage.setItem('xeremia-active-set-id', '1')

    await act(async () => {
      render(<App />)
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Prune' })).toBeEnabled(),
    )
    vi.mocked(httpMod.poolRemove).mockClear()

    await act(async () => {
      screen.getByRole('button', { name: 'Prune' }).click()
    })

    // Only the pooled track the committed lane already holds is removed.
    expect(vi.mocked(httpMod.poolRemove).mock.calls).toEqual([
      [1, committed.id],
    ])
  })

  it('hydrates the shell from the server layout row', async () => {
    localStorage.clear()
    const httpMod = await import('./api/http')
    vi.mocked(httpMod.fetchWorkspaceLayout).mockResolvedValueOnce({
      preset: 'Explorer sandbox',
      place: { browser: { x: 0, y: 0, w: 4, h: 4 } },
      custom: {},
      shell: 'legacy',
    })

    await act(async () => {
      render(<App />)
    })

    expect(screen.getByLabelText('Collapse track browser')).toBeInTheDocument()
  })
})

describe('Sequencer bench clipboard', () => {
  /**
   * Pool, subgroup and membership rows the bench clipboard writes. The
   * sequencer's default lane is virtual until a subgroup exists, so a paste
   * onto it depends on how the server answers after each write.
   */
  function fakeSetRows(tracks: Track[]) {
    const pool: PoolEntry[] = tracks.map((track, index) => ({
      id: 20 + index,
      set_id: 1,
      track_id: track.id,
      insertion_order: index,
      highlight_color: null,
      track,
    }))
    const subgroups: PoolSubgroup[] = []
    const memberships: PoolSubgroupMembership[] = []
    let nextPoolEntryId = 40
    let nextSubgroupId = 5
    let nextMembershipId = 60
    let releasePoolRemovals: (() => void) | null = null
    let poolRemovalGate: Promise<void> | null = null

    const entryOf = (trackId: number) =>
      pool.find((entry) => entry.track_id === trackId) ?? null

    const addMember = (subgroupId: number, poolEntryId: number) => {
      const held = memberships.some(
        (m) => m.subgroup_id === subgroupId && m.pool_entry_id === poolEntryId,
      )
      if (!held) {
        memberships.push({
          id: nextMembershipId++,
          subgroup_id: subgroupId,
          pool_entry_id: poolEntryId,
          display_order: memberships.length,
        })
      }
    }

    return {
      hydrate: (): HydratedSet => ({
        set: {
          id: 1,
          name: 'Test',
          created_at: '',
          updated_at: '',
          pool_count: pool.length,
          tracklist_count: 0,
        },
        pool: pool.map((entry) => ({ ...entry })),
        tracklist: [],
        explorer_nodes: [],
        explorer_edges: [],
        pool_subgroups: subgroups.map((group) => ({ ...group })),
        pool_subgroup_memberships: memberships.map((m) => ({ ...m })),
      }),
      poolRemove: async (_setId: number, trackId: number) => {
        const entry = entryOf(trackId)
        if (!entry) {
          return
        }
        pool.splice(pool.indexOf(entry), 1)
        for (let i = memberships.length - 1; i >= 0; i--) {
          if (memberships[i].pool_entry_id === entry.id) {
            memberships.splice(i, 1)
          }
        }
        await poolRemovalGate
      },
      pausePoolRemovals: () => {
        poolRemovalGate = new Promise((resolve) => {
          releasePoolRemovals = resolve
        })
      },
      releasePoolRemovals: () => {
        releasePoolRemovals?.()
        releasePoolRemovals = null
        poolRemovalGate = null
      },
      subgroupCreate: async (_setId: number, name: string) => {
        const group = {
          id: nextSubgroupId++,
          set_id: 1,
          name,
          display_order: subgroups.length,
        }
        subgroups.push(group)
        return group
      },
      subgroupDelete: async (_setId: number, subgroupId: number) => {
        const group = subgroups.find((g) => g.id === subgroupId)
        if (group) {
          subgroups.splice(subgroups.indexOf(group), 1)
        }
        for (let i = memberships.length - 1; i >= 0; i--) {
          if (memberships[i].subgroup_id === subgroupId) {
            memberships.splice(i, 1)
          }
        }
      },
      subgroupAddMember: async (
        _setId: number,
        subgroupId: number,
        poolEntryId: number,
      ) => {
        if (!pool.some((entry) => entry.id === poolEntryId)) {
          throw new Error('pool row is gone')
        }
        addMember(subgroupId, poolEntryId)
      },
      subgroupDropTrack: async (
        _setId: number,
        subgroupId: number,
        trackId: number,
      ) => {
        let entry = entryOf(trackId)
        if (!entry) {
          entry = {
            id: nextPoolEntryId++,
            set_id: 1,
            track_id: trackId,
            insertion_order: pool.length,
            highlight_color: null,
            track: tracks.find((t) => t.id === trackId) ?? null,
          }
          pool.push(entry)
        }
        addMember(subgroupId, entry.id)
      },
      /** Track titles per lane, so a split lane is visible in the result. */
      laneTitles: () =>
        subgroups.map((group) =>
          memberships
            .filter((m) => m.subgroup_id === group.id)
            .map(
              (m) => pool.find((entry) => entry.id === m.pool_entry_id)?.track,
            )
            .map((track) => track?.title ?? '')
            .sort(),
        ),
    }
  }

  async function renderWithSequencerSet(tracks: Track[]) {
    const httpMod = await import('./api/http')
    const rows = fakeSetRows(tracks)
    vi.mocked(httpMod.fetchSets).mockResolvedValue([
      {
        id: 1,
        name: 'Test',
        created_at: '',
        updated_at: '',
        pool_count: tracks.length,
        tracklist_count: 0,
      },
    ])
    vi.mocked(httpMod.fetchHydratedSet).mockImplementation(async () =>
      rows.hydrate(),
    )
    vi.mocked(httpMod.poolRemove).mockImplementation(rows.poolRemove)
    vi.mocked(httpMod.subgroupCreate).mockImplementation(rows.subgroupCreate)
    vi.mocked(httpMod.subgroupDelete).mockImplementation(rows.subgroupDelete)
    vi.mocked(httpMod.subgroupAddMember).mockImplementation(
      rows.subgroupAddMember,
    )
    vi.mocked(httpMod.subgroupDropTrack).mockImplementation(
      rows.subgroupDropTrack,
    )
    localStorage.setItem('xeremia-active-set-id', '1')

    await act(async () => {
      render(<App />)
    })
    const sequencer = await screen.findByLabelText('Sequencer')
    await waitFor(() =>
      expect(
        within(sequencer).getByLabelText(tracks[0].title),
      ).toBeInTheDocument(),
    )
    return rows
  }

  async function pressClipboardKey(sequencer: HTMLElement, key: string) {
    const body = sequencer.querySelector('.sq-body') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(body, { key, metaKey: true })
    })
  }

  function placeCursor(
    sequencer: HTMLElement,
    laneLabel: string,
    clientX: number,
  ) {
    const lane = within(sequencer).getByLabelText(laneLabel)
    act(() => {
      fireEvent.pointerDown(lane, { clientX, button: 0 })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX })
    })
  }

  // These cases count subgroup writes, so they start from a clean call log.
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('keeps a multi-track bench cut in place until a safe paste', async () => {
    const httpMod = await import('./api/http')
    await renderWithSequencerSet(makeTracks(3))
    const sequencer = screen.getByLabelText('Sequencer')
    const lane = sequencer.querySelector('.sq-lane--alt') as HTMLElement

    // jsdom reports a zero rect, so client x 88 is the set start and every
    // 6px after it is one minute. The sweep covers the first two blocks.
    act(() => {
      fireEvent.pointerDown(lane, { clientX: 88, clientY: 10, button: 0 })
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 112, clientY: 10 })
      fireEvent.pointerUp(window, { clientX: 112, clientY: 10 })
    })
    await pressClipboardKey(sequencer, 'x')
    await pressClipboardKey(sequencer, 'v')

    expect(sequencer.querySelectorAll('.sq-lane--alt')).toHaveLength(1)
    expect(httpMod.poolRemove).not.toHaveBeenCalled()
    expect(httpMod.subgroupCreate).not.toHaveBeenCalled()
    expect(httpMod.subgroupDropTrack).not.toHaveBeenCalled()
    for (const title of ['Track 1', 'Track 2', 'Track 3']) {
      expect(within(sequencer).getByLabelText(title)).toBeInTheDocument()
    }
  })

  it('does not materialize the virtual lane during repeated in-place pastes', async () => {
    const httpMod = await import('./api/http')
    await renderWithSequencerSet(makeTracks(1))
    const sequencer = screen.getByLabelText('Sequencer')

    for (let i = 0; i < 2; i++) {
      act(() => {
        within(sequencer).getByLabelText('Track 1').click()
      })
      await pressClipboardKey(sequencer, 'x')
      await pressClipboardKey(sequencer, 'v')
    }

    expect(httpMod.poolRemove).not.toHaveBeenCalled()
    expect(httpMod.subgroupCreate).not.toHaveBeenCalled()
    expect(sequencer.querySelectorAll('.sq-lane--alt')).toHaveLength(1)
    expect(within(sequencer).getByLabelText('Track 1')).toBeInTheDocument()
  })

  it('copies a benched track to committed without removing it from the pool', async () => {
    const httpMod = await import('./api/http')
    await renderWithSequencerSet(makeTracks(1))
    const sequencer = screen.getByLabelText('Sequencer')

    act(() => {
      within(sequencer).getByLabelText('Track 1').click()
    })
    await pressClipboardKey(sequencer, 'c')
    placeCursor(sequencer, 'Committed lane', 120)
    await pressClipboardKey(sequencer, 'v')

    await waitFor(() => expect(httpMod.tracklistAdd).toHaveBeenCalledWith(1, 1))
    expect(httpMod.poolMoveToTracklist).not.toHaveBeenCalled()
  })

  it('copies a benched track into another lane via subgroup drop', async () => {
    const httpMod = await import('./api/http')
    await renderWithSequencerSet(makeTracks(1))
    const sequencer = screen.getByLabelText('Sequencer')

    act(() => {
      within(sequencer).getByLabelText('Track 1').click()
    })
    await pressClipboardKey(sequencer, 'c')
    act(() => {
      within(sequencer).getByLabelText('Add lane').click()
    })
    await waitFor(() =>
      expect(
        within(sequencer).getByLabelText('Alt 1 lane'),
      ).toBeInTheDocument(),
    )
    placeCursor(sequencer, 'Alt 1 lane', 120)
    await pressClipboardKey(sequencer, 'v')

    await waitFor(() =>
      expect(httpMod.subgroupDropTrack).toHaveBeenCalledWith(
        1,
        expect.any(Number),
        1,
        'pool',
      ),
    )
    expect(httpMod.subgroupAddMember).not.toHaveBeenCalled()
  })
})
