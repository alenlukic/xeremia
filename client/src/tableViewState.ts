import { useEffect, useRef } from 'react'
import type { SortingState } from '@tanstack/react-table'
import type { SortDescriptor } from './components/SortTierBar'
import type { FilterModel } from './hooks/useTrackFilters'
import type { FilterMap } from './components/table/tableFilter'

export const TABLE_VIEW_STATE_KEY = 'xeremia.tableViewState'
export const TABLE_VIEW_STATE_VERSION = 1

export type BucketKey = 'same_key' | 'higher_key' | 'lower_key'

export interface SearchTableViewState {
  searchText: string
  filterModel: FilterModel
  sorting: SortingState
}

export interface MatchesTableViewState {
  sorting: SortingState
  activeBuckets: BucketKey[]
  filters: FilterMap
  filterModel: FilterModel
}

export interface PoolTableViewState {
  sortingByScope: Record<string, SortDescriptor[]>
  filtersByScope: Record<string, FilterMap>
}

export interface TracklistTableViewState {
  readonly _empty?: never
}

export interface TableViewStatePayload {
  version: number
  search: SearchTableViewState
  matches: MatchesTableViewState
  pool: PoolTableViewState
  tracklist: TracklistTableViewState
}

export const DEFAULT_SEARCH_VIEW: SearchTableViewState = {
  searchText: '',
  filterModel: [],
  sorting: [],
}

export const DEFAULT_MATCHES_VIEW: MatchesTableViewState = {
  sorting: [],
  activeBuckets: ['same_key', 'higher_key', 'lower_key'],
  filters: {},
  filterModel: [],
}

export const DEFAULT_POOL_VIEW: PoolTableViewState = {
  sortingByScope: {},
  filtersByScope: {},
}

export function defaultTableViewState(): TableViewStatePayload {
  return {
    version: TABLE_VIEW_STATE_VERSION,
    search: { ...DEFAULT_SEARCH_VIEW },
    matches: {
      ...DEFAULT_MATCHES_VIEW,
      activeBuckets: [...DEFAULT_MATCHES_VIEW.activeBuckets],
    },
    pool: { ...DEFAULT_POOL_VIEW },
    tracklist: {},
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSortingState(value: unknown): value is SortingState {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === 'string' &&
        typeof entry.desc === 'boolean',
    )
  )
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return (
    value === undefined || (typeof value === 'number' && Number.isFinite(value))
  )
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isFilterCondition(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return false
  }
  if (
    value.kind !== 'key' &&
    value.kind !== 'bpm' &&
    value.kind !== 'genre' &&
    value.kind !== 'label' &&
    value.kind !== 'dateAdded'
  ) {
    return false
  }
  return (
    (value.values === undefined ||
      (Array.isArray(value.values) &&
        value.values.every((entry) => typeof entry === 'string'))) &&
    isOptionalFiniteNumber(value.exact) &&
    isOptionalFiniteNumber(value.min) &&
    isOptionalFiniteNumber(value.max) &&
    isOptionalString(value.after) &&
    isOptionalString(value.before)
  )
}

function isFilterModel(value: unknown): value is FilterModel {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every(
    (group) =>
      isRecord(group) &&
      typeof group.id === 'string' &&
      Array.isArray(group.conditions) &&
      group.conditions.every(isFilterCondition),
  )
}

function isFilterMap(value: unknown): value is FilterMap {
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every((entry) => {
    if (!isRecord(entry)) {
      return false
    }
    if ('values' in entry) {
      return (
        Object.keys(entry).every((key) => key === 'values') &&
        Array.isArray(entry.values) &&
        entry.values.every((item) => typeof item === 'string')
      )
    }
    return (
      Object.keys(entry).every((key) => key === 'min' || key === 'max') &&
      isOptionalFiniteNumber(entry.min) &&
      isOptionalFiniteNumber(entry.max)
    )
  })
}

function isSortDescriptors(value: unknown): value is SortDescriptor[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === 'string' &&
        typeof entry.desc === 'boolean',
    )
  )
}

