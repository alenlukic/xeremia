import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react'
import type {
  ExplorerNode,
  ExplorerEdge,
  Track,
  TransitionMatch,
} from '../types'
import { colorForColumn, ACTION_FILL } from '../utils/explorer'
import { forceDirectedLayout } from '../utils/graphLayout'
import { fetchMatches } from '../api/http'
import { useTrackSearch } from '../hooks/useTrackSearch'
import { formatOverallScore, TRACK_DRAG_MIME } from '../utils'

export type ExplorerAddResult = { node_id: string } | null

/** Straight lines, smooth cubic curves, or right-angle elbows. */
export type EdgeStyle = 'curved' | 'straight' | 'orthogonal'

interface Props {
  allTracks: Track[]
  nodes: ExplorerNode[]
  edges: ExplorerEdge[]
  /** Return to the tracklist/pool view. */
  onBack?: () => void
  onAddNode: (
    trackId: number,
    x?: number,
    y?: number,
    parentNodeId?: string,
  ) => void | Promise<ExplorerAddResult>
  onMoveNode: (nodeId: string, x: number, y: number) => void
  onSetPositions: (
    positions: { node_id: string; x: number; y: number }[],
  ) => Promise<void>
  onDeleteNode: (
    nodeId: string,
    rewireEdges?: { parent_node_id: string; child_node_id: string }[],
  ) => void | Promise<void>
  onAddEdge: (parentNodeId: string, childNodeId: string) => Promise<void>
  onDeleteEdge: (edgeId: number) => Promise<void>
  onSwap: (nodeAId: string, nodeBId: string) => void
  onNodeToTracklist: (nodeId: string) => void
  onAddNodeWithParents: (
    trackId: number,
    parentIds: string[],
    x: number,
    y: number,
  ) => Promise<ExplorerAddResult>
  tracklistTrackIds: Set<number>
  fetchEdgeScores: (
    pairs: [number, number][],
  ) => Promise<{ scores: (number | null)[] }>
}

interface Point {
  x: number
  y: number
}

interface ConnectDragState {
  sourceNodeId: string
  startX: number
  startY: number
  cursorX: number
  cursorY: number
}

interface ChildAddState {
  parentNode: ExplorerNode
  matches: TransitionMatch[]
  loading: boolean
}

/** Snapshot of a deleted node + its connections, used to reconstruct it on undo. */
interface DeletedNode {
  node_id: string
  track_id: number
  x: number
  y: number
  /** node_ids of incoming-edge parents at deletion time. */
  parentIds: string[]
  /** node_ids of outgoing-edge children at deletion time. */
  childIds: string[]
}

const NODE_W = 210
const NODE_H = 48
const GRID = 20
/** Horizontal padding between a node and its lane's boundaries. */
const LANE_PAD = 15
/** Lane width: one node plus padding on both sides (a multiple of GRID). */
const LANE_W = NODE_W + 2 * LANE_PAD
const HANDLE_R = 6
const ACTION_H = 48
const ACTION_LABEL_SIZE = 20
const ACTION_GAP = 8
const ACTION_ROW_MARGIN = 8
const ACTION_SCALE = 0.75
const MIN_CANVAS_W = 2400
const MIN_CANVAS_H = 1600
const CANVAS_PAD = 400
const ZOOM_STORAGE_KEY = 'explorer-zoom'
const EDGE_STYLE_STORAGE_KEY = 'explorer-edge-style'
const DRAG_THRESHOLD = 5

function readStoredZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY)
    if (raw === null) {
      return 1
    }
    const val = Number(raw)
    if (!Number.isFinite(val) || val < 0.2 || val > 3) {
      return 1
    }
    return val
  } catch {
    return 1
  }
}

function readStoredEdgeStyle(): EdgeStyle {
  try {
    const raw = localStorage.getItem(EDGE_STYLE_STORAGE_KEY)
    if (raw === 'curved' || raw === 'straight' || raw === 'orthogonal') {
      return raw
    }
  } catch {
    /* storage unavailable */
  }
  return 'curved'
}

function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID
}

// Nodes always rest inside a vertical lane one node wide, never straddling a
// boundary: snap x to the nearest lane's interior.
function snapToLaneX(x: number): number {
  const lane = Math.max(0, Math.round((x - LANE_PAD) / LANE_W))
  return lane * LANE_W + LANE_PAD
}

// Stable per-node color derived from its id, so a node keeps its color across
// re-layouts (there are no columns to key off of any more).
function colorForNodeId(nodeId: string): string {
  let h = 0
  for (let i = 0; i < nodeId.length; i++) {
    h = (h * 31 + nodeId.charCodeAt(i)) % 997
  }
  return colorForColumn(h)
}

// --- Node titles -----------------------------------------------------------
// Titles arrive as `[01B - B - 110.00] Artist - Track`. They render on two
// lines — metadata prefix + artist, then the track name — each truncated on its
// own against the node's inner width. Type size is derived from the node box
// rather than hard-coded, so resizing the node carries through to both the
// label size and the width truncation measures against.

/** Horizontal breathing room between the label and the node's edges. */
const TITLE_PAD_X = 8
const TITLE_MAX_W = NODE_W - 2 * TITLE_PAD_X
const TITLE_PRIMARY_SIZE = Math.round(NODE_H / 4)
const TITLE_SECONDARY_SIZE = TITLE_PRIMARY_SIZE - 1
/** Distance between the two lines' centers. */
const TITLE_LINE_GAP = TITLE_PRIMARY_SIZE + 2
/** Must track --font-body so measurement matches what actually renders. */
const TITLE_FONT_FAMILY = "'DM Sans', system-ui, sans-serif"

/**
 * Split a raw title into its two display lines: `[prefix] Artist` and `Track`.
 * Titles without a metadata prefix or an ` - ` separator collapse to one line.
 */
function splitNodeTitle(full: string): [string, string] {
  const close = full.indexOf(']')
  const prefix = close === -1 ? '' : full.slice(0, close + 1)
  const rest = (close === -1 ? full : full.slice(close + 1)).trim()
  const dash = rest.indexOf(' - ')
  const head = dash === -1 ? rest : rest.slice(0, dash).trim()
  const tail = dash === -1 ? '' : rest.slice(dash + 3).trim()
  return [prefix ? `${prefix} ${head}`.trim() : head, tail]
}

/** Lazily-created 2D context reused for glyph measurement. */
let measureCtx: CanvasRenderingContext2D | null | undefined
function textWidth(text: string, fontSize: number): number {
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d')
  }
  if (!measureCtx) {
    // No canvas (jsdom): fall back to an average-advance estimate so
    // truncation still degrades sensibly rather than throwing.
    return text.length * fontSize * 0.55
  }
  measureCtx.font = `${fontSize}px ${TITLE_FONT_FAMILY}`
  return measureCtx.measureText(text).width
}

const truncCache = new Map<string, string>()

/**
 * Trim `text` until it fits `maxW` at `fontSize`, appending an ellipsis.
 * Measuring real glyph widths (rather than counting characters) is what keeps
 * truncation correct as the type scale changes.
 */
