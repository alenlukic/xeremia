import type {
  Track,
  SearchSuggestion,
  TransitionMatch,
  MatchDetail,
  CacheStats,
  WeightsResponse,
  TrackTraitEntry,
  SetSummary,
  HydratedSet,
  PoolSubgroup,
} from '../types'

export async function fetchTracks(params: {
  camelot_code?: string
  bpm?: number
  bpm_min?: number
  bpm_max?: number
}): Promise<Track[]> {
  const qs = new URLSearchParams()
  if (params.camelot_code) {
    qs.set('camelot_code', params.camelot_code)
  }
  if (params.bpm != null) {
    qs.set('bpm', String(params.bpm))
  }
  if (params.bpm_min != null) {
    qs.set('bpm_min', String(params.bpm_min))
  }
  if (params.bpm_max != null) {
    qs.set('bpm_max', String(params.bpm_max))
  }

  const url = `/api/tracks${qs.toString() ? '?' + qs.toString() : ''}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch tracks: ${res.status}`)
  }
  return res.json()
}

export async function searchTracks(q: string): Promise<SearchSuggestion[]> {
  if (!q.trim()) {
    return []
  }
  const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`)
  }
  return res.json()
}

export async function fetchMatches(
  trackId: number,
  signal?: AbortSignal,
): Promise<TransitionMatch[]> {
  const res = await fetch(`/api/tracks/${trackId}/matches`, { signal })
  if (!res.ok) {
    throw new Error(`Failed to fetch matches: ${res.status}`)
  }
  return res.json()
}

export async function fetchMatchDetail(
  trackId: number,
  candidateId: number,
): Promise<MatchDetail> {
  const res = await fetch(`/api/tracks/${trackId}/match-detail/${candidateId}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch match detail: ${res.status}`)
  }
  return res.json()
}

export async function fetchTrackTraits(): Promise<TrackTraitEntry[]> {
  const res = await fetch('/api/track-traits')
  if (!res.ok) {
    throw new Error(`Failed to fetch track traits: ${res.status}`)
  }
  return res.json()
}

export async function fetchCacheStats(): Promise<CacheStats> {
  const res = await fetch('/api/admin/cache-stats')
  if (!res.ok) {
    throw new Error(`Failed to fetch cache stats: ${res.status}`)
  }
  return res.json()
}

export async function fetchWeights(): Promise<WeightsResponse> {
  const res = await fetch('/api/weights')
  if (!res.ok) {
    throw new Error(`Failed to fetch weights: ${res.status}`)
  }
  return res.json()
}

export async function fetchDefaultWeights(): Promise<Record<string, number>> {
  const res = await fetch('/api/weights/defaults')
  if (!res.ok) {
    throw new Error(`Failed to fetch default weights: ${res.status}`)
  }
  return res.json()
}

export async function updateWeights(
  weights: Record<string, number>,
): Promise<WeightsResponse> {
  const res = await fetch('/api/weights', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weights }),
  })
  if (!res.ok) {
    throw new Error(`Failed to update weights: ${res.status}`)
  }
  return res.json()
}

export async function fetchTransitionScores(
  pairs: [number, number][],
): Promise<{ scores: (number | null)[] }> {
  const res = await fetch('/api/sets/transition-scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairs }),
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch transition scores: ${res.status}`)
  }
  return res.json()
}

export async function exportSetM3u8(
  trackIds: number[],
  name: string,
): Promise<{ content: string; filename: string }> {
  const res = await fetch('/api/sets/export-m3u8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_ids: trackIds, name }),
  })
  if (!res.ok) {
    throw new Error(`Failed to export set: ${res.status}`)
  }
  return res.json()
}

// --- Set workspace API ---

export async function fetchSets(): Promise<SetSummary[]> {
  const res = await fetch('/api/sets')
  if (!res.ok) {
    throw new Error(`Failed to fetch sets: ${res.status}`)
  }
  return res.json()
}

export async function createSet(name: string): Promise<SetSummary> {
  const res = await fetch('/api/sets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw new Error(`Failed to create set: ${res.status}`)
  }
  return res.json()
}

export async function fetchHydratedSet(setId: number): Promise<HydratedSet> {
  const res = await fetch(`/api/sets/${setId}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch set: ${res.status}`)
  }
  return res.json()
}

export async function updateSet(
  setId: number,
  name: string,
): Promise<SetSummary> {
  const res = await fetch(`/api/sets/${setId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw new Error(`Failed to update set: ${res.status}`)
  }
  return res.json()
}

export async function deleteSet(setId: number): Promise<void> {
  const res = await fetch(`/api/sets/${setId}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`Failed to delete set: ${res.status}`)
  }
}

export async function poolAdd(setId: number, trackId: number): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/pool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: trackId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `Pool add failed: ${res.status}`)
  }
}

export async function poolRemove(
  setId: number,
  trackId: number,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/pool/${trackId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(`Pool remove failed: ${res.status}`)
  }
}

export async function poolMoveToTracklist(
  setId: number,
  trackId: number,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/pool/move-to-tracklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: trackId }),
  })
  if (!res.ok) {
    throw new Error(`Pool move to tracklist failed: ${res.status}`)
  }
}

