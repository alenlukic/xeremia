import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react'
import type {
  ExplorerNode,
  ExplorerEdge,
  SearchSuggestion,
  Track,
  TransitionMatch,
} from '../types'
import { colorForColumn, ACTION_FILL } from '../utils/explorer'
import { fetchMatches } from '../api/http'
import { useTrackSearch } from '../hooks/useTrackSearch'
import { SetExplorerDeleteModal } from './SetExplorerDeleteModal'
import { formatOverallScore, TRACK_DRAG_MIME } from '../utils'

interface Props {
  allTracks: Track[]
  nodes: ExplorerNode[]
  edges: ExplorerEdge[]
  /** Return to the tracklist/pool view. */
  onBack?: () => void
  onAddNode: (trackId: number, parentNodeId?: string, level?: number) => void
  onDeleteNode: (
    nodeId: string,
    rewireEdges?: { parent_node_id: string; child_node_id: string }[],
  ) => void | Promise<void>
  onAddEdge: (parentNodeId: string, childNodeId: string) => Promise<void>
  onDeleteEdge: (edgeId: number) => Promise<void>
  onSwap: (nodeAId: string, nodeBId: string) => void
  onNodeToTracklist: (nodeId: string) => void
  onAddSibling: (
    trackId: number,
    inheritParentIds: string[],
    level: number,
  ) => Promise<unknown>
  tracklistTrackIds: Set<number>
  fetchEdgeScores: (
    pairs: [number, number][],
  ) => Promise<{ scores: (number | null)[] }>
}

interface SiblingAddState {
  targetLevel: number
  parentIds: string[]
  selectedParents: Set<string>
  searchQuery: string
}

interface ChildAddState {
  parentNode: ExplorerNode
  matches: TransitionMatch[]
  loading: boolean
}

interface ConnectDragState {
  sourceNodeId: string
  sourceLevel: number
  sourceCX: number
  sourceCY: number
  cursorX: number
  cursorY: number
}

interface LayoutNode {
  node: ExplorerNode
  x: number
  y: number
  children: LayoutNode[]
}

const NODE_W = 360
const NODE_H = 48
const V_GAP = 176
const MAX_COLS = 5
const SLOT_W = 390
const ACTION_H = 48
const ACTION_LABEL_SIZE = 20
const ACTION_GAP = 8
const ACTION_ROW_MARGIN = 8
const TOP_PAD = ACTION_H + ACTION_ROW_MARGIN
const LEVEL_ADD_W = 70
const LEVEL_ADD_H = 28
const LEVEL_ADD_GAP = 16
const EDGE_SLOTS = 5
// Departure slots (left half) and arrival slots (right half) of a node's
// width never share an x-coordinate, even though `nodeX` itself repeats
// across levels whenever a parent and an unrelated child land in the same
// column — without this split, a departure stub on one node and an arrival
// stub on a same-column node at a different level could compute the same
// absolute x and their vertical runs could genuinely overlap.
const HALF_SLOT_SPAN = NODE_W / 2 / EDGE_SLOTS
const LANE_STUB = 10
const LANE_S = 6
const ZOOM_STORAGE_KEY = 'explorer-zoom'

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

// Each node has 5 departure slots (left half of its width) and 5 arrival
// slots (right half). A parent emits a line to a given child from the
// departure slot matching that CHILD's column index; a child receives a
// line from the arrival slot matching that PARENT's column index. A node
// can have at most one edge per distinct partner column, so within each
// half every edge gets a unique x-offset — and the left/right split keeps
// departures and arrivals from colliding with each other across levels.
function departureSlotX(nodeX: number, slotIdx: number): number {
  return nodeX + HALF_SLOT_SPAN * (slotIdx + 0.5)
}

function arrivalSlotX(nodeX: number, slotIdx: number): number {
  return nodeX + NODE_W / 2 + HALF_SLOT_SPAN * (slotIdx + 0.5)
}

function truncateForSvg(text: string, max = 56): string {
  if (text.length <= max) {
    return text
  }
  return text.slice(0, max - 1) + '…'
}

// ---------------------------------------------------------------------------
// Memoized sub-components
// Props use primitives (number, boolean, string) and stable object references
// from the parent's props — never freshly-created objects derived inside render.
// React.memo compares primitives by value, so layout recomputation that produces
// the same numbers does not cause re-renders of unaffected items.
// ---------------------------------------------------------------------------

interface ExplorerNodeItemProps {
  x: number
  y: number
  nodeId: string
  trackId: number
  level: number
  colIndex: number
  trackTitle: string | undefined
  isSelected: boolean
  showActions: boolean
  isSwapSource: boolean
  inTracklist: boolean
  onNodeClick: (nodeId: string, additive: boolean) => void
  onNodeMouseDown: (
    e: React.MouseEvent,
    nodeId: string,
    level: number,
    x: number,
    y: number,
  ) => void
  onNodeMouseUp: (nodeId: string, level: number) => void
  onSetDeleteTarget: (nodeId: string) => void
  onSetSwapSource: (nodeId: string) => void
  openChildAdd: (nodeId: string) => void
  onNodeToTracklist: (nodeId: string) => void
  onAddNode: (trackId: number, parentNodeId: string, level: number) => void
}

