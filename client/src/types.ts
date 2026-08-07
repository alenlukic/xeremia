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
  /** Track length read from the audio header; null until the backfill runs. */
  duration_seconds?: number | null
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

/** Sequencer view state, stored on the set so it survives a reload. */
export interface SequencerSettings {
  start_minutes?: number
  end_minutes?: number
  tick_minutes?: number
  px_per_min?: number
  view?: string
  /** Bench lane positions by track id; a lane position is part of the plan. */
  bench_times?: Record<string, number>
  bench_overrides?: Record<string, Record<string, number | null>>
}

export interface SetSummary {
  id: number
  name: string
  created_at: string
  updated_at: string
  pool_count: number
  tracklist_count: number
  sequencer?: SequencerSettings | null
}

export interface PoolEntry {
  id: number
  set_id: number
  track_id: number
  insertion_order: number
  /** Optional per-track highlight color (#RRGGBB); null when not highlighted. */
  highlight_color: string | null
  track: Track | null
}

export interface TracklistEntry {
  id: number
  set_id: number
  track_id: number
  position: number
  note?: string
  /** Sequencer overrides. Null means "derive from the track". */
  play_minutes?: number | null
  pinned_end_minutes?: number | null
  bpm_override?: number | null
  track: Track | null
}

/** Per-track Sequencer overrides as the API accepts them. */
export interface TracklistOverrides {
  play_minutes: number | null
  pinned_end_minutes: number | null
  bpm_override: number | null
}

export interface ExplorerNode {
  id: number
  set_id: number
  node_id: string
  track_id: number
  /** Free-canvas position (grid-snapped SVG user-space coordinates). */
  x: number
  y: number
  /** Legacy tree-layout fields, retained for backward compatibility. */
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
  display_order: number
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

export type TableId = 'search' | 'matches' | 'tracklist' | 'pool'

/** The workspace layout reuses the table-preference surface for device scoping. */
export const WORKSPACE_LAYOUT_TABLE_ID = 'workspace-layout'

export type PreferenceTableId = TableId | typeof WORKSPACE_LAYOUT_TABLE_ID

export type WidgetId = 'browser' | 'matches' | 'pool' | 'explorer' | 'sequencer'

/**
 * A widget's rectangle in grid units on the discretized workspace canvas.
 * Free-form: any size, any position, as long as it stays on the grid and does
 * not overlap another widget.
 */
export interface Placement {
  x: number
  y: number
  w: number
  h: number
}

export type LayoutPlace = Partial<Record<WidgetId, Placement>>

export type ShellId = 'workspace' | 'legacy'

/**
 * Widgets whose width is pinned. A locked widget's columns are excluded from
 * divider redistribution, so resizing elsewhere leaves its width untouched.
 */
export type LockedWidgets = Partial<Record<WidgetId, true>>

/** A named layout the DJ saved. Rectangles carry their own sizes. */
export interface SavedLayout {
  place: LayoutPlace
  locked?: LockedWidgets
}

export interface WorkspaceLayoutState {
  preset: string
  place: LayoutPlace
  /**
   * Canvas size the rectangles were authored at, in units. Placements rescale
   * from this on load, so a different window never shifts widgets into each
   * other.
   */
  bounds?: { cols: number; rows: number }
  custom: Record<string, SavedLayout>
  shell: ShellId
  /** Absent on rows written before width locking existed. */
  locked?: LockedWidgets
}

export interface TablePreferenceConfig {
  column_order: string[]
  column_visibility: Record<string, boolean>
  column_widths: Record<string, number>
  /** Only the workspace-layout row carries this. */
  layout?: WorkspaceLayoutState | null
}

export interface TablePreferenceResponse extends TablePreferenceConfig {
  table_id: TableId
  updated_at?: string | null
}

export interface TablePreferencesListResponse {
  preferences: TablePreferenceResponse[]
}
