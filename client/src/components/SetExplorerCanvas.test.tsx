import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetExplorerCanvas } from './SetExplorerCanvas'
import type { ExplorerNode, ExplorerEdge, Track } from '../types'
import { colorForColumn } from '../utils/explorer'
import { TRACK_DRAG_MIME } from '../utils'

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([
    {
      id: 99,
      title: 'Search Result',
      artist_names: [],
      bpm: 130,
      key: 'A',
      camelot_code: '11B',
    },
  ]),
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
  overrides: Partial<ExplorerNode> & {
    node_id: string
    track_id: number
    level: number
  },
): ExplorerNode {
  return {
    id: 1,
    set_id: 1,
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

function defaultProps(
  overrides: {
    nodes?: ExplorerNode[]
    edges?: ExplorerEdge[]
    tracklistTrackIds?: Set<number>
  } = {},
) {
  return {
    allTracks: [] as Track[],
    nodes: overrides.nodes ?? [],
    edges: overrides.edges ?? [],
    onAddNode: vi.fn(),
    onDeleteNode: vi.fn(),
    onAddEdge: vi.fn().mockResolvedValue(undefined),
    onDeleteEdge: vi.fn().mockResolvedValue(undefined),
    onSwap: vi.fn(),
    onNodeToTracklist: vi.fn(),
    onAddSibling: vi.fn().mockResolvedValue(null),
    tracklistTrackIds: overrides.tracklistTrackIds ?? new Set<number>(),
    fetchEdgeScores: vi.fn().mockResolvedValue({ scores: [] }),
  }
}

/**
 * jsdom implements no SVG coordinate mapping, so `toSvgPoint` returns null and
 * geometry-based features (marquee, drop hit-testing) can't resolve. Stub the
 * matrix to identity so SVG user-space equals client coordinates.
 */
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

describe('SetExplorerCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem('explorer-zoom')
  })

  describe('C1: per-level +Add Track control', () => {
    it('does not render per-node +Sibling button', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)
      expect(screen.queryByLabelText('Add sibling node')).toBeNull()
      expect(screen.queryByTestId('sibling-add-btn')).toBeNull()
    })

    it('renders one +Add Track per occupied level plus one extra for the next empty level', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const addBtns = screen.getAllByTestId('level-add-btn')
      expect(addBtns.length).toBe(3)
      expect(addBtns[0]).toHaveAttribute('data-level', '0')
      expect(addBtns[1]).toHaveAttribute('data-level', '1')
      expect(addBtns[2]).toHaveAttribute('data-level', '2')
    })

    it('renders two +Add Track buttons for a single root node (level 0 + extra level 1)', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const addBtns = screen.getAllByTestId('level-add-btn')
      expect(addBtns.length).toBe(2)
      expect(addBtns[0]).toHaveAttribute('data-level', '0')
      expect(addBtns[1]).toHaveAttribute('data-level', '1')
    })

    it('opens sibling-add modal when the extra deepest-level +Add Track is clicked', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const addBtns = screen.getAllByTestId('level-add-btn')
      const extraBtn = addBtns[addBtns.length - 1]
      expect(extraBtn).toHaveAttribute('data-level', '2')
      await userEvent.click(extraBtn)

      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument()
      expect(screen.getByTestId('sibling-search-input')).toBeInTheDocument()
    })

    it('opens sibling-add modal when +Add Track is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const addBtns = screen.getAllByTestId('level-add-btn')
      await userEvent.click(addBtns[0])

      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument()
      expect(screen.getByTestId('sibling-search-input')).toBeInTheDocument()
    })

    it("lists every node at the parent level as an inheritable connection, not just the rightmost sibling's existing parents", async () => {
      // Two parents (p0, p1) exist at level 0, but only p0 is connected to
      // the existing level-1 sibling. p1 has no children yet and must still
      // show up as a selectable parent when adding another level-1 node.
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'p0',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'p1',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
        makeNode({
          id: 3,
          node_id: 'c0',
          track_id: 12,
          level: 1,
          col_index: 0,
        }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'p0', child_node_id: 'c0' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const addBtns = screen.getAllByTestId('level-add-btn')
      const level1AddBtn = addBtns.find(
        (b) => b.getAttribute('data-level') === '1',
      )!
      await userEvent.click(level1AddBtn)

      const modal = within(screen.getByTestId('sibling-add-modal'))
      expect(modal.getByText('Track 10')).toBeInTheDocument()
      expect(modal.getByText('Track 11')).toBeInTheDocument()

      const checkboxes = modal.getAllByRole('checkbox') as HTMLInputElement[]
      expect(checkboxes).toHaveLength(2)
      // p0 (already connected to the rightmost sibling) is pre-checked;
      // p1 (no children yet) is offered but not pre-checked.
      expect(checkboxes[0].checked).toBe(true)
      expect(checkboxes[1].checked).toBe(false)
    })
  })

  describe('C4: node selection and control visibility', () => {
    it('renders action rows hidden by default (no --visible class)', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const actionRow = screen.getByTestId('explorer-action-row')
      expect(actionRow.classList.contains('explorer-action-row--visible')).toBe(
        false,
      )
    })

    it('reveals action row when node is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const nodeGroup = screen.getByTestId('explorer-node')
      await userEvent.click(nodeGroup)

      const actionRow = screen.getByTestId('explorer-action-row')
      expect(actionRow.classList.contains('explorer-action-row--visible')).toBe(
        true,
      )
    })

    it('selected node controls include delete, swap, +Child, →TL', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const nodeGroup = screen.getByTestId('explorer-node')
      await userEvent.click(nodeGroup)

      expect(screen.getByLabelText('Delete node')).toBeInTheDocument()
      expect(screen.getByLabelText('Swap track IDs')).toBeInTheDocument()
      expect(screen.getByTestId('child-add-btn')).toBeInTheDocument()
      expect(screen.getByLabelText('Add to Tracklist')).toBeInTheDocument()
    })

    it('hides +TL when track is already in tracklist', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(
        <SetExplorerCanvas
          {...defaultProps({ nodes, tracklistTrackIds: new Set([10]) })}
        />,
      )

      const nodeGroup = screen.getByTestId('explorer-node')
      await userEvent.click(nodeGroup)

      expect(screen.queryByLabelText('Add to Tracklist')).toBeNull()
    })
  })

  describe('C3: edge selection and deletion', () => {
    it('renders transparent hitbox over each edge', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox')
      expect(hitboxes.length).toBe(1)
    })

    it('shows delete affordance when edge is clicked', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)

      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument()
    })

    it('calls onDeleteEdge when delete affordance is clicked', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      render(<SetExplorerCanvas {...props} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)

      const deleteBtn = screen.getByTestId('explorer-edge-delete-btn')
      await userEvent.click(deleteBtn)

      expect(props.onDeleteEdge).toHaveBeenCalledWith(1)
    })
  })

  describe('C2: adjacent-level drag-connect gating', () => {
    function simulateDrag(
      container: HTMLElement,
      source: Element,
      target: Element,
    ) {
      const viewport = container.querySelector('.set-explorer-viewport')!
      fireEvent.mouseDown(source, { bubbles: true, clientX: 0, clientY: 0 })
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 })
      fireEvent.mouseUp(target, { bubbles: true })
    }

    it('calls onAddEdge when dragging between adjacent levels (0→1)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = []
      const props = defaultProps({ nodes, edges })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      simulateDrag(container, nodeGroups[0], nodeGroups[1])

      expect(props.onAddEdge).toHaveBeenCalledWith('n1', 'n2')
    })

    it('does not call onAddEdge when dragging between non-adjacent levels (0→2)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 2 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
        { id: 2, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ]
      const props = defaultProps({ nodes, edges })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      simulateDrag(container, nodeGroups[0], nodeGroups[2])

      expect(props.onAddEdge).not.toHaveBeenCalled()
    })

    it('does not call onAddEdge when dragging between same-level nodes', async () => {
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'n1',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
      ]
      const props = defaultProps({ nodes })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      simulateDrag(container, nodeGroups[0], nodeGroups[1])

      expect(props.onAddEdge).not.toHaveBeenCalled()
    })

    it('renders dashed preview line during connect-drag', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const props = defaultProps({ nodes })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      const viewport = container.querySelector('.set-explorer-viewport')!

      fireEvent.mouseDown(nodeGroups[0], {
        bubbles: true,
        clientX: 0,
        clientY: 0,
      })
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 })

      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument()
    })

    it('does not call onAddEdge when edge already exists (idempotent)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      simulateDrag(container, nodeGroups[0], nodeGroups[1])

      expect(props.onAddEdge).not.toHaveBeenCalled()
    })

    it('repeated drag-connect to same target remains idempotent', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      simulateDrag(container, nodeGroups[0], nodeGroups[1])
      simulateDrag(container, nodeGroups[0], nodeGroups[1])
      simulateDrag(container, nodeGroups[0], nodeGroups[1])

      expect(props.onAddEdge).not.toHaveBeenCalled()
    })

    it('treats the lower-level node as parent regardless of drag direction', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const props = defaultProps({ nodes })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      simulateDrag(container, nodeGroups[1], nodeGroups[0])

      expect(props.onAddEdge).toHaveBeenCalledWith('n1', 'n2')
    })
  })

  describe('interaction state isolation', () => {
    it('clicking SVG background clears node and edge selection', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const nodeGroup = screen.getAllByTestId('explorer-node')[0]
      await userEvent.click(nodeGroup)
      expect(
        screen
          .getAllByTestId('explorer-action-row')[0]
          .classList.contains('explorer-action-row--visible'),
      ).toBe(true)

      const svg = document.querySelector('.set-explorer-svg')
      if (svg) {
        await userEvent.click(svg)
      }

      const actionRows = screen.getAllByTestId('explorer-action-row')
      for (const row of actionRows) {
        expect(row.classList.contains('explorer-action-row--visible')).toBe(
          false,
        )
      }
    })
  })

  describe('preserved Contract 6 behavior', () => {
    it('displays raw track title without cleanTitle stripping', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      nodes[0].track = {
        id: 10,
        title: '[8A - Aminor - 128] My Track',
        artist_names: [],
        bpm: 128,
        key: 'C',
        camelot_code: '8B',
        genre: null,
        label: null,
        energy: null,
        date_added: null,
      }
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const titleEl = document.querySelector('.explorer-node-title')
      expect(titleEl?.textContent).toContain('[8A')
    })

    it('renders node rect at 360x48', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const nodeGroup = screen.getAllByTestId('explorer-node')[0]
      const rects = nodeGroup.querySelectorAll('rect')
      const mainRect = Array.from(rects).find(
        (r) => r.getAttribute('width') === '360',
      )
      expect(mainRect).toBeTruthy()
      expect(mainRect?.getAttribute('height')).toBe('48')
    })

    it('renders node title at fontSize 9', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const titleEl = document.querySelector('.explorer-node-title')
      expect(titleEl?.getAttribute('font-size')).toBe('9')
    })

    it('exposes full untruncated track title via SVG <title> element on each node', () => {
      const longTitle = 'A'.repeat(80)
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      nodes[0].track = {
        id: 10,
        title: longTitle,
        artist_names: [],
        bpm: 128,
        key: 'C',
        camelot_code: '8B',
        genre: null,
        label: null,
        energy: null,
        date_added: null,
      }
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const nodeGroup = screen.getByTestId('explorer-node')
      const svgTitle = nodeGroup.querySelector(':scope > title')
      expect(svgTitle).toBeTruthy()
      expect(svgTitle?.textContent).toBe(longTitle)

      const visibleText = document.querySelector('.explorer-node-title')
      expect(visibleText?.textContent).not.toBe(longTitle)
      expect(visibleText?.textContent?.endsWith('…')).toBe(true)
    })

    it('SVG <title> matches visible text when title is short enough', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      nodes[0].track = {
        id: 10,
        title: 'Short Title',
        artist_names: [],
        bpm: 128,
        key: 'C',
        camelot_code: '8B',
        genre: null,
        label: null,
        energy: null,
        date_added: null,
      }
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const nodeGroup = screen.getByTestId('explorer-node')
      const svgTitle = nodeGroup.querySelector(':scope > title')
      expect(svgTitle?.textContent).toBe('Short Title')

      const visibleText = document.querySelector('.explorer-node-title')
      expect(visibleText?.textContent).toBe('Short Title')
    })
  })

  describe('swap action', () => {
    it('activates swap mode when swap button is clicked', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      await userEvent.click(nodeGroups[0])

      const swapBtns = screen.getAllByLabelText('Swap track IDs')
      await userEvent.click(swapBtns[0])

      expect(screen.getByText('Click another node to swap')).toBeInTheDocument()
    })
  })

  describe('child-add flow (+Child match picker)', () => {
    it('opens match-driven child picker (not search) when +Child is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      await userEvent.click(screen.getByTestId('explorer-node'))

      const childBtns = screen.getAllByTestId('child-add-btn')
      await userEvent.click(childBtns[0])

      expect(screen.getByTestId('child-add-modal')).toBeInTheDocument()
      expect(screen.getByText('Add Child')).toBeInTheDocument()
      expect(screen.queryByTestId('child-search-input')).toBeNull()
    })

    it('shows loading state then match results', async () => {
      const { fetchMatches } = await import('../api/http')
      ;(fetchMatches as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          candidate_id: 99,
          title: 'Match Track',
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
      ])

      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      await userEvent.click(screen.getByTestId('explorer-node'))
      const childBtns = screen.getAllByTestId('child-add-btn')
      await userEvent.click(childBtns[0])

      const matchItem = await screen.findByText('Match Track')
      expect(matchItem).toBeInTheDocument()
      expect(fetchMatches).toHaveBeenCalledWith(10)
    })

    it('invokes onAddNode when a match is selected from child picker', async () => {
      const { fetchMatches } = await import('../api/http')
      ;(fetchMatches as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          candidate_id: 42,
          title: 'Picked Match',
          overall_score: 0.9,
          bucket: 'same_key',
          camelot_score: 1,
          bpm_score: 0.95,
          energy_score: 0.85,
          similarity_score: 0.75,
          freshness_score: 1,
          genre_similarity_score: 0.7,
          mood_continuity_score: 0.6,
          vocal_clash_score: 1,
          instrument_similarity_score: 0.5,
        },
      ])

      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      const props = defaultProps({ nodes })
      render(<SetExplorerCanvas {...props} />)

      await userEvent.click(screen.getByTestId('explorer-node'))
      const childBtns = screen.getAllByTestId('child-add-btn')
      await userEvent.click(childBtns[0])

      const matchItem = await screen.findByText('Picked Match')
      await userEvent.click(matchItem)

      expect(props.onAddNode).toHaveBeenCalledWith(42, 'n1', 1)
    })

    it('shows empty message when no matches are returned', async () => {
      const { fetchMatches } = await import('../api/http')
      ;(fetchMatches as ReturnType<typeof vi.fn>).mockResolvedValue([])

      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      await userEvent.click(screen.getByTestId('explorer-node'))
      const childBtns = screen.getAllByTestId('child-add-btn')
      await userEvent.click(childBtns[0])

      await screen.findByText('No matches found.')
    })
  })

  describe('delete action', () => {
    it('deletes the node immediately (no confirmation) when the delete action is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      const props = defaultProps({ nodes })
      render(<SetExplorerCanvas {...props} />)

      await userEvent.click(screen.getByTestId('explorer-node'))

      const deleteBtns = screen.getAllByLabelText('Delete node')
      await userEvent.click(deleteBtns[0])

      expect(screen.queryByText('Delete Node')).toBeNull()
      expect(props.onDeleteNode).toHaveBeenCalledWith('n1')
    })
  })

  describe('tracklist-add action', () => {
    it('calls onNodeToTracklist when +TL action is clicked', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      const props = defaultProps({ nodes })
      render(<SetExplorerCanvas {...props} />)

      await userEvent.click(screen.getByTestId('explorer-node'))

      const tlBtns = screen.getAllByLabelText('Add to Tracklist')
      await userEvent.click(tlBtns[0])

      expect(props.onNodeToTracklist).toHaveBeenCalledWith('n1')
    })
  })

  describe('interaction mode isolation', () => {
    it('selecting an edge clears a pending swap source', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      await userEvent.click(nodeGroups[0])
      const swapBtns = screen.getAllByLabelText('Swap track IDs')
      await userEvent.click(swapBtns[0])
      expect(screen.getByText('Click another node to swap')).toBeInTheDocument()

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)

      expect(screen.queryByText('Click another node to swap')).toBeNull()
    })

    it('starting swap mode clears a selected edge', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      render(<SetExplorerCanvas {...props} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument()

      const nodeGroups = screen.getAllByTestId('explorer-node')
      await userEvent.click(nodeGroups[0])
      const swapBtns = screen.getAllByLabelText('Swap track IDs')
      await userEvent.click(swapBtns[0])

      expect(screen.queryByTestId('explorer-edge-delete-btn')).toBeNull()
    })

    it('opening level-add clears a selected edge', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument()

      const addBtns = screen.getAllByTestId('level-add-btn')
      await userEvent.click(addBtns[0])

      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument()
      expect(screen.queryByTestId('explorer-edge-delete-btn')).toBeNull()
    })

    it('opening level-add clears a pending swap source', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      await userEvent.click(nodeGroups[0])
      const swapBtns = screen.getAllByLabelText('Swap track IDs')
      await userEvent.click(swapBtns[0])
      expect(screen.getByText('Click another node to swap')).toBeInTheDocument()

      const addBtns = screen.getAllByTestId('level-add-btn')
      await userEvent.click(addBtns[0])

      expect(screen.queryByText('Click another node to swap')).toBeNull()
    })

    it('Escape clears both swap source and selected edge', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      await userEvent.click(nodeGroups[0])
      const swapBtns = screen.getAllByLabelText('Swap track IDs')
      await userEvent.click(swapBtns[0])
      expect(screen.getByText('Click another node to swap')).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(screen.queryByText('Click another node to swap')).toBeNull()
    })

    it('swap click on same node does not call onSwap', async () => {
      const nodes = [makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 })]
      const props = defaultProps({ nodes })
      render(<SetExplorerCanvas {...props} />)

      const nodeGroup = screen.getByTestId('explorer-node')
      await userEvent.click(nodeGroup)
      const swapBtn = screen.getByLabelText('Swap track IDs')
      await userEvent.click(swapBtn)

      await userEvent.click(nodeGroup)

      expect(props.onSwap).not.toHaveBeenCalled()
    })
  })

  describe('empty state', () => {
    it('shows empty message when no nodes exist', () => {
      render(<SetExplorerCanvas {...defaultProps()} />)
      expect(screen.getByText(/Explorer is empty/)).toBeInTheDocument()
    })

    it('renders a level-0 +Add Track button even when explorer is empty', () => {
      render(<SetExplorerCanvas {...defaultProps()} />)
      const addBtn = screen.getByTestId('level-add-btn')
      expect(addBtn).toBeInTheDocument()
      expect(addBtn).toHaveAttribute('data-level', '0')
    })

    it('opens sibling-add modal from the empty-state add button', async () => {
      render(<SetExplorerCanvas {...defaultProps()} />)
      const addBtn = screen.getByTestId('level-add-btn')
      await userEvent.click(addBtn)
      expect(screen.getByTestId('sibling-add-modal')).toBeInTheDocument()
    })
  })

  describe('keyboard edge deletion', () => {
    it('deletes selected edge on Delete key', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      render(<SetExplorerCanvas {...props} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)

      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'Delete' })

      expect(props.onDeleteEdge).toHaveBeenCalledWith(42)
    })

    it('deletes selected edge on Backspace key', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 7, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      render(<SetExplorerCanvas {...props} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)

      fireEvent.keyDown(window, { key: 'Backspace' })

      expect(props.onDeleteEdge).toHaveBeenCalledWith(7)
    })

    it('does not delete edge when Delete is pressed inside an input', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument()

      const input = document.createElement('input')
      container.appendChild(input)
      fireEvent.keyDown(input, { key: 'Delete', bubbles: true })

      expect(props.onDeleteEdge).not.toHaveBeenCalled()
      container.removeChild(input)
    })

    it('does not delete edge when Backspace is pressed inside an input', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)

      const input = document.createElement('input')
      container.appendChild(input)
      fireEvent.keyDown(input, { key: 'Backspace', bubbles: true })

      expect(props.onDeleteEdge).not.toHaveBeenCalled()
      container.removeChild(input)
    })

    it('does not delete edge when Delete/Backspace originates from a textarea', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 42, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      await userEvent.click(hitbox)
      expect(screen.getByTestId('explorer-edge-delete-btn')).toBeInTheDocument()

      const textarea = document.createElement('textarea')
      container.appendChild(textarea)

      fireEvent.keyDown(textarea, { key: 'Delete', bubbles: true })
      fireEvent.keyDown(textarea, { key: 'Backspace', bubbles: true })

      expect(props.onDeleteEdge).not.toHaveBeenCalled()

      container.removeChild(textarea)
    })
  })

  describe('connect-drag off-node cancel', () => {
    it('cancels drag silently when mouseUp is on viewport (not on a node)', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const props = defaultProps({ nodes })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      const viewport = container.querySelector('.set-explorer-viewport')!

      fireEvent.mouseDown(nodeGroups[0], {
        bubbles: true,
        clientX: 0,
        clientY: 0,
      })
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 })

      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument()

      fireEvent.mouseUp(viewport)

      expect(screen.queryByTestId('connect-drag-line')).toBeNull()
      expect(props.onAddEdge).not.toHaveBeenCalled()
    })
  })

  describe('plain-click-no-drag behavior', () => {
    it('plain click selects node without showing connect-drag line', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      const nodeGroup = screen.getByTestId('explorer-node')
      await userEvent.click(nodeGroup)

      expect(screen.queryByTestId('connect-drag-line')).toBeNull()
      expect(
        screen
          .getByTestId('explorer-action-row')
          .classList.contains('explorer-action-row--visible'),
      ).toBe(true)
    })

    it('non-left-button mouseDown does not start connect-drag', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const props = defaultProps({ nodes })
      const { container } = render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      const viewport = container.querySelector('.set-explorer-viewport')!

      fireEvent.mouseDown(nodeGroups[0], {
        bubbles: true,
        button: 2,
        clientX: 0,
        clientY: 0,
      })
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 })

      expect(screen.queryByTestId('connect-drag-line')).toBeNull()
    })

    it('pan works immediately after a plain node click', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      const { container } = render(
        <SetExplorerCanvas {...defaultProps({ nodes })} />,
      )

      const nodeGroup = screen.getByTestId('explorer-node')
      await userEvent.click(nodeGroup)

      const svg = container.querySelector('.set-explorer-svg')!
      fireEvent.mouseDown(svg, { bubbles: true, clientX: 100, clientY: 100 })
      fireEvent.mouseMove(container.querySelector('.set-explorer-viewport')!, {
        bubbles: true,
        clientX: 120,
        clientY: 120,
      })
      fireEvent.mouseUp(container.querySelector('.set-explorer-viewport')!)

      const transform =
        svg.getAttribute('style') ?? (svg as HTMLElement).style.transform
      expect(transform).toBeTruthy()
    })
  })

  describe('multi-parent DAG dedup', () => {
    it('renders each node exactly once even when it has two parents', () => {
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'n1',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
        { id: 2, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const renderedNodes = screen.getAllByTestId('explorer-node')
      expect(renderedNodes.length).toBe(3)
    })
  })

  describe('C2: edge score styling and fixed-slot geometry', () => {
    const NODE_W = 360
    const NODE_H = 48
    const V_GAP = 176
    const SLOT_W = 390
    const TOP_PAD = 48 + 8
    const EDGE_SLOTS = 5
    const HALF_SLOT_SPAN = NODE_W / 2 / EDGE_SLOTS
    const LANE_STUB = 10
    const LANE_S = 6

    function parentX(col: number) {
      return col * SLOT_W + (SLOT_W - NODE_W) / 2
    }
    function parentBottom(level: number) {
      return TOP_PAD + level * (NODE_H + V_GAP) + NODE_H
    }
    // A node's departure (left half) / arrival (right half) slot is keyed by
    // the partner's column index (0-4) only — never by the node's own column
    // — so the x-offset never drifts with the node's own position in the
    // level. The left/right split keeps departures and arrivals from ever
    // landing on the same absolute x, even when a parent and an unrelated
    // child share a column across adjacent levels.
    function departureSlotX(nodeX: number, slotIdx: number) {
      return nodeX + HALF_SLOT_SPAN * (slotIdx + 0.5)
    }
    function arrivalSlotX(nodeX: number, slotIdx: number) {
      return nodeX + NODE_W / 2 + HALF_SLOT_SPAN * (slotIdx + 0.5)
    }

    it('edge color is derived from the parent column index', async () => {
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'n1',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ]
      const props = defaultProps({ nodes, edges })
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.75] })
      render(<SetExplorerCanvas {...props} />)

      const label = await screen.findByTestId('explorer-edge-label')
      expect(label.getAttribute('fill')).toBe(colorForColumn(1))
    })

    it('a parent with 3 children produces one shared stroke color, matching the parent node', () => {
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'n1',
          track_id: 10,
          level: 0,
          col_index: 2,
        }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 1,
          col_index: 0,
        }),
        makeNode({
          id: 3,
          node_id: 'n3',
          track_id: 12,
          level: 1,
          col_index: 1,
        }),
        makeNode({
          id: 4,
          node_id: 'n4',
          track_id: 13,
          level: 1,
          col_index: 2,
        }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
        { id: 2, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
        { id: 3, set_id: 1, parent_node_id: 'n1', child_node_id: 'n4' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox')
      expect(hitboxes.length).toBe(3)
      const visiblePaths = hitboxes.map((h) => h.nextElementSibling!)
      const strokes = visiblePaths.map((p) => p.getAttribute('stroke'))
      expect(strokes).toEqual([
        colorForColumn(2),
        colorForColumn(2),
        colorForColumn(2),
      ])

      const parentNodeGroup = screen.getAllByTestId('explorer-node')[0]
      const parentRect = Array.from(
        parentNodeGroup.querySelectorAll('rect'),
      ).find((r) => r.getAttribute('width') === '360')!
      expect(parentRect.getAttribute('fill')).toBe(colorForColumn(2))
    })

    it('edges from different parents use distinct colors keyed off each parent column', () => {
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'p0',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'p1',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
        makeNode({
          id: 3,
          node_id: 'p2',
          track_id: 12,
          level: 0,
          col_index: 2,
        }),
        makeNode({
          id: 4,
          node_id: 'c0',
          track_id: 13,
          level: 1,
          col_index: 0,
        }),
        makeNode({
          id: 5,
          node_id: 'c1',
          track_id: 14,
          level: 1,
          col_index: 1,
        }),
        makeNode({
          id: 6,
          node_id: 'c2',
          track_id: 15,
          level: 1,
          col_index: 2,
        }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'p0', child_node_id: 'c0' },
        { id: 2, set_id: 1, parent_node_id: 'p1', child_node_id: 'c1' },
        { id: 3, set_id: 1, parent_node_id: 'p2', child_node_id: 'c2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox')
      expect(hitboxes.length).toBe(3)
      const visiblePaths = hitboxes.map((h) => h.nextElementSibling!)
      const strokes = visiblePaths.map((p) => p.getAttribute('stroke'))
      expect(strokes[0]).toBe(colorForColumn(0))
      expect(strokes[1]).toBe(colorForColumn(1))
      expect(strokes[2]).toBe(colorForColumn(2))
    })

    it('score label has explorer-edge-label class for opacity styling', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.85] })
      render(<SetExplorerCanvas {...props} />)

      const label = await screen.findByTestId('explorer-edge-label')
      expect(label.classList.contains('explorer-edge-label')).toBe(true)
    })

    it('score label is positioned just above child node entry slot (childTop - 8)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.85] })
      render(<SetExplorerCanvas {...props} />)

      const label = await screen.findByTestId('explorer-edge-label')
      const labelYVal = Number(label.getAttribute('y')!)
      // childTop for level 1 = TOP_PAD + 1 * (NODE_H + V_GAP)
      const childTop = TOP_PAD + 1 * (NODE_H + V_GAP)
      expect(labelYVal).toBeCloseTo(childTop - 8, 0)
    })

    it('score label uses textAnchor=end, immediately left of the arrival vertical stub', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [0.85] })
      render(<SetExplorerCanvas {...props} />)

      const label = await screen.findByTestId('explorer-edge-label')
      expect(label.getAttribute('text-anchor')).toBe('end')
      // labelX = endX - 10, where endX = arrivalSlotX(childX, parentColIdx)
      const childX = parentX(0) // n2 is col 0
      const endX = arrivalSlotX(childX, 0)
      const labelXVal = Number(label.getAttribute('x')!)
      expect(labelXVal).toBeCloseTo(endX - 10, 1)
    })

    it('edges from same parent to different children use distinct child-column-based slots', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 1,
          col_index: 0,
        }),
        makeNode({
          id: 3,
          node_id: 'n3',
          track_id: 12,
          level: 1,
          col_index: 1,
        }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
        { id: 2, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox')
      expect(hitboxes.length).toBe(2)
      const d1 = hitboxes[0].getAttribute('d')!
      const d2 = hitboxes[1].getAttribute('d')!
      const startX1 = Number(d1.split(' ')[1])
      const startX2 = Number(d2.split(' ')[1])
      // startX is keyed by the target child's column: child col 0 vs col 1.
      expect(startX1).toBeCloseTo(departureSlotX(parentX(0), 0), 1)
      expect(startX2).toBeCloseTo(departureSlotX(parentX(0), 1), 1)
      expect(startX1).not.toBe(startX2)
    })

    it('edge slot is determined by child column index', () => {
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'n1',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
        makeNode({
          id: 3,
          node_id: 'n3',
          track_id: 12,
          level: 1,
          col_index: 0,
        }),
        makeNode({
          id: 4,
          node_id: 'n4',
          track_id: 13,
          level: 1,
          col_index: 1,
        }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
        { id: 2, set_id: 1, parent_node_id: 'n2', child_node_id: 'n4' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox')
      const d1 = hitboxes[0].getAttribute('d')!
      const d2 = hitboxes[1].getAttribute('d')!
      const startX1 = Number(d1.split(' ')[1])
      const startX2 = Number(d2.split(' ')[1])
      // startX is keyed by the target child's column, relative to the
      // parent's own node position — it must not drift with the parent's
      // own column index (that drift was the source of overlapping lines).
      expect(startX1).toBeCloseTo(departureSlotX(parentX(0), 0), 1)
      expect(startX2).toBeCloseTo(departureSlotX(parentX(1), 1), 1)
    })

    it('child entry uses slot-aligned position, not child center', () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      const d = hitbox.getAttribute('d')!
      const parts = d.split(' ')
      const endX = Number(parts[parts.length - 2])
      const childNodeX = parentX(0)
      // n1(col 0)→n2(col 0): endX = arrivalSlotX(childNodeX, parentColIdx=0)
      const expectedEndX = arrivalSlotX(childNodeX, 0)
      expect(endX).toBeCloseTo(expectedEndX, 1)
    })

    it('edges from 5 different columns use all 5 distinct slot positions', () => {
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'n1',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
        makeNode({
          id: 3,
          node_id: 'n3',
          track_id: 12,
          level: 0,
          col_index: 2,
        }),
        makeNode({
          id: 4,
          node_id: 'n4',
          track_id: 13,
          level: 0,
          col_index: 3,
        }),
        makeNode({
          id: 5,
          node_id: 'n5',
          track_id: 14,
          level: 0,
          col_index: 4,
        }),
        makeNode({
          id: 6,
          node_id: 'n6',
          track_id: 15,
          level: 1,
          col_index: 0,
        }),
        makeNode({
          id: 7,
          node_id: 'n7',
          track_id: 16,
          level: 1,
          col_index: 1,
        }),
        makeNode({
          id: 8,
          node_id: 'n8',
          track_id: 17,
          level: 1,
          col_index: 2,
        }),
        makeNode({
          id: 9,
          node_id: 'n9',
          track_id: 18,
          level: 1,
          col_index: 3,
        }),
        makeNode({
          id: 10,
          node_id: 'n10',
          track_id: 19,
          level: 1,
          col_index: 4,
        }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n6' },
        { id: 2, set_id: 1, parent_node_id: 'n2', child_node_id: 'n7' },
        { id: 3, set_id: 1, parent_node_id: 'n3', child_node_id: 'n8' },
        { id: 4, set_id: 1, parent_node_id: 'n4', child_node_id: 'n9' },
        { id: 5, set_id: 1, parent_node_id: 'n5', child_node_id: 'n10' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox')
      const starts = hitboxes.map((h) =>
        Number(h.getAttribute('d')!.split(' ')[1]),
      )
      const uniqueStarts = new Set(starts.map((s) => Math.round(s)))
      expect(uniqueStarts.size).toBe(5)
    })

    it('endX is keyed by the source parent column index', () => {
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'n1',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
        makeNode({ id: 3, node_id: 'n3', track_id: 12, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      const d = hitbox.getAttribute('d')!
      const parts = d.split(' ')
      const endX = Number(parts[10])
      const childNodeX = parentX(0)
      // n2(col 1)→n3(col 0): endX = arrivalSlotX(childNodeX, parentColIdx=1)
      const expectedEndX = arrivalSlotX(childNodeX, 1)
      expect(endX).toBeCloseTo(expectedEndX, 1)
    })

    it('laneY = parentBottom + LANE_STUB + laneIndex * LANE_S for a known edge', () => {
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'n1',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
        makeNode({
          id: 3,
          node_id: 'n3',
          track_id: 12,
          level: 1,
          col_index: 0,
        }),
        makeNode({
          id: 4,
          node_id: 'n4',
          track_id: 13,
          level: 1,
          col_index: 1,
        }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n2', child_node_id: 'n3' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      const d = hitbox.getAttribute('d')!
      const parts = d.split(' ')
      const laneYFromPath = Number(parts[5])
      const parentColIdx = 1
      const childColIdx = 0
      const laneIndex = parentColIdx * EDGE_SLOTS + childColIdx
      const expectedLaneY = parentBottom(0) + LANE_STUB + laneIndex * LANE_S
      expect(laneYFromPath).toBeCloseTo(expectedLaneY, 1)
    })

    it('same-column parent and child still get distinct departure/arrival x positions', () => {
      // A departure stub and an arrival stub must never land on the same x
      // — even for a straight-through same-column edge — because a node at
      // the same column on a DIFFERENT level could otherwise coincide with
      // it (see the regression test below for the concrete failure case).
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitbox = screen.getByTestId('explorer-edge-hitbox')
      const d = hitbox.getAttribute('d')!
      const parts = d.split(' ')
      const startX = Number(parts[1])
      const endX = Number(parts[10])
      expect(startX).not.toBe(endX)
      expect(endX - startX).toBeCloseTo(NODE_W / 2, 1)
    })

    it('regression: a parent and an unrelated child sharing a column across levels do not produce overlapping vertical segments', () => {
      // Reproduces the exact case found in production data: a fully-connected
      // 3x3 bipartite graph where Jakare (level 0, col 2) -> Emancipator and
      // Asura (level 0, col 1) -> Jose Solano (level 1, col 2) used to land
      // their departure/arrival stubs on the same x because Jakare and Jose
      // Solano share column 2 across adjacent levels.
      const nodes = [
        makeNode({
          id: 1,
          node_id: 'p0',
          track_id: 10,
          level: 0,
          col_index: 0,
        }),
        makeNode({
          id: 2,
          node_id: 'p1',
          track_id: 11,
          level: 0,
          col_index: 1,
        }),
        makeNode({
          id: 3,
          node_id: 'p2',
          track_id: 12,
          level: 0,
          col_index: 2,
        }),
        makeNode({
          id: 4,
          node_id: 'c0',
          track_id: 13,
          level: 1,
          col_index: 0,
        }),
        makeNode({
          id: 5,
          node_id: 'c1',
          track_id: 14,
          level: 1,
          col_index: 1,
        }),
        makeNode({
          id: 6,
          node_id: 'c2',
          track_id: 15,
          level: 1,
          col_index: 2,
        }),
      ]
      const edges: ExplorerEdge[] = []
      let edgeId = 1
      for (const parent of ['p0', 'p1', 'p2']) {
        for (const child of ['c0', 'c1', 'c2']) {
          edges.push({
            id: edgeId++,
            set_id: 1,
            parent_node_id: parent,
            child_node_id: child,
          })
        }
      }
      render(<SetExplorerCanvas {...defaultProps({ nodes, edges })} />)

      const hitboxes = screen.getAllByTestId('explorer-edge-hitbox')
      expect(hitboxes.length).toBe(9)

      type Segment = { x: number; yMin: number; yMax: number }
      const segments: Segment[] = []
      for (const hitbox of hitboxes) {
        const [x1, y1, , y2, x2, , , y3] = hitbox
          .getAttribute('d')!
          .replace(/[ML]/g, '')
          .trim()
          .split(/\s+/)
          .map(Number)
        segments.push({ x: x1, yMin: Math.min(y1, y2), yMax: Math.max(y1, y2) })
        segments.push({ x: x2, yMin: Math.min(y2, y3), yMax: Math.max(y2, y3) })
      }

      for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
          const a = segments[i]
          const b = segments[j]
          if (Math.abs(a.x - b.x) > 0.5) {
            continue
          }
          const rangesOverlap = a.yMin < b.yMax && b.yMin < a.yMax
          expect(rangesOverlap).toBe(false)
        }
      }
    })
  })

  describe('edge score loading state', () => {
    it('shows spinner while scores are loading', async () => {
      let resolveScores: (val: { scores: (number | null)[] }) => void
      const scorePromise = new Promise<{ scores: (number | null)[] }>(
        (resolve) => {
          resolveScores = resolve
        },
      )
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      props.fetchEdgeScores = vi.fn().mockReturnValue(scorePromise)
      render(<SetExplorerCanvas {...props} />)

      await vi.waitFor(() => {
        expect(screen.getByTestId('explorer-score-spinner')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('explorer-edge-label')).toBeNull()

      await vi.runAllTimersAsync().catch(() => {})
      resolveScores!({ scores: [0.85] })
      await vi.waitFor(() => {
        expect(screen.getByTestId('explorer-edge-label')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('explorer-score-spinner')).toBeNull()
    })

    it('shows em dash for null score after loading completes', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const props = defaultProps({ nodes, edges })
      props.fetchEdgeScores = vi.fn().mockResolvedValue({ scores: [null] })
      render(<SetExplorerCanvas {...props} />)

      const label = await screen.findByTestId('explorer-edge-label')
      expect(label.textContent).toBe('—')
    })

    it('shows no spinner or label before fetch begins', () => {
      const nodes = [makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      expect(screen.queryByTestId('explorer-score-spinner')).toBeNull()
      expect(screen.queryByTestId('explorer-edge-label')).toBeNull()
    })
  })

  describe('edge score caching', () => {
    it('only fetches scores for uncached edges when new edges are added', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({
          id: 2,
          node_id: 'n2',
          track_id: 11,
          level: 1,
          col_index: 0,
        }),
        makeNode({
          id: 3,
          node_id: 'n3',
          track_id: 12,
          level: 1,
          col_index: 1,
        }),
      ]
      const edges1: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const fetchScores = vi
        .fn()
        .mockResolvedValueOnce({ scores: [0.85] })
        .mockResolvedValueOnce({ scores: [0.72] })

      const props = {
        ...defaultProps({ nodes, edges: edges1 }),
        fetchEdgeScores: fetchScores,
      }
      const { rerender } = render(<SetExplorerCanvas {...props} />)

      await screen.findByTestId('explorer-edge-label')
      expect(fetchScores).toHaveBeenCalledTimes(1)
      expect(fetchScores).toHaveBeenCalledWith([[10, 11]])

      const edges2: ExplorerEdge[] = [
        ...edges1,
        { id: 2, set_id: 1, parent_node_id: 'n1', child_node_id: 'n3' },
      ]
      rerender(<SetExplorerCanvas {...{ ...props, edges: edges2 }} />)

      await vi.waitFor(() => {
        expect(fetchScores).toHaveBeenCalledTimes(2)
      })
      expect(fetchScores).toHaveBeenLastCalledWith([[10, 12]])
    })

    it('starting a connect-drag does not trigger score refetch', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const edges: ExplorerEdge[] = [
        { id: 1, set_id: 1, parent_node_id: 'n1', child_node_id: 'n2' },
      ]
      const fetchScores = vi.fn().mockResolvedValue({ scores: [0.85] })
      const props = {
        ...defaultProps({ nodes, edges }),
        fetchEdgeScores: fetchScores,
      }
      const { container } = render(<SetExplorerCanvas {...props} />)

      await screen.findByTestId('explorer-edge-label')
      const callCount = fetchScores.mock.calls.length

      const nodeGroups = screen.getAllByTestId('explorer-node')
      const viewport = container.querySelector('.set-explorer-viewport')!
      fireEvent.mouseDown(nodeGroups[0], {
        bubbles: true,
        clientX: 0,
        clientY: 0,
      })
      fireEvent.mouseMove(viewport, { bubbles: true, clientX: 20, clientY: 20 })

      expect(screen.getByTestId('connect-drag-line')).toBeInTheDocument()
      expect(fetchScores.mock.calls.length).toBe(callCount)

      fireEvent.mouseUp(viewport)
    })
  })

  describe('zoom persistence', () => {
    it('restores zoom from localStorage on mount', () => {
      localStorage.setItem('explorer-zoom', '1.5')
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)
      const svg = document.querySelector('.set-explorer-svg') as HTMLElement
      expect(svg.style.transform).toContain('scale(1.5)')
    })

    it('falls back to default zoom for invalid stored value', () => {
      localStorage.setItem('explorer-zoom', 'not-a-number')
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)
      const svg = document.querySelector('.set-explorer-svg') as HTMLElement
      expect(svg.style.transform).toContain('scale(1)')
    })

    it('falls back to default zoom when value is out of range', () => {
      localStorage.setItem('explorer-zoom', '10')
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)
      const svg = document.querySelector('.set-explorer-svg') as HTMLElement
      expect(svg.style.transform).toContain('scale(1)')
    })

    it('persists zoom to localStorage on ctrl+wheel', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      const { container } = render(
        <SetExplorerCanvas {...defaultProps({ nodes })} />,
      )
      const viewport = container.querySelector('.set-explorer-viewport')!
      fireEvent.wheel(viewport, { deltaY: -100, ctrlKey: true })
      const stored = localStorage.getItem('explorer-zoom')
      expect(stored).not.toBeNull()
      expect(Number(stored!)).toBeCloseTo(1.1, 1)
    })
  })

  describe('drag-and-drop from top quadrants', () => {
    function dropData(mime: string, value: string) {
      return {
        dataTransfer: {
          types: [mime],
          getData: (t: string) => (t === mime ? value : ''),
          setData: vi.fn(),
          dropEffect: '',
        },
      }
    }

    /**
     * jsdom's synthesized drag events drop clientX/clientY, which the drop
     * router needs for hit-testing — so build a MouseEvent (which carries
     * coordinates) named `drop`/`dragover` and attach a stub dataTransfer.
     */
    function fireDragAt(
      el: Element,
      type: 'drop' | 'dragover',
      value: string,
      x: number,
      y: number,
    ) {
      const evt = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      })
      Object.defineProperty(evt, 'dataTransfer', {
        value: dropData(TRACK_DRAG_MIME, value).dataTransfer,
      })
      fireEvent(el, evt)
    }

    it('drops a track onto the empty canvas to add a root node', () => {
      const props = defaultProps({ nodes: [] })
      const { container } = render(<SetExplorerCanvas {...props} />)
      const viewport = container.querySelector('.set-explorer-viewport')!
      fireEvent.drop(viewport, dropData(TRACK_DRAG_MIME, '99'))
      expect(props.onAddNode).toHaveBeenCalledWith(99, undefined, undefined)
    })

    it('drops a track onto the canvas with existing nodes to add another root', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      const props = defaultProps({ nodes })
      const { container } = render(<SetExplorerCanvas {...props} />)
      const viewport = container.querySelector('.set-explorer-viewport')!
      fireEvent.drop(viewport, dropData(TRACK_DRAG_MIME, '42'))
      expect(props.onAddNode).toHaveBeenCalledWith(42, undefined, undefined)
    })

    it('ignores a drop with no track payload', () => {
      const props = defaultProps({ nodes: [] })
      const { container } = render(<SetExplorerCanvas {...props} />)
      const viewport = container.querySelector('.set-explorer-viewport')!
      fireEvent.drop(viewport, dropData(TRACK_DRAG_MIME, '   '))
      expect(props.onAddNode).not.toHaveBeenCalled()
    })

    // A level-0 node occupies SVG x[15,375] y[56,104]; with the identity matrix
    // stub those are also the client coordinates used for hit-testing.
    it('dropping a track over a node adds it as that node’s child', () => {
      withSvgMatrixStub(() => {
        const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
        const props = defaultProps({ nodes })
        const { container } = render(<SetExplorerCanvas {...props} />)
        const viewport = container.querySelector('.set-explorer-viewport')!
        fireDragAt(viewport, 'drop', '77', 100, 80)
        expect(props.onAddNode).toHaveBeenCalledWith(77, 'n1', 1)
        expect(props.onAddNode).toHaveBeenCalledTimes(1)
      })
    })

    it('dropping a track clear of any node adds a root node', () => {
      withSvgMatrixStub(() => {
        const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
        const props = defaultProps({ nodes })
        const { container } = render(<SetExplorerCanvas {...props} />)
        const viewport = container.querySelector('.set-explorer-viewport')!
        fireDragAt(viewport, 'drop', '42', 900, 900)
        expect(props.onAddNode).toHaveBeenCalledWith(42, undefined, undefined)
      })
    })

    it('highlights the node under the cursor during a drag', () => {
      withSvgMatrixStub(() => {
        const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
        const { container } = render(
          <SetExplorerCanvas {...defaultProps({ nodes })} />,
        )
        const viewport = container.querySelector('.set-explorer-viewport')!
        fireDragAt(viewport, 'dragover', '77', 100, 80)
        expect(
          container
            .querySelector('[data-node-id="n1"]')
            ?.classList.contains('explorer-node-group--drop'),
        ).toBe(true)
      })
    })
  })

  describe('node selection and deletion by keyboard', () => {
    it('deletes a single selected node immediately on Backspace (no confirmation)', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      const props = defaultProps({ nodes })
      render(<SetExplorerCanvas {...props} />)

      await userEvent.click(screen.getByTestId('explorer-node'))
      fireEvent.keyDown(window, { key: 'Backspace' })

      expect(screen.queryByText('Delete Node')).toBeNull()
      expect(props.onDeleteNode).toHaveBeenCalledWith('n1')
    })

    it('does not delete on Backspace when nothing is selected', () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      const props = defaultProps({ nodes })
      render(<SetExplorerCanvas {...props} />)
      fireEvent.keyDown(window, { key: 'Backspace' })
      expect(props.onDeleteNode).not.toHaveBeenCalled()
    })

    it('reconstructs the deleted node on Ctrl+Z (undo)', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      const props = defaultProps({ nodes })
      render(<SetExplorerCanvas {...props} />)

      await userEvent.click(screen.getByTestId('explorer-node'))
      fireEvent.keyDown(window, { key: 'Backspace' })
      await waitFor(() =>
        expect(props.onDeleteNode).toHaveBeenCalledWith('n1'),
      )

      fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
      await waitFor(() =>
        expect(props.onAddNode).toHaveBeenCalledWith(10, undefined, 0),
      )
    })

    it('shift-clicking selects multiple nodes; Backspace deletes them all (no confirmation)', async () => {
      const nodes = [
        makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
        makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
      ]
      const props = defaultProps({ nodes })
      render(<SetExplorerCanvas {...props} />)

      const nodeGroups = screen.getAllByTestId('explorer-node')
      fireEvent.click(nodeGroups[0], { shiftKey: true })
      fireEvent.click(nodeGroups[1], { shiftKey: true })

      fireEvent.keyDown(window, { key: 'Delete' })

      expect(screen.queryByTestId('bulk-delete-modal')).toBeNull()
      await waitFor(() =>
        expect(props.onDeleteNode).toHaveBeenCalledTimes(2),
      )
      expect(props.onDeleteNode).toHaveBeenCalledWith('n1')
      expect(props.onDeleteNode).toHaveBeenCalledWith('n2')
    })

    it('Escape clears the node selection', async () => {
      const nodes = [makeNode({ node_id: 'n1', track_id: 10, level: 0 })]
      render(<SetExplorerCanvas {...defaultProps({ nodes })} />)

      await userEvent.click(screen.getByTestId('explorer-node'))
      expect(
        screen
          .getByTestId('explorer-action-row')
          .classList.contains('explorer-action-row--visible'),
      ).toBe(true)

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(
        screen
          .getByTestId('explorer-action-row')
          .classList.contains('explorer-action-row--visible'),
      ).toBe(false)
    })

    it('marquee (Ctrl/Cmd+drag) selects nodes and Backspace deletes them', async () => {
      const props = withSvgMatrixStub(() => {
        const nodes = [
          makeNode({ id: 1, node_id: 'n1', track_id: 10, level: 0 }),
          makeNode({ id: 2, node_id: 'n2', track_id: 11, level: 1 }),
        ]
        const p = defaultProps({ nodes })
        const { container } = render(<SetExplorerCanvas {...p} />)
        const svg = container.querySelector('.set-explorer-svg')!
        const viewport = container.querySelector('.set-explorer-viewport')!

        fireEvent.mouseDown(svg, { ctrlKey: true, clientX: 0, clientY: 0 })
        fireEvent.mouseMove(viewport, { clientX: 400, clientY: 400 })
        expect(screen.getByTestId('explorer-marquee')).toBeInTheDocument()
        fireEvent.mouseUp(viewport)

        fireEvent.keyDown(window, { key: 'Backspace' })
        expect(screen.queryByTestId('bulk-delete-modal')).toBeNull()
        return p
      })
      await waitFor(() => expect(props.onDeleteNode).toHaveBeenCalledTimes(2))
    })
  })
})
