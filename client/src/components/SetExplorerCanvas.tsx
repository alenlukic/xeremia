import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
const V_GAP = 88;
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
const TOTAL_LANES = EDGE_SLOTS * EDGE_SLOTS; // 25
const LANE_PITCH = (MAX_COLS * SLOT_W) / TOTAL_LANES; // 78px per lane
const STUB_H = 26; // diagonal transition depth at parent exit and child entry

function edgeSlotX(nodeX: number, slotIndex: number): number {
  return nodeX + EDGE_PAD + (NODE_W - 2 * EDGE_PAD) * slotIndex / (EDGE_SLOTS - 1);
}

function edgeLaneX(parentColIdx: number, childColIdx: number): number {
  const laneIndex = parentColIdx * EDGE_SLOTS + childColIdx;
  return LANE_PITCH * (laneIndex + 0.5);
}

function truncateForSvg(text: string, max = 56): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

function buildForest(nodes: ExplorerNode[], edges: ExplorerEdge[]): LayoutNode[] {
  const childSet = new Set(edges.map(e => e.child_node_id));
  const childrenMap = new Map<string, string[]>();
  for (const e of edges) {
    const list = childrenMap.get(e.parent_node_id) ?? [];
    list.push(e.child_node_id);
    childrenMap.set(e.parent_node_id, list);
  }
  const nodeMap = new Map<string, ExplorerNode>();
  for (const n of nodes) nodeMap.set(n.node_id, n);

  const roots = nodes.filter(n => !childSet.has(n.node_id));

  function build(nodeId: string): LayoutNode | null {
    const n = nodeMap.get(nodeId);
    if (!n) return null;
    const kids = (childrenMap.get(nodeId) ?? [])
      .map(build)
      .filter((x): x is LayoutNode => x !== null);
    return { node: n, x: 0, y: 0, children: kids };
  }

  return roots.map(r => build(r.node_id)).filter((x): x is LayoutNode => x !== null);
}

function collectByLevel(forest: LayoutNode[]): Map<number, LayoutNode[]> {
  const byLevel = new Map<number, LayoutNode[]>();
  const visited = new Set<string>();
  function walk(node: LayoutNode) {
    if (visited.has(node.node.node_id)) return;
    visited.add(node.node.node_id);
    const lv = node.node.level;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(node);
    for (const c of node.children) walk(c);
  }
  for (const r of forest) walk(r);
  return byLevel;
}