function truncateToWidth(
  text: string,
  fontSize: number,
  maxW = TITLE_MAX_W,
): string {
  if (!text) {
    return ''
  }
  const key = `${fontSize}|${maxW}|${text}`
  const cached = truncCache.get(key)
  if (cached !== undefined) {
    return cached
  }
  let out = text
  if (textWidth(text, fontSize) > maxW) {
    let lo = 0
    let hi = text.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (textWidth(text.slice(0, mid) + '…', fontSize) <= maxW) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    out = lo > 0 ? text.slice(0, lo).trimEnd() + '…' : '…'
  }
  if (truncCache.size > 2000) {
    truncCache.clear()
  }
  truncCache.set(key, out)
  return out
}

// Point on a node's rectangle border along the ray from its center toward
// (towardX, towardY). Used to anchor edges at the node's edge, not its center.
function borderPoint(
  cx: number,
  cy: number,
  towardX: number,
  towardY: number,
): Point {
  const dx = towardX - cx
  const dy = towardY - cy
  if (dx === 0 && dy === 0) {
    return { x: cx, y: cy }
  }
  const halfW = NODE_W / 2
  const halfH = NODE_H / 2
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

interface EdgeGeometry {
  path: string
  end: Point
  /** Unit direction of the final path segment (for the arrowhead). */
  angle: number
  labelX: number
  labelY: number
}

function computeEdgeGeometry(
  source: Point,
  target: Point,
  style: EdgeStyle,
): EdgeGeometry {
  const sc = { x: source.x + NODE_W / 2, y: source.y + NODE_H / 2 }
  const tc = { x: target.x + NODE_W / 2, y: target.y + NODE_H / 2 }
  const start = borderPoint(sc.x, sc.y, tc.x, tc.y)
  const end = borderPoint(tc.x, tc.y, sc.x, sc.y)
  const dx = end.x - start.x
  const dy = end.y - start.y

  let path: string
  let approach: Point // point the arrow is coming *from*

  if (style === 'straight') {
    path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`
    approach = start
  } else if (style === 'orthogonal') {
    if (Math.abs(dx) >= Math.abs(dy)) {
      const midX = (start.x + end.x) / 2
      path = `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`
      approach = { x: midX, y: end.y }
    } else {
      const midY = (start.y + end.y) / 2
      path = `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`
      approach = { x: end.x, y: midY }
    }
  } else {
    // Curved: cubic bezier with tangents along the dominant axis.
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const off = Math.max(
      40,
      Math.min(200, (horizontal ? Math.abs(dx) : Math.abs(dy)) * 0.5),
    )
    const sgnX = Math.sign(dx) || 1
    const sgnY = Math.sign(dy) || 1
    const c1 = horizontal
      ? { x: start.x + sgnX * off, y: start.y }
      : { x: start.x, y: start.y + sgnY * off }
    const c2 = horizontal
      ? { x: end.x - sgnX * off, y: end.y }
      : { x: end.x, y: end.y - sgnY * off }
    path = `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`
    approach = c2
  }

  const angle = Math.atan2(end.y - approach.y, end.x - approach.x)
  return {
    path,
    end,
    angle,
    labelX: (start.x + end.x) / 2,
    labelY: (start.y + end.y) / 2 - 6,
  }
}

// ---------------------------------------------------------------------------
// Memoized node
// ---------------------------------------------------------------------------

interface ExplorerNodeItemProps {
  x: number
  y: number
  nodeId: string
  trackId: number
  trackTitle: string | undefined
  color: string
  isSelected: boolean
  showActions: boolean
  isSwapSource: boolean
  isDragging: boolean
  isStacked: boolean
  inTracklist: boolean
  onNodeClick: (nodeId: string, additive: boolean) => void
  onNodeMouseDown: (e: React.MouseEvent, nodeId: string) => void
  onNodeMouseUp: (nodeId: string) => void
  onHandleMouseDown: (e: React.MouseEvent, nodeId: string) => void
  onSetDeleteTarget: (nodeId: string) => void
  onSetSwapSource: (nodeId: string) => void
  openChildAdd: (nodeId: string) => void
  onNodeToTracklist: (nodeId: string) => void
}

const ExplorerNodeItem = memo(function ExplorerNodeItem({
  x,
  y,
  nodeId,
  trackId,
  trackTitle,
  color,
  isSelected,
  showActions,
  isSwapSource,
  isDragging,
  isStacked,
  inTracklist,
  onNodeClick,
  onNodeMouseDown,
  onNodeMouseUp,
  onHandleMouseDown,
  onSetDeleteTarget,
  onSetSwapSource,
  openChildAdd,
  onNodeToTracklist,
}: ExplorerNodeItemProps) {
  const fullTitle = trackTitle ?? String(trackId)
  const [titleHead, titleTail] = splitNodeTitle(fullTitle)
  const primary = truncateToWidth(titleHead, TITLE_PRIMARY_SIZE)
  const secondary = truncateToWidth(titleTail, TITLE_SECONDARY_SIZE)

  const actions: {
    key: string
    label: string
    ariaLabel: string
    fill: string
    w: number
    testId?: string
    action: () => void
  }[] = [
    {
      key: 'del',
      label: '×',
      ariaLabel: 'Delete node',
      fill: ACTION_FILL.danger,
      w: 44,
      action: () => onSetDeleteTarget(nodeId),
    },
    {
      key: 'swap',
      label: '↕',
      ariaLabel: 'Swap track IDs',
      fill: ACTION_FILL.accent,
      w: 44,
      action: () => onSetSwapSource(nodeId),
    },
    {
      key: 'child',
      label: '+Child',
      ariaLabel: 'Add child node',
      fill: ACTION_FILL.accent,
      w: 76,
      testId: 'child-add-btn',
      action: () => openChildAdd(nodeId),
    },
  ]
  if (!inTracklist) {
    actions.push({
      key: 'tl',
      label: '→TL',
      ariaLabel: 'Add to Tracklist',
      fill: ACTION_FILL.success,
      w: 52,
      action: () => onNodeToTracklist(nodeId),
    })
  }

  const totalActionsW =
    actions.reduce((s, a) => s + a.w, 0) + (actions.length - 1) * ACTION_GAP
  const actionXs: number[] = []
  let runX = 0
  for (const a of actions) {
    actionXs.push(runX)
    runX += a.w + ACTION_GAP
  }

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={`explorer-node-group${isDragging ? ' explorer-node-group--dragging' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onNodeClick(nodeId, e.shiftKey || e.metaKey || e.ctrlKey)
      }}
      onMouseDown={(e) => onNodeMouseDown(e, nodeId)}
      onMouseUp={() => onNodeMouseUp(nodeId)}
      data-testid="explorer-node"
      data-node-id={nodeId}
    >
      <g
        transform={`translate(${NODE_W / 2}, ${-(ACTION_SCALE * ACTION_H + ACTION_ROW_MARGIN)}) scale(${ACTION_SCALE}) translate(${-totalActionsW / 2}, 0)`}
      >
        <g
          className={`explorer-action-row ${showActions ? 'explorer-action-row--visible' : ''}`}
          data-testid="explorer-action-row"
        >
          {actions.map((a, i) => (
            <g
              key={a.key}
              transform={`translate(${actionXs[i]}, 0)`}
              className="explorer-action-btn"
              onClick={(e) => {
                e.stopPropagation()
                a.action()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  a.action()
                }
              }}
              cursor="pointer"
              role="button"
              tabIndex={0}
              aria-label={a.ariaLabel}
              data-testid={a.testId}
            >
              <title>{a.ariaLabel}</title>
              <rect
                width={a.w}
                height={ACTION_H}
                rx={8}
                fill="var(--surface)"
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={a.w / 2}
                y={ACTION_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={a.fill}
                fontSize={ACTION_LABEL_SIZE}
                fontWeight="600"
              >
                {a.label}
              </text>
            </g>
          ))}
        </g>
      </g>

      <title>{fullTitle}</title>
      <rect
        className="explorer-node-body"
        width={NODE_W}
        height={NODE_H}
        rx={6}
        fill={color}
        opacity={isSwapSource ? 0.5 : isStacked ? 0.45 : 0.85}
        stroke={isSelected ? '#fff' : isSwapSource ? '#fff' : 'none'}
        strokeWidth={isSelected ? 2 : isSwapSource ? 2 : 0}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        className="explorer-node-title"
      >
        <tspan
          x={NODE_W / 2}
          y={NODE_H / 2 - (secondary ? TITLE_LINE_GAP / 2 : 0)}
          fontSize={TITLE_PRIMARY_SIZE}
        >
          {primary}
        </tspan>
        {secondary && (
          <tspan
            x={NODE_W / 2}
            y={NODE_H / 2 + TITLE_LINE_GAP / 2}
            fontSize={TITLE_SECONDARY_SIZE}
            opacity={0.85}
          >
            {secondary}
          </tspan>
        )}
      </text>

      {/* Outgoing-edge connect port (drag from here to another node). */}
      <circle
        className="explorer-connect-handle"
        cx={NODE_W}
        cy={NODE_H / 2}
        r={HANDLE_R}
        fill="var(--surface)"
        stroke={color}
        strokeWidth={2}
        onMouseDown={(e) => onHandleMouseDown(e, nodeId)}
        onClick={(e) => e.stopPropagation()}
        data-testid="explorer-connect-handle"
      />
    </g>
  )
})

