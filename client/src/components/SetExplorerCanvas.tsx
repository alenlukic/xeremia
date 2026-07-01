import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import type { ExplorerNode, ExplorerEdge, SearchSuggestion, TransitionMatch } from '../types';
import { nodeColorForLevel, edgeColorForColumn, ACTION_FILL } from '../utils/explorer';
import { searchTracks, fetchMatches } from '../api/http';
import { SetExplorerDeleteModal } from './SetExplorerDeleteModal';
import { formatOverallScore } from '../utils';

interface Props {
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
  onAddNode: (trackId: number, parentNodeId?: string, level?: number) => void;
  onDeleteNode: (nodeId: string, rewireEdges?: { parent_node_id: string; child_node_id: string }[]) => void;
  onAddEdge: (parentNodeId: string, childNodeId: string) => Promise<void>;
  onDeleteEdge: (edgeId: number) => Promise<void>;
  onSwap: (nodeAId: string, nodeBId: string) => void;
  onNodeToTracklist: (nodeId: string) => void;
  onAddSibling: (trackId: number, inheritParentIds: string[], level: number) => Promise<unknown>;
  tracklistTrackIds: Set<number>;
  fetchEdgeScores: (pairs: [number, number][]) => Promise<{ scores: (number | null)[] }>;
}

interface SiblingAddState {
  targetLevel: number;
  parentIds: string[];
  selectedParents: Set<string>;
  searchQuery: string;
  searchResults: SearchSuggestion[];
  showResults: boolean;
}

interface ChildAddState {
  parentNode: ExplorerNode;
  matches: TransitionMatch[];
  loading: boolean;
}

interface ConnectDragState {
  sourceNodeId: string;
  sourceLevel: number;
  sourceCX: number;
  sourceCY: number;
  cursorX: number;
  cursorY: number;
}

interface LayoutNode {
  node: ExplorerNode;
  x: number;
  y: number;
  children: LayoutNode[];
}

const NODE_W = 360;
const NODE_H = 48;
const V_GAP = 176;
const MAX_COLS = 5;
const SLOT_W = 390;
const ACTION_H = 24;
const ACTION_LABEL_SIZE = 10;
const ACTION_GAP = 4;
const TOP_PAD = ACTION_H + 8;
const LEVEL_ADD_W = 70;
const LEVEL_ADD_H = 28;
const LEVEL_ADD_GAP = 16;
const EDGE_SLOTS = 5;
const EDGE_PAD = 40;
const SLOT_STEP = 10;   // px between adjacent slots within a bucket
const BUCKET_GAP = 8;   // extra px between bucket groups (visually separates parent clusters)
const LANE_STUB = 10;
const LANE_S = 6;
const ZOOM_STORAGE_KEY = 'explorer-zoom';

function readStoredZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw === null) return 1;
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0.2 || val > 3) return 1;
    return val;
  } catch {
    return 1;
  }
}

// 25 node slots: 5 parent-column buckets × 5 child-column sub-slots each.
// laneIndex = parentColIdx * EDGE_SLOTS + childColIdx → unique departure and arrival per edge.
function nodeSlotX(nodeX: number, laneIndex: number): number {
  const bucket = Math.floor(laneIndex / EDGE_SLOTS);
  const slot = laneIndex % EDGE_SLOTS;
  return nodeX + EDGE_PAD + bucket * (EDGE_SLOTS * SLOT_STEP + BUCKET_GAP) + slot * SLOT_STEP;
}

function truncateForSvg(text: string, max = 56): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

// ---------------------------------------------------------------------------
// Memoized sub-components
// Props use primitives (number, boolean, string) and stable object references
// from the parent's props — never freshly-created objects derived inside render.
// React.memo compares primitives by value, so layout recomputation that produces
// the same numbers does not cause re-renders of unaffected items.
// ---------------------------------------------------------------------------

