import { describe, it, expect } from 'vitest'
import {
  buildTrackSearchIndex,
  searchTracksLocal,
  mergeSuggestions,
} from './trackSearch'
import type { SearchSuggestion, Track } from '../types'

function makeTrack(overrides: Partial<Track> & { id: number }): Track {
  return {
    title: `Track ${overrides.id}`,
    artist_names: [],
    bpm: null,
    key: null,
    camelot_code: null,
    genre: null,
    label: null,
    energy: null,
    ...overrides,
  }
}

const tracks: Track[] = [
  makeTrack({
    id: 1,
    title: 'Midnight Drive',
    artist_names: ['Kollektiv Nacht'],
    bpm: 124,
    camelot_code: '8A',
    genre: 'Melodic Techno',
    label: 'Afterlife',
  }),
  makeTrack({
    id: 2,
    title: 'Drive Me Home',
    artist_names: ['Solar Fields'],
    bpm: 118,
    camelot_code: '3B',
  }),
  makeTrack({
    id: 3,
    title: 'Sunset Boulevard',
    artist_names: ['Midnight City'],
    bpm: 124,
    camelot_code: '8A',
  }),
  makeTrack({
    id: 4,
    title: 'Deep Blue',
    artist_names: ['Oceanic'],
    bpm: 122,
    camelot_code: '11B',
    genre: 'Progressive House',
  }),
]

const index = buildTrackSearchIndex(tracks)

describe('searchTracksLocal', () => {
  it('returns empty for blank queries', () => {
    expect(searchTracksLocal(index, '')).toEqual([])
    expect(searchTracksLocal(index, '   ')).toEqual([])
  })

  it('matches title prefixes case-insensitively', () => {
    const results = searchTracksLocal(index, 'mid')
    expect(results.map((r) => r.id)).toContain(1)
  })

  it('ranks title matches above artist matches', () => {
    const results = searchTracksLocal(index, 'midnight')
    expect(results.map((r) => r.id)).toEqual([1, 3])
  })

  it('ranks exact title matches first', () => {
    const results = searchTracksLocal(index, 'drive me home')
    expect(results[0].id).toBe(2)
  })

  it('matches artist names', () => {
    const results = searchTracksLocal(index, 'solar')
    expect(results.map((r) => r.id)).toEqual([2])
  })

  it('requires all tokens to match', () => {
    const results = searchTracksLocal(index, 'midnight oceanic')
    expect(results).toEqual([])
  })

  it('matches camelot codes exactly', () => {
    const results = searchTracksLocal(index, '8a')
    expect(results.map((r) => r.id).sort()).toEqual([1, 3])
  })

  it('matches BPM numerically', () => {
    const results = searchTracksLocal(index, '124')
    expect(results.map((r) => r.id).sort()).toEqual([1, 3])
  })

  it('matches genre with lower priority than title', () => {
    const results = searchTracksLocal(index, 'progressive')
    expect(results.map((r) => r.id)).toEqual([4])
  })

  it('respects the result limit', () => {
    const many = buildTrackSearchIndex(
      Array.from({ length: 30 }, (_, i) =>
        makeTrack({ id: i + 1, title: `Common Song ${i + 1}` }),
      ),
    )
    expect(searchTracksLocal(many, 'common').length).toBe(10)
  })

  it('projects tracks to search suggestions', () => {
    const [first] = searchTracksLocal(index, 'deep blue')
    expect(first).toEqual({
      id: 4,
      title: 'Deep Blue',
      artist_names: ['Oceanic'],
      bpm: 122,
      key: null,
      camelot_code: '11B',
    })
  })
})

describe('mergeSuggestions', () => {
  const s = (id: number): SearchSuggestion => ({
    id,
    title: `T${id}`,
    artist_names: [],
    bpm: null,
    key: null,
    camelot_code: null,
  })

  it('keeps primary ordering and appends unseen secondary results', () => {
    const merged = mergeSuggestions([s(1), s(2)], [s(2), s(3)])
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3])
  })

  it('caps at the limit', () => {
    const primary = Array.from({ length: 8 }, (_, i) => s(i + 1))
    const secondary = Array.from({ length: 8 }, (_, i) => s(i + 100))
    expect(mergeSuggestions(primary, secondary).length).toBe(10)
  })
})
