export type TableId = 'search' | 'matches' | 'tracklist' | 'pool'

export interface TablePreferenceConfig {
  column_order: string[]
  column_visibility: Record<string, boolean>
  column_widths: Record<string, number>
}

export interface TablePreferenceResponse extends TablePreferenceConfig {
  table_id: TableId
  updated_at?: string | null
}

export interface TablePreferencesListResponse {
  preferences: TablePreferenceResponse[]
}

export interface ColumnRegistryEntry {
  id: string
  label: string
  defaultVisible?: boolean
  defaultWidth?: number
  resizable?: boolean
  /**
   * Whether the inline hover-× can hide this column. Identity columns (e.g. the
   * matches "Track" column) set this false so an accidental click can never
   * remove them — they stay adjustable only in Admin → Preferences.
   */
  removable?: boolean
}

export interface NormalizedTableConfig {
  columnOrder: string[]
  columnVisibility: Record<string, boolean>
  columnWidths: Record<string, number>
}

export const MIN_COL_WIDTH = 40
export const MAX_COL_WIDTH = 2000

const SEARCH_REGISTRY: ColumnRegistryEntry[] = [
  { id: 'play', label: 'Pre.', defaultVisible: true, resizable: false },
  {
    id: 'camelot_code',
    label: 'Camelot',
    defaultVisible: true,
    defaultWidth: 62,
  },
  { id: 'key', label: 'Key', defaultVisible: false, defaultWidth: 62 },
  { id: 'bpm', label: 'BPM', defaultVisible: true, defaultWidth: 62 },
  { id: 'energy', label: 'Energy', defaultVisible: false, defaultWidth: 62 },
  {
    id: 'date_added',
    label: 'Date Added',
    defaultVisible: true,
    defaultWidth: 80,
  },
  { id: 'title', label: 'Title', defaultVisible: true, defaultWidth: 220 },
  { id: 'label', label: 'Label', defaultVisible: true, defaultWidth: 90 },
  { id: 'genre', label: 'Genre', defaultVisible: true, defaultWidth: 90 },
]

const MATCHES_REGISTRY: ColumnRegistryEntry[] = [
  { id: 'play', label: 'Pre.', defaultVisible: true, resizable: false },
  {
    id: 'track_title',
    label: 'Track',
    defaultVisible: true,
    defaultWidth: 260,
    // Identity column: never removable inline so it can't vanish by accident.
    removable: false,
  },
  {
    id: 'overall_score',
    label: 'Score',
    defaultVisible: true,
    defaultWidth: 70,
  },
  {
    id: 'similarity_score',
    label: 'Spectral',
    defaultVisible: true,
    defaultWidth: 60,
  },
  { id: 'camelot_score', label: 'Key', defaultVisible: true, defaultWidth: 60 },
  { id: 'bpm_score', label: 'BPM', defaultVisible: true, defaultWidth: 60 },
  {
    id: 'genre_similarity_score',
    label: 'Genre',
    defaultVisible: true,
    defaultWidth: 60,
  },
  {
    id: 'freshness_score',
    label: 'Recency',
    defaultVisible: true,
    defaultWidth: 60,
  },
  {
    id: 'energy_score',
    label: 'Energy (MIK)',
    defaultVisible: true,
    defaultWidth: 73,
  },
  {
    id: 'mood_continuity_score',
    label: 'Mood',
    defaultVisible: true,
    defaultWidth: 60,
  },
  {
    id: 'instrument_similarity_score',
    label: 'Instruments',
    defaultVisible: true,
    defaultWidth: 73,
  },
  {
    id: 'vocal_clash_score',
    label: 'Vocals',
    defaultVisible: true,
    defaultWidth: 60,
  },
  {
    id: 'details',
    label: 'Details',
    defaultVisible: true,
    defaultWidth: 48,
    resizable: false,
  },
]

const TRACKLIST_REGISTRY: ColumnRegistryEntry[] = [
  { id: 'play', label: 'Pre.', defaultVisible: true, resizable: false },
  { id: 'num', label: '#', defaultVisible: true, defaultWidth: 40 },
  { id: 'title', label: 'Title', defaultVisible: true, defaultWidth: 220 },
  { id: 'key', label: 'Key', defaultVisible: true, defaultWidth: 62 },
  { id: 'bpm', label: 'BPM', defaultVisible: true, defaultWidth: 62 },
  { id: 'note', label: 'Note', defaultVisible: true, defaultWidth: 160 },
]

