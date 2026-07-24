import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { SetExplorerCanvas } from './SetExplorerCanvas'
import type { ExplorerNode, ExplorerEdge, Track } from '../types'
import { TRACK_DRAG_MIME } from '../utils'

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
  fetchMatches: vi.fn().mockResolvedValue([
    {
      candidate_id: 99,
      title: 'Match Result',
      overall_score: 0.85,
      bucket: 'same_key',
      camelot_score: 1,
      bpm_score: 0.9,
      energy_score: 0.8,
      similarity_score: 0.7,
      freshness_score: 1,
      genre_similarity_score: 0.6,
      mood_continuity_score: 0.5,
      vocal_clash_score: 1,
      instrument_similarity_score: 0.4,
    },
  ]),
}))

function makeNode(
  overrides: Partial<ExplorerNode> & { node_id: string; track_id: number },
): ExplorerNode {
  return {
    id: 1,
    set_id: 1,
    x: 0,
    y: 0,
    level: 0,
    col_index: 0,
    track: {
      id: overrides.track_id,
      title: `Track ${overrides.track_id}`,
      artist_names: [],
      bpm: 128,
      key: 'C',
      camelot_code: '8B',
      genre: null,
      label: null,
      energy: null,
      date_added: null,
    },
    ...overrides,
  }
}