interface ExplorerNodeItemProps {
  x: number;
  y: number;
  nodeId: string;
  trackId: number;
  level: number;
  colIndex: number;
  trackTitle: string | undefined;
  isSelected: boolean;
  isSwapSource: boolean;
  inTracklist: boolean;
  onNodeClick: (nodeId: string) => void;
  onNodeMouseDown: (e: React.MouseEvent, nodeId: string, level: number, x: number, y: number) => void;
  onNodeMouseUp: (nodeId: string, level: number) => void;
  onSetDeleteTarget: (nodeId: string) => void;
  onSetSwapSource: (nodeId: string) => void;
  openChildAdd: (nodeId: string) => void;
  onNodeToTracklist: (nodeId: string) => void;
  onAddNode: (trackId: number, parentNodeId: string, level: number) => void;
}

const ExplorerNodeItem = memo(function ExplorerNodeItem({
  x, y, nodeId, trackId, level, colIndex, trackTitle, isSelected, isSwapSource, inTracklist,
  onNodeClick, onNodeMouseDown, onNodeMouseUp,
  onSetDeleteTarget, onSetSwapSource, openChildAdd, onNodeToTracklist, onAddNode,
}: ExplorerNodeItemProps) {
  const color = nodeColorForLevel(level);
  const fullTitle = trackTitle ?? String(trackId);
  const title = truncateForSvg(fullTitle);

  const actions: { key: string; label: string; ariaLabel: string; fill: string; w: number; testId?: string; action: () => void }[] = [
    { key: 'del', label: '×', ariaLabel: 'Delete node', fill: ACTION_FILL.danger, w: 22, action: () => onSetDeleteTarget(nodeId) },
    { key: 'swap', label: '↕', ariaLabel: 'Swap track IDs', fill: ACTION_FILL.accent, w: 22, action: () => onSetSwapSource(nodeId) },
    { key: 'child', label: '+Child', ariaLabel: 'Add child node', fill: ACTION_FILL.accent, w: 38, testId: 'child-add-btn', action: () => openChildAdd(nodeId) },
  ];
  if (!inTracklist) {
    actions.push({ key: 'tl', label: '→TL', ariaLabel: 'Add to Tracklist', fill: ACTION_FILL.success, w: 26, action: () => onNodeToTracklist(nodeId) });
  }

  const totalActionsW = actions.reduce((s, a) => s + a.w, 0) + (actions.length - 1) * ACTION_GAP;
  const actionsStartX = (NODE_W - totalActionsW) / 2;
  const actionXs: number[] = [];
  let runX = 0;
  for (const a of actions) { actionXs.push(runX); runX += a.w + ACTION_GAP; }

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className="explorer-node-group"
      onClick={e => { e.stopPropagation(); onNodeClick(nodeId); }}
      onMouseDown={e => onNodeMouseDown(e, nodeId, level, x, y)}
      onMouseUp={() => onNodeMouseUp(nodeId, level)}
      data-testid="explorer-node"
      data-level={level}
      data-col-index={colIndex}
    >
      <g transform={`translate(${actionsStartX}, ${-(ACTION_H + 4)})`}>
        <g
          className={`explorer-action-row ${isSelected ? 'explorer-action-row--visible' : ''}`}
          data-testid="explorer-action-row"
        >
          {actions.map((a, i) => (
            <g
              key={a.key}
              ref={(el) => { if (el) el.setAttribute('title', a.ariaLabel); }}
              transform={`translate(${actionXs[i]}, 0)`}
              className="explorer-action-btn"
              onClick={e => { e.stopPropagation(); a.action(); }}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); a.action(); } }}
              cursor="pointer"
              role="button"
              tabIndex={0}
              aria-label={a.ariaLabel}
              data-testid={a.testId}
            >
              <title>{a.ariaLabel}</title>
              <rect width={a.w} height={ACTION_H} rx={4} fill="var(--surface)" stroke="var(--border)" strokeWidth={0.5}>
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
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={e => {
          e.preventDefault();
          const trackId = parseInt(e.dataTransfer.getData('text/plain'), 10);
          if (!isNaN(trackId)) onAddNode(trackId, nodeId, level + 1);
        }}
      />
    </g>
  );
});