// ---------------------------------------------------------------------------
// Memoized edge
// ---------------------------------------------------------------------------

interface ExplorerEdgeItemProps {
  edgeId: number
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  color: string
  style: EdgeStyle
  isSelected: boolean
  score: number | null | undefined
  isLoading: boolean
  onEdgeClick: (e: React.MouseEvent, id: number) => void
  onDeleteEdge: (id: number) => void
}

const ExplorerEdgeItem = memo(function ExplorerEdgeItem({
  edgeId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  color,
  style,
  isSelected,
  score,
  isLoading,
  onEdgeClick,
  onDeleteEdge,
}: ExplorerEdgeItemProps) {
  const geo = computeEdgeGeometry(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    style,
  )
  // Arrowhead triangle at the target anchor.
  const ah = 9
  const a1 = geo.angle + Math.PI - 0.4
  const a2 = geo.angle + Math.PI + 0.4
  const arrow = [
    `${geo.end.x},${geo.end.y}`,
    `${geo.end.x + ah * Math.cos(a1)},${geo.end.y + ah * Math.sin(a1)}`,
    `${geo.end.x + ah * Math.cos(a2)},${geo.end.y + ah * Math.sin(a2)}`,
  ].join(' ')

  return (
    <g>
      <path
        d={geo.path}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: 'pointer' }}
        onClick={(e) => onEdgeClick(e, edgeId)}
        data-testid="explorer-edge-hitbox"
      />
      <path
        d={geo.path}
        fill="none"
        stroke={isSelected ? 'var(--accent)' : color}
        strokeWidth={isSelected ? 2.5 : 1.5}
        pointerEvents="none"
        data-testid="explorer-edge-path"
      />
      <polygon
        points={arrow}
        fill={isSelected ? 'var(--accent)' : color}
        pointerEvents="none"
        data-testid="explorer-edge-arrow"
      />
      {isLoading && score === undefined ? (
        <g
          className="explorer-score-spinner"
          data-testid="explorer-score-spinner"
          transform={`translate(${geo.labelX}, ${geo.labelY})`}
        >
          <circle
            r={5}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="10 5"
            opacity={0.7}
          />
        </g>
      ) : score !== undefined ? (
        <text
          x={geo.labelX}
          y={geo.labelY}
          textAnchor="middle"
          dominantBaseline="auto"
          className="explorer-edge-label"
          fill={color}
          data-testid="explorer-edge-label"
        >
          {score !== null ? formatOverallScore(score) : '—'}
        </text>
      ) : null}
      {isSelected && (
        <g
          transform={`translate(${geo.labelX}, ${geo.labelY + 12})`}
          className="explorer-edge-delete"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteEdge(edgeId)
          }}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          aria-label="Delete edge"
          data-testid="explorer-edge-delete-btn"
        >
          <circle
            r={10}
            fill="var(--surface)"
            stroke="var(--danger)"
            strokeWidth={1.5}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--danger)"
            fontSize={14}
            fontWeight="700"
          >
            ×
          </text>
        </g>
      )}
    </g>
  )
})

// ---------------------------------------------------------------------------

