import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ExplorerNode, ExplorerEdge, SearchSuggestion } from '../types';
import { nodeColorForLevel, edgeColorForColumn, ACTION_FILL } from '../utils/explorer';
import { cleanTitle } from '../utils/trackTitle';
import { searchTracks } from '../api/http';
import { SetExplorerDeleteModal } from './SetExplorerDeleteModal';
import { formatOverallScore } from '../utils';

interface Props {
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
  onAddNode: (trackId: number, parentNodeId?: string, level?: number) => void;
  onDeleteNode: (nodeId: string, rewireEdges?: { parent_node_id: string; child_node_id: string }[]) => void;
  onSwap: (nodeAId: string, nodeBId: string) => void;
  onNodeToTracklist: (nodeId: string) => void;
  onAddSibling: (trackId: number, inheritParentIds: string[], level: number) => Promise<unknown>;
  tracklistTrackIds: Set<number>;
  fetchEdgeScores: (pairs: [number, number][]) => Promise<{ scores: (number | null)[] }>;
}

interface SiblingAddState {
  targetNode: ExplorerNode;
  parentIds: string[];
  selectedParents: Set<string>;
  searchQuery: string;
  searchResults: SearchSuggestion[];
  showResults: boolean;
}

interface ChildAddState {
  parentNode: ExplorerNode;
  searchQuery: string;
  searchResults: SearchSuggestion[];
  showResults: boolean;
}

interface LayoutNode {
  node: ExplorerNode;
  x: number;
  y: number;
  children: LayoutNode[];
}

const NODE_W = 176;
const NODE_H = 40;
const V_GAP = 60;
const MAX_COLS = 5;
const SLOT_W = 196;
const ACTION_H = 24;
const ACTION_LABEL_SIZE = 10;
const ACTION_GAP = 4;
const TOP_PAD = ACTION_H + 8;

function truncateForSvg(text: string, max = 18): string {
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
  function walk(node: LayoutNode) {
    const lv = node.node.level;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(node);
    for (const c of node.children) walk(c);
  }
  for (const r of forest) walk(r);
  return byLevel;
}