function makeTrack(id: number, title: string): Track {
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

function makeEdge(
  id: number,
  parent: string,
  child: string,
): ExplorerEdge {
  return { id, set_id: 1, parent_node_id: parent, child_node_id: child }
}

function defaultProps(
  overrides: {
    nodes?: ExplorerNode[]
    edges?: ExplorerEdge[]
    allTracks?: Track[]
    tracklistTrackIds?: Set<number>
    fetchEdgeScores?: ReturnType<typeof vi.fn>
  } = {},
) {
  return {
    allTracks: overrides.allTracks ?? ([] as Track[]),
    nodes: overrides.nodes ?? [],
    edges: overrides.edges ?? [],
    onAddNode: vi.fn().mockResolvedValue({ node_id: 'new' }),
    onMoveNode: vi.fn(),
    onSetPositions: vi.fn().mockResolvedValue(undefined),
    onDeleteNode: vi.fn(),
    onAddEdge: vi.fn().mockResolvedValue(undefined),
    onDeleteEdge: vi.fn().mockResolvedValue(undefined),
    onSwap: vi.fn(),
    onNodeToTracklist: vi.fn(),
    onAddNodeWithParents: vi.fn().mockResolvedValue({ node_id: 'new' }),
    tracklistTrackIds: overrides.tracklistTrackIds ?? new Set<number>(),
    fetchEdgeScores:
      overrides.fetchEdgeScores ?? vi.fn().mockResolvedValue({ scores: [] }),
  }
}

// jsdom implements no SVG coordinate mapping, so `toSvgPoint` returns null and
// geometry features (marquee, drop hit-testing) can't resolve. Stub the matrix
// to identity so SVG user-space equals client coordinates.
function withSvgMatrixStub<T>(fn: () => T): T {
  const proto = window.SVGSVGElement.prototype as unknown as {
    createSVGPoint?: () => {
      x: number
      y: number
      matrixTransform: () => { x: number; y: number }
    }
    getScreenCTM?: () => { inverse: () => unknown }
  }
  const origPoint = proto.createSVGPoint
  const origCTM = proto.getScreenCTM
  proto.createSVGPoint = function () {
    const p = { x: 0, y: 0, matrixTransform: () => ({ x: p.x, y: p.y }) }
    return p
  }
  proto.getScreenCTM = function () {
    return { inverse: () => ({}) }
  }
  try {
    return fn()
  } finally {
    proto.createSVGPoint = origPoint
    proto.getScreenCTM = origCTM
  }
}

function nodeEl(container: HTMLElement, nodeId: string): HTMLElement {
  const el = container.querySelector(`[data-node-id="${nodeId}"]`)
  if (!el) {
    throw new Error(`node ${nodeId} not found`)
  }
  return el as unknown as HTMLElement
}

function viewportEl(container: HTMLElement): HTMLElement {
  return container.querySelector('.set-explorer-viewport') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('SetExplorerCanvas — rendering', () => {
  it('shows the empty message when there are no nodes', () => {
    render(<SetExplorerCanvas {...defaultProps()} />)
    expect(screen.getByText(/Canvas is empty/i)).toBeInTheDocument()
  })

  it('renders a node at its x/y position with its title', () => {
    const nodes = [makeNode({ node_id: 'a', track_id: 1, x: 120, y: 80 })]
    const { container } = render(
      <SetExplorerCanvas {...defaultProps({ nodes })} />,
    )
    const g = nodeEl(container, 'a')
    expect(g.getAttribute('transform')).toBe('translate(120, 80)')
    expect(g.querySelector('.explorer-node-title')?.textContent).toBe('Track 1')
  })

  it('renders the infinite dot grid', () => {
    const { container } = render(<SetExplorerCanvas {...defaultProps()} />)
    expect(container.querySelector('.explorer-grid-bg')).toBeInTheDocument()
    expect(container.querySelector('#explorer-grid-dots')).toBeInTheDocument()
  })
})

describe('SetExplorerCanvas — selection and node actions', () => {
  it('reveals the action row when a single node is selected', () => {
    const nodes = [makeNode({ node_id: 'a', track_id: 1 })]
    const { container } = render(
      <SetExplorerCanvas {...defaultProps({ nodes })} />,
    )
    const g = nodeEl(container, 'a')
    expect(
      within(g).getByTestId('explorer-action-row').classList.contains(
        'explorer-action-row--visible',
      ),
    ).toBe(false)
    fireEvent.click(g)
    expect(
      within(g).getByTestId('explorer-action-row').classList.contains(
        'explorer-action-row--visible',
      ),
    ).toBe(true)
  })

  it('deletes a node via the × action', () => {
    const nodes = [makeNode({ node_id: 'a', track_id: 1 })]
    const props = defaultProps({ nodes })
    const { container } = render(<SetExplorerCanvas {...props} />)
    const g = nodeEl(container, 'a')
    fireEvent.click(g)
    fireEvent.click(within(g).getByLabelText('Delete node'))
    expect(props.onDeleteNode).toHaveBeenCalledWith('a')
  })

  it('deletes selected node(s) with Backspace', () => {
    const nodes = [makeNode({ node_id: 'a', track_id: 1 })]
    const props = defaultProps({ nodes })
    const { container } = render(<SetExplorerCanvas {...props} />)
    fireEvent.click(nodeEl(container, 'a'))
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(props.onDeleteNode).toHaveBeenCalledWith('a')
  })

  it('clears selection on Escape', () => {
    const nodes = [makeNode({ node_id: 'a', track_id: 1 })]
    const { container } = render(
      <SetExplorerCanvas {...defaultProps({ nodes })} />,
    )
    const g = nodeEl(container, 'a')
    fireEvent.click(g)
    expect(
      within(g)
        .getByTestId('explorer-action-row')
        .classList.contains('explorer-action-row--visible'),
    ).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(
      within(g)
        .getByTestId('explorer-action-row')
        .classList.contains('explorer-action-row--visible'),
    ).toBe(false)
  })

  it('starts a swap and completes it on the next node click', () => {
    const nodes = [
      makeNode({ node_id: 'a', track_id: 1, x: 0, y: 0 }),
      makeNode({ node_id: 'b', track_id: 2, x: 400, y: 0 }),
    ]
    const props = defaultProps({ nodes })
    const { container } = render(<SetExplorerCanvas {...props} />)
    fireEvent.click(nodeEl(container, 'a'))
    fireEvent.click(
      within(nodeEl(container, 'a')).getByLabelText('Swap track IDs'),
    )
    expect(screen.getByText(/Click another node to swap/i)).toBeInTheDocument()
    fireEvent.click(nodeEl(container, 'b'))
    expect(props.onSwap).toHaveBeenCalledWith('a', 'b')
  })

  it('offers →TL only for nodes not already in the tracklist', () => {
    const nodes = [
      makeNode({ node_id: 'a', track_id: 1, x: 0, y: 0 }),
      makeNode({ node_id: 'b', track_id: 2, x: 400, y: 0 }),
    ]
    const props = defaultProps({
      nodes,
      tracklistTrackIds: new Set([2]),
    })
    const { container } = render(<SetExplorerCanvas {...props} />)
    fireEvent.click(nodeEl(container, 'a'))
    fireEvent.click(within(nodeEl(container, 'a')).getByLabelText('Add to Tracklist'))
    expect(props.onNodeToTracklist).toHaveBeenCalledWith('a')
    expect(
      within(nodeEl(container, 'b')).queryByLabelText('Add to Tracklist'),
    ).toBeNull()
  })
})

describe('SetExplorerCanvas — repositioning (drag)', () => {
  it('persists a snapped position after dragging a node body', () => {
    const nodes = [makeNode({ node_id: 'a', track_id: 1, x: 100, y: 100 })]
    const props = defaultProps({ nodes })
    const { container } = render(<SetExplorerCanvas {...props} />)
    const g = nodeEl(container, 'a')
    const vp = viewportEl(container)
    fireEvent.mouseDown(g, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.mouseMove(vp, { clientX: 200, clientY: 160 })
    fireEvent.mouseUp(vp)
    // originX 100 + delta 100 = 200, originY 100 + 60 = 160 (grid-snapped).
    expect(props.onMoveNode).toHaveBeenCalledWith('a', 200, 160)
  })

  it('does not persist a click without movement', () => {
    const nodes = [makeNode({ node_id: 'a', track_id: 1, x: 100, y: 100 })]
    const props = defaultProps({ nodes })
    const { container } = render(<SetExplorerCanvas {...props} />)
    const g = nodeEl(container, 'a')
    const vp = viewportEl(container)
    fireEvent.mouseDown(g, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.mouseUp(vp)
    expect(props.onMoveNode).not.toHaveBeenCalled()
  })
})

describe('SetExplorerCanvas — edges', () => {
  it('creates a directed edge by dragging from a connect handle to a node', () => {
    const nodes = [
      makeNode({ node_id: 'a', track_id: 1, x: 0, y: 0 }),
      makeNode({ node_id: 'b', track_id: 2, x: 400, y: 0 }),
    ]
    const props = defaultProps({ nodes })
    const { container } = render(<SetExplorerCanvas {...props} />)
    const handle = nodeEl(container, 'a').querySelector(
      '.explorer-connect-handle',
    ) as HTMLElement
    fireEvent.mouseDown(handle, { button: 0 })
    fireEvent.mouseUp(nodeEl(container, 'b'))
    expect(props.onAddEdge).toHaveBeenCalledWith('a', 'b')
  })

  it('renders a directed edge with an arrowhead', () => {
    const nodes = [
      makeNode({ node_id: 'a', track_id: 1, x: 0, y: 0 }),
      makeNode({ node_id: 'b', track_id: 2, x: 400, y: 0 }),
    ]
    const edges = [makeEdge(1, 'a', 'b')]
    render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)
    expect(screen.getByTestId('explorer-edge-path')).toBeInTheDocument()
    expect(screen.getByTestId('explorer-edge-arrow')).toBeInTheDocument()
  })

  it('selects an edge and deletes it via the × button', () => {
    const nodes = [
      makeNode({ node_id: 'a', track_id: 1, x: 0, y: 0 }),
      makeNode({ node_id: 'b', track_id: 2, x: 400, y: 0 }),
    ]
    const edges = [makeEdge(7, 'a', 'b')]
    const props = defaultProps({ nodes, edges })
    render(<SetExplorerCanvas {...props} />)
    fireEvent.click(screen.getByTestId('explorer-edge-hitbox'))
    fireEvent.click(screen.getByTestId('explorer-edge-delete-btn'))
    expect(props.onDeleteEdge).toHaveBeenCalledWith(7)
  })

  it('deletes a selected edge with Backspace', () => {
    const nodes = [
      makeNode({ node_id: 'a', track_id: 1, x: 0, y: 0 }),
      makeNode({ node_id: 'b', track_id: 2, x: 400, y: 0 }),
    ]
    const edges = [makeEdge(7, 'a', 'b')]
    const props = defaultProps({ nodes, edges })
    render(<SetExplorerCanvas {...props} />)
    fireEvent.click(screen.getByTestId('explorer-edge-hitbox'))
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(props.onDeleteEdge).toHaveBeenCalledWith(7)
  })

  it('shows a compatibility score label once fetched', async () => {
    const nodes = [
      makeNode({ node_id: 'a', track_id: 1, x: 0, y: 0 }),
      makeNode({ node_id: 'b', track_id: 2, x: 400, y: 0 }),
    ]
    const edges = [makeEdge(1, 'a', 'b')]
    const fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.9] })
    render(
      <SetExplorerCanvas {...defaultProps({ nodes, edges, fetchEdgeScores })} />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('explorer-edge-label')).toBeInTheDocument(),
    )
  })
})