const POOL_REGISTRY: ColumnRegistryEntry[] = [
  { id: 'play', label: 'Pre.', defaultVisible: true, resizable: false },
  { id: 'num', label: '#', defaultVisible: true, defaultWidth: 40 },
  { id: 'title', label: 'Title', defaultVisible: true, defaultWidth: 220 },
  { id: 'key', label: 'Key', defaultVisible: true, defaultWidth: 62 },
  { id: 'bpm', label: 'BPM', defaultVisible: true, defaultWidth: 62 },
  {
    id: 'subgroups',
    label: 'Groups',
    defaultVisible: true,
    defaultWidth: 140,
  },
]

export const TABLE_REGISTRIES: Record<TableId, ColumnRegistryEntry[]> = {
  search: SEARCH_REGISTRY,
  matches: MATCHES_REGISTRY,
  tracklist: TRACKLIST_REGISTRY,
  pool: POOL_REGISTRY,
}

export const TABLE_IDS: TableId[] = ['search', 'matches', 'tracklist', 'pool']

function defaultOrder(registry: ColumnRegistryEntry[]): string[] {
  return registry.map((entry) => entry.id)
}

function defaultVisibility(
  registry: ColumnRegistryEntry[],
): Record<string, boolean> {
  const visibility: Record<string, boolean> = {}
  for (const entry of registry) {
    visibility[entry.id] = entry.defaultVisible !== false
  }
  return visibility
}

function defaultWidths(
  registry: ColumnRegistryEntry[],
): Record<string, number> {
  const widths: Record<string, number> = {}
  for (const entry of registry) {
    if (entry.defaultWidth != null) {
      widths[entry.id] = entry.defaultWidth
    }
  }
  return widths
}

export function defaultTableConfig(tableId: TableId): NormalizedTableConfig {
  const registry = TABLE_REGISTRIES[tableId]
  return {
    columnOrder: defaultOrder(registry),
    columnVisibility: defaultVisibility(registry),
    columnWidths: defaultWidths(registry),
  }
}

function clampWidth(width: number): number {
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(width)))
}

export function normalizeTableConfig(
  tableId: TableId,
  saved?: Partial<TablePreferenceConfig> | null,
): NormalizedTableConfig {
  const registry = TABLE_REGISTRIES[tableId]
  const registryIds = new Set(registry.map((entry) => entry.id))
  const defaults = defaultTableConfig(tableId)

  const rawOrder = Array.isArray(saved?.column_order)
    ? saved.column_order.filter(
        (id): id is string => typeof id === 'string' && registryIds.has(id),
      )
    : []
  const seen = new Set<string>()
  const columnOrder: string[] = []
  for (const id of rawOrder) {
    if (!seen.has(id)) {
      seen.add(id)
      columnOrder.push(id)
    }
  }
  // Insert registry columns absent from the saved order at their registry-relative
  // position (before the next registry sibling already present) rather than at the
  // very end — so a newly-introduced column appears where the registry intends it.
  for (let i = 0; i < registry.length; i++) {
    const id = registry[i].id
    if (seen.has(id)) {
      continue
    }
    let insertAt = columnOrder.length
    for (let j = i + 1; j < registry.length; j++) {
      const idx = columnOrder.indexOf(registry[j].id)
      if (idx >= 0) {
        insertAt = idx
        break
      }
    }
    columnOrder.splice(insertAt, 0, id)
    seen.add(id)
  }

  const columnVisibility = { ...defaults.columnVisibility }
  if (saved?.column_visibility && typeof saved.column_visibility === 'object') {
    for (const [id, visible] of Object.entries(saved.column_visibility)) {
      if (registryIds.has(id) && typeof visible === 'boolean') {
        columnVisibility[id] = visible
      }
    }
  }

  const columnWidths = { ...defaults.columnWidths }
  if (saved?.column_widths && typeof saved.column_widths === 'object') {
    for (const [id, width] of Object.entries(saved.column_widths)) {
      if (
        registryIds.has(id) &&
        typeof width === 'number' &&
        Number.isFinite(width)
      ) {
        columnWidths[id] = clampWidth(width)
      }
    }
  }

  return { columnOrder, columnVisibility, columnWidths }
}

export function toApiPayload(
  config: NormalizedTableConfig,
): TablePreferenceConfig {
  return {
    column_order: [...config.columnOrder],
    column_visibility: { ...config.columnVisibility },
    column_widths: { ...config.columnWidths },
  }
}

export function visibleColumnIds(config: NormalizedTableConfig): string[] {
  return config.columnOrder.filter(
    (id) => config.columnVisibility[id] !== false,
  )
}

export function inactiveColumns(
  tableId: TableId,
  config: NormalizedTableConfig,
): ColumnRegistryEntry[] {
  return TABLE_REGISTRIES[tableId].filter(
    (entry) => config.columnVisibility[entry.id] === false,
  )
}
