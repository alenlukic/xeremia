import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import type { ExplorerNode, ExplorerEdge, ExplorerTree, SearchSuggestion, TransitionMatch } from '../types';
import { searchTracks, fetchMatches } from '../api/http';
import { SetExplorerDeleteModal } from './SetExplorerDeleteModal';
import { ExplorerGrid, type ConnectDragState } from './explorer/ExplorerGrid';
import type { ExplorerCellViewModel } from './explorer/Level';
import { formatOverallScore } from '../utils';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { MAX_COLS } from '../dnd';

const NODE_H = 48;
const V_GAP = 176;
const SLOT_W = 390;
const TOP_PAD = 32;
const LEVEL_HEIGHT = NODE_H + V_GAP;
const MAX_LEVELS = 100;
const DRAG_THRESHOLD = 5;

interface Props {
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
  onAddNode: (trackId: number, parentNodeId?: string, level?: number, colIndex?: number) => void;
  onDeleteNode: (nodeId: string, rewireEdges?: { parent_node_id: string; child_node_id: string }[]) => void;
  onAddEdge: (parentNodeId: string, childNodeId: string) => Promise<void>;
  onDeleteEdge: (edgeId: number) => Promise<void>;
  onSwap: (nodeAId: string, nodeBId: string) => void;
  onNodeToTracklist: (nodeId: string) => void;
  onAddSibling: (trackId: number, inheritParentIds: string[], level: number, colIndex?: number) => Promise<unknown>;
  tracklistTrackIds: Set<number>;
  fetchEdgeScores: (pairs: [number, number][]) => Promise<{ scores: (number | null)[] }>;
  warningNodeId?: string | null;
  trees?: ExplorerTree[];
  activeTreeId?: number | null;
  onSelectTree?: (treeId: number) => void;
  onCreateTree?: (
    name: string,
    mode?: 'empty' | 'full_copy' | 'subtree_copy',
    sourceTreeId?: number,
    sourceNodeId?: string,
  ) => Promise<ExplorerTree | null>;
}

interface SiblingAddState {
  targetLevel: number;
  targetColIndex: number;
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

export const SetExplorerCanvas = memo(function SetExplorerCanvas({
  nodes, edges, onAddNode, onDeleteNode, onAddEdge, onDeleteEdge, onSwap,
  onNodeToTracklist, onAddSibling, tracklistTrackIds, fetchEdgeScores, warningNodeId,
  trees, activeTreeId, onSelectTree, onCreateTree,
}: Props) {
  const [showNewTreeInput, setShowNewTreeInput] = useState(false);
  const [newTreeName, setNewTreeName] = useState('');
  const [newTreeMode, setNewTreeMode] = useState<'empty' | 'full_copy' | 'subtree_copy'>('empty');
  const newTreeInputRef = useRef<HTMLInputElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (showNewTreeInput && newTreeInputRef.current) newTreeInputRef.current.focus();
  }, [showNewTreeInput]);

  const handleCreateTree = useCallback(async () => {
    const name = newTreeName.trim();
    if (!name || !onCreateTree) return;
    const sourceNode = newTreeMode === 'subtree_copy' ? selectedNodeId ?? undefined : undefined;
    await onCreateTree(name, newTreeMode, activeTreeId ?? undefined, sourceNode);
    setNewTreeName('');
    setShowNewTreeInput(false);
    setNewTreeMode('empty');
  }, [newTreeName, newTreeMode, activeTreeId, selectedNodeId, onCreateTree]);

  const { track: playingTrack, playing: isAudioPlaying, togglePlayPause } = useAudioPlayer();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerNode | null>(null);
  const [edgeScores, setEdgeScores] = useState<Map<string, number | null>>(new Map());
  const [loadingEdgeKeys, setLoadingEdgeKeys] = useState<Set<string>>(new Set());
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [siblingAdd, setSiblingAdd] = useState<SiblingAddState | null>(null);
  const [childAdd, setChildAdd] = useState<ChildAddState | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [connectDrag, setConnectDrag] = useState<ConnectDragState | null>(null);

  const scoreCacheRef = useRef(new Map<string, number | null>());
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const connectDragRef = useRef<ConnectDragState | null>(null);
  connectDragRef.current = connectDrag;
  const swapSourceRef = useRef<string | null>(null);
  swapSourceRef.current = swapSource;
  const fetchEdgeScoresRef = useRef(fetchEdgeScores);
  fetchEdgeScoresRef.current = fetchEdgeScores;
  const pendingDragRef = useRef<{
    sourceNodeId: string; sourceLevel: number;
    sourceCX: number; sourceCY: number;
    startClientX: number; startClientY: number;
  } | null>(null);

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

