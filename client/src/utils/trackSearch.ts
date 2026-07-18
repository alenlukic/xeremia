import type { SearchSuggestion, Track } from '../types'

/**
 * Client-side track search over the in-memory collection cache.
 *
 * Mirrors the Elasticsearch ranking in src/api/es.py (title-boosted
 * multi-field matching with camelot/BPM support) so results stay instant
 * and available even when Elasticsearch is unreachable.
 */

const TITLE_BOOST = 5
const TITLE_EXACT_BOOST = 10
const ARTIST_BOOST = 2
const GENRE_LABEL_BOOST = 0.5
const CAMELOT_BOOST = 1
const BPM_BOOST = 1.5
/** Non-prefix substring matches count at half weight. */
const SUBSTRING_FACTOR = 0.5

export const SEARCH_LIMIT = 10

interface IndexEntry {
  track: Track
  titleLc: string
  titleWords: string[]
  artistsLc: string[]
  artistWords: string[]
  genreLc: string
  labelLc: string
  camelotUc: string
}

export type TrackSearchIndex = IndexEntry[]

function words(s: string): string[] {
  return s.split(/[^a-z0-9]+/).filter(Boolean)
}

export function buildTrackSearchIndex(tracks: Track[]): TrackSearchIndex {
  return tracks.map((track) => {
    const titleLc = track.title.toLowerCase()
    const artistsLc = track.artist_names.map((a) => a.toLowerCase())
    return {
      track,
      titleLc,
      titleWords: words(titleLc),
      artistsLc,
      artistWords: artistsLc.flatMap(words),
      genreLc: track.genre?.toLowerCase() ?? '',
      labelLc: track.label?.toLowerCase() ?? '',
      camelotUc: track.camelot_code?.toUpperCase() ?? '',
    }
  })
}

function fieldScore(
  token: string,
  fieldWords: string[],
  fieldFull: string,
  boost: number,
): number {
  if (fieldWords.some((w) => w.startsWith(token))) {
    return boost
  }
  if (fieldFull.includes(token)) {
    return boost * SUBSTRING_FACTOR
  }
  return 0
}

function toSuggestion(track: Track): SearchSuggestion {
  return {
    id: track.id,
    title: track.title,
    artist_names: track.artist_names,
    bpm: track.bpm,
    key: track.key,
    camelot_code: track.camelot_code,
  }
}

/**
 * Rank tracks against `query`. Every query token must match at least one
 * field; tracks are scored by field weight and match quality.
 */
export function searchTracksLocal(
  index: TrackSearchIndex,
  query: string,
  limit: number = SEARCH_LIMIT,
): SearchSuggestion[] {
  const rawQuery = query.trim()
  if (!rawQuery) {
    return []
  }

  const trimmed = rawQuery.toLowerCase()
  const tokens = words(trimmed)
  const camelotQuery = rawQuery.toUpperCase()

  const bpmQuery = Number(trimmed)
  const hasBpmQuery = Number.isFinite(bpmQuery)

  const scored: { entry: IndexEntry; score: number }[] = []

  for (const entry of index) {
    let exactScore = 0
    if (entry.camelotUc && entry.camelotUc === camelotQuery) {
      exactScore += CAMELOT_BOOST
    }

    if (
      hasBpmQuery &&
      entry.track.bpm != null &&
      entry.track.bpm === bpmQuery
    ) {
      exactScore += BPM_BOOST
    }

    let tokenTotal = 0
    let allTokensMatch = tokens.length > 0
    for (const token of tokens) {
      const tokenScore = Math.max(
        fieldScore(token, entry.titleWords, entry.titleLc, TITLE_BOOST),
        entry.artistWords.length > 0
          ? Math.max(
              ...entry.artistsLc.map((a) =>
                fieldScore(token, entry.artistWords, a, ARTIST_BOOST),
              ),
            )
          : 0,
        entry.genreLc
          ? fieldScore(token, [], entry.genreLc, GENRE_LABEL_BOOST)
          : 0,
        entry.labelLc
          ? fieldScore(token, [], entry.labelLc, GENRE_LABEL_BOOST)
          : 0,
      )
      if (tokenScore === 0) {
        allTokensMatch = false
        break
      }
      tokenTotal += tokenScore
    }

    let score = exactScore
    if (allTokensMatch) {
      score += tokenTotal
      if (entry.titleLc === trimmed) {
        score += TITLE_EXACT_BOOST
      }
    }
    if (score === 0) {
      continue
    }

    scored.push({ entry, score })
  }

  scored.sort(
    (a, b) =>
      b.score - a.score || a.entry.titleLc.localeCompare(b.entry.titleLc),
  )
  return scored.slice(0, limit).map((s) => toSuggestion(s.entry.track))
}

/**
 * Merge server (Elasticsearch) results with local results: server ranking
 * wins, local hits missing from the server response fill the tail.
 */
export function mergeSuggestions(
  primary: SearchSuggestion[],
  secondary: SearchSuggestion[],
  limit: number = SEARCH_LIMIT,
): SearchSuggestion[] {
  const seen = new Set(primary.map((s) => s.id))
  const merged = [...primary]
  for (const s of secondary) {
    if (!seen.has(s.id)) {
      seen.add(s.id)
      merged.push(s)
    }
  }
  return merged.slice(0, limit)
}