export async function subgroupCreate(
  setId: number,
  name: string,
): Promise<PoolSubgroup> {
  const res = await fetch(`/api/sets/${setId}/pool/subgroups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw new Error(`Subgroup create failed: ${res.status}`)
  }
  return res.json()
}

export async function subgroupRename(
  setId: number,
  subgroupId: number,
  name: string,
): Promise<PoolSubgroup> {
  const res = await fetch(`/api/sets/${setId}/pool/subgroups/${subgroupId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw new Error(`Subgroup rename failed: ${res.status}`)
  }
  return res.json()
}

export async function subgroupDelete(
  setId: number,
  subgroupId: number,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/pool/subgroups/${subgroupId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(`Subgroup delete failed: ${res.status}`)
  }
}

export async function subgroupReorder(
  setId: number,
  subgroupIds: number[],
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/pool/subgroups/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subgroup_ids: subgroupIds }),
  })
  if (!res.ok) {
    throw new Error(`Subgroup reorder failed: ${res.status}`)
  }
}

export async function subgroupAddMember(
  setId: number,
  subgroupId: number,
  poolEntryId: number,
): Promise<void> {
  const res = await fetch(
    `/api/sets/${setId}/pool/subgroups/${subgroupId}/members`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pool_entry_id: poolEntryId }),
    },
  )
  if (!res.ok) {
    throw new Error(`Subgroup add member failed: ${res.status}`)
  }
}

export async function subgroupRemoveMember(
  setId: number,
  subgroupId: number,
  poolEntryId: number,
): Promise<void> {
  const res = await fetch(
    `/api/sets/${setId}/pool/subgroups/${subgroupId}/members/${poolEntryId}`,
    {
      method: 'DELETE',
    },
  )
  if (!res.ok) {
    throw new Error(`Subgroup remove member failed: ${res.status}`)
  }
}

export async function tracklistAdd(
  setId: number,
  trackId: number,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/tracklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: trackId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `Tracklist add failed: ${res.status}`)
  }
}

export async function updateTracklistNote(
  setId: number,
  trackId: number,
  note: string,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/tracklist/${trackId}/note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })
  if (!res.ok) {
    throw new Error(`Note update failed: ${res.status}`)
  }
}

export async function tracklistRemove(
  setId: number,
  trackId: number,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/tracklist/${trackId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(`Tracklist remove failed: ${res.status}`)
  }
}

export async function tracklistReorder(
  setId: number,
  trackId: number,
  newPosition: number,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/tracklist/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: trackId, new_position: newPosition }),
  })
  if (!res.ok) {
    throw new Error(`Tracklist reorder failed: ${res.status}`)
  }
}

export async function tracklistMoveToPool(
  setId: number,
  trackId: number,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/tracklist/move-to-pool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: trackId }),
  })
  if (!res.ok) {
    throw new Error(`Tracklist move to pool failed: ${res.status}`)
  }
}

export async function explorerAddNode(
  setId: number,
  trackId: number,
  parentNodeId?: string,
  level: number = 0,
): Promise<{ ok: boolean; node_id: string; track_id: number; level: number }> {
  const res = await fetch(`/api/sets/${setId}/explorer/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      track_id: trackId,
      parent_node_id: parentNodeId,
      level,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `Explorer add node failed: ${res.status}`)
  }
  return res.json()
}

export async function explorerDeleteNode(
  setId: number,
  nodeId: string,
  rewireEdges?: { parent_node_id: string; child_node_id: string }[],
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/explorer/delete-node`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId, rewire_edges: rewireEdges ?? [] }),
  })
  if (!res.ok) {
    throw new Error(`Explorer delete node failed: ${res.status}`)
  }
}

export async function explorerAddEdge(
  setId: number,
  parentNodeId: string,
  childNodeId: string,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/explorer/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent_node_id: parentNodeId,
      child_node_id: childNodeId,
    }),
  })
  if (!res.ok) {
    throw new Error(`Explorer add edge failed: ${res.status}`)
  }
}

export async function explorerDeleteEdge(
  setId: number,
  edgeId: number,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/explorer/edges/${edgeId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(`Explorer delete edge failed: ${res.status}`)
  }
}

export async function explorerSwap(
  setId: number,
  nodeAId: string,
  nodeBId: string,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/explorer/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_a_id: nodeAId, node_b_id: nodeBId }),
  })
  if (!res.ok) {
    throw new Error(`Explorer swap failed: ${res.status}`)
  }
}

export async function explorerNodeToTracklist(
  setId: number,
  nodeId: string,
): Promise<void> {
  const res = await fetch(`/api/sets/${setId}/explorer/node-to-tracklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId }),
  })
  if (!res.ok) {
    throw new Error(`Explorer node to tracklist failed: ${res.status}`)
  }
}

export async function explorerEdgeScores(
  setId: number,
  pairs: [number, number][],
): Promise<{ scores: (number | null)[] }> {
  const res = await fetch(`/api/sets/${setId}/explorer/edge-scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairs }),
  })
  if (!res.ok) {
    throw new Error(`Explorer edge scores failed: ${res.status}`)
  }
  return res.json()
}