interface ExplorerEdgeItemProps {
  edgeId: number;
  parentX: number;
  parentY: number;
  childX: number;
  childY: number;
  parentColIdx: number;
  childColIdx: number;
  isSelected: boolean;
  score: number | null | undefined;
  isLoading: boolean;
  onEdgeClick: (e: React.MouseEvent, id: number) => void;
  onDeleteEdge: (id: number) => void;
}

const ExplorerEdgeItem = memo(function ExplorerEdgeItem({
  edgeId, parentX, parentY, childX, childY, parentColIdx, childColIdx,
  isSelected, score, isLoading, onEdgeClick, onDeleteEdge,
}: ExplorerEdgeItemProps) {
  const parentBottom = parentY + NODE_H;
  const childTop = childY;
  const strokeColor = edgeColorForColumn(childColIdx);
  const laneIndex = parentColIdx * EDGE_SLOTS + childColIdx;
  const startX = nodeSlotX(parentX, laneIndex);
  const endX = nodeSlotX(childX, laneIndex);
  const laneY = parentBottom + LANE_STUB + laneIndex * LANE_S;
  const pathD = `M ${startX} ${parentBottom} L ${startX} ${laneY} L ${endX} ${laneY} L ${endX} ${childTop}`;
  const labelX = endX - 10;
  const labelY = childTop - 8;
  const edgeMidX = (startX + endX) / 2;

  return (
    <g key={`edge-${edgeId}`}>
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
        onClick={e => onEdgeClick(e, edgeId)}
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
          onClick={e => { e.stopPropagation(); onDeleteEdge(edgeId); }}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          aria-label="Delete edge"
          data-testid="explorer-edge-delete-btn"
        >
          <circle r={10} fill="var(--surface)" stroke="var(--danger)" strokeWidth={1.5} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--danger)"
            fontSize={14}
            fontWeight="700"
          >×</text>
        </g>
      )}
    </g>
  );
});

