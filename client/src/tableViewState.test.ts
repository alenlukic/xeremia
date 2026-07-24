import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  TABLE_VIEW_STATE_KEY,
  TABLE_VIEW_STATE_VERSION,
  defaultTableViewState,
  parseTableViewState,
  readTableViewState,
  writeTableViewState,
} from './tableViewState'

describe('tableViewState', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('round-trips a valid payload through sessionStorage', () => {
    const state = defaultTableViewState()
    state.search.searchText = 'house'
    state.search.sorting = [{ id: 'title', desc: false }]
    state.matches.activeBuckets = ['same_key']
    state.pool.sortingByScope.all = [{ id: 'insertion_order', desc: false }]
    writeTableViewState(state)
    const restored = readTableViewState()
    expect(restored.search.searchText).toBe('house')
    expect(restored.search.sorting).toEqual([{ id: 'title', desc: false }])
    expect(restored.matches.activeBuckets).toEqual(['same_key'])
    expect(restored.pool.sortingByScope.all).toEqual([
      { id: 'insertion_order', desc: false },
    ])
  })

  it('preserves an all-off match bucket selection', () => {
    const state = defaultTableViewState()
    state.matches.activeBuckets = []
    writeTableViewState(state)
    expect(readTableViewState().matches.activeBuckets).toEqual([])
  })

  it('returns defaults when storage is absent', () => {
    expect(readTableViewState()).toEqual(defaultTableViewState())
  })

  it('returns defaults for malformed JSON', () => {
    sessionStorage.setItem(TABLE_VIEW_STATE_KEY, '{not json')
    expect(readTableViewState()).toEqual(defaultTableViewState())
  })

  it('returns defaults for version mismatch', () => {
    sessionStorage.setItem(
      TABLE_VIEW_STATE_KEY,
      JSON.stringify({ version: TABLE_VIEW_STATE_VERSION + 1 }),
    )
    expect(readTableViewState().search.searchText).toBe('')
  })

  it('returns defaults when storage throws', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    expect(readTableViewState()).toEqual(defaultTableViewState())
    getItem.mockRestore()
  })

  it('ignores write failures without throwing', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota')
      })
    expect(() => writeTableViewState(defaultTableViewState())).not.toThrow()
    setItem.mockRestore()
  })

  it('sanitizes invalid slice fields', () => {
    const parsed = parseTableViewState({
      version: TABLE_VIEW_STATE_VERSION,
      search: { searchText: 42, filterModel: 'bad', sorting: 'bad' },
      matches: {
        sorting: null,
        activeBuckets: ['nope'],
        filters: null,
        filterModel: null,
      },
      pool: { sortingByScope: null, filtersByScope: null },
    })
    expect(parsed.search.searchText).toBe('')
    expect(parsed.matches.activeBuckets).toEqual([
      'same_key',
      'higher_key',
      'lower_key',
    ])
    expect(parsed.pool.sortingByScope).toEqual({})
  })

  it('rejects malformed nested filter values', () => {
    const parsed = parseTableViewState({
      version: TABLE_VIEW_STATE_VERSION,
      search: {
        searchText: '',
        filterModel: [{ id: 'bad', conditions: [null] }],
        sorting: [],
      },
      matches: {
        sorting: [],
        activeBuckets: ['same_key'],
        filters: { overall_score: { min: 'high' } },
        filterModel: [],
      },
      pool: {
        sortingByScope: {},
        filtersByScope: { all: { key: { values: [5] } } },
      },
    })
    expect(parsed.search.filterModel).toEqual([])
    expect(parsed.matches.filters).toEqual({})
    expect(parsed.pool.filtersByScope).toEqual({})
  })
})