function isBucketKey(value: unknown): value is BucketKey {
  return value === 'same_key' || value === 'higher_key' || value === 'lower_key'
}

function parseSearchSlice(raw: unknown): SearchTableViewState {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SEARCH_VIEW }
  }
  return {
    searchText:
      typeof raw.searchText === 'string'
        ? raw.searchText
        : DEFAULT_SEARCH_VIEW.searchText,
    filterModel: isFilterModel(raw.filterModel)
      ? raw.filterModel
      : DEFAULT_SEARCH_VIEW.filterModel,
    sorting: isSortingState(raw.sorting)
      ? raw.sorting
      : DEFAULT_SEARCH_VIEW.sorting,
  }
}

function parseMatchesSlice(raw: unknown): MatchesTableViewState {
  if (!isRecord(raw)) {
    return {
      ...DEFAULT_MATCHES_VIEW,
      activeBuckets: [...DEFAULT_MATCHES_VIEW.activeBuckets],
    }
  }
  const buckets =
    Array.isArray(raw.activeBuckets) && raw.activeBuckets.every(isBucketKey)
      ? raw.activeBuckets
      : DEFAULT_MATCHES_VIEW.activeBuckets
  return {
    sorting: isSortingState(raw.sorting)
      ? raw.sorting
      : DEFAULT_MATCHES_VIEW.sorting,
    activeBuckets: [...buckets],
    filters: isFilterMap(raw.filters)
      ? raw.filters
      : DEFAULT_MATCHES_VIEW.filters,
    filterModel: isFilterModel(raw.filterModel)
      ? raw.filterModel
      : DEFAULT_MATCHES_VIEW.filterModel,
  }
}

function parsePoolSlice(raw: unknown): PoolTableViewState {
  if (!isRecord(raw)) {
    return { ...DEFAULT_POOL_VIEW }
  }
  const sortingByScope: Record<string, SortDescriptor[]> = {}
  if (isRecord(raw.sortingByScope)) {
    for (const [scope, value] of Object.entries(raw.sortingByScope)) {
      if (isSortDescriptors(value)) {
        sortingByScope[scope] = value
      }
    }
  }
  const filtersByScope: Record<string, FilterMap> = {}
  if (isRecord(raw.filtersByScope)) {
    for (const [scope, value] of Object.entries(raw.filtersByScope)) {
      if (isFilterMap(value)) {
        filtersByScope[scope] = value
      }
    }
  }
  return { sortingByScope, filtersByScope }
}

export function parseTableViewState(raw: unknown): TableViewStatePayload {
  const defaults = defaultTableViewState()
  if (!isRecord(raw)) {
    return defaults
  }
  if (raw.version !== TABLE_VIEW_STATE_VERSION) {
    return defaults
  }
  return {
    version: TABLE_VIEW_STATE_VERSION,
    search: parseSearchSlice(raw.search),
    matches: parseMatchesSlice(raw.matches),
    pool: parsePoolSlice(raw.pool),
    tracklist: {},
  }
}

export function readTableViewState(): TableViewStatePayload {
  try {
    if (typeof window === 'undefined') {
      return defaultTableViewState()
    }
    const raw = window.sessionStorage.getItem(TABLE_VIEW_STATE_KEY)
    if (!raw) {
      return defaultTableViewState()
    }
    return parseTableViewState(JSON.parse(raw))
  } catch {
    return defaultTableViewState()
  }
}

export function writeTableViewState(state: TableViewStatePayload): void {
  try {
    if (typeof window === 'undefined') {
      return
    }
    window.sessionStorage.setItem(
      TABLE_VIEW_STATE_KEY,
      JSON.stringify({ ...state, version: TABLE_VIEW_STATE_VERSION }),
    )
  } catch {
    // Unavailable or quota exceeded — keep in-memory state only.
  }
}

export function usePersistTableViewSlice<K extends keyof TableViewStatePayload>(
  slice: K,
  value: TableViewStatePayload[K],
): void {
  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    const current = readTableViewState()
    writeTableViewState({ ...current, [slice]: value })
  }, [slice, value])
}