const ExplorerNodeItem = memo(function ExplorerNodeItem({
  x,
  y,
  nodeId,
  trackId,
  level,
  colIndex,
  trackTitle,
  isSelected,
  showActions,
  isSwapSource,
  inTracklist,
  onNodeClick,
  onNodeMouseDown,
  onNodeMouseUp,
  onSetDeleteTarget,
  onSetSwapSource,
  openChildAdd,
  onNodeToTracklist,
  onAddNode,
}: ExplorerNodeItemProps) {
  const color = colorForColumn(colIndex)
  const fullTitle = trackTitle ?? String(trackId)
  const title = truncateForSvg(fullTitle)

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
  const actionsStartX = (NODE_W - totalActionsW) / 2
  const actionXs: number[] = []
  let runX = 0
  for (const a of actions) {
    actionXs.push(runX)
    runX += a.w + ACTION_GAP
  }

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className="explorer-node-group"
      onClick={(e) => {
        e.stopPropagation()
        onNodeClick(nodeId, e.shiftKey || e.metaKey)
      }}
      onMouseDown={(e) => onNodeMouseDown(e, nodeId, level, x, y)}
      onMouseUp={() => onNodeMouseUp(nodeId, level)}
      data-testid="explorer-node"
      data-level={level}
      data-col-index={colIndex}
    >
      <g
        transform={`translate(${actionsStartX}, ${-(ACTION_H + ACTION_ROW_MARGIN)})`}
      >
        <g
          className={`explorer-action-row ${showActions ? 'explorer-action-row--visible' : ''}`}
          data-testid="explorer-action-row"
        >
          {actions.map((a, i) => (
            <g
              key={a.key}
              ref={(el) => {
                if (el) {
                  el.setAttribute('title', a.ariaLabel)
                }
              }}
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
              >
                <title>{a.ariaLabel}</title>
              </rect>
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
        width={NODE_W}
        height={NODE_H}
        rx={6}
        fill={color}
        opacity={isSwapSource ? 0.5 : 0.85}
        stroke={isSelected ? '#fff' : isSwapSource ? '#fff' : 'none'}
        strokeWidth={isSelected ? 2 : isSwapSource ? 2 : 0}
      />
      <text
        x={NODE_W / 2}
        y={NODE_H / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={9}
        className="explorer-node-title"
      >
        {title}
      </text>

      <rect
        x={0}
        y={NODE_H - 4}
        width={NODE_W}
        height={8}
        fill="transparent"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => {
          e.preventDefault()
          // Drop on a node's lower edge adds a child; stop propagation so the
          // viewport-level root drop does not also fire.
          e.stopPropagation()
          const rawTrackId =
            e.dataTransfer.getData(TRACK_DRAG_MIME) ||
            e.dataTransfer.getData('text/plain')
          if (rawTrackId.trim() === '') {
            return
          }
          const trackId = Number(rawTrackId)
          if (Number.isInteger(trackId)) {
            onAddNode(trackId, nodeId, level + 1)
          }
        }}
      />
    </g>
  )
})

interface ExplorerEdgeItemProps {
  edgeId: number
  parentX: number
  parentY: number
  childX: number
  childY: number
  parentColIdx: number
  childColIdx: number
  isSelected: boolean
  score: number | null | undefined
  isLoading: boolean
  onEdgeClick: (e: React.MouseEvent, id: number) => void
  onDeleteEdge: (id: number) => void
}

const ExplorerEdgeItem = memo(function ExplorerEdgeItem({
  edgeId,
  parentX,
  parentY,
  childX,
  childY,
  parentColIdx,
  childColIdx,
  isSelected,
  score,
  isLoading,
  onEdgeClick,
  onDeleteEdge,
}: ExplorerEdgeItemProps) {
  const parentBottom = parentY + NODE_H
  const childTop = childY
  const strokeColor = colorForColumn(parentColIdx)
  const laneIndex = parentColIdx * EDGE_SLOTS + childColIdx
  // Parent emits from the departure slot matching the child's column; child
  // receives into the arrival slot matching the parent's column (see
  // departureSlotX/arrivalSlotX above).
  const startX = departureSlotX(parentX, childColIdx)
  const endX = arrivalSlotX(childX, parentColIdx)
  const laneY = parentBottom + LANE_STUB + laneIndex * LANE_S
  const pathD = `M ${startX} ${parentBottom} L ${startX} ${laneY} L ${endX} ${laneY} L ${endX} ${childTop}`
  const labelX = endX - 10
  const labelY = childTop - 8
  const edgeMidX = (startX + endX) / 2

  return (
    <g key={`edge-${edgeId}`}>
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
        onClick={(e) => onEdgeClick(e, edgeId)}
        data-testid="explorer-edge-hitbox"
      />
      <path
        d={pathD}
        fill="none"
        stroke={isSelected ? 'var(--accent)' : strokeColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        pointerEvents="none"
      />
      {isLoading && score === undefined ? (
        <g
          className="explorer-score-spinner"
          data-testid="explorer-score-spinner"
          transform={`translate(${labelX}, ${labelY})`}
        >
          <circle
            r={5}
            fill="none"
            stroke={strokeColor}
            strokeWidth={1.5}
            strokeDasharray="10 5"
            opacity={0.7}
          />
        </g>
      ) : score !== undefined ? (
        <text
          x={labelX}
          y={labelY}
          textAnchor="end"
          dominantBaseline="auto"
          className="explorer-edge-label"
          fill={strokeColor}
          data-testid="explorer-edge-label"
        >
          {score !== null ? formatOverallScore(score) : '—'}
        </text>
      ) : null}
      {isSelected && (
        <g
          transform={`translate(${edgeMidX}, ${laneY})`}
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

export function SetExplorerCanvas({
  allTracks,
  nodes,
  edges,
  onBack,
  onAddNode,
  onDeleteNode,
  onAddEdge,
  onDeleteEdge,
  onSwap,
  onNodeToTracklist,
  onAddSibling,
  tracklistTrackIds,
  fetchEdgeScores,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const {
    suggestions: rootSuggestions,
    search: rootSearch,
    clear: rootClear,
  } = useTrackSearch(allTracks)
  const {
    suggestions: siblingSuggestions,
    search: siblingSearch,
    clear: siblingClear,
  } = useTrackSearch(allTracks)
  const [deleteTarget, setDeleteTarget] = useState<ExplorerNode | null>(null)
  const [edgeScores, setEdgeScores] = useState<Map<string, number | null>>(
    new Map(),
  )
  const [loadingEdgeKeys, setLoadingEdgeKeys] = useState<Set<string>>(new Set())
  const [swapSource, setSwapSource] = useState<string | null>(null)
  const [siblingAdd, setSiblingAdd] = useState<SiblingAddState | null>(null)
  const [childAdd, setChildAdd] = useState<ChildAddState | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null)
  const [marquee, setMarquee] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const [connectDrag, setConnectDrag] = useState<ConnectDragState | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const scoreCacheRef = useRef(new Map<string, number | null>())
  // Always-current refs so scoring effect can read latest nodes/edges without
  // taking array references as dependencies (array identity changes every render).
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const byLevelMapRef = useRef<Map<number, LayoutNode[]>>(new Map())
  // Layout positions + current node selection, read from event-handler
  // callbacks (marquee finalize / backspace) without taking them as deps.
  const allFlatRef = useRef<LayoutNode[]>([])
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  // Rubber-band (marquee) drag-select origin in SVG user-space; non-null only
  // while a Shift+background drag is in progress.
  const marqueeOriginRef = useRef<{ x: number; y: number } | null>(null)
  const marqueeEndRef = useRef<{ x: number; y: number } | null>(null)
  const marqueeMovedRef = useRef(false)
  // Suppress the click that fires right after a marquee/pan drag so it does not
  // immediately clear the selection the drag just made.
  const suppressSvgClickRef = useRef(false)
  // Refs for volatile UI state consumed by stable callbacks — prevents callbacks
  // from changing identity on every render, which would defeat React.memo on sub-components.
  const connectDragRef = useRef<ConnectDragState | null>(null)
  const swapSourceRef = useRef<string | null>(null)
  const fetchEdgeScoresRef = useRef(fetchEdgeScores)

  // Stable refs for ALL external callbacks from the parent.
  // Many of these (onAddNode, onSwap, onAddEdge, etc.) come from useSetBuilder
  // hooks where `activeSet` is a dep — so they get new references on every data
  // refresh. Without refs, every ExplorerNodeItem/ExplorerEdgeItem would see a
  // new callback prop and re-render, defeating React.memo entirely.
  const onAddNodeRef = useRef(onAddNode)
  const onDeleteNodeRef = useRef(onDeleteNode)
  const onAddEdgeRef = useRef(onAddEdge)
  const onDeleteEdgeRef = useRef(onDeleteEdge)
  const onSwapRef = useRef(onSwap)
  const onNodeToTracklistRef = useRef(onNodeToTracklist)
  const onAddSiblingRef = useRef(onAddSibling)

  // Sync render-time values into refs after commit. The refs are only read from
  // event-handler callbacks / effects (never during render), so a one-render lag
  // is safe and avoids the react-hooks/refs render-mutation warning.
  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
    connectDragRef.current = connectDrag
    swapSourceRef.current = swapSource
    fetchEdgeScoresRef.current = fetchEdgeScores
    onAddNodeRef.current = onAddNode
    onDeleteNodeRef.current = onDeleteNode
    onAddEdgeRef.current = onAddEdge
    onDeleteEdgeRef.current = onDeleteEdge
    onSwapRef.current = onSwap
    onNodeToTracklistRef.current = onNodeToTracklist
    onAddSiblingRef.current = onAddSibling
    selectedNodeIdsRef.current = selectedNodeIds
  })

  // Stable wrapper callbacks — identity never changes, body reads via ref.
  const stableOnAddNode = useCallback(
    (trackId: number, parentNodeId?: string, level?: number) =>
      onAddNodeRef.current(trackId, parentNodeId, level),
    [],
  )
  const stableOnNodeToTracklist = useCallback(
    (nodeId: string) => onNodeToTracklistRef.current(nodeId),
    [],
  )
  const stableOnDeleteEdge = useCallback(
    (id: number) => onDeleteEdgeRef.current(id),
    [],
  )

  const [pan, setPan] = useState({ x: 20, y: 20 })
  const [zoom, setZoom] = useState(readStoredZoom)
  const draggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const pendingDragRef = useRef<{
    sourceNodeId: string
    sourceLevel: number
    sourceCX: number
    sourceCY: number
    startClientX: number
    startClientY: number
  } | null>(null)
  const DRAG_THRESHOLD = 5

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom((prev) => {
        const next = Math.max(0.2, Math.min(3, prev + delta))
        try {
          localStorage.setItem(ZOOM_STORAGE_KEY, String(next))
        } catch {
          /* storage unavailable */
        }
        return next
      })
    } else {
      const dy = e.deltaMode === 0 ? e.deltaY : e.deltaY * 14
      setPan((prev) => ({ ...prev, y: prev.y - dy }))
    }
  }, [])

  // Map a client (screen) coordinate to the SVG user-space, accounting for the
  // CSS pan/zoom transform on the <svg>. Returns null if the SVG is unavailable.
  const toSvgPoint = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current
      if (!svg) {
        return null
      }
      const pt = svg.createSVGPoint()
      pt.x = clientX
      pt.y = clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) {
        return null
      }
      const p = pt.matrixTransform(ctm.inverse())
      return { x: p.x, y: p.y }
    },
    [],
  )

  const handleBgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (connectDragRef.current) {
        return
      }
      pendingDragRef.current = null
      const onBackground =
        e.target === svgRef.current || (e.target as Element).tagName === 'svg'
      if (!onBackground) {
        return
      }
      // Shift+drag on the background draws a marquee to multi-select nodes;
      // a plain drag pans the canvas.
      if (e.shiftKey) {
        const origin = toSvgPoint(e.clientX, e.clientY)
        if (origin) {
          marqueeOriginRef.current = origin
          marqueeMovedRef.current = false
          setMarquee({ x0: origin.x, y0: origin.y, x1: origin.x, y1: origin.y })
          return
        }
      }
      draggingRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
    },
    [toSvgPoint],
  )

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const cd = connectDragRef.current
    if (pendingDragRef.current && !cd) {
      const pd = pendingDragRef.current
      const dx = e.clientX - pd.startClientX
      const dy = e.clientY - pd.startClientY
      if (Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD) {
        setConnectDrag({
          sourceNodeId: pd.sourceNodeId,
          sourceLevel: pd.sourceLevel,
          sourceCX: pd.sourceCX,
          sourceCY: pd.sourceCY,
          cursorX: pd.sourceCX,
          cursorY: pd.sourceCY,
        })
        pendingDragRef.current = null
      }
      return
    }
    if (cd) {
      const svg = svgRef.current
      if (!svg) {
        return
      }
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) {
        return
      }
      const svgPt = pt.matrixTransform(ctm.inverse())
      setConnectDrag((prev) =>
        prev ? { ...prev, cursorX: svgPt.x, cursorY: svgPt.y } : prev,
      )
      return
    }
    if (!draggingRef.current) {
      return
    }
    const dx = e.clientX - lastMouseRef.current.x
    const dy = e.clientY - lastMouseRef.current.y
    lastMouseRef.current = { x: e.clientX, y: e.clientY }
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const o = marqueeOriginRef.current
      if (o) {
        const p = toSvgPoint(e.clientX, e.clientY)
        if (p) {
          marqueeEndRef.current = p
          if (Math.abs(p.x - o.x) + Math.abs(p.y - o.y) >= DRAG_THRESHOLD) {
            marqueeMovedRef.current = true
          }
          setMarquee({ x0: o.x, y0: o.y, x1: p.x, y1: p.y })
        }
        return
      }
      handleCanvasMouseMove(e)
    },
    [toSvgPoint, handleCanvasMouseMove],
  )

  const handleMouseUp = useCallback(() => {
    const origin = marqueeOriginRef.current
    if (origin) {
      const end = marqueeEndRef.current ?? origin
      marqueeOriginRef.current = null
      marqueeEndRef.current = null
      setMarquee(null)
      if (marqueeMovedRef.current) {
        // Select every node whose box intersects the marquee rect.
        const minX = Math.min(origin.x, end.x)
        const maxX = Math.max(origin.x, end.x)
        const minY = Math.min(origin.y, end.y)
        const maxY = Math.max(origin.y, end.y)
        const hits = new Set<string>()
        for (const ln of allFlatRef.current) {
          if (
            ln.x <= maxX &&
            ln.x + NODE_W >= minX &&
            ln.y <= maxY &&
            ln.y + NODE_H >= minY
          ) {
            hits.add(ln.node.node_id)
          }
        }
        setSelectedNodeIds(hits)
        setSelectedEdgeId(null)
        suppressSvgClickRef.current = true
      }
      return
    }
    draggingRef.current = false
    pendingDragRef.current = null
    if (connectDragRef.current) {
      setConnectDrag(null)
    }
  }, [])

  const { allFlat, totalWidth, totalHeight, columnIndices, byLevelMap } =
    useMemo(() => {
      const byLevel = new Map<number, LayoutNode[]>()
      for (const n of nodes) {
        const lv = n.level
        const layoutNode = { node: n, x: 0, y: 0, children: [] }
        const levelNodes = byLevel.get(lv)
        if (levelNodes === undefined) {
          byLevel.set(lv, [layoutNode])
        } else {
          levelNodes.push(layoutNode)
        }
      }
      const colIndices = new Map<string, number>()
      let maxLv = 0
      let maxColIndex = 0
      for (const [lv, lvNodes] of byLevel) {
        if (lv > maxLv) {
          maxLv = lv
        }
        lvNodes.sort((a, b) => a.node.col_index - b.node.col_index)
        for (let i = 0; i < lvNodes.length; i++) {
          const col = lvNodes[i].node.col_index
          if (col > maxColIndex) {
            maxColIndex = col
          }
          colIndices.set(lvNodes[i].node.node_id, col)
          lvNodes[i].x =
            Math.min(col, MAX_COLS - 1) * SLOT_W + (SLOT_W - NODE_W) / 2
          lvNodes[i].y = TOP_PAD + lv * (NODE_H + V_GAP)
        }
      }
      const flat: LayoutNode[] = []
      for (const ns of byLevel.values()) {
        flat.push(...ns)
      }
      const usedCols = byLevel.size > 0 ? maxColIndex + 1 : 1
      return {
        allFlat: flat,
        totalWidth: Math.max(usedCols, MAX_COLS) * SLOT_W,
        totalHeight: TOP_PAD + (maxLv + 2) * (NODE_H + V_GAP) + 40,
        columnIndices: colIndices,
        byLevelMap: byLevel,
      }
    }, [nodes])

  useEffect(() => {
    byLevelMapRef.current = byLevelMap
  }, [byLevelMap])

  useEffect(() => {
    allFlatRef.current = allFlat
  }, [allFlat])

  const levelEntries = useMemo(() => {
    const entries: { level: number; nodesAtLevel: LayoutNode[] }[] = []
    const maxLevel = byLevelMap.size > 0 ? Math.max(...byLevelMap.keys()) : -1
    for (let lv = 0; lv <= maxLevel + 1; lv++) {
      entries.push({ level: lv, nodesAtLevel: byLevelMap.get(lv) ?? [] })
    }
    return entries
  }, [byLevelMap])

  const svgW = Math.max(totalWidth, 600)
  const svgH = Math.max(totalHeight, 400)

  // Stable primitive that changes only when edges are actually added or removed.
  // Using this instead of the `edges` array as a dependency prevents the scoring
  // effect from re-firing on every parent render (new array reference ≠ new content).
  const edgePairKey = useMemo(
    () =>
      edges
        .map((e) => `${e.parent_node_id}-${e.child_node_id}`)
        .sort()
        .join(','),
    [edges],
  )

  // Fetch edge compatibility scores for newly-added edges (cached ones are
  // merged in synchronously). This is a data-fetch effect: the synchronous
  // setState calls mark loading state / merge cached scores before the async
  // fetch resolves. react-hooks/set-state-in-effect is a false positive for
  // fetch effects, so it is scoped-and-documented rather than refactored.
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

    // Additive-only update: do not rebuild the whole map.
    // Deleted edges leave stale entries in the map but they are never rendered
    // because the edge is gone from the JSX loop. This avoids spurious state
    // updates (and re-renders) on every edge deletion.
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

  useEffect(() => {
    if (selectedEdgeId === null) {
      return
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDeleteEdge(selectedEdgeId)
        setSelectedEdgeId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedEdgeId, onDeleteEdge])

  // Delete selected node(s) on Backspace/Delete. A single selection opens the
  // per-node delete modal (which handles child rewiring); multiple selected
  // nodes open a bulk-confirm modal.
  useEffect(() => {
    if (selectedNodeIds.size === 0) {
      return
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const ids = Array.from(selectedNodeIds)
        if (ids.length === 1) {
          const node = nodesRef.current.find((n) => n.node_id === ids[0])
          if (node) {
            setDeleteTarget(node)
          }
        } else {
          setBulkDeleteIds(ids)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeIds])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSwapSource(null)
        setSelectedEdgeId(null)
        setSelectedNodeIds(new Set())
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  const handleSearchAdd = useCallback(
    (q: string) => {
      setSearchQuery(q)
      rootSearch(q)
    },
    [rootSearch],
  )

  const handleSearchSelect = useCallback(
    (s: SearchSuggestion) => {
      stableOnAddNode(s.id)
      setSearchQuery('')
      rootClear()
    },
    [stableOnAddNode, rootClear],
  )

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    // Ignore the click synthesized at the end of a marquee drag so it does not
    // wipe the just-made selection.
    if (suppressSvgClickRef.current) {
      suppressSvgClickRef.current = false
      return
    }
    if (
      e.target === svgRef.current ||
      (e.target as Element).classList.contains('set-explorer-svg')
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
      // Plain click: toggle a sole selection off, otherwise select just this one.
      if (prev.size === 1 && prev.has(nodeId)) {
        return new Set()
      }
      return new Set([nodeId])
    })
    setSelectedEdgeId(null)
  }, [])

  const handleNodeMouseDown = useCallback(
    (
      e: React.MouseEvent,
      nodeId: string,
      level: number,
      x: number,
      y: number,
    ) => {
      if (e.button !== 0) {
        return
      }
      if (swapSourceRef.current) {
        return
      }
      const target = e.target as Element
      if (
        target.closest('.explorer-action-row') ||
        target.closest('.explorer-edge-delete')
      ) {
        return
      }
      e.stopPropagation()
      const cx = x + NODE_W / 2
      const cy = y + NODE_H / 2
      pendingDragRef.current = {
        sourceNodeId: nodeId,
        sourceLevel: level,
        sourceCX: cx,
        sourceCY: cy,
        startClientX: e.clientX,
        startClientY: e.clientY,
      }
    },
    [],
  )

  const handleNodeMouseUp = useCallback((nodeId: string, level: number) => {
    const cd = connectDragRef.current
    if (!cd) {
      return
    }
    if (cd.sourceNodeId === nodeId) {
      setConnectDrag(null)
      return
    }
    const srcLevel = cd.sourceLevel
    const tgtLevel = level
    if (Math.abs(srcLevel - tgtLevel) === 1) {
      const parentId = srcLevel < tgtLevel ? cd.sourceNodeId : nodeId
      const childId = srcLevel < tgtLevel ? nodeId : cd.sourceNodeId
      const alreadyConnected = edgesRef.current.some(
        (e) => e.parent_node_id === parentId && e.child_node_id === childId,
      )
      if (!alreadyConnected) {
        onAddEdgeRef.current(parentId, childId)
      }
    }
    setConnectDrag(null)
  }, [])

  const openLevelAdd = useCallback(
    (level: number, nodesAtLevel: LayoutNode[]) => {
      // Every node at the parent level is a candidate connection, not just
      // the ones already wired to the rightmost sibling — otherwise parents
      // added after the rightmost sibling never appear as options.
      const parentLevelNodes = byLevelMapRef.current.get(level - 1) ?? []
      const parentIds = parentLevelNodes.map((n) => n.node.node_id)
      const rightmost =
        nodesAtLevel.length > 0
          ? nodesAtLevel.reduce((a, b) =>
              a.node.col_index >= b.node.col_index ? a : b,
            )
          : null
      const inheritedParentIds = rightmost
        ? edgesRef.current
            .filter((e) => e.child_node_id === rightmost.node.node_id)
            .map((e) => e.parent_node_id)
        : []
      setSwapSource(null)
      setSelectedEdgeId(null)
      siblingClear()
      setSiblingAdd({
        targetLevel: level,
        parentIds,
        selectedParents: new Set(inheritedParentIds),
        searchQuery: '',
      })
    },
    [siblingClear],
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
      stableOnAddNode(
        m.candidate_id,
        childAdd.parentNode.node_id,
        childAdd.parentNode.level + 1,
      )
      setChildAdd(null)
    },
    [childAdd, stableOnAddNode],
  )

  const handleSiblingSearch = useCallback(
    (q: string) => {
      setSiblingAdd((prev) => (prev ? { ...prev, searchQuery: q } : prev))
      siblingSearch(q)
    },
    [siblingSearch],
  )

  const toggleSiblingParent = useCallback((parentId: string) => {
    setSiblingAdd((prev) => {
      if (!prev) {
        return prev
      }
      const next = new Set(prev.selectedParents)
      if (next.has(parentId)) {
        next.delete(parentId)
      } else {
        next.add(parentId)
      }
      return { ...prev, selectedParents: next }
    })
  }, [])

  const handleSiblingSelect = useCallback(
    async (s: SearchSuggestion) => {
      if (!siblingAdd) {
        return
      }
      const parentIds = Array.from(siblingAdd.selectedParents)
      if (parentIds.length > 0) {
        await onAddSiblingRef.current(s.id, parentIds, siblingAdd.targetLevel)
      } else {
        await stableOnAddNode(s.id, undefined, siblingAdd.targetLevel)
      }
      siblingClear()
      setSiblingAdd(null)
    },
    [siblingAdd, stableOnAddNode, siblingClear],
  )

  const handleEdgeClick = useCallback((e: React.MouseEvent, edgeId: number) => {
    e.stopPropagation()
    setSelectedEdgeId((prev) => (prev === edgeId ? null : edgeId))
    setSelectedNodeIds(new Set())
    setSwapSource(null)
  }, [])

  const handleDeleteEdge = useCallback(
    (edgeId: number) => {
      stableOnDeleteEdge(edgeId)
      setSelectedEdgeId(null)
    },
    [stableOnDeleteEdge],
  )

  const onSetSwapSource = useCallback((nodeId: string) => {
    setSwapSource(nodeId)
    setSelectedEdgeId(null)
  }, [])

  const handleSetDeleteTarget = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((n) => n.node_id === nodeId)
    if (node) {
      setDeleteTarget(node)
    }
  }, [])

  const handleBulkDelete = useCallback(async () => {
    const ids = bulkDeleteIds
    if (!ids) {
      return
    }
    setBulkDeleteIds(null)
    setSelectedNodeIds(new Set())
    // Delete sequentially so each set-refresh settles before the next removal.
    for (const id of ids) {
      await onDeleteNodeRef.current(id)
    }
  }, [bulkDeleteIds])

  // Drop a track from a top quadrant onto empty canvas to seed a root node.
  // Drops that land on a node's lower edge are handled there (child add) and
  // stop propagation, so they never reach here.
  const handleViewportDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes(TRACK_DRAG_MIME) ||
      e.dataTransfer.types.includes('text/plain')
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
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
      if (Number.isInteger(trackId)) {
        stableOnAddNode(trackId)
      }
    },
    [stableOnAddNode],
  )

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>()
    for (const n of allFlat) {
      map.set(n.node.node_id, n)
    }
    return map
  }, [allFlat])

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
        <div className="set-explorer-search-wrapper">
          <input
            className="set-explorer-search"
            placeholder="Search to add root node…"
            value={searchQuery}
            onChange={(e) => handleSearchAdd(e.target.value)}
          />
          {searchQuery.trim() !== '' && rootSuggestions.length > 0 && (
            <ul className="set-explorer-search-dropdown">
              {rootSuggestions.map((s) => (
                <li
                  key={s.id}
                  className="set-explorer-search-item"
                  onMouseDown={() => handleSearchSelect(s)}
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
        {swapSource && (
          <span className="set-explorer-swap-hint">
            Click another node to swap
          </span>
        )}
      </div>

      <div
        ref={viewportRef}
        className="set-explorer-viewport"
        onWheel={handleWheel}
        onMouseDown={handleBgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragOver={handleViewportDragOver}
        onDrop={handleViewportDrop}
      >
        {nodes.length === 0 ? (
          <div>
            <p className="set-empty-tracks">
              Explorer is empty. Search above, or drag a track here, to add a
              root node.
            </p>
            <svg
              className="set-explorer-svg"
              width={200}
              height={80}
              viewBox="0 0 200 80"
            >
              <g
                transform={`translate(${(200 - LEVEL_ADD_W) / 2}, ${(80 - LEVEL_ADD_H) / 2})`}
                className="explorer-level-add-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  openLevelAdd(0, [])
                }}
                role="button"
                tabIndex={0}
                aria-label="Add track to level 0"
                data-testid="level-add-btn"
                data-level="0"
                style={{ cursor: 'pointer' }}
              >
                <rect
                  width={LEVEL_ADD_W}
                  height={LEVEL_ADD_H}
                  rx={4}
                  fill="var(--surface)"
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                />
                <text
                  x={LEVEL_ADD_W / 2}
                  y={LEVEL_ADD_H / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--success)"
                  fontSize={10}
                  fontWeight="600"
                >
                  + Add Track
                </text>
              </g>
            </svg>
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="set-explorer-svg"
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
            onClick={handleSvgClick}
          >
            {/* Edges */}
            {edges.map((edge) => {
              const parent = nodeMap.get(edge.parent_node_id)
              const child = nodeMap.get(edge.child_node_id)
              if (!parent || !child) {
                return null
              }
              const parentColIdx =
                (columnIndices.get(edge.parent_node_id) ?? 0) % EDGE_SLOTS
              const childColIdx =
                (columnIndices.get(edge.child_node_id) ?? 0) % EDGE_SLOTS
              const nodeKey = `${edge.parent_node_id}-${edge.child_node_id}`
              const score = edgeScores.get(nodeKey)
              return (
                <ExplorerEdgeItem
                  key={`edge-${edge.id}`}
                  edgeId={edge.id}
                  parentX={parent.x}
                  parentY={parent.y}
                  childX={child.x}
                  childY={child.y}
                  parentColIdx={parentColIdx}
                  childColIdx={childColIdx}
                  isSelected={selectedEdgeId === edge.id}
                  score={score}
                  isLoading={loadingEdgeKeys.has(nodeKey)}
                  onEdgeClick={handleEdgeClick}
                  onDeleteEdge={handleDeleteEdge}
                />
              )
            })}

            {/* Connect-drag preview line */}
            {connectDrag && (
              <line
                x1={connectDrag.sourceCX}
                y1={connectDrag.sourceCY}
                x2={connectDrag.cursorX}
                y2={connectDrag.cursorY}
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="6 4"
                pointerEvents="none"
                data-testid="connect-drag-line"
              />
            )}

            {/* Marquee (drag-select) rectangle */}
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
            {allFlat.map((ln) => (
              <ExplorerNodeItem
                key={ln.node.node_id}
                nodeId={ln.node.node_id}
                trackId={ln.node.track_id}
                level={ln.node.level}
                colIndex={ln.node.col_index}
                trackTitle={ln.node.track?.title}
                x={ln.x}
                y={ln.y}
                isSelected={selectedNodeIds.has(ln.node.node_id)}
                showActions={
                  selectedNodeIds.size === 1 &&
                  selectedNodeIds.has(ln.node.node_id)
                }
                isSwapSource={swapSource === ln.node.node_id}
                inTracklist={tracklistTrackIds.has(ln.node.track_id)}
                onNodeClick={handleNodeClick}
                onNodeMouseDown={handleNodeMouseDown}
                onNodeMouseUp={handleNodeMouseUp}
                onSetDeleteTarget={handleSetDeleteTarget}
                onSetSwapSource={onSetSwapSource}
                openChildAdd={openChildAdd}
                onNodeToTracklist={stableOnNodeToTracklist}
                onAddNode={stableOnAddNode}
              />
            ))}

            {/* Per-level +Add Track controls */}
            {levelEntries.map(({ level, nodesAtLevel }) => {
              const lastNode =
                nodesAtLevel.length > 0
                  ? nodesAtLevel.reduce((a, b) =>
                      a.node.col_index >= b.node.col_index ? a : b,
                    )
                  : null
              const addX = lastNode
                ? lastNode.x + NODE_W + LEVEL_ADD_GAP
                : (SLOT_W - NODE_W) / 2
              const addY =
                TOP_PAD + level * (NODE_H + V_GAP) + (NODE_H - LEVEL_ADD_H) / 2
              return (
                <g
                  key={`level-add-${level}`}
                  transform={`translate(${addX}, ${addY})`}
                  className="explorer-level-add-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    openLevelAdd(level, nodesAtLevel)
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Add track to level ${level}`}
                  data-testid="level-add-btn"
                  data-level={level}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    width={LEVEL_ADD_W}
                    height={LEVEL_ADD_H}
                    rx={4}
                    fill="var(--surface)"
                    stroke="var(--border)"
                    strokeWidth={1}
                    strokeDasharray="4 2"
                  />
                  <text
                    x={LEVEL_ADD_W / 2}
                    y={LEVEL_ADD_H / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--success)"
                    fontSize={10}
                    fontWeight="600"
                  >
                    + Add Track
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>

      {deleteTarget && (
        <SetExplorerDeleteModal
          node={deleteTarget}
          edges={edges}
          nodes={nodes}
          onConfirm={(rewireEdges) => {
            onDeleteNodeRef.current(deleteTarget.node_id, rewireEdges)
            setDeleteTarget(null)
            setSelectedNodeIds(new Set())
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {bulkDeleteIds && (
        <div
          className="explorer-delete-overlay"
          onClick={() => setBulkDeleteIds(null)}
        >
          <div
            className="explorer-delete-modal"
            onClick={(e) => e.stopPropagation()}
            data-testid="bulk-delete-modal"
          >
            <h3>Delete {bulkDeleteIds.length} nodes</h3>
            <p className="text-muted">
              This removes the selected nodes and all of their connections. This
              cannot be undone.
            </p>
            <div className="explorer-delete-buttons" style={{ marginTop: 12 }}>
              <button
                className="set-action-btn"
                onClick={() => setBulkDeleteIds(null)}
              >
                Cancel
              </button>
              <button
                className="set-action-btn set-action-btn--danger"
                onClick={handleBulkDelete}
              >
                Delete all
              </button>
            </div>
          </div>
        </div>
      )}

      {siblingAdd && (
        <div
          className="explorer-delete-overlay"
          onClick={() => setSiblingAdd(null)}
        >
          <div
            className="explorer-delete-modal"
            onClick={(e) => e.stopPropagation()}
            data-testid="sibling-add-modal"
          >
            <h3>Add Track to Level {siblingAdd.targetLevel}</h3>
            <p className="text-muted">
              Add a track at level {siblingAdd.targetLevel}
            </p>

            {siblingAdd.parentIds.length > 0 && (
              <div className="explorer-delete-section">
                <p className="text-muted" style={{ marginBottom: 4 }}>
                  Inherit parent connections:
                </p>
                {siblingAdd.parentIds.map((pid) => {
                  const pNode = nodes.find((n) => n.node_id === pid)
                  return (
                    <label key={pid} style={{ display: 'block' }}>
                      <input
                        type="checkbox"
                        checked={siblingAdd.selectedParents.has(pid)}
                        onChange={() => toggleSiblingParent(pid)}
                      />{' '}
                      {pNode?.track?.title ?? pid}
                    </label>
                  )
                })}
              </div>
            )}

            <div
              className="set-explorer-search-wrapper"
              style={{ marginTop: 8 }}
            >
              <input
                className="set-explorer-search"
                placeholder="Search for track…"
                value={siblingAdd.searchQuery}
                onChange={(e) => handleSiblingSearch(e.target.value)}
                autoFocus
                data-testid="sibling-search-input"
              />
              {siblingAdd.searchQuery.trim() !== '' &&
                siblingSuggestions.length > 0 && (
                  <ul className="set-explorer-search-dropdown">
                    {siblingSuggestions.map((s) => (
                      <li
                        key={s.id}
                        className="set-explorer-search-item"
                        onMouseDown={() => handleSiblingSelect(s)}
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

            <div className="explorer-delete-buttons" style={{ marginTop: 12 }}>
              <button
                className="set-action-btn"
                onClick={() => setSiblingAdd(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
