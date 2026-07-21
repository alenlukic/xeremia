import { useState, useMemo } from 'react'
import type { Track } from '../types'
import { dateAddedTimestamp } from '../utils'

/**
 * Client-side filtering over the session-cached collection with support for
 * filter *groups*: conditions within a group are ANDed, and groups are ORed —
 * i.e. `(A AND B) OR (C AND D)`. No server round-trips on filter change.
 */
export type FilterKind = 'key' | 'bpm' | 'genre' | 'label' | 'dateAdded'

export interface FilterCondition {
  id: string
  kind: FilterKind
  /** key / genre / label: selected values (ORed within the condition). */
  values?: string[]
  /** bpm: exact match (mutually exclusive with min/max). */
  exact?: number
  /** bpm: inclusive range bounds. */
  min?: number
  max?: number
  /** dateAdded: inclusive YYYY-MM-DD bounds. */
  after?: string
  before?: string
}

export interface FilterGroup {
  id: string
  conditions: FilterCondition[]
}

export type FilterModel = FilterGroup[]

export const FILTER_KIND_LABELS: Record<FilterKind, string> = {
  key: 'Key',
  bpm: 'BPM',
  genre: 'Genre',
  label: 'Label',
  dateAdded: 'Date Added',
}

let idSeq = 0
function nextId(prefix: string): string {
  idSeq += 1
  return `${prefix}-${idSeq}`
}

export function newCondition(kind: FilterKind): FilterCondition {
  const cond: FilterCondition = { id: nextId('cond'), kind }
  if (kind === 'key' || kind === 'genre' || kind === 'label') {
    cond.values = []
  }
  return cond
}

export function newGroup(conditions: FilterCondition[] = []): FilterGroup {
  return { id: nextId('grp'), conditions }
}

export function isActiveCondition(c: FilterCondition): boolean {
  switch (c.kind) {
    case 'key':
    case 'genre':
    case 'label':
      return (c.values?.length ?? 0) > 0
    case 'bpm':
      return c.exact != null || c.min != null || c.max != null
    case 'dateAdded':
      return Boolean(c.after) || Boolean(c.before)
  }
}

/** A group contributes to the OR only if it has at least one active condition. */
export function isActiveGroup(g: FilterGroup): boolean {
  return g.conditions.some(isActiveCondition)
}

export function isActiveModel(model: FilterModel): boolean {
  return model.some(isActiveGroup)
}

const DAY_MS = 86_400_000

function passesCondition(track: Track, c: FilterCondition): boolean {
  switch (c.kind) {
    case 'key':
      return (c.values ?? []).includes(track.camelot_code ?? '')
    case 'genre':
      return (c.values ?? []).includes(track.genre ?? '')
    case 'label':
      return (c.values ?? []).includes(track.label ?? '')
    case 'bpm': {
      if (track.bpm == null) {
        return false
      }
      if (c.exact != null) {
        return track.bpm === c.exact
      }
      if (c.min != null && track.bpm < c.min) {
        return false
      }
      if (c.max != null && track.bpm > c.max) {
        return false
      }
      return true
    }
    case 'dateAdded': {
      const ts = dateAddedTimestamp(track.date_added)
      if (ts == null) {
        return false
      }
      if (c.after) {
        const a = Date.parse(c.after)
        if (!Number.isNaN(a) && ts < a) {
          return false
        }
      }
      if (c.before) {
        const b = Date.parse(c.before)
        // Include the entire "before" day (bounds arrive as date-only strings).
        if (!Number.isNaN(b) && ts > b + DAY_MS - 1) {
          return false
        }
      }
      return true
    }
  }
}

/** A group passes when every one of its active conditions passes (AND). */
function passesGroup(track: Track, g: FilterGroup): boolean {
  return g.conditions.every(
    (c) => !isActiveCondition(c) || passesCondition(track, c),
  )
}

/** A track matches when it passes any active group (OR); no groups ⇒ all pass. */
export function matchesModel(track: Track, model: FilterModel): boolean {
  const active = model.filter(isActiveGroup)
  if (active.length === 0) {
    return true
  }
  return active.some((g) => passesGroup(track, g))
}

/** Drop inactive conditions and any group left empty. */
export function pruneModel(model: FilterModel): FilterModel {
  return model
    .map((g) => ({ ...g, conditions: g.conditions.filter(isActiveCondition) }))
    .filter((g) => g.conditions.length > 0)
}

/** Add or replace a condition (matched by id) within a group. */
export function upsertCondition(
  model: FilterModel,
  groupId: string,
  cond: FilterCondition,
): FilterModel {
  return model.map((g) => {
    if (g.id !== groupId) {
      return g
    }
    const exists = g.conditions.some((c) => c.id === cond.id)
    return {
      ...g,
      conditions: exists
        ? g.conditions.map((c) => (c.id === cond.id ? cond : c))
        : [...g.conditions, cond],
    }
  })
}

export function removeConditionFromModel(
  model: FilterModel,
  groupId: string,
  condId: string,
): FilterModel {
  return pruneModel(
    model.map((g) =>
      g.id === groupId
        ? { ...g, conditions: g.conditions.filter((c) => c.id !== condId) }
        : g,
    ),
  )
}

interface TrackFiltersResult {
  model: FilterModel
  setModel: React.Dispatch<React.SetStateAction<FilterModel>>
  filteredTracks: Track[]
  isActive: boolean
  /** Distinct, sorted genre/label values present in the collection. */
  genres: string[]
  labels: string[]
}

export function useTrackFilters(
  allTracks: Track[],
  searchText: string = '',
): TrackFiltersResult {
  const [model, setModel] = useState<FilterModel>([])

  const normalizedSearch = searchText.trim().toLowerCase()

  const genres = useMemo(() => {
    const set = new Set<string>()
    for (const t of allTracks) {
      if (t.genre) {
        set.add(t.genre)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [allTracks])

  const labels = useMemo(() => {
    const set = new Set<string>()
    for (const t of allTracks) {
      if (t.label) {
        set.add(t.label)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [allTracks])

  const filteredTracks = useMemo(() => {
    return allTracks.filter((track) => {
      if (!matchesModel(track, model)) {
        return false
      }
      if (normalizedSearch) {
        const title = track.title.toLowerCase()
        const artists = track.artist_names.join(' ').toLowerCase()
        if (
          !title.includes(normalizedSearch) &&
          !artists.includes(normalizedSearch)
        ) {
          return false
        }
      }
      return true
    })
  }, [allTracks, model, normalizedSearch])

  return {
    model,
    setModel,
    filteredTracks,
    isActive: isActiveModel(model),
    genres,
    labels,
  }
}