export function SetExplorerCanvas({
  nodes, edges, onAddNode, onDeleteNode, onAddEdge, onDeleteEdge, onSwap,
  onNodeToTracklist, onAddSibling, tracklistTrackIds, fetchEdgeScores,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerNode | null>(null);
  const [edgeScores, setEdgeScores] = useState<Map<string, number | null>>(new Map());
  const [scoresLoading, setScoresLoading] = useState(false);
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [siblingAdd, setSiblingAdd] = useState<SiblingAddState | null>(null);
  const [childAdd, setChildAdd] = useState<ChildAddState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [connectDrag, setConnectDrag] = useState<ConnectDragState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(1);
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const pendingDragRef = useRef<{ sourceNodeId: string; sourceLevel: number; sourceCX: number; sourceCY: number; startClientX: number; startClientY: number } | null>(null);
  const DRAG_THRESHOLD = 5;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.max(0.2, Math.min(3, prev + delta)));
    } else {
      const dy = e.deltaMode === 0 ? e.deltaY : e.deltaY * 14;
      setPan(prev => ({ ...prev, y: prev.y - dy }));
    }
  }, []);

  const handleBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (connectDrag) return;
    pendingDragRef.current = null;
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      draggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [connectDrag]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (pendingDragRef.current && !connectDrag) {
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
    if (connectDrag) {
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
  }, [connectDrag]);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
    pendingDragRef.current = null;
    if (connectDrag) {
      setConnectDrag(null);
    }
  }, [connectDrag]);

  const forest = useMemo(() => buildForest(nodes, edges), [nodes, edges]);

  const { allFlat, totalWidth, totalHeight, columnIndices, byLevelMap } = useMemo(() => {
    const byLevel = collectByLevel(forest);
    const colIndices = new Map<string, number>();
    let maxLv = 0;
    for (const [lv, lvNodes] of byLevel) {
      if (lv > maxLv) maxLv = lv;
      for (let i = 0; i < lvNodes.length; i++) {
        const col = Math.min(i, MAX_COLS - 1);
        colIndices.set(lvNodes[i].node.node_id, col);
        lvNodes[i].x = col * SLOT_W + (SLOT_W - NODE_W) / 2;
        lvNodes[i].y = TOP_PAD + lv * (NODE_H + V_GAP);
      }
    }
    const flat: LayoutNode[] = [];
    for (const ns of byLevel.values()) flat.push(...ns);
    const usedCols = byLevel.size > 0
      ? Math.max(...Array.from(byLevel.values()).map(ns => ns.length))
      : 1;
    return {
      allFlat: flat,
      totalWidth: Math.max(usedCols, MAX_COLS) * SLOT_W,
      totalHeight: TOP_PAD + (maxLv + 2) * (NODE_H + V_GAP) + 40,
      columnIndices: colIndices,
      byLevelMap: byLevel,
    };
  }, [forest]);

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

  useEffect(() => {
    if (nodes.length < 2) return;
    const pairs: [number, number][] = [];
    const pairKeys: string[] = [];
    for (const edge of edges) {
      const parent = nodes.find(n => n.node_id === edge.parent_node_id);
      const child = nodes.find(n => n.node_id === edge.child_node_id);
      if (parent && child) {
        pairs.push([parent.track_id, child.track_id]);
        pairKeys.push(`${edge.parent_node_id}-${edge.child_node_id}`);
      }
    }
    if (pairs.length === 0) return;
    setScoresLoading(true);
    let cancelled = false;
    fetchEdgeScores(pairs).then(result => {
      if (cancelled) return;
      const map = new Map<string, number | null>();
      pairKeys.forEach((k, i) => map.set(k, result.scores[i] ?? null));
      setEdgeScores(map);
      setScoresLoading(false);
    }).catch(() => { if (!cancelled) setScoresLoading(false); });
    return () => { cancelled = true; };
  }, [nodes, edges, fetchEdgeScores]);

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
    onAddNode(s.id);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  }, [onAddNode]);

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).classList.contains('set-explorer-svg')) {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSwapSource(null);
    }
  }, []);

  const handleNodeClick = useCallback((node: ExplorerNode) => {
    if (swapSource) {
      if (swapSource !== node.node_id) {
        onSwap(swapSource, node.node_id);
      }
      setSwapSource(null);
      return;
    }
    setSelectedNodeId(prev => prev === node.node_id ? null : node.node_id);
    setSelectedEdgeId(null);
  }, [swapSource, onSwap]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, ln: LayoutNode) => {
    if (e.button !== 0) return;
    if (swapSource) return;
    const target = e.target as Element;
    if (target.closest('.explorer-action-row') || target.closest('.explorer-edge-delete')) return;
    e.stopPropagation();
    const cx = ln.x + NODE_W / 2;
    const cy = ln.y + NODE_H / 2;
    pendingDragRef.current = {
      sourceNodeId: ln.node.node_id,
      sourceLevel: ln.node.level,
      sourceCX: cx,
      sourceCY: cy,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  }, [swapSource]);

  const handleNodeMouseUp = useCallback((ln: LayoutNode) => {
    if (!connectDrag) return;
    if (connectDrag.sourceNodeId === ln.node.node_id) {
      setConnectDrag(null);
      return;
    }
    const srcLevel = connectDrag.sourceLevel;
    const tgtLevel = ln.node.level;
    const diff = Math.abs(srcLevel - tgtLevel);
    if (diff === 1) {
      const parentId = srcLevel < tgtLevel ? connectDrag.sourceNodeId : ln.node.node_id;
      const childId = srcLevel < tgtLevel ? ln.node.node_id : connectDrag.sourceNodeId;
      const alreadyConnected = edges.some(
        e => e.parent_node_id === parentId && e.child_node_id === childId,
      );
      if (!alreadyConnected) {
        onAddEdge(parentId, childId);
      }
    }
    setConnectDrag(null);
  }, [connectDrag, edges, onAddEdge]);

  const openLevelAdd = useCallback((level: number, nodesAtLevel: LayoutNode[]) => {
    const rightmost = nodesAtLevel.length > 0
      ? nodesAtLevel[nodesAtLevel.length - 1]
      : null;
    const parentIds = rightmost
      ? edges.filter(e => e.child_node_id === rightmost.node.node_id).map(e => e.parent_node_id)
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
  }, [edges]);

  const openChildAdd = useCallback(async (node: ExplorerNode) => {
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
    onAddNode(m.candidate_id, childAdd.parentNode.node_id, childAdd.parentNode.level + 1);
    setChildAdd(null);
  }, [childAdd, onAddNode]);

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
      await onAddSibling(s.id, parentIds, siblingAdd.targetLevel);
    } else {
      await onAddNode(s.id, undefined, siblingAdd.targetLevel);
    }
    setSiblingAdd(null);
  }, [siblingAdd, onAddSibling, onAddNode]);

  const handleEdgeClick = useCallback((e: React.MouseEvent, edgeId: number) => {
    e.stopPropagation();
    setSelectedEdgeId(prev => prev === edgeId ? null : edgeId);
    setSelectedNodeId(null);
    setSwapSource(null);
  }, []);

  const handleDeleteEdge = useCallback((edgeId: number) => {
    onDeleteEdge(edgeId);
    setSelectedEdgeId(null);
  }, [onDeleteEdge]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const n of allFlat) map.set(n.node.node_id, n);
    return map;
  }, [allFlat]);

  const parentChildMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of edges) {
      const list = map.get(e.parent_node_id) ?? [];
      list.push(e.child_node_id);
      map.set(e.parent_node_id, list);
    }
    return map;
  }, [edges]);

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
              const parentBottom = parent.y + NODE_H;
              const childTop = child.y;
              const midY = (parentBottom + childTop) / 2;
              const parentColIdx = columnIndices.get(edge.parent_node_id) ?? 0;
              const childColIdx = (columnIndices.get(edge.child_node_id) ?? 0) % EDGE_SLOTS;
              const strokeColor = edgeColorForColumn(childColIdx);

              const startX = edgeSlotX(parent.x, childColIdx);
              const endX = edgeSlotX(child.x, childColIdx);
              const laneX = edgeLaneX(parentColIdx, childColIdx);

              // 25-lane diagonal routing: exit stub → diagonal to lane → vertical in lane → diagonal to child entry
              // No horizontal segments: diagonals eliminate 0-degree overlaps between different edges
              const pathD = `M ${startX} ${parentBottom} L ${laneX} ${parentBottom + STUB_H} L ${laneX} ${childTop - STUB_H} L ${endX} ${childTop}`;
              const scoreKey = `${edge.parent_node_id}-${edge.child_node_id}`;
              const score = edgeScores.get(scoreKey);
              const labelX = laneX - 8;
              const labelY = midY;
              const isSelected = selectedEdgeId === edge.id;
              const edgeMidX = laneX;
              return (
                <g key={`edge-${edge.id}`}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    style={{ cursor: 'pointer' }}
                    onClick={e => handleEdgeClick(e, edge.id)}
                    data-testid="explorer-edge-hitbox"
                  />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isSelected ? 'var(--accent)' : strokeColor}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    pointerEvents="none"
                  />
                  {scoresLoading && score === undefined ? (
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
                      dominantBaseline="central"
                      className="explorer-edge-label"
                      fill={strokeColor}
                      data-testid="explorer-edge-label"
                    >
                      {score !== null ? formatOverallScore(score) : '—'}
                    </text>
                  ) : null}
                  {isSelected && (
                    <g
                      transform={`translate(${edgeMidX}, ${midY})`}
                      className="explorer-edge-delete"
                      onClick={e => { e.stopPropagation(); handleDeleteEdge(edge.id); }}
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
            {allFlat.map(ln => {
              const color = nodeColorForLevel(ln.node.level);
              const isSwapSource = swapSource === ln.node.node_id;
              const isSelected = selectedNodeId === ln.node.node_id;
              const inTracklist = tracklistTrackIds.has(ln.node.track_id);
              const fullTitle = ln.node.track?.title ?? String(ln.node.track_id);
              const title = truncateForSvg(fullTitle);

              const actions: { key: string; label: string; ariaLabel: string; fill: string; w: number; testId?: string; action: () => void }[] = [
                { key: 'del', label: '×', ariaLabel: 'Delete node', fill: ACTION_FILL.danger, w: 22, action: () => setDeleteTarget(ln.node) },
                { key: 'swap', label: '↕', ariaLabel: 'Swap track IDs', fill: ACTION_FILL.accent, w: 22, action: () => { setSwapSource(ln.node.node_id); setSelectedEdgeId(null); } },
                { key: 'child', label: '+Child', ariaLabel: 'Add child node', fill: ACTION_FILL.accent, w: 38, testId: 'child-add-btn', action: () => openChildAdd(ln.node) },
              ];
              if (!inTracklist) {
                actions.push({ key: 'tl', label: '→TL', ariaLabel: 'Add to Tracklist', fill: ACTION_FILL.success, w: 26, action: () => onNodeToTracklist(ln.node.node_id) });
              }

              const totalActionsW = actions.reduce((s, a) => s + a.w, 0) + (actions.length - 1) * ACTION_GAP;
              const actionsStartX = (NODE_W - totalActionsW) / 2;
              const actionXs: number[] = [];
              let runX = 0;
              for (const a of actions) { actionXs.push(runX); runX += a.w + ACTION_GAP; }

              return (
                <g
                  key={ln.node.node_id}
                  transform={`translate(${ln.x}, ${ln.y})`}
                  className="explorer-node-group"
                  onClick={e => { e.stopPropagation(); handleNodeClick(ln.node); }}
                  onMouseDown={e => handleNodeMouseDown(e, ln)}
                  onMouseUp={() => handleNodeMouseUp(ln)}
                  data-testid="explorer-node"
                  data-level={ln.node.level}
                >
                  {/* Action row: outer <g> for position, inner <g> for unfurl animation */}
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
                      if (!isNaN(trackId)) {
                        onAddNode(trackId, ln.node.node_id, ln.node.level + 1);
                      }
                    }}
                  />
                </g>
              );
            })}

            {/* Per-level +Add Track controls */}
            {levelEntries.map(({ level, nodesAtLevel }) => {
              const lastNode = nodesAtLevel.length > 0 ? nodesAtLevel[nodesAtLevel.length - 1] : null;
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
            onDeleteNode(deleteTarget.node_id, rewireEdges);
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