export function SetExplorerCanvas({
  nodes, edges, onAddNode, onDeleteNode, onAddEdge, onDeleteEdge, onSwap,
  onNodeToTracklist, onAddSibling, tracklistTrackIds, fetchEdgeScores,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerNode | null>(null);
  const [edgeScores, setEdgeScores] = useState<Map<string, number | null>>(new Map());
  const [loadingEdgeKeys, setLoadingEdgeKeys] = useState<Set<string>>(new Set());
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [siblingAdd, setSiblingAdd] = useState<SiblingAddState | null>(null);
  const [childAdd, setChildAdd] = useState<ChildAddState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [connectDrag, setConnectDrag] = useState<ConnectDragState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scoreCacheRef = useRef(new Map<string, number | null>());
  // Always-current refs so scoring effect can read latest nodes/edges without
  // taking array references as dependencies (array identity changes every render).
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  // Refs for volatile UI state consumed by stable callbacks — prevents callbacks
  // from changing identity on every render, which would defeat React.memo on sub-components.
  const connectDragRef = useRef<ConnectDragState | null>(null);
  connectDragRef.current = connectDrag;
  const swapSourceRef = useRef<string | null>(null);
  swapSourceRef.current = swapSource;
  const fetchEdgeScoresRef = useRef(fetchEdgeScores);
  fetchEdgeScoresRef.current = fetchEdgeScores;

  // Stable refs for ALL external callbacks from the parent.
  // Many of these (onAddNode, onSwap, onAddEdge, etc.) come from useSetBuilder
  // hooks where `activeSet` is a dep — so they get new references on every data
  // refresh. Without refs, every ExplorerNodeItem/ExplorerEdgeItem would see a
  // new callback prop and re-render, defeating React.memo entirely.
  const onAddNodeRef = useRef(onAddNode);
  onAddNodeRef.current = onAddNode;
  const onDeleteNodeRef = useRef(onDeleteNode);
  onDeleteNodeRef.current = onDeleteNode;
  const onAddEdgeRef = useRef(onAddEdge);
  onAddEdgeRef.current = onAddEdge;
  const onDeleteEdgeRef = useRef(onDeleteEdge);
  onDeleteEdgeRef.current = onDeleteEdge;
  const onSwapRef = useRef(onSwap);
  onSwapRef.current = onSwap;
  const onNodeToTracklistRef = useRef(onNodeToTracklist);
  onNodeToTracklistRef.current = onNodeToTracklist;
  const onAddSiblingRef = useRef(onAddSibling);
  onAddSiblingRef.current = onAddSibling;

  // Stable wrapper callbacks — identity never changes, body reads via ref.
  const stableOnAddNode = useCallback(
    (trackId: number, parentNodeId?: string, level?: number) => onAddNodeRef.current(trackId, parentNodeId, level),
    [],
  );
  const stableOnNodeToTracklist = useCallback(
    (nodeId: string) => onNodeToTracklistRef.current(nodeId),
    [],
  );
  const stableOnDeleteEdge = useCallback(
    (id: number) => onDeleteEdgeRef.current(id),
    [],
  );

  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(readStoredZoom);
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const pendingDragRef = useRef<{ sourceNodeId: string; sourceLevel: number; sourceCX: number; sourceCY: number; startClientX: number; startClientY: number } | null>(null);
  const DRAG_THRESHOLD = 5;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => {
        const next = Math.max(0.2, Math.min(3, prev + delta));
        try { localStorage.setItem(ZOOM_STORAGE_KEY, String(next)); } catch { /* storage unavailable */ }
        return next;
      });
    } else {
      const dy = e.deltaMode === 0 ? e.deltaY : e.deltaY * 14;
      setPan(prev => ({ ...prev, y: prev.y - dy }));
    }
  }, []);

  const handleBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (connectDragRef.current) return;
    pendingDragRef.current = null;
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      draggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const cd = connectDragRef.current;
    if (pendingDragRef.current && !cd) {
      const pd = pendingDragRef.current;
      const dx = e.clientX - pd.startClientX;
      const dy = e.clientY - pd.startClientY;
      if (Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD) {
        setConnectDrag({
          sourceNodeId: pd.sourceNodeId,
          sourceLevel: pd.sourceLevel,
          sourceCX: pd.sourceCX,
          sourceCY: pd.sourceCY,
          cursorX: pd.sourceCX,
          cursorY: pd.sourceCY,
        });
        pendingDragRef.current = null;
      }
      return;
    }
    if (cd) {
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm.inverse());
      setConnectDrag(prev => prev ? { ...prev, cursorX: svgPt.x, cursorY: svgPt.y } : prev);
      return;
    }
    if (!draggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
    pendingDragRef.current = null;
    if (connectDragRef.current) setConnectDrag(null);
  }, []);

  const { allFlat, totalWidth, totalHeight, columnIndices, byLevelMap } = useMemo(() => {
    const byLevel = new Map<number, LayoutNode[]>();
    for (const n of nodes) {
      const lv = n.level;
      if (!byLevel.has(lv)) byLevel.set(lv, []);
      byLevel.get(lv)!.push({ node: n, x: 0, y: 0, children: [] });
    }
    const colIndices = new Map<string, number>();
    let maxLv = 0;
    let maxColIndex = 0;
    for (const [lv, lvNodes] of byLevel) {
      if (lv > maxLv) maxLv = lv;
      lvNodes.sort((a, b) => a.node.col_index - b.node.col_index);
      for (let i = 0; i < lvNodes.length; i++) {
        const col = lvNodes[i].node.col_index;
        if (col > maxColIndex) maxColIndex = col;
        colIndices.set(lvNodes[i].node.node_id, col);
        lvNodes[i].x = Math.min(col, MAX_COLS - 1) * SLOT_W + (SLOT_W - NODE_W) / 2;
        lvNodes[i].y = TOP_PAD + lv * (NODE_H + V_GAP);
      }
    }
    const flat: LayoutNode[] = [];
    for (const ns of byLevel.values()) flat.push(...ns);
    const usedCols = byLevel.size > 0 ? maxColIndex + 1 : 1;
    return {
      allFlat: flat,
      totalWidth: Math.max(usedCols, MAX_COLS) * SLOT_W,
      totalHeight: TOP_PAD + (maxLv + 2) * (NODE_H + V_GAP) + 40,
      columnIndices: colIndices,
      byLevelMap: byLevel,
    };
  }, [nodes]);

  const levelEntries = useMemo(() => {
    const entries: { level: number; nodesAtLevel: LayoutNode[] }[] = [];
    const maxLevel = byLevelMap.size > 0
      ? Math.max(...byLevelMap.keys())
      : -1;
    for (let lv = 0; lv <= maxLevel + 1; lv++) {
      entries.push({ level: lv, nodesAtLevel: byLevelMap.get(lv) ?? [] });
    }
    return entries;
  }, [byLevelMap]);

  const svgW = Math.max(totalWidth, 600);
  const svgH = Math.max(totalHeight, 400);

  // Stable primitive that changes only when edges are actually added or removed.
  // Using this instead of the `edges` array as a dependency prevents the scoring
  // effect from re-firing on every parent render (new array reference ≠ new content).
  const edgePairKey = useMemo(
    () => edges.map(e => `${e.parent_node_id}-${e.child_node_id}`).sort().join(','),
    [edges],
  );

  useEffect(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    if (currentNodes.length < 2) return;
    const newPairs: [number, number][] = [];
    const newTrackKeys: string[] = [];
    const newNodeKeys: string[] = [];
    const fromCacheEntries: Array<[string, number | null]> = [];

    for (const edge of currentEdges) {
      const parent = currentNodes.find(n => n.node_id === edge.parent_node_id);
      const child = currentNodes.find(n => n.node_id === edge.child_node_id);
      if (!parent || !child) continue;
      const trackKey = `${parent.track_id}-${child.track_id}`;
      const nodeKey = `${edge.parent_node_id}-${edge.child_node_id}`;
      const cached = scoreCacheRef.current.get(trackKey);
      if (cached !== undefined) {
        fromCacheEntries.push([nodeKey, cached]);
      } else {
        newPairs.push([parent.track_id, child.track_id]);
        newTrackKeys.push(trackKey);
        newNodeKeys.push(nodeKey);
      }
    }

    // Additive-only update: do not rebuild the whole map.
    // Deleted edges leave stale entries in the map but they are never rendered
    // because the edge is gone from the JSX loop. This avoids spurious state
    // updates (and re-renders) on every edge deletion.
    if (newPairs.length === 0) {
      if (fromCacheEntries.length > 0) {
        setEdgeScores(prev => {
          const needsUpdate = fromCacheEntries.some(([k, v]) => prev.get(k) !== v);
          if (!needsUpdate) return prev;
          const next = new Map(prev);
          for (const [k, v] of fromCacheEntries) next.set(k, v);
          return next;
        });
      }
      return;
    }

    setLoadingEdgeKeys(prev => {
      const next = new Set(prev);
      for (const nk of newNodeKeys) next.add(nk);
      return next;
    });
    let cancelled = false;
    fetchEdgeScoresRef.current(newPairs).then(result => {
      if (cancelled) return;
      newTrackKeys.forEach((tk, i) => {
        scoreCacheRef.current.set(tk, result.scores[i] ?? null);
      });
      setEdgeScores(prev => {
        const next = new Map(prev);
        for (const [k, v] of fromCacheEntries) next.set(k, v);
        newNodeKeys.forEach((nk, i) => next.set(nk, result.scores[i] ?? null));
        return next;
      });
      setLoadingEdgeKeys(prev => {
        if (newNodeKeys.every(nk => !prev.has(nk))) return prev;
        const next = new Set(prev);
        for (const nk of newNodeKeys) next.delete(nk);
        return next;
      });
    }).catch(() => {
      if (!cancelled) {
        setLoadingEdgeKeys(prev => {
          if (newNodeKeys.every(nk => !prev.has(nk))) return prev;
          const next = new Set(prev);
          for (const nk of newNodeKeys) next.delete(nk);
          return next;
        });
      }
    });
    return () => { cancelled = true; };
  }, [edgePairKey]);

  useEffect(() => {
    if (selectedEdgeId === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteEdge(selectedEdgeId);
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEdgeId, onDeleteEdge]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSwapSource(null);
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSearchAdd = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }
    try {
      const results = await searchTracks(q);
      setSearchResults(results);
      setShowSearch(results.length > 0);
    } catch { /* ignore */ }
  }, []);

  const handleSearchSelect = useCallback((s: SearchSuggestion) => {
    stableOnAddNode(s.id);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  }, [stableOnAddNode]);

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).classList.contains('set-explorer-svg')) {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSwapSource(null);
    }
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    const ss = swapSourceRef.current;
    if (ss) {
      if (ss !== nodeId) onSwapRef.current(ss, nodeId);
      setSwapSource(null);
      return;
    }
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
    setSelectedEdgeId(null);
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string, level: number, x: number, y: number) => {
    if (e.button !== 0) return;
    if (swapSourceRef.current) return;
    const target = e.target as Element;
    if (target.closest('.explorer-action-row') || target.closest('.explorer-edge-delete')) return;
    e.stopPropagation();
    const cx = x + NODE_W / 2;
    const cy = y + NODE_H / 2;
    pendingDragRef.current = {
      sourceNodeId: nodeId,
      sourceLevel: level,
      sourceCX: cx,
      sourceCY: cy,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  }, []);

  const handleNodeMouseUp = useCallback((nodeId: string, level: number) => {
    const cd = connectDragRef.current;
    if (!cd) return;
    if (cd.sourceNodeId === nodeId) { setConnectDrag(null); return; }
    const srcLevel = cd.sourceLevel;
    const tgtLevel = level;
    if (Math.abs(srcLevel - tgtLevel) === 1) {
      const parentId = srcLevel < tgtLevel ? cd.sourceNodeId : nodeId;
      const childId = srcLevel < tgtLevel ? nodeId : cd.sourceNodeId;
      const alreadyConnected = edgesRef.current.some(
        e => e.parent_node_id === parentId && e.child_node_id === childId,
      );
      if (!alreadyConnected) onAddEdgeRef.current(parentId, childId);
    }
    setConnectDrag(null);
  }, []);

  const openLevelAdd = useCallback((level: number, nodesAtLevel: LayoutNode[]) => {
    const rightmost = nodesAtLevel.length > 0
      ? nodesAtLevel.reduce((a, b) => a.node.col_index >= b.node.col_index ? a : b)
      : null;
    const parentIds = rightmost
      ? edgesRef.current.filter(e => e.child_node_id === rightmost.node.node_id).map(e => e.parent_node_id)
      : [];
    setSwapSource(null);
    setSelectedEdgeId(null);
    setSiblingAdd({
      targetLevel: level,
      parentIds,
      selectedParents: new Set(parentIds),
      searchQuery: '',
      searchResults: [],
      showResults: false,
    });
  }, []);

  const openChildAdd = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find(n => n.node_id === nodeId);
    if (!node) return;
    setChildAdd({ parentNode: node, matches: [], loading: true });
    try {
      const matches = await fetchMatches(node.track_id);
      setChildAdd(prev => prev ? { ...prev, matches, loading: false } : prev);
    } catch {
      setChildAdd(prev => prev ? { ...prev, loading: false } : prev);
    }
  }, []);

  const handleChildSelect = useCallback((m: TransitionMatch) => {
    if (!childAdd) return;
    stableOnAddNode(m.candidate_id, childAdd.parentNode.node_id, childAdd.parentNode.level + 1);
    setChildAdd(null);
  }, [childAdd, stableOnAddNode]);

  const handleSiblingSearch = useCallback(async (q: string) => {
    setSiblingAdd(prev => prev ? { ...prev, searchQuery: q } : prev);
    if (!q.trim()) {
      setSiblingAdd(prev => prev ? { ...prev, searchResults: [], showResults: false } : prev);
      return;
    }
    try {
      const results = await searchTracks(q);
      setSiblingAdd(prev => prev ? { ...prev, searchResults: results, showResults: results.length > 0 } : prev);
    } catch { /* ignore */ }
  }, []);

  const toggleSiblingParent = useCallback((parentId: string) => {
    setSiblingAdd(prev => {
      if (!prev) return prev;
      const next = new Set(prev.selectedParents);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return { ...prev, selectedParents: next };
    });
  }, []);

  const handleSiblingSelect = useCallback(async (s: SearchSuggestion) => {
    if (!siblingAdd) return;
    const parentIds = Array.from(siblingAdd.selectedParents);
    if (parentIds.length > 0) {
      await onAddSiblingRef.current(s.id, parentIds, siblingAdd.targetLevel);
    } else {
      await stableOnAddNode(s.id, undefined, siblingAdd.targetLevel);
    }
    setSiblingAdd(null);
  }, [siblingAdd, stableOnAddNode]);

  const handleEdgeClick = useCallback((e: React.MouseEvent, edgeId: number) => {
    e.stopPropagation();
    setSelectedEdgeId(prev => prev === edgeId ? null : edgeId);
    setSelectedNodeId(null);
    setSwapSource(null);
  }, []);

  const handleDeleteEdge = useCallback((edgeId: number) => {
    stableOnDeleteEdge(edgeId);
    setSelectedEdgeId(null);
  }, [stableOnDeleteEdge]);

  const onSetSwapSource = useCallback((nodeId: string) => {
    setSwapSource(nodeId);
    setSelectedEdgeId(null);
  }, []);

  const handleSetDeleteTarget = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.node_id === nodeId);
    if (node) setDeleteTarget(node);
  }, []);

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const n of allFlat) map.set(n.node.node_id, n);
    return map;
  }, [allFlat]);

  return (
    <div className="set-explorer">
      <div className="set-explorer-controls">
        <div className="set-explorer-search-wrapper">
          <input
            className="set-explorer-search"
            placeholder="Search to add root node…"
            value={searchQuery}
            onChange={e => handleSearchAdd(e.target.value)}
          />
          {showSearch && (
            <ul className="set-explorer-search-dropdown">
              {searchResults.map(s => (
                <li
                  key={s.id}
                  className="set-explorer-search-item"
                  onMouseDown={() => handleSearchSelect(s)}
                >
                  <span>{s.title}</span>
                  <span className="text-muted">
                    {s.camelot_code && <span className="mono"> {s.camelot_code}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {swapSource && (
          <span className="set-explorer-swap-hint">Click another node to swap</span>
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
      >
        {nodes.length === 0 ? (
          <div>
            <p className="set-empty-tracks">Explorer is empty. Search above to add a root node.</p>
            <svg
              className="set-explorer-svg"
              width={200}
              height={80}
              viewBox="0 0 200 80"
            >
              <g
                transform={`translate(${(200 - LEVEL_ADD_W) / 2}, ${(80 - LEVEL_ADD_H) / 2})`}
                className="explorer-level-add-btn"
                onClick={e => { e.stopPropagation(); openLevelAdd(0, []); }}
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
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
            onClick={handleSvgClick}
          >
            {/* Edges */}
            {edges.map(edge => {
              const parent = nodeMap.get(edge.parent_node_id);
              const child = nodeMap.get(edge.child_node_id);
              if (!parent || !child) return null;
              const parentColIdx = columnIndices.get(edge.parent_node_id) ?? 0;
              const childColIdx = (columnIndices.get(edge.child_node_id) ?? 0) % EDGE_SLOTS;
              const nodeKey = `${edge.parent_node_id}-${edge.child_node_id}`;
              const score = edgeScores.get(nodeKey);
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
              );
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

            {/* Nodes */}
            {allFlat.map(ln => (
              <ExplorerNodeItem
                key={ln.node.node_id}
                nodeId={ln.node.node_id}
                trackId={ln.node.track_id}
                level={ln.node.level}
                colIndex={ln.node.col_index}
                trackTitle={ln.node.track?.title}
                x={ln.x}
                y={ln.y}
                isSelected={selectedNodeId === ln.node.node_id}
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
              const lastNode = nodesAtLevel.length > 0
                ? nodesAtLevel.reduce((a, b) => a.node.col_index >= b.node.col_index ? a : b)
                : null;
              const addX = lastNode
                ? lastNode.x + NODE_W + LEVEL_ADD_GAP
                : (SLOT_W - NODE_W) / 2;
              const addY = TOP_PAD + level * (NODE_H + V_GAP) + (NODE_H - LEVEL_ADD_H) / 2;
              return (
                <g
                  key={`level-add-${level}`}
                  transform={`translate(${addX}, ${addY})`}
                  className="explorer-level-add-btn"
                  onClick={e => { e.stopPropagation(); openLevelAdd(level, nodesAtLevel); }}
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
              );
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
            onDeleteNodeRef.current(deleteTarget.node_id, rewireEdges);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {siblingAdd && (
        <div className="explorer-delete-overlay" onClick={() => setSiblingAdd(null)}>
          <div className="explorer-delete-modal" onClick={e => e.stopPropagation()} data-testid="sibling-add-modal">
            <h3>Add Track to Level {siblingAdd.targetLevel}</h3>
            <p className="text-muted">
              Add a track at level {siblingAdd.targetLevel}
            </p>

            {siblingAdd.parentIds.length > 0 && (
              <div className="explorer-delete-section">
                <p className="text-muted" style={{ marginBottom: 4 }}>Inherit parent connections:</p>
                {siblingAdd.parentIds.map(pid => {
                  const pNode = nodes.find(n => n.node_id === pid);
                  return (
                    <label key={pid} style={{ display: 'block' }}>
                      <input
                        type="checkbox"
                        checked={siblingAdd.selectedParents.has(pid)}
                        onChange={() => toggleSiblingParent(pid)}
                      />
                      {' '}{pNode?.track?.title ?? pid}
                    </label>
                  );
                })}
              </div>
            )}

            <div className="set-explorer-search-wrapper" style={{ marginTop: 8 }}>
              <input
                className="set-explorer-search"
                placeholder="Search for track…"
                value={siblingAdd.searchQuery}
                onChange={e => handleSiblingSearch(e.target.value)}
                autoFocus
                data-testid="sibling-search-input"
              />
              {siblingAdd.showResults && (
                <ul className="set-explorer-search-dropdown">
                  {siblingAdd.searchResults.map(s => (
                    <li
                      key={s.id}
                      className="set-explorer-search-item"
                      onMouseDown={() => handleSiblingSelect(s)}
                    >
                      <span>{s.title}</span>
                      <span className="text-muted">
                        {s.camelot_code && <span className="mono"> {s.camelot_code}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="explorer-delete-buttons" style={{ marginTop: 12 }}>
              <button className="set-action-btn" onClick={() => setSiblingAdd(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {childAdd && (
        <div className="explorer-delete-overlay" onClick={() => setChildAdd(null)}>
          <div className="explorer-delete-modal" onClick={e => e.stopPropagation()} data-testid="child-add-modal">
            <h3>Add Child</h3>
            <p className="text-muted">
              Matches for <strong>{childAdd.parentNode.track?.title ?? childAdd.parentNode.node_id}</strong>
            </p>

            {childAdd.loading ? (
              <p className="text-muted" data-testid="child-match-loading">Loading matches…</p>
            ) : childAdd.matches.length === 0 ? (
              <p className="text-muted">No matches found.</p>
            ) : (
              <ul className="set-explorer-search-dropdown" style={{ position: 'static', maxHeight: 260, overflowY: 'auto' }}>
                {childAdd.matches.map(m => (
                  <li
                    key={m.candidate_id}
                    className="set-explorer-search-item"
                    onClick={() => handleChildSelect(m)}
                    data-testid="child-match-item"
                  >
                    <span>{m.title}</span>
                    <span className="text-muted mono">{formatOverallScore(m.overall_score)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="explorer-delete-buttons" style={{ marginTop: 12 }}>
              <button className="set-action-btn" onClick={() => setChildAdd(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