describe('SetExplorerCanvas — edge style toggle', () => {
  function edgePathD(): string {
    return screen.getByTestId('explorer-edge-path').getAttribute('d') ?? ''
  }

  it('switches edge geometry between curved, straight and right-angle', () => {
    const nodes = [
      makeNode({ node_id: 'a', track_id: 1, x: 0, y: 0 }),
      makeNode({ node_id: 'b', track_id: 2, x: 400, y: 200 }),
    ]
    const edges = [makeEdge(1, 'a', 'b')]
    render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

    // Default is curved (cubic bezier).
    expect(edgePathD()).toContain('C')

    fireEvent.click(screen.getByTestId('explorer-edge-style-straight'))
    const straight = edgePathD()
    expect(straight).not.toContain('C')
    expect(straight).toContain('L')

    fireEvent.click(screen.getByTestId('explorer-edge-style-orthogonal'))
    const ortho = edgePathD()
    expect(ortho).not.toContain('C')
    expect((ortho.match(/L/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('persists the chosen edge style to localStorage', () => {
    const nodes = [makeNode({ node_id: 'a', track_id: 1 })]
    render(<SetExplorerCanvas {...defaultProps({ nodes })} />)
    fireEvent.click(screen.getByTestId('explorer-edge-style-straight'))
    expect(localStorage.getItem('explorer-edge-style')).toBe('straight')
  })
})

describe('SetExplorerCanvas — auto-layout', () => {
  it('computes and persists positions for all nodes', async () => {
    const nodes = [
      makeNode({ node_id: 'a', track_id: 1, x: 0, y: 0 }),
      makeNode({ node_id: 'b', track_id: 2, x: 0, y: 0 }),
    ]
    const edges = [makeEdge(1, 'a', 'b')]
    const props = defaultProps({ nodes, edges })
    render(<SetExplorerCanvas {...props} />)
    fireEvent.click(screen.getByTestId('explorer-auto-layout-btn'))
    expect(props.onSetPositions).toHaveBeenCalledTimes(1)
    const positions = props.onSetPositions.mock.calls[0][0]
    expect(positions).toHaveLength(2)
    for (const p of positions) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})

describe('SetExplorerCanvas — adding tracks', () => {
  it('adds a node from the search box', async () => {
    const props = defaultProps({ allTracks: [makeTrack(5, 'Cool Track')] })
    render(<SetExplorerCanvas {...props} />)
    fireEvent.change(screen.getByTestId('explorer-add-search-input'), {
      target: { value: 'Cool' },
    })
    const item = await screen.findByTestId('explorer-add-search-item')
    fireEvent.mouseDown(item)
    expect(props.onAddNode).toHaveBeenCalled()
    expect(props.onAddNode.mock.calls[0][0]).toBe(5)
  })

  it('adds a node when a track is dropped on the canvas', () => {
    const props = defaultProps()
    const { container } = render(<SetExplorerCanvas {...props} />)
    withSvgMatrixStub(() => {
      const dataTransfer = {
        types: [TRACK_DRAG_MIME],
        getData: (t: string) => (t === TRACK_DRAG_MIME ? '7' : ''),
        dropEffect: '',
      }
      fireEvent.drop(viewportEl(container), {
        dataTransfer,
        clientX: 300,
        clientY: 200,
      })
    })
    expect(props.onAddNode).toHaveBeenCalled()
    expect(props.onAddNode.mock.calls[0][0]).toBe(7)
  })

  it('adds a matched child node from the +Child modal', async () => {
    const nodes = [makeNode({ node_id: 'a', track_id: 1, x: 40, y: 40 })]
    const props = defaultProps({ nodes })
    const { container } = render(<SetExplorerCanvas {...props} />)
    fireEvent.click(nodeEl(container, 'a'))
    fireEvent.click(within(nodeEl(container, 'a')).getByLabelText('Add child node'))
    const item = await screen.findByTestId('child-match-item')
    fireEvent.click(item)
    expect(props.onAddNode).toHaveBeenCalled()
    const call = props.onAddNode.mock.calls[0]
    expect(call[0]).toBe(99) // candidate id
    expect(call[3]).toBe('a') // wired to the parent node
  })
})

describe('SetExplorerCanvas — zoom', () => {
  it('zooms in and reflects the level', () => {
    render(<SetExplorerCanvas {...defaultProps()} />)
    expect(screen.getByTestId('explorer-zoom-level')).toHaveTextContent('100%')
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(screen.getByTestId('explorer-zoom-level')).toHaveTextContent('110%')
  })
})
