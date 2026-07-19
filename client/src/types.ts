export interface Track {
  id: number
  title: string
  artist_names: string[]
  bpm: number | null
  key: string | null
  camelot_code: string | null
  genre: string | null
  label: string | null
  energy: number | null
  date_added: string | null
}

export interface SearchSuggestion {
  id: number
  title: string
  artist_names: string[]
  bpm: number | null
  key: string | null
  camelot_code: string | null
}

export interface TransitionMatch {
  candidate_id: number
  title: string
  overall_score: number
  bucket: 'same_key' | 'higher_key' | 'lower_key'
  camelot_score: number
  bpm_score: number
  energy_score: number
  similarity_score: number
  freshness_score: number
  genre_similarity_score: number
  mood_continuity_score: number
  vocal_clash_score: number
  instrument_similarity_score: number
}

export interface MatchDetailFactorScore {
  name: string
  score: number
  weight: number
}

export interface MatchDetailTrackInfo {
  id: number
  title: string
  bpm: number | null
  key: string | null
  camelot_code: string | null
  energy: number | null
  genre: string | null
  label: string | null
  traits: Record<string, unknown> | null
}

export interface MatchDetail {
  overall_score: number
  factors: MatchDetailFactorScore[]
  on_deck: MatchDetailTrackInfo
  candidate: MatchDetailTrackInfo
}

export interface KeyDistEntry {
  key: string
  count: number
}

export interface BpmDistEntry {
  bin_start: number
  bin_end: number
  count: number
}

export interface CacheEntry {
  pair: [number, number]
  timestamp: number
}

export interface CacheExit {
  pair: [number, number]
  timestamp: number
  reason: string
}

export interface CacheStats {
  used: number
  capacity: number
  usage_ratio: number
  hits: number
  misses: number
  hit_rate: number
  hit_rate_numerator: number
  hit_rate_denominator: number
  hit_rate_basis: string
  key_distribution: KeyDistEntry[]
  bpm_distribution: BpmDistEntry[]
  recent_entries: CacheEntry[]
  recent_exits: CacheExit[]
}

export interface TransitionChainEntry {
  track: Track | SearchSuggestion
}

export interface TrackTraitEntry {
  track_id: number
  traits: Record<string, unknown> | null
}

export interface WeightsResponse {
  raw_weights: Record<string, number>
  effective_weights: Record<string, number>
  raw_sum: number
  target_sum: number
  is_sum_valid: boolean
  message: string | null
}

export interface SetTrackEntry {
  track: Track
  note: string
}

export interface DjSet {
  id: string
  name: string
  tracks: SetTrackEntry[]
}

// --- Persisted set workspace types ---

export interface SetSummary {
  id: number
  name: string
  created_at: string
  updated_at: string
  pool_count: number
  tracklist_count: number
}

export interface PoolEntry {
  id: number
  set_id: number
  track_id: number
  insertion_order: number
  track: Track | null
}

export interface TracklistEntry {
  id: number
  set_id: number
  track_id: number
  position: number
  note?: string
  track: Track | null
}

export interface ExplorerNode {
  id: number
  set_id: number
  node_id: string
  track_id: number
  level: number
  col_index: number
  track: Track | null
}

export interface ExplorerEdge {
  id: number
  set_id: number
  parent_node_id: string
  child_node_id: string
}

export interface PoolSubgroup {
  id: number
  set_id: number
  name: string
  display_order: number
}

export interface PoolSubgroupMembership {
  id: number
  subgroup_id: number
  pool_entry_id: number
}

export interface HydratedSet {
  set: SetSummary
  pool: PoolEntry[]
  tracklist: TracklistEntry[]
  explorer_nodes: ExplorerNode[]
  explorer_edges: ExplorerEdge[]
  pool_subgroups?: PoolSubgroup[]
  pool_subgroup_memberships?: PoolSubgroupMembership[]
}