  const stableOnAddNode = useCallback(
    (trackId: number, parentNodeId?: string, level?: number, colIndex?: number) =>
      onAddNodeRef.current(trackId, parentNodeId, level, colIndex),
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
  const handlePlayTrack = useCallback(
    (trackId: number, title: string) => togglePlayPause(trackId, title),
    [togglePlayPause],
  );

  // --- View model: 100 x 5 grid ---
  const viewModel: ExplorerCellViewModel[][] = useMemo(() => {
    const nodesByPos = new Map<string, ExplorerNode>();
    for (const n of nodes) {
      nodesByPos.set(`${n.level}-${n.col_index}`, n);
    }

    const grid: ExplorerCellViewModel[][] = [];
    for (let l = 0; l < MAX_LEVELS; l++) {
      const row: ExplorerCellViewModel[] = [];
      for (let c = 0; c < MAX_COLS; c++) {
        row.push({ level: l, colIndex: c, node: nodesByPos.get(`${l}-${c}`) ?? null });
      }
      grid.push(row);
    }
    return grid;
  }, [nodes]);

  // --- Edge score fetching ---
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

  // --- Keyboard handlers ---
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

  // --- Search ---
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

  // --- Node interactions ---
  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSwapSource(null);
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

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string, level: number, colIndex: number) => {
    if (e.button !== 0) return;
    if (swapSourceRef.current) return;
    const target = e.target as Element;
    if (target.closest('.explorer-cell-action-row')) return;
    e.stopPropagation();
    const cx = colIndex * SLOT_W + SLOT_W / 2;
    const cy = TOP_PAD + level * LEVEL_HEIGHT + NODE_H / 2;
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

  // --- Grid mouse handlers for connect-drag ---
  const handleGridMouseMove = useCallback((e: React.MouseEvent, gridX: number, gridY: number) => {
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
      setConnectDrag(prev => prev ? { ...prev, cursorX: gridX, cursorY: gridY } : prev);
    }
  }, []);

  const handleGridMouseUp = useCallback(() => {
    pendingDragRef.current = null;
    if (connectDragRef.current) setConnectDrag(null);
  }, []);

  // --- Cell add (opens sibling modal targeted at exact slot) ---
  const handleCellAdd = useCallback((level: number, colIndex: number) => {
    const nodesAtLevelAbove = nodesRef.current.filter(n => n.level === level - 1);
    const parentIds = nodesAtLevelAbove.map(n => n.node_id);
    setSwapSource(null);
    setSelectedEdgeId(null);
    setSiblingAdd({
      targetLevel: level,
      targetColIndex: colIndex,
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

  // --- Sibling modal ---
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
      await onAddSiblingRef.current(s.id, parentIds, siblingAdd.targetLevel, siblingAdd.targetColIndex);
    } else {
      await stableOnAddNode(s.id, undefined, siblingAdd.targetLevel, siblingAdd.targetColIndex);
    }
    setSiblingAdd(null);
  }, [siblingAdd, stableOnAddNode]);

  // --- Edge interactions ---
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

  const playingTrackId = isAudioPlaying && playingTrack ? playingTrack.id : null;

  return (
    <div className="set-explorer">
      {trees && trees.length > 0 && (
        <div className="explorer-tree-tabs" role="tablist" aria-label="Explorer trees">
          {trees.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === activeTreeId}
              className={`explorer-tree-tab${t.id === activeTreeId ? ' explorer-tree-tab--active' : ''}`}
              onClick={() => onSelectTree?.(t.id)}
            >
              {t.name}
            </button>
          ))}
          {onCreateTree && !showNewTreeInput && (
            <button
              className="explorer-tree-tab explorer-tree-tab--add"
              onClick={() => setShowNewTreeInput(true)}
              title="Create new tree"
            >
              +
            </button>
          )}
          {showNewTreeInput && (
            <span className="explorer-tree-new-inline">
              <input
                ref={newTreeInputRef}
                className="explorer-tree-name-input"
                placeholder="Tree name…"
                value={newTreeName}
                onChange={e => setNewTreeName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateTree();
                  if (e.key === 'Escape') { setShowNewTreeInput(false); setNewTreeName(''); }
                }}
              />
              <select
                className="explorer-tree-mode-select"
                value={newTreeMode}
                onChange={e => setNewTreeMode(e.target.value as 'empty' | 'full_copy' | 'subtree_copy')}
              >
                <option value="empty">Empty</option>
                <option value="full_copy">Copy current</option>
                <option value="subtree_copy">Copy subtree</option>
              </select>
              <button className="explorer-tree-tab explorer-tree-tab--confirm" onClick={handleCreateTree}>Create</button>
              <button className="explorer-tree-tab" onClick={() => { setShowNewTreeInput(false); setNewTreeName(''); }}>Cancel</button>
            </span>
          )}
        </div>
      )}

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

      <ExplorerGrid
        viewModel={viewModel}
        edges={edges}
        nodes={nodes}
        edgeScores={edgeScores}
        loadingEdgeKeys={loadingEdgeKeys}
        selectedEdgeId={selectedEdgeId}
        selectedNodeId={selectedNodeId}
        swapSource={swapSource}
        warningNodeId={warningNodeId ?? null}
        tracklistTrackIds={tracklistTrackIds}
        playingTrackId={playingTrackId}
        connectDrag={connectDrag}
        onEdgeClick={handleEdgeClick}
        onDeleteEdge={handleDeleteEdge}
        onCellAdd={handleCellAdd}
        onNodeClick={handleNodeClick}
        onNodeMouseDown={handleNodeMouseDown}
        onNodeMouseUp={handleNodeMouseUp}
        onSetDeleteTarget={handleSetDeleteTarget}
        onSetSwapSource={onSetSwapSource}
        onOpenChildAdd={openChildAdd}
        onNodeToTracklist={stableOnNodeToTracklist}
        onPlayTrack={handlePlayTrack}
        onGridMouseMove={handleGridMouseMove}
        onGridMouseUp={handleGridMouseUp}
        onBackgroundClick={handleBackgroundClick}
      />

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
            <h3>Add Track to Level {siblingAdd.targetLevel}, Column {siblingAdd.targetColIndex}</h3>
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
});