export function SetExplorerCanvas({
  allTracks,
  nodes,
  edges,
  onBack,
  onAddNode,
  onMoveNode,
  onSetPositions,
  onDeleteNode,
  onAddEdge,
  onDeleteEdge,
  onSwap,
  onNodeToTracklist,
  onAddNodeWithParents,
  tracklistTrackIds,
  fetchEdgeScores,
}: Props) {
  const {
    suggestions: addSuggestions,
    search: addSearch,
    clear: addClear,
  } = useTrackSearch(allTracks)

  const [edgeScores, setEdgeScores] = useState<Map<string, number | null>>(
    new Map(),
  )
  const [loadingEdgeKeys, setLoadingEdgeKeys] = useState<Set<string>>(new Set())
  const [swapSource, setSwapSource] = useState<string | null>(null)
  const [childAdd, setChildAdd] = useState<ChildAddState | null>(null)
  const [addQuery, setAddQuery] = useState('')
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null)
  const [marquee, setMarquee] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const [connectDrag, setConnectDrag] = useState<ConnectDragState | null>(null)
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [zoom, setZoom] = useState(readStoredZoom)
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(readStoredEdgeStyle)
  // Local position overrides: hold live drag positions and auto-layout results
  // that the server has not echoed back yet. Rendering reads these first.
  const [posOverride, setPosOverride] = useState<Map<string, Point>>(
    () => new Map(),
  )
  const [draggingIds, setDraggingIds] = useState<Set<string> | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const scoreCacheRef = useRef(new Map<string, number | null>())

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const posOverrideRef = useRef(posOverride)
  const connectDragRef = useRef<ConnectDragState | null>(null)
  const swapSourceRef = useRef<string | null>(null)
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  const fetchEdgeScoresRef = useRef(fetchEdgeScores)

  // Stable refs for all parent callbacks (they change identity on every data
  // refresh; refs keep the memoized sub-components from re-rendering).
  const onAddNodeRef = useRef(onAddNode)
  const onMoveNodeRef = useRef(onMoveNode)
  const onSetPositionsRef = useRef(onSetPositions)
  const onDeleteNodeRef = useRef(onDeleteNode)
  const onAddEdgeRef = useRef(onAddEdge)
  const onDeleteEdgeRef = useRef(onDeleteEdge)
  const onSwapRef = useRef(onSwap)
  const onNodeToTracklistRef = useRef(onNodeToTracklist)
  const onAddNodeWithParentsRef = useRef(onAddNodeWithParents)

  // Pan / node-drag / marquee gesture refs.
  const panningRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const nodeDragRef = useRef<{
    startClientX: number
    startClientY: number
    lastClientX: number
    lastClientY: number
    /** Viewport scroll offsets at drag start; scrolling mid-drag (e.g. edge
        auto-scroll) moves the content without any mousemove, so the scroll
        delta must be added to the client delta to keep nodes under the cursor. */
    startScrollLeft: number
    startScrollTop: number
    /** Drag-start position of every node moving in this gesture. */
    origins: Map<string, Point>
    moved: boolean
  } | null>(null)
  const marqueeOriginRef = useRef<Point | null>(null)
  /** Last pointer position in client coords, for re-mapping gesture previews
      when the viewport scrolls under a stationary pointer. */
  const lastPointerClientRef = useRef<Point | null>(null)
  const marqueeEndRef = useRef<Point | null>(null)
  const marqueeMovedRef = useRef(false)
  const suppressSvgClickRef = useRef(false)
  const undoStackRef = useRef<DeletedNode[][]>([])
  const deleteNodesRef = useRef<(ids: string[]) => void | Promise<void>>(
    () => {},
  )
  const undoDeleteRef = useRef<() => void | Promise<void>>(() => {})

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
    posOverrideRef.current = posOverride
    connectDragRef.current = connectDrag
    swapSourceRef.current = swapSource
    selectedNodeIdsRef.current = selectedNodeIds
    fetchEdgeScoresRef.current = fetchEdgeScores
    onAddNodeRef.current = onAddNode
    onMoveNodeRef.current = onMoveNode
    onSetPositionsRef.current = onSetPositions
    onDeleteNodeRef.current = onDeleteNode
    onAddEdgeRef.current = onAddEdge
    onDeleteEdgeRef.current = onDeleteEdge
    onSwapRef.current = onSwap
    onNodeToTracklistRef.current = onNodeToTracklist
    onAddNodeWithParentsRef.current = onAddNodeWithParents
  })

  // Prune overrides once the server echoes a matching position, or the node is
  // gone. During a plain move (no re-hydration) the prop stays stale, so the
  // override persists and keeps holding the true position.
  useEffect(() => {
    setPosOverride((prev) => {
      if (prev.size === 0) {
        return prev
      }
      const byId = new Map(nodes.map((n) => [n.node_id, n]))
      let changed = false
      const next = new Map(prev)
      for (const [id, p] of prev) {
        const node = byId.get(id)
        if (!node || (node.x === p.x && node.y === p.y)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [nodes])

  const nodeMap = useMemo(() => {
    const map = new Map<string, { node: ExplorerNode; pos: Point }>()
    for (const n of nodes) {
      map.set(n.node_id, {
        node: n,
        pos: posOverride.get(n.node_id) ?? { x: n.x, y: n.y },
      })
    }
    return map
  }, [nodes, posOverride])

  // Nodes whose rectangles overlap another node's ("stacked") render more
  // transparent so the ones underneath stay visible.
  const stackedIds = useMemo(() => {
    const entries = [...nodeMap.values()]
    const ids = new Set<string>()
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i].pos
        const b = entries[j].pos
        if (
          a.x < b.x + NODE_W &&
          a.x + NODE_W > b.x &&
          a.y < b.y + NODE_H &&
          a.y + NODE_H > b.y
        ) {
          ids.add(entries[i].node.node_id)
          ids.add(entries[j].node.node_id)
        }
      }
    }
    return ids
  }, [nodeMap])

  const canvasSize = useMemo(() => {
    let maxX = 0
    let maxY = 0
    for (const { pos } of nodeMap.values()) {
      maxX = Math.max(maxX, pos.x + NODE_W)
      maxY = Math.max(maxY, pos.y + NODE_H)
    }
    return {
      w: Math.max(MIN_CANVAS_W, maxX + CANVAS_PAD),
      h: Math.max(MIN_CANVAS_H, maxY + CANVAS_PAD),
    }
  }, [nodeMap])

  // --- Coordinate helpers ---------------------------------------------------

  const toSvgPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const svg = svgRef.current
      if (
        !svg ||
        typeof svg.createSVGPoint !== 'function' ||
        typeof svg.getScreenCTM !== 'function'
      ) {
        return null
      }
      try {
        const pt = svg.createSVGPoint()
        pt.x = clientX
        pt.y = clientY
        const ctm = svg.getScreenCTM()
        if (!ctm) {
          return null
        }
        const p = pt.matrixTransform(ctm.inverse())
        return { x: p.x, y: p.y }
      } catch {
        return null
      }
    },
    [],
  )

  const viewportCenterSvg = useCallback((): Point => {
    const vp = viewportRef.current
    const w = vp?.clientWidth ?? 800
    const h = vp?.clientHeight ?? 600
    return {
      x: (w / 2 - pan.x) / zoom,
      y: (h / 2 - pan.y) / zoom,
    }
  }, [pan.x, pan.y, zoom])

  // --- Zoom -----------------------------------------------------------------

  const setZoomValue = useCallback((next: number) => {
    const clamped = Math.max(0.2, Math.min(3, next))
    setZoom(clamped)
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(clamped))
    } catch {
      /* storage unavailable */
    }
  }, [])

  const zoomBy = useCallback(
    (delta: number) =>
      setZoom((prev) => {
        const next = Math.max(0.2, Math.min(3, prev + delta))
        try {
          localStorage.setItem(ZOOM_STORAGE_KEY, String(next))
        } catch {
          /* storage unavailable */
        }
        return next
      }),
    [],
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey) {
        return
      }
      e.preventDefault()
      zoomBy(e.deltaY > 0 ? -0.1 : 0.1)
    },
    [zoomBy],
  )

  const changeEdgeStyle = useCallback((style: EdgeStyle) => {
    setEdgeStyle(style)
    try {
      localStorage.setItem(EDGE_STYLE_STORAGE_KEY, style)
    } catch {
      /* storage unavailable */
    }
  }, [])

  // --- Background gestures (pan + marquee) ----------------------------------

  const handleBgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (connectDragRef.current || nodeDragRef.current) {
        return
      }
      const target = e.target as Element
      const onBackground =
        target === svgRef.current ||
        target.classList.contains('set-explorer-svg') ||
        target.classList.contains('explorer-grid-bg')
      if (!onBackground) {
        return
      }
      if (e.metaKey || e.ctrlKey) {
        const origin = toSvgPoint(e.clientX, e.clientY)
        if (origin) {
          marqueeOriginRef.current = origin
          marqueeMovedRef.current = false
          setMarquee({ x0: origin.x, y0: origin.y, x1: origin.x, y1: origin.y })
          return
        }
      }
      panningRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
    },
    [toSvgPoint],
  )

  // Re-derive dragged node positions from the latest pointer + scroll state.
  // Called from mousemove, and from viewport scroll so nodes keep following
  // the cursor while the content scrolls under a stationary pointer.
  const updateNodeDragPositions = useCallback(() => {
    const nd = nodeDragRef.current
    if (!nd) {
      return
    }
    const vp = viewportRef.current
    const dxc =
      nd.lastClientX -
      nd.startClientX +
      ((vp?.scrollLeft ?? nd.startScrollLeft) - nd.startScrollLeft)
    const dyc =
      nd.lastClientY -
      nd.startClientY +
      ((vp?.scrollTop ?? nd.startScrollTop) - nd.startScrollTop)
    if (!nd.moved && Math.abs(dxc) + Math.abs(dyc) < DRAG_THRESHOLD) {
      return
    }
    if (!nd.moved) {
      nd.moved = true
      setDraggingIds(new Set(nd.origins.keys()))
    }
    setPosOverride((prev) => {
      const next = new Map(prev)
      for (const [id, o] of nd.origins) {
        next.set(id, {
          x: Math.max(0, o.x + dxc / zoom),
          y: Math.max(0, o.y + dyc / zoom),
        })
      }
      return next
    })
  }, [zoom])

  // Marquee in progress: re-map its moving corner from client coords.
  // Returns true when a marquee gesture is active (caller should stop there).
  const updateMarquee = useCallback(
    (clientX: number, clientY: number): boolean => {
      const o = marqueeOriginRef.current
      if (!o) {
        return false
      }
      const p = toSvgPoint(clientX, clientY)
      if (p) {
        marqueeEndRef.current = p
        if (Math.abs(p.x - o.x) + Math.abs(p.y - o.y) >= DRAG_THRESHOLD) {
          marqueeMovedRef.current = true
        }
        setMarquee({ x0: o.x, y0: o.y, x1: p.x, y1: p.y })
      }
      return true
    },
    [toSvgPoint],
  )

  // Connect-drag preview: re-map the cursor end of the pending edge.
  const updateConnectDrag = useCallback(
    (clientX: number, clientY: number): boolean => {
      if (!connectDragRef.current) {
        return false
      }
      const p = toSvgPoint(clientX, clientY)
      if (p) {
        setConnectDrag((prev) =>
          prev ? { ...prev, cursorX: p.x, cursorY: p.y } : prev,
        )
      }
      return true
    },
    [toSvgPoint],
  )

  // Scrolling moves the content under a stationary pointer without any
  // mousemove, so every in-flight gesture must be re-derived here.
  const handleViewportScroll = useCallback(() => {
    if (nodeDragRef.current) {
      updateNodeDragPositions()
      return
    }
    const last = lastPointerClientRef.current
    if (!last) {
      return
    }
    if (updateMarquee(last.x, last.y)) {
      return
    }
    updateConnectDrag(last.x, last.y)
  }, [updateNodeDragPositions, updateMarquee, updateConnectDrag])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      lastPointerClientRef.current = { x: e.clientX, y: e.clientY }

      if (updateMarquee(e.clientX, e.clientY)) {
        return
      }

      if (updateConnectDrag(e.clientX, e.clientY)) {
        return
      }

      // Node reposition drag (single node, or the whole selection as a group).
      const nd = nodeDragRef.current
      if (nd) {
        nd.lastClientX = e.clientX
        nd.lastClientY = e.clientY
        updateNodeDragPositions()
        return
      }

      // Plain pan.
      if (!panningRef.current) {
        return
      }
      const dx = e.clientX - lastMouseRef.current.x
      const dy = e.clientY - lastMouseRef.current.y
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
    },
    [updateMarquee, updateConnectDrag, updateNodeDragPositions],
  )

  const finishMarquee = useCallback(() => {
    const origin = marqueeOriginRef.current
    if (!origin) {
      return false
    }
    const end = marqueeEndRef.current ?? origin
    marqueeOriginRef.current = null
    marqueeEndRef.current = null
    setMarquee(null)
    if (marqueeMovedRef.current) {
      const minX = Math.min(origin.x, end.x)
      const maxX = Math.max(origin.x, end.x)
      const minY = Math.min(origin.y, end.y)
      const maxY = Math.max(origin.y, end.y)
      const hits = new Set<string>()
      for (const { node, pos } of nodeMap.values()) {
        if (
          pos.x <= maxX &&
          pos.x + NODE_W >= minX &&
          pos.y <= maxY &&
          pos.y + NODE_H >= minY
        ) {
          hits.add(node.node_id)
        }
      }
      setSelectedNodeIds(hits)
      setSelectedEdgeId(null)
      suppressSvgClickRef.current = true
    }
    return true
  }, [nodeMap])

  const handleMouseUp = useCallback(() => {
    if (finishMarquee()) {
      return
    }
    // Finish a node reposition: snap to lane/grid + persist.
    const nd = nodeDragRef.current
    if (nd) {
      nodeDragRef.current = null
      if (nd.moved) {
        const snapped: { node_id: string; x: number; y: number }[] = []
        for (const [id, o] of nd.origins) {
          const cur = posOverrideRef.current.get(id) ?? o
          snapped.push({
            node_id: id,
            x: snapToLaneX(cur.x),
            y: snapToGrid(cur.y),
          })
        }
        setPosOverride((prev) => {
          const next = new Map(prev)
          for (const s of snapped) {
            next.set(s.node_id, { x: s.x, y: s.y })
          }
          return next
        })
        if (snapped.length === 1) {
          onMoveNodeRef.current(snapped[0].node_id, snapped[0].x, snapped[0].y)
        } else {
          void onSetPositionsRef.current(snapped)
        }
        suppressSvgClickRef.current = true
      }
      setDraggingIds(null)
    }
    panningRef.current = false
    if (connectDragRef.current) {
      setConnectDrag(null)
    }
  }, [finishMarquee])

  // --- Node gestures --------------------------------------------------------

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (e.button !== 0 || swapSourceRef.current) {
        return
      }
      const target = e.target as Element
      if (
        target.closest('.explorer-action-row') ||
        target.closest('.explorer-connect-handle')
      ) {
        return
      }
      e.stopPropagation()
      if (!nodeMap.has(nodeId)) {
        return
      }
      // Grabbing a node inside the current multi-selection drags the whole
      // selection; grabbing any other node drags just that node.
      const selected = selectedNodeIdsRef.current
      const ids =
        selected.has(nodeId) && selected.size > 1 ? [...selected] : [nodeId]
      const origins = new Map<string, Point>()
      for (const id of ids) {
        const entry = nodeMap.get(id)
        if (entry) {
          origins.set(id, { x: entry.pos.x, y: entry.pos.y })
        }
      }
      const vp = viewportRef.current
      nodeDragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        startScrollLeft: vp?.scrollLeft ?? 0,
        startScrollTop: vp?.scrollTop ?? 0,
        origins,
        moved: false,
      }
    },
    [nodeMap],
  )

  const handleHandleMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (e.button !== 0 || swapSourceRef.current) {
        return
      }
      e.stopPropagation()
      const entry = nodeMap.get(nodeId)
      if (!entry) {
        return
      }
      const startX = entry.pos.x + NODE_W
      const startY = entry.pos.y + NODE_H / 2
      setConnectDrag({
        sourceNodeId: nodeId,
        startX,
        startY,
        cursorX: startX,
        cursorY: startY,
      })
    },
    [nodeMap],
  )

  const handleNodeMouseUp = useCallback((nodeId: string) => {
    const cd = connectDragRef.current
    if (!cd) {
      return
    }
    if (cd.sourceNodeId !== nodeId) {
      const already = edgesRef.current.some(
        (e) =>
          e.parent_node_id === cd.sourceNodeId && e.child_node_id === nodeId,
      )
      if (!already) {
        void onAddEdgeRef.current(cd.sourceNodeId, nodeId)
      }
    }
    setConnectDrag(null)
  }, [])

  // --- Selection / click ----------------------------------------------------

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (suppressSvgClickRef.current) {
      suppressSvgClickRef.current = false
      return
    }
    const target = e.target as Element
    if (
      target === svgRef.current ||
      target.classList.contains('set-explorer-svg') ||
      target.classList.contains('explorer-grid-bg')
    ) {
      setSelectedNodeIds(new Set())
      setSelectedEdgeId(null)
      setSwapSource(null)
    }
  }, [])

  const handleNodeClick = useCallback((nodeId: string, additive: boolean) => {
    const ss = swapSourceRef.current
    if (ss) {
      if (ss !== nodeId) {
        onSwapRef.current(ss, nodeId)
      }
      setSwapSource(null)
      return
    }
    setSelectedNodeIds((prev) => {
      if (additive) {
        const next = new Set(prev)
        if (next.has(nodeId)) {
          next.delete(nodeId)
        } else {
          next.add(nodeId)
        }
        return next
      }
      if (prev.size === 1 && prev.has(nodeId)) {
        return new Set()
      }
      return new Set([nodeId])
    })
    setSelectedEdgeId(null)
  }, [])

  const onSetSwapSource = useCallback((nodeId: string) => {
    setSwapSource(nodeId)
    setSelectedEdgeId(null)
  }, [])

  const handleEdgeClick = useCallback((e: React.MouseEvent, edgeId: number) => {
    e.stopPropagation()
    setSelectedEdgeId((prev) => (prev === edgeId ? null : edgeId))
    setSelectedNodeIds(new Set())
    setSwapSource(null)
  }, [])

  const handleDeleteEdge = useCallback((edgeId: number) => {
    void onDeleteEdgeRef.current(edgeId)
    setSelectedEdgeId(null)
  }, [])

  // --- Delete / undo --------------------------------------------------------

  const captureNode = useCallback((nodeId: string): DeletedNode | null => {
    const node = nodesRef.current.find((n) => n.node_id === nodeId)
    if (!node) {
      return null
    }
    const pos = posOverrideRef.current.get(nodeId) ?? { x: node.x, y: node.y }
    return {
      node_id: nodeId,
      track_id: node.track_id,
      x: pos.x,
      y: pos.y,
      parentIds: edgesRef.current
        .filter((e) => e.child_node_id === nodeId)
        .map((e) => e.parent_node_id),
      childIds: edgesRef.current
        .filter((e) => e.parent_node_id === nodeId)
        .map((e) => e.child_node_id),
    }
  }, [])

  const deleteNodes = useCallback(
    async (ids: string[]) => {
      const batch = ids
        .map(captureNode)
        .filter((d): d is DeletedNode => d !== null)
      if (batch.length === 0) {
        return
      }
      undoStackRef.current.push(batch)
      setSelectedNodeIds(new Set())
      for (const d of batch) {
        await onDeleteNodeRef.current(d.node_id)
      }
    },
    [captureNode],
  )

  // Reconstruct the last deletion: recreate every node (no edges), then relink
  // every edge via the old→new id map. Creating nodes first, edges second,
  // sidesteps ordering and the newly-allowed indirect cycles.
  const undoDelete = useCallback(async () => {
    const batch = undoStackRef.current.pop()
    if (!batch || batch.length === 0) {
      return
    }
    const deletedSet = new Set(batch.map((d) => d.node_id))
    const idMap = new Map<string, string>()
    for (const d of batch) {
      const r = await onAddNodeWithParentsRef.current(d.track_id, [], d.x, d.y)
      if (r?.node_id) {
        idMap.set(d.node_id, r.node_id)
      }
    }
    // Incoming edges (from survivors or restored parents).
    for (const d of batch) {
      const newChild = idMap.get(d.node_id)
      if (!newChild) {
        continue
      }
      for (const pOld of d.parentIds) {
        const parent = deletedSet.has(pOld) ? idMap.get(pOld) : pOld
        if (parent) {
          await onAddEdgeRef.current(parent, newChild)
        }
      }
    }
    // Outgoing edges to survivors (internal edges already added above).
    for (const d of batch) {
      const newParent = idMap.get(d.node_id)
      if (!newParent) {
        continue
      }
      for (const cOld of d.childIds) {
        if (deletedSet.has(cOld)) {
          continue
        }
        await onAddEdgeRef.current(newParent, cOld)
      }
    }
  }, [])

  const handleSetDeleteTarget = useCallback(
    (nodeId: string) => {
      void deleteNodes([nodeId])
    },
    [deleteNodes],
  )

  useEffect(() => {
    deleteNodesRef.current = deleteNodes
    undoDeleteRef.current = undoDelete
  })

  // --- Keyboard -------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      const isUndo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z'
      if (isUndo) {
        e.preventDefault()
        void undoDeleteRef.current()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgeId !== null) {
          e.preventDefault()
          void onDeleteEdgeRef.current(selectedEdgeId)
          setSelectedEdgeId(null)
          return
        }
        const ids = Array.from(selectedNodeIdsRef.current)
        if (ids.length === 0) {
          return
        }
        e.preventDefault()
        void deleteNodesRef.current(ids)
        return
      }
      if (e.key === 'Escape') {
        setSwapSource(null)
        setSelectedEdgeId(null)
        setSelectedNodeIds(new Set())
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedEdgeId])

  // --- Edge scores ----------------------------------------------------------

  const edgePairKey = useMemo(
    () =>
      edges
        .map((e) => `${e.parent_node_id}-${e.child_node_id}`)
        .sort()
        .join(','),
    [edges],
  )

  // Data-fetch effect: the synchronous setState calls mark loading state / merge
  // cached scores before the async fetch resolves — a documented false positive
  // for react-hooks/set-state-in-effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const currentNodes = nodesRef.current
    const currentEdges = edgesRef.current
    if (currentNodes.length < 2) {
      return
    }
    const newPairs: [number, number][] = []
    const newTrackKeys: string[] = []
    const newNodeKeys: string[] = []
    const fromCacheEntries: Array<[string, number | null]> = []

    for (const edge of currentEdges) {
      const parent = currentNodes.find((n) => n.node_id === edge.parent_node_id)
      const child = currentNodes.find((n) => n.node_id === edge.child_node_id)
      if (!parent || !child) {
        continue
      }
      const trackKey = `${parent.track_id}-${child.track_id}`
      const nodeKey = `${edge.parent_node_id}-${edge.child_node_id}`
      const cached = scoreCacheRef.current.get(trackKey)
      if (cached !== undefined) {
        fromCacheEntries.push([nodeKey, cached])
      } else {
        newPairs.push([parent.track_id, child.track_id])
        newTrackKeys.push(trackKey)
        newNodeKeys.push(nodeKey)
      }
    }

    if (newPairs.length === 0) {
      if (fromCacheEntries.length > 0) {
        setEdgeScores((prev) => {
          const needsUpdate = fromCacheEntries.some(
            ([k, v]) => prev.get(k) !== v,
          )
          if (!needsUpdate) {
            return prev
          }
          const next = new Map(prev)
          for (const [k, v] of fromCacheEntries) {
            next.set(k, v)
          }
          return next
        })
      }
      return
    }

    setLoadingEdgeKeys((prev) => {
      const next = new Set(prev)
      for (const nk of newNodeKeys) {
        next.add(nk)
      }
      return next
    })
    let cancelled = false
    fetchEdgeScoresRef
      .current(newPairs)
      .then((result) => {
        if (cancelled) {
          return
        }
        newTrackKeys.forEach((tk, i) => {
          scoreCacheRef.current.set(tk, result.scores[i] ?? null)
        })
        setEdgeScores((prev) => {
          const next = new Map(prev)
          for (const [k, v] of fromCacheEntries) {
            next.set(k, v)
          }
          newNodeKeys.forEach((nk, i) => next.set(nk, result.scores[i] ?? null))
          return next
        })
        setLoadingEdgeKeys((prev) => {
          if (newNodeKeys.every((nk) => !prev.has(nk))) {
            return prev
          }
          const next = new Set(prev)
          for (const nk of newNodeKeys) {
            next.delete(nk)
          }
          return next
        })
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingEdgeKeys((prev) => {
            if (newNodeKeys.every((nk) => !prev.has(nk))) {
              return prev
            }
            const next = new Set(prev)
            for (const nk of newNodeKeys) {
              next.delete(nk)
            }
            return next
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [edgePairKey])
  /* eslint-enable react-hooks/set-state-in-effect */

  // --- Add track / child ----------------------------------------------------

  const stableOnAddNode = useCallback(
    (trackId: number, x?: number, y?: number, parentNodeId?: string) =>
      onAddNodeRef.current(trackId, x, y, parentNodeId),
    [],
  )

  const stableOnNodeToTracklist = useCallback(
    (nodeId: string) => onNodeToTracklistRef.current(nodeId),
    [],
  )

  const handleAddSearch = useCallback(
    (q: string) => {
      setAddQuery(q)
      addSearch(q)
    },
    [addSearch],
  )

  const handleAddSelect = useCallback(
    (trackId: number) => {
      const c = viewportCenterSvg()
      stableOnAddNode(trackId, snapToLaneX(c.x), snapToGrid(c.y))
      setAddQuery('')
      addClear()
    },
    [viewportCenterSvg, stableOnAddNode, addClear],
  )

  const openChildAdd = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find((n) => n.node_id === nodeId)
    if (!node) {
      return
    }
    setChildAdd({ parentNode: node, matches: [], loading: true })
    try {
      const matches = await fetchMatches(node.track_id)
      setChildAdd((prev) =>
        prev ? { ...prev, matches, loading: false } : prev,
      )
    } catch {
      setChildAdd((prev) => (prev ? { ...prev, loading: false } : prev))
    }
  }, [])

  const handleChildSelect = useCallback(
    (m: TransitionMatch) => {
      if (!childAdd) {
        return
      }
      const src = posOverrideRef.current.get(childAdd.parentNode.node_id) ?? {
        x: childAdd.parentNode.x,
        y: childAdd.parentNode.y,
      }
      // Place the child below-right of its parent, in the next lane over.
      stableOnAddNode(
        m.candidate_id,
        snapToLaneX(src.x + LANE_W),
        snapToGrid(src.y + NODE_H + 60),
        childAdd.parentNode.node_id,
      )
      setChildAdd(null)
    },
    [childAdd, stableOnAddNode],
  )

  // --- Auto-layout ----------------------------------------------------------

  const handleAutoLayout = useCallback(() => {
    const layout = forceDirectedLayout(
      nodesRef.current.map((n) => ({ id: n.node_id })),
      edgesRef.current.map((e) => ({
        source: e.parent_node_id,
        target: e.child_node_id,
      })),
    )
    if (layout.size === 0) {
      return
    }
    const snapped = [...layout.entries()].map(([id, p]) => ({
      node_id: id,
      x: snapToLaneX(p.x),
      y: snapToGrid(p.y),
    }))
    setPosOverride(() => {
      const next = new Map<string, Point>()
      for (const s of snapped) {
        next.set(s.node_id, { x: s.x, y: s.y })
      }
      return next
    })
    void onSetPositionsRef.current(snapped)
  }, [])

  // --- Drag-and-drop from track lists ---------------------------------------

  const handleViewportDragOver = useCallback((e: React.DragEvent) => {
    if (
      !e.dataTransfer.types.includes(TRACK_DRAG_MIME) &&
      !e.dataTransfer.types.includes('text/plain')
    ) {
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleViewportDrop = useCallback(
    (e: React.DragEvent) => {
      const raw =
        e.dataTransfer.getData(TRACK_DRAG_MIME) ||
        e.dataTransfer.getData('text/plain')
      if (raw.trim() === '') {
        return
      }
      e.preventDefault()
      const trackId = Number(raw)
      if (!Number.isInteger(trackId)) {
        return
      }
      const pt = toSvgPoint(e.clientX, e.clientY) ?? viewportCenterSvg()
      stableOnAddNode(
        trackId,
        snapToLaneX(pt.x - NODE_W / 2),
        Math.max(0, snapToGrid(pt.y - NODE_H / 2)),
      )
    },
    [toSvgPoint, viewportCenterSvg, stableOnAddNode],
  )

  const singleSelected =
    selectedNodeIds.size === 1 ? [...selectedNodeIds][0] : null

  return (
    <div className="set-explorer">
      <div className="set-explorer-controls">
        {onBack && (
          <button
            className="explorer-back-btn"
            aria-label="Back to tracklist and pool"
            title="Back to tracklist and pool"
            onClick={onBack}
          >
            ←
          </button>
        )}

        <div className="set-explorer-search-wrapper explorer-add-search">
          <input
            className="set-explorer-search"
            placeholder="Add track to canvas…"
            value={addQuery}
            onChange={(e) => handleAddSearch(e.target.value)}
            data-testid="explorer-add-search-input"
          />
          {addQuery.trim() !== '' && addSuggestions.length > 0 && (
            <ul className="set-explorer-search-dropdown">
              {addSuggestions.map((s) => (
                <li
                  key={s.id}
                  className="set-explorer-search-item"
                  onMouseDown={() => handleAddSelect(s.id)}
                  data-testid="explorer-add-search-item"
                >
                  <span>{s.title}</span>
                  <span className="text-muted">
                    {s.camelot_code && (
                      <span className="mono"> {s.camelot_code}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          className="set-action-btn"
          onClick={handleAutoLayout}
          aria-label="Auto-layout graph"
          data-testid="explorer-auto-layout-btn"
        >
          Auto-layout
        </button>

        <div
          className="explorer-edge-style-toggle"
          role="group"
          aria-label="Edge style"
          data-testid="explorer-edge-style-toggle"
        >
          {(['curved', 'straight', 'orthogonal'] as EdgeStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              className={`explorer-edge-style-btn${edgeStyle === style ? ' explorer-edge-style-btn--active' : ''}`}
              aria-pressed={edgeStyle === style}
              onClick={() => changeEdgeStyle(style)}
              data-testid={`explorer-edge-style-${style}`}
            >
              {style === 'curved'
                ? 'Curved'
                : style === 'straight'
                  ? 'Straight'
                  : 'Right-angle'}
            </button>
          ))}
        </div>

        {swapSource && (
          <span className="set-explorer-swap-hint">
            Click another node to swap
          </span>
        )}
      </div>

      <div
        className="explorer-zoom-controls"
        role="group"
        aria-label="Explorer zoom"
      >
        <button
          type="button"
          className="explorer-zoom-btn"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomBy(0.1)}
        >
          +
        </button>
        <span className="explorer-zoom-level" data-testid="explorer-zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="explorer-zoom-btn"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomBy(-0.1)}
        >
          −
        </button>
        <button
          type="button"
          className="explorer-zoom-btn explorer-zoom-reset"
          aria-label="Reset zoom"
          title="Reset zoom"
          onClick={() => setZoomValue(1)}
        >
          ⤢
        </button>
      </div>

      <div
        ref={viewportRef}
        className="set-explorer-viewport"
        onWheel={handleWheel}
        onMouseDown={handleBgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onScroll={handleViewportScroll}
        onDragOver={handleViewportDragOver}
        onDrop={handleViewportDrop}
      >
        {nodes.length === 0 && (
          <p className="set-empty-tracks set-explorer-empty-message">
            Canvas is empty. Drag a track here, or use “Add track to canvas”, to
            place a node.
          </p>
        )}
        <svg
          ref={svgRef}
          className="set-explorer-svg"
          width={canvasSize.w}
          height={canvasSize.h}
          viewBox={`0 0 ${canvasSize.w} ${canvasSize.h}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          onClick={handleSvgClick}
        >
          <defs>
            <pattern
              id="explorer-grid-dots"
              width={GRID}
              height={GRID}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={1} cy={1} r={1} className="explorer-grid-dot" />
            </pattern>
            <pattern
              id="explorer-lane-lines"
              width={LANE_W}
              height={GRID}
              patternUnits="userSpaceOnUse"
            >
              <line
                className="explorer-lane-line"
                x1={0.5}
                y1={0}
                x2={0.5}
                y2={GRID}
              />
            </pattern>
          </defs>
          <rect
            className="explorer-grid-bg"
            x={0}
            y={0}
            width={canvasSize.w}
            height={canvasSize.h}
            fill="url(#explorer-grid-dots)"
          />
          {/* Lane boundary lines, one every LANE_W. Shares the grid-bg class
              so background hit-testing (pan, marquee, deselect) still works. */}
          <rect
            className="explorer-grid-bg explorer-lane-bg"
            x={0}
            y={0}
            width={canvasSize.w}
            height={canvasSize.h}
            fill="url(#explorer-lane-lines)"
            data-testid="explorer-lane-bg"
          />

          {/* Edges */}
          {edges.map((edge) => {
            const parent = nodeMap.get(edge.parent_node_id)
            const child = nodeMap.get(edge.child_node_id)
            if (!parent || !child) {
              return null
            }
            const nodeKey = `${edge.parent_node_id}-${edge.child_node_id}`
            return (
              <ExplorerEdgeItem
                key={`edge-${edge.id}`}
                edgeId={edge.id}
                sourceX={parent.pos.x}
                sourceY={parent.pos.y}
                targetX={child.pos.x}
                targetY={child.pos.y}
                color={colorForNodeId(edge.parent_node_id)}
                style={edgeStyle}
                isSelected={selectedEdgeId === edge.id}
                score={edgeScores.get(nodeKey)}
                isLoading={loadingEdgeKeys.has(nodeKey)}
                onEdgeClick={handleEdgeClick}
                onDeleteEdge={handleDeleteEdge}
              />
            )
          })}

          {/* Connect-drag preview line */}
          {connectDrag && (
            <line
              x1={connectDrag.startX}
              y1={connectDrag.startY}
              x2={connectDrag.cursorX}
              y2={connectDrag.cursorY}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="6 4"
              pointerEvents="none"
              data-testid="connect-drag-line"
            />
          )}

          {/* Marquee */}
          {marquee && (
            <rect
              className="explorer-marquee"
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              pointerEvents="none"
              data-testid="explorer-marquee"
            />
          )}

          {/* Nodes */}
          {[...nodeMap.values()].map(({ node, pos }) => (
            <ExplorerNodeItem
              key={node.node_id}
              nodeId={node.node_id}
              trackId={node.track_id}
              trackTitle={node.track?.title}
              color={colorForNodeId(node.node_id)}
              x={pos.x}
              y={pos.y}
              isSelected={selectedNodeIds.has(node.node_id)}
              showActions={singleSelected === node.node_id}
              isSwapSource={swapSource === node.node_id}
              isDragging={draggingIds?.has(node.node_id) ?? false}
              isStacked={stackedIds.has(node.node_id)}
              inTracklist={tracklistTrackIds.has(node.track_id)}
              onNodeClick={handleNodeClick}
              onNodeMouseDown={handleNodeMouseDown}
              onNodeMouseUp={handleNodeMouseUp}
              onHandleMouseDown={handleHandleMouseDown}
              onSetDeleteTarget={handleSetDeleteTarget}
              onSetSwapSource={onSetSwapSource}
              openChildAdd={openChildAdd}
              onNodeToTracklist={stableOnNodeToTracklist}
            />
          ))}
        </svg>
      </div>

      {childAdd && (
        <div
          className="explorer-delete-overlay"
          onClick={() => setChildAdd(null)}
        >
          <div
            className="explorer-delete-modal"
            onClick={(e) => e.stopPropagation()}
            data-testid="child-add-modal"
          >
            <h3>Add Child</h3>
            <p className="text-muted">
              Matches for{' '}
              <strong>
                {childAdd.parentNode.track?.title ??
                  childAdd.parentNode.node_id}
              </strong>
            </p>

            {childAdd.loading ? (
              <p className="text-muted" data-testid="child-match-loading">
                Loading matches…
              </p>
            ) : childAdd.matches.length === 0 ? (
              <p className="text-muted">No matches found.</p>
            ) : (
              <ul
                className="set-explorer-search-dropdown"
                style={{
                  position: 'static',
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {childAdd.matches.map((m) => (
                  <li
                    key={m.candidate_id}
                    className="set-explorer-search-item"
                    onClick={() => handleChildSelect(m)}
                    data-testid="child-match-item"
                  >
                    <span>{m.title}</span>
                    <span className="text-muted mono">
                      {formatOverallScore(m.overall_score)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="explorer-delete-buttons" style={{ marginTop: 12 }}>
              <button
                className="set-action-btn"
                onClick={() => setChildAdd(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
