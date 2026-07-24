import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSetBuilder } from './useSetBuilder'
import type { ExplorerNode, HydratedSet, SetSummary, Track } from '../types'

vi.mock('../api/http', () => ({
  fetchSets: vi.fn(),
  createSet: vi.fn(),
  fetchHydratedSet: vi.fn(),
  deleteSet: vi.fn(),
  poolAdd: vi.fn(),
  poolRemove: vi.fn(),
  poolReorder: vi.fn(),
  poolMoveToTracklist: vi.fn(),
  tracklistAdd: vi.fn(),
  tracklistRemove: vi.fn(),
  tracklistReorder: vi.fn(),
  tracklistMoveToPool: vi.fn(),
  updateTracklistNote: vi.fn(),
  explorerAddNode: vi.fn(),
  explorerDeleteNode: vi.fn(),
  explorerAddEdge: vi.fn(),
  explorerSwap: vi.fn(),
  explorerNodeToTracklist: vi.fn(),
  explorerDeleteEdge: vi.fn(),
  explorerEdgeScores: vi.fn(),
  subgroupCreate: vi.fn(),
  subgroupRename: vi.fn(),
  subgroupDelete: vi.fn(),
  subgroupReorder: vi.fn(),
  subgroupMemberReorder: vi.fn(),
  subgroupAddMember: vi.fn(),
  subgroupRemoveMember: vi.fn(),
  subgroupDropTrack: vi.fn(),
}))

function makeSetSummary(overrides: Partial<SetSummary> = {}): SetSummary {
  return {
    id: 1,
    name: 'Test Set',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    pool_count: 0,
    tracklist_count: 0,
    ...overrides,
  }
}

function makeTrack(id: number, title = `Track ${id}`): Track {
  return {
    id,
    title,
    artist_names: [],
    bpm: 128,
    key: 'C',
    camelot_code: '8B',
    genre: null,
    label: null,
    energy: null,
    date_added: null,
  }
}

function makeExplorerNode(
  overrides: Partial<ExplorerNode> & {
    node_id: string
    track_id: number
    level: number
  },
): ExplorerNode {
  const { node_id, track_id, level, col_index = 0, ...rest } = overrides
  return {
    id: 1,
    set_id: 1,
    node_id,
    track_id,
    level,
    col_index,
    track: makeTrack(track_id),
    ...rest,
  }
}

function makeHydratedSet(overrides: Partial<HydratedSet> = {}): HydratedSet {
  return {
    set: makeSetSummary(),
    pool: [],
    tracklist: [],
    explorer_nodes: [],
    explorer_edges: [],
    ...overrides,
  }
}