export function SetExplorerCanvas({
  nodes, edges, onAddNode, onDeleteNode, onSwap, onNodeToTracklist,
  onAddSibling, tracklistTrackIds, fetchEdgeScores,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerNode | null>(null);
  const [edgeScores, setEdgeScores] = useState<Map<string, number | null>>(new Map());
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [siblingAdd, setSiblingAdd] = useState<SiblingAddState | null>(null);
  const [childAdd, setChildAdd] = useState<ChildAddState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(1);
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.2, Math.min(3, prev + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      draggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const forest = useMemo(() => buildForest(nodes, edges), [nodes, edges]);

  const { allFlat, totalWidth, totalHeight, columnIndices } = useMemo(() => {
    const byLevel = collectByLevel(forest);
    const colIndices = new Map<string, number>();
    let maxLv = 0;
    for (const [lv, nodes] of byLevel) {
      if (lv > maxLv) maxLv = lv;
      for (let i = 0; i < nodes.length; i++) {
        const col = Math.min(i, MAX_COLS - 1);
        colIndices.set(nodes[i].node.node_id, col);
        nodes[i].x = col * SLOT_W + (SLOT_W - NODE_W) / 2;
        nodes[i].y = TOP_PAD + lv * (NODE_H + V_GAP);
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
      totalHeight: TOP_PAD + (maxLv + 1) * (NODE_H + V_GAP) + 40,
      columnIndices: colIndices,
    };
  }, [forest]);

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
    let cancelled = false;
    fetchEdgeScores(pairs).then(result => {
      if (cancelled) return;
      const map = new Map<string, number | null>();
      pairKeys.forEach((k, i) => map.set(k, result.scores[i] ?? null));
      setEdgeScores(map);
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [nodes, edges, fetchEdgeScores]);

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

  const handleNodeClick = useCallback((node: ExplorerNode) => {
    if (swapSource) {
      if (swapSource !== node.node_id) {
        onSwap(swapSource, node.node_id);
      }
      setSwapSource(null);
    }
  }, [swapSource, onSwap]);

  const openSiblingAdd = useCallback((node: ExplorerNode) => {
    const parentIds = edges
      .filter(e => e.child_node_id === node.node_id)
      .map(e => e.parent_node_id);
    setSiblingAdd({
      targetNode: node,
      parentIds,
      selectedParents: new Set(parentIds),
      searchQuery: '',
      searchResults: [],
      showResults: false,
    });
  }, [edges]);

  const openChildAdd = useCallback((node: ExplorerNode) => {
    setChildAdd({
      parentNode: node,
      searchQuery: '',
      searchResults: [],
      showResults: false,
    });
  }, []);

  const handleChildSearch = useCallback(async (q: string) => {
    setChildAdd(prev => prev ? { ...prev, searchQuery: q } : prev);
    if (!q.trim()) {
      setChildAdd(prev => prev ? { ...prev, searchResults: [], showResults: false } : prev);
      return;
    }
    try {
      const results = await searchTracks(q);
      setChildAdd(prev => prev ? { ...prev, searchResults: results, showResults: results.length > 0 } : prev);
    } catch { /* ignore */ }
  }, []);

  const handleChildSelect = useCallback((s: SearchSuggestion) => {
    if (!childAdd) return;
    onAddNode(s.id, childAdd.parentNode.node_id, childAdd.parentNode.level + 1);
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
      await onAddSibling(s.id, parentIds, siblingAdd.targetNode.level);
    } else {
      await onAddNode(s.id, undefined, siblingAdd.targetNode.level);
    }
    setSiblingAdd(null);
  }, [siblingAdd, onAddSibling, onAddNode]);

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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {nodes.length === 0 ? (
          <p className="set-empty-tracks">Explorer is empty. Search above to add a root node.</p>
        ) : (
          <svg
            ref={svgRef}
            className="set-explorer-svg"
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
          >
            {edges.map(edge => {
              const parent = nodeMap.get(edge.parent_node_id);
              const child = nodeMap.get(edge.child_node_id);
              if (!parent || !child) return null;
              const parentCX = parent.x + NODE_W / 2;
              const parentBottom = parent.y + NODE_H;
              const childCX = child.x + NODE_W / 2;
              const childTop = child.y;
              const midY = (parentBottom + childTop) / 2;
              const colIdx = columnIndices.get(edge.child_node_id) ?? 0;
              const strokeColor = edgeColorForColumn(colIdx);
              const pathD = `M ${parentCX} ${parentBottom} L ${parentCX} ${midY} L ${childCX} ${midY} L ${childCX} ${childTop}`;
              const scoreKey = `${edge.parent_node_id}-${edge.child_node_id}`;
              const score = edgeScores.get(scoreKey);
              const labelX = parentCX === childCX ? parentCX + 14 : (parentCX + childCX) / 2;
              return (
                <g key={`edge-${edge.id}`}>
                  <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={1.5} />
                  {score !== undefined && (
                    <text
                      x={labelX}
                      y={midY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="explorer-edge-label"
                      data-testid="explorer-edge-label"
                    >
                      {score !== null ? formatOverallScore(score) : '—'}
                    </text>
                  )}
                </g>
              );
            })}

            {allFlat.map(ln => {
              const color = nodeColorForLevel(ln.node.level);
              const isSwapSource = swapSource === ln.node.node_id;
              const inTracklist = tracklistTrackIds.has(ln.node.track_id);
              const title = truncateForSvg(cleanTitle(ln.node.track, ln.node.track_id));

              const actions: { key: string; label: string; ariaLabel: string; fill: string; w: number; testId?: string; action: () => void }[] = [
                { key: 'del', label: '×', ariaLabel: 'Delete node', fill: ACTION_FILL.danger, w: 22, action: () => setDeleteTarget(ln.node) },
                { key: 'swap', label: '⇄', ariaLabel: 'Swap with another node', fill: ACTION_FILL.accent, w: 22, action: () => setSwapSource(ln.node.node_id) },
                { key: 'sib', label: '+Sibling', ariaLabel: 'Add sibling node', fill: ACTION_FILL.success, w: 46, testId: 'sibling-add-btn', action: () => openSiblingAdd(ln.node) },
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
                  onClick={() => handleNodeClick(ln.node)}
                  data-testid="explorer-node"
                  data-level={ln.node.level}
                >
                  {/* Consolidated action row above the node */}
                  <g className="explorer-action-row" transform={`translate(${actionsStartX}, ${-(ACTION_H + 4)})`}>
                    {actions.map((a, i) => (
                      <g
                        key={a.key}
                        ref={(el) => { if (el) el.setAttribute('title', a.ariaLabel); }}
                        transform={`translate(${actionXs[i]}, 0)`}
                        className="explorer-action-btn"
                        onClick={e => { e.stopPropagation(); a.action(); }}
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

                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={6}
                    fill={color}
                    opacity={isSwapSource ? 0.5 : 0.85}
                    stroke={isSwapSource ? '#fff' : 'none'}
                    strokeWidth={isSwapSource ? 2 : 0}
                  />
                  <text
                    x={NODE_W / 2}
                    y={NODE_H / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#fff"
                    fontSize={12}
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
            <h3>Add Sibling</h3>
            <p className="text-muted">
              Add a sibling to <strong>{siblingAdd.targetNode.track?.title ?? siblingAdd.targetNode.node_id}</strong>
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
                placeholder="Search for sibling track…"
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
              Add a child under <strong>{childAdd.parentNode.track?.title ?? childAdd.parentNode.node_id}</strong>
            </p>

            <div className="set-explorer-search-wrapper" style={{ marginTop: 8 }}>
              <input
                className="set-explorer-search"
                placeholder="Search for child track…"
                value={childAdd.searchQuery}
                onChange={e => handleChildSearch(e.target.value)}
                autoFocus
                data-testid="child-search-input"
              />
              {childAdd.showResults && (
                <ul className="set-explorer-search-dropdown">
                  {childAdd.searchResults.map(s => (
                    <li
                      key={s.id}
                      className="set-explorer-search-item"
                      onMouseDown={() => handleChildSelect(s)}
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
              <button className="set-action-btn" onClick={() => setChildAdd(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