describe('useSetBuilder addExplorerNode', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    const http = await import('../api/http')
    vi.mocked(http.fetchSets).mockResolvedValue([])
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(makeHydratedSet())
    vi.mocked(http.explorerAddNode).mockResolvedValue({
      ok: true,
      node_id: 'created',
      track_id: 999,
      x: 0,
      y: 0,
    })
    vi.mocked(http.explorerAddEdge).mockResolvedValue(undefined)
    vi.mocked(http.explorerEdgeScores).mockResolvedValue({ scores: [] })
  })

  it('adds a node at the given canvas position, allowing duplicate tracks', async () => {
    // The graph canvas has no "levels": dropping a track that already exists
    // creates a new node at the drop point rather than reusing the old one.
    const http = await import('../api/http')
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'existing', track_id: 99, level: 0 }),
      ],
    })
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated)

    const { result } = renderHook(() => useSetBuilder())

    await act(async () => {
      result.current.selectSet(1)
    })

    await waitFor(() => expect(result.current.activeSetId).toBe(1))

    await act(async () => {
      await result.current.addExplorerNode(99, 300, 200)
    })

    expect(http.explorerAddNode).toHaveBeenCalledWith(1, 99, 300, 200, undefined)
    expect(http.explorerAddEdge).not.toHaveBeenCalled()
  })

  it('deleteExplorerEdge calls explorerDeleteEdge and refreshes the active set', async () => {
    const http = await import('../api/http')
    vi.mocked(http.explorerDeleteEdge).mockResolvedValue(undefined)
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'n1', track_id: 10, level: 0 }),
        makeExplorerNode({ node_id: 'n2', track_id: 11, level: 1 }),
      ],
      explorer_edges: [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ],
    })
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated)

    const { result } = renderHook(() => useSetBuilder())

    await act(async () => {
      result.current.selectSet(1)
    })

    await waitFor(() => expect(result.current.activeSetId).toBe(1))

    await act(async () => {
      await result.current.deleteExplorerEdge(42)
    })

    expect(http.explorerDeleteEdge).toHaveBeenCalledWith(1, 42)
    expect(http.fetchHydratedSet).toHaveBeenCalled()
  })

  it('addExplorerEdge skips API call when edge already exists in active set', async () => {
    const http = await import('../api/http')
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'n1', track_id: 10, level: 0 }),
        makeExplorerNode({ node_id: 'n2', track_id: 11, level: 1 }),
      ],
      explorer_edges: [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ],
    })
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated)

    const { result } = renderHook(() => useSetBuilder())

    await act(async () => {
      result.current.selectSet(1)
    })

    await waitFor(() => expect(result.current.activeSetId).toBe(1))

    await act(async () => {
      await result.current.addExplorerEdge('n1', 'n2')
    })

    expect(http.explorerAddEdge).not.toHaveBeenCalled()
  })

  it('addExplorerEdge calls API when edge does not yet exist', async () => {
    const http = await import('../api/http')
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'n1', track_id: 10, level: 0 }),
        makeExplorerNode({ node_id: 'n2', track_id: 11, level: 1 }),
      ],
      explorer_edges: [],
    })
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated)

    const { result } = renderHook(() => useSetBuilder())

    await act(async () => {
      result.current.selectSet(1)
    })

    await waitFor(() => expect(result.current.activeSetId).toBe(1))

    await act(async () => {
      await result.current.addExplorerEdge('n1', 'n2')
    })

    expect(http.explorerAddEdge).toHaveBeenCalledWith(1, 'n1', 'n2')
  })

  it('creates a node wired to a parent when a parent id is supplied', async () => {
    const http = await import('../api/http')
    const hydrated = makeHydratedSet({
      explorer_nodes: [
        makeExplorerNode({ node_id: 'parent', track_id: 10, level: 0 }),
      ],
    })
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(hydrated)

    const { result } = renderHook(() => useSetBuilder())

    await act(async () => {
      result.current.selectSet(1)
    })

    await waitFor(() => expect(result.current.activeSetId).toBe(1))

    await act(async () => {
      await result.current.addExplorerNode(99, 300, 200, 'parent')
    })

    expect(http.explorerAddNode).toHaveBeenCalledWith(1, 99, 300, 200, 'parent')
  })

  it('surfaces explorer node-cap constraint detail in the toast', async () => {
    const http = await import('../api/http')
    vi.mocked(http.explorerAddNode).mockRejectedValue(
      new Error('Explorer exceeds maximum of 500 nodes per set'),
    )

    const { result } = renderHook(() => useSetBuilder())

    await act(async () => {
      result.current.selectSet(1)
    })

    await waitFor(() => expect(result.current.activeSetId).toBe(1))

    await act(async () => {
      await result.current.addExplorerNode(99, 300, 200)
    })

    expect(result.current.error).toBe(
      'Explorer exceeds maximum of 500 nodes per set',
    )
  })
})

describe('useSetBuilder dropTrackToSubgroup', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    const http = await import('../api/http')
    vi.mocked(http.fetchSets).mockResolvedValue([])
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(makeHydratedSet())
    vi.mocked(http.subgroupDropTrack).mockResolvedValue(undefined)
  })

  it('calls subgroupDropTrack and refreshes the active set', async () => {
    const http = await import('../api/http')
    const { result } = renderHook(() => useSetBuilder())

    await act(async () => {
      result.current.selectSet(1)
    })

    await waitFor(() => expect(result.current.activeSetId).toBe(1))

    await act(async () => {
      await result.current.dropTrackToSubgroup(5, 42, 'browse')
    })

    expect(http.subgroupDropTrack).toHaveBeenCalledWith(1, 5, 42, 'browse')
    expect(http.fetchHydratedSet).toHaveBeenCalled()
  })
})

describe('useSetBuilder reorderSubgroupMember', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    const http = await import('../api/http')
    vi.mocked(http.fetchSets).mockResolvedValue([])
    vi.mocked(http.fetchHydratedSet).mockResolvedValue(makeHydratedSet())
    vi.mocked(http.subgroupMemberReorder).mockResolvedValue(undefined)
  })

  it('calls subgroupMemberReorder and refreshes the active set', async () => {
    const http = await import('../api/http')
    const { result } = renderHook(() => useSetBuilder())

    await act(async () => {
      result.current.selectSet(1)
    })

    await waitFor(() => expect(result.current.activeSetId).toBe(1))

    await act(async () => {
      await result.current.reorderSubgroupMember(5, 42, 1)
    })

    expect(http.subgroupMemberReorder).toHaveBeenCalledWith(1, 5, 42, 1)
    expect(http.fetchHydratedSet).toHaveBeenCalled()
  })
})
