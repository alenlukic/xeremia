import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import type { ExplorerNode, ExplorerEdge, ExplorerTree, SearchSuggestion, TransitionMatch } from '../types';
import { searchTracks, fetchMatches } from '../api/http';
import { SetExplorerDeleteModal } from './SetExplorerDeleteModal';
import { ExplorerGrid, type ConnectDragState } from './explorer/ExplorerGrid';
import type { ExplorerCellViewModel } from './explorer/Level';
import { formatOverallScore } from '../utils';
import { stripTitlePrefix } from '../utils/explorer';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { MAX_COLS } from '../dnd';

const NODE_H = 27;
const V_GAP = 132;
const SLOT_W = 292;
const TOP_PAD = 32;
const LABEL_W = 32;
const CELL_NODE_OFFSET_Y = 0;
const LEVEL_HEIGHT = NODE_H + V_GAP;
const MAX_LEVELS = 100;
const DRAG_THRESHOLD = 5;

export interface MoveDragState {
  sourceNodeId: string;
  sourceLevel: number;
  sourceCol: number;
  sourceCX: number;
  sourceCY: number;
  cursorX: number;
  cursorY: number;
  targetLevel: number;
  targetCol: number;
  dropType: 'relocate' | 'reparent' | 'invalid';
}

function isDescendant(edges: ExplorerEdge[], ancestorId: string, candidateId: string): boolean {
  const visited = new Set<string>();
  const queue = [ancestorId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === candidateId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const e of edges) {
      if (e.parent_node_id === current) queue.push(e.child_node_id);
    }
  }
  return false;
}

interface Props {
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
  onAddNode: (trackId: number, parentNodeId?: string, level?: number, colIndex?: number) => void;
  onDeleteNode: (nodeId: string, rewireEdges?: { parent_node_id: string; child_node_id: string }[]) => void;
  onAddEdge: (parentNodeId: string, childNodeId: string) => Promise<void>;
  onDeleteEdge: (edgeId: number) => Promise<void>;
  onSwap: (nodeAId: string, nodeBId: string) => void;
  onMoveNode: (nodeId: string, targetLevel?: number, targetColIndex?: number, newParentNodeId?: string) => void;
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
  onRenameTree?: (treeId: number, name: string) => Promise<boolean>;
  onDeleteTree?: (treeId: number) => Promise<boolean>;
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
  nodes, edges, onAddNode, onDeleteNode, onAddEdge, onDeleteEdge, onSwap, onMoveNode,
  onNodeToTracklist, onAddSibling, tracklistTrackIds, fetchEdgeScores, warningNodeId,
  trees, activeTreeId, onSelectTree, onCreateTree, onRenameTree, onDeleteTree,
}: Props) {
  const [showNewTreeInput, setShowNewTreeInput] = useState(false);
  const [newTreeName, setNewTreeName] = useState('');
  const [newTreeMode, setNewTreeMode] = useState<'empty' | 'full_copy' | 'subtree_copy'>('empty');
  const newTreeInputRef = useRef<HTMLInputElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [renamingTreeId, setRenamingTreeId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameInFlightRef = useRef(false);
  const [deleteConfirmTreeId, setDeleteConfirmTreeId] = useState<number | null>(null);

  useEffect(() => {
    if (showNewTreeInput && newTreeInputRef.current) newTreeInputRef.current.focus();
  }, [showNewTreeInput]);

  useEffect(() => {
    if (renamingTreeId !== null && renameInputRef.current) renameInputRef.current.focus();
  }, [renamingTreeId]);

  const handleCreateTree = useCallback(async () => {
    const name = newTreeName.trim();
    if (!name || !onCreateTree) return;
    const sourceNode = newTreeMode === 'subtree_copy' ? selectedNodeId ?? undefined : undefined;
    await onCreateTree(name, newTreeMode, activeTreeId ?? undefined, sourceNode);
    setNewTreeName('');
    setShowNewTreeInput(false);
    setNewTreeMode('empty');
  }, [newTreeName, newTreeMode, activeTreeId, selectedNodeId, onCreateTree]);

  const handleStartRename = useCallback((treeId: number, currentName: string) => {
    setRenamingTreeId(treeId);
    setRenameValue(currentName);
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (renameInFlightRef.current) return;
    if (renamingTreeId === null || !onRenameTree) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingTreeId(null); return; }
    renameInFlightRef.current = true;
    try {
      await onRenameTree(renamingTreeId, trimmed);
    } finally {
      renameInFlightRef.current = false;
    }
    setRenamingTreeId(null);
  }, [renamingTreeId, renameValue, onRenameTree]);

  const handleConfirmDelete = useCallback(async () => {
    if (deleteConfirmTreeId === null || !onDeleteTree) return;
    await onDeleteTree(deleteConfirmTreeId);
    setDeleteConfirmTreeId(null);
  }, [deleteConfirmTreeId, onDeleteTree]);

  const { track: playingTrack, playing: isAudioPlaying, togglePlayPause } = useAudioPlayer();
  const [deleteTarget, setDeleteTarget] = useState<ExplorerNode | null>(null);
  const [edgeScores, setEdgeScores] = useState<Map<string, number | null>>(new Map());
  const [loadingEdgeKeys, setLoadingEdgeKeys] = useState<Set<string>>(new Set());
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [siblingAdd, setSiblingAdd] = useState<SiblingAddState | null>(null);
  const [childAdd, setChildAdd] = useState<ChildAddState | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [connectDrag, setConnectDrag] = useState<ConnectDragState | null>(null);
  const [moveDrag, setMoveDrag] = useState<MoveDragState | null>(null);

  const scoreCacheRef = useRef(new Map<string, number | null>());
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const connectDragRef = useRef<ConnectDragState | null>(null);
  connectDragRef.current = connectDrag;
  const activeConnectSourceRef = useRef<{
    sourceNodeId: string; sourceLevel: number; sourceCX: number; sourceCY: number;
  } | null>(null);
  const moveDragRef = useRef<MoveDragState | null>(null);
  moveDragRef.current = moveDrag;
  const swapSourceRef = useRef<string | null>(null);
  swapSourceRef.current = swapSource;
  const fetchEdgeScoresRef = useRef(fetchEdgeScores);
  fetchEdgeScoresRef.current = fetchEdgeScores;
  const pendingDragRef = useRef<{
    sourceNodeId: string; sourceLevel: number; sourceCol: number;
    sourceCX: number; sourceCY: number;
    startClientX: number; startClientY: number;
    isMoveDrag: boolean;
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
  const onMoveNodeRef = useRef(onMoveNode);
  onMoveNodeRef.current = onMoveNode;
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
    const cx = LABEL_W + colIndex * SLOT_W + SLOT_W / 2;
    const cy = TOP_PAD + level * LEVEL_HEIGHT + CELL_NODE_OFFSET_Y + NODE_H / 2;
    const nodeEl = target.closest('.explorer-cell-node');
    const rect = nodeEl?.getBoundingClientRect();
    const isMoveDrag = rect && rect.height > 0
      ? (e.clientY - rect.top) < rect.height * (2 / 3)
      : false;

    pendingDragRef.current = {
      sourceNodeId: nodeId,
      sourceLevel: level,
      sourceCol: colIndex,
      sourceCX: cx,
      sourceCY: cy,
      startClientX: e.clientX,
      startClientY: e.clientY,
      isMoveDrag,
    };
  }, []);

  const computeDropType = useCallback((
    sourceNodeId: string, targetLevel: number, targetCol: number,
  ): 'relocate' | 'reparent' | 'invalid' => {
    if (targetLevel < 0 || targetLevel >= MAX_LEVELS || targetCol < 0 || targetCol >= MAX_COLS) {
      return 'invalid';
    }
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const sourceNode = currentNodes.find(n => n.node_id === sourceNodeId);
    if (!sourceNode) return 'invalid';
    if (sourceNode.level === targetLevel && sourceNode.col_index === targetCol) return 'invalid';

    const occupant = currentNodes.find(
      n => n.level === targetLevel && n.col_index === targetCol && n.node_id !== sourceNodeId,
    );

    if (!occupant) return 'relocate';

    if (isDescendant(currentEdges, sourceNodeId, occupant.node_id)) return 'invalid';

    const childLevel = occupant.level + 1;
    if (childLevel >= MAX_LEVELS) return 'invalid';
    const occupiedAtChild = currentNodes.filter(n => n.level === childLevel && n.node_id !== sourceNodeId);
    if (occupiedAtChild.length >= MAX_COLS) return 'invalid';

    return 'reparent';
  }, []);

  const isOverValidConnectTarget = useCallback((
    gridX: number, gridY: number, sourceNodeId: string, sourceLevel: number,
  ): boolean => {
    const tLevel = Math.max(0, Math.min(MAX_LEVELS - 1, Math.floor((gridY - TOP_PAD) / LEVEL_HEIGHT)));
    if (Math.abs(sourceLevel - tLevel) !== 1) return false;
    const tCol = Math.max(0, Math.min(MAX_COLS - 1, Math.floor((gridX - LABEL_W) / SLOT_W)));
    const target = nodesRef.current.find(n => n.level === tLevel && n.col_index === tCol);
    if (!target || target.node_id === sourceNodeId) return false;
    const parentId = sourceNodeId;
    const childId = target.node_id;
    return !edgesRef.current.some(
      e => (e.parent_node_id === parentId && e.child_node_id === childId) ||
           (e.parent_node_id === childId && e.child_node_id === parentId),
    );
  }, []);

  const handleNodeMouseUp = useCallback((nodeId: string, level: number) => {
    if (moveDragRef.current) return;
    const acs = activeConnectSourceRef.current;
    if (!acs) return;
    if (acs.sourceNodeId === nodeId) {
      activeConnectSourceRef.current = null;
      setConnectDrag(null);
      return;
    }
    const srcLevel = acs.sourceLevel;
    const tgtLevel = level;
    if (Math.abs(srcLevel - tgtLevel) === 1) {
      const parentId = srcLevel < tgtLevel ? acs.sourceNodeId : nodeId;
      const childId = srcLevel < tgtLevel ? nodeId : acs.sourceNodeId;
      const alreadyConnected = edgesRef.current.some(
        e => (e.parent_node_id === parentId && e.child_node_id === childId) ||
             (e.parent_node_id === childId && e.child_node_id === parentId),
      );
      if (!alreadyConnected) onAddEdgeRef.current(parentId, childId);
    }
    activeConnectSourceRef.current = null;
    setConnectDrag(null);
  }, []);

  // --- Grid mouse handlers for connect-drag and move-drag ---
  const handleGridMouseMove = useCallback((e: React.MouseEvent, gridX: number, gridY: number) => {
    const md = moveDragRef.current;
    const cd = connectDragRef.current;

    if (pendingDragRef.current && !cd && !md) {
      const pd = pendingDragRef.current;
      const dx = e.clientX - pd.startClientX;
      const dy = e.clientY - pd.startClientY;
      if (Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD) {
        if (pd.isMoveDrag) {
          const tLevel = Math.max(0, Math.min(MAX_LEVELS - 1, Math.floor((gridY - TOP_PAD) / LEVEL_HEIGHT)));
          const tCol = Math.max(0, Math.min(MAX_COLS - 1, Math.floor((gridX - LABEL_W) / SLOT_W)));
          const dropType = computeDropType(pd.sourceNodeId, tLevel, tCol);
          setMoveDrag({
            sourceNodeId: pd.sourceNodeId,
            sourceLevel: pd.sourceLevel,
            sourceCol: pd.sourceCol,
            sourceCX: pd.sourceCX,
            sourceCY: pd.sourceCY,
            cursorX: gridX,
            cursorY: gridY,
            targetLevel: tLevel,
            targetCol: tCol,
            dropType,
          });
        } else {
          activeConnectSourceRef.current = {
            sourceNodeId: pd.sourceNodeId,
            sourceLevel: pd.sourceLevel,
            sourceCX: pd.sourceCX,
            sourceCY: pd.sourceCY,
          };
          if (isOverValidConnectTarget(gridX, gridY, pd.sourceNodeId, pd.sourceLevel)) {
            setConnectDrag({
              sourceNodeId: pd.sourceNodeId,
              sourceLevel: pd.sourceLevel,
              sourceCX: pd.sourceCX,
              sourceCY: pd.sourceCY,
              cursorX: gridX,
              cursorY: gridY,
            });
          }
        }
        pendingDragRef.current = null;
      }
      return;
    }
    if (md) {
      const tLevel = Math.max(0, Math.min(MAX_LEVELS - 1, Math.floor((gridY - TOP_PAD) / LEVEL_HEIGHT)));
      const tCol = Math.max(0, Math.min(MAX_COLS - 1, Math.floor((gridX - LABEL_W) / SLOT_W)));
      const dropType = computeDropType(md.sourceNodeId, tLevel, tCol);
      setMoveDrag(prev => prev ? { ...prev, cursorX: gridX, cursorY: gridY, targetLevel: tLevel, targetCol: tCol, dropType } : prev);
      return;
    }
    const acs = activeConnectSourceRef.current;
    if (acs) {
      if (isOverValidConnectTarget(gridX, gridY, acs.sourceNodeId, acs.sourceLevel)) {
        setConnectDrag({
          sourceNodeId: acs.sourceNodeId,
          sourceLevel: acs.sourceLevel,
          sourceCX: acs.sourceCX,
          sourceCY: acs.sourceCY,
          cursorX: gridX,
          cursorY: gridY,
        });
      } else if (connectDragRef.current) {
        setConnectDrag(null);
      }
    }
  }, [computeDropType, isOverValidConnectTarget]);

  const handleGridMouseUp = useCallback(() => {
    pendingDragRef.current = null;
    const md = moveDragRef.current;
    if (md) {
      if (md.dropType === 'relocate') {
        onMoveNodeRef.current(md.sourceNodeId, md.targetLevel, md.targetCol);
      } else if (md.dropType === 'reparent') {
        const targetNode = nodesRef.current.find(
          n => n.level === md.targetLevel && n.col_index === md.targetCol,
        );
        if (targetNode) {
          onMoveNodeRef.current(md.sourceNodeId, undefined, undefined, targetNode.node_id);
        }
      }
      setMoveDrag(null);
      return;
    }
    activeConnectSourceRef.current = null;
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
            <span key={t.id} className="explorer-tree-tab-wrapper">
              {renamingTreeId === t.id ? (
                <input
                  ref={renameInputRef}
                  className="explorer-tree-name-input explorer-tree-rename-input"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmRename();
                    if (e.key === 'Escape') setRenamingTreeId(null);
                  }}
                  onBlur={handleConfirmRename}
                  data-testid="tree-rename-input"
                />
              ) : (
                <button
                  role="tab"
                  aria-selected={t.id === activeTreeId}
                  className={`explorer-tree-tab${t.id === activeTreeId ? ' explorer-tree-tab--active' : ''}`}
                  onClick={() => onSelectTree?.(t.id)}
                  onDoubleClick={() => onRenameTree && handleStartRename(t.id, t.name)}
                >
                  {t.name}
                </button>
              )}
              {t.id === activeTreeId && renamingTreeId !== t.id && (
                <>
                  {onRenameTree && (
                    <button
                      className="explorer-tree-action"
                      onClick={() => handleStartRename(t.id, t.name)}
                      aria-label="Rename tree"
                      data-testid="tree-rename-btn"
                      title="Rename tree"
                    >✎</button>
                  )}
                  {onDeleteTree && trees.length > 0 && (
                    <button
                      className="explorer-tree-action explorer-tree-action--danger"
                      onClick={() => setDeleteConfirmTreeId(t.id)}
                      aria-label="Delete tree"
                      data-testid="tree-delete-btn"
                      title="Delete tree"
                    >×</button>
                  )}
                </>
              )}
            </span>
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

      {swapSource && (
        <div className="set-explorer-controls">
          <span className="set-explorer-swap-hint">Click another node to swap</span>
        </div>
      )}

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
        moveDrag={moveDrag}
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
            <h3>Add Track — Row {siblingAdd.targetLevel + 1}</h3>
            <p className="text-muted">
              Add a track at row {siblingAdd.targetLevel + 1}
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
                      {' '}{pNode?.track?.title ? stripTitlePrefix(pNode.track.title) : pid}
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
              Matches for <strong>{childAdd.parentNode.track?.title ? stripTitlePrefix(childAdd.parentNode.track.title) : childAdd.parentNode.node_id}</strong>
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
                    <button
                      className="play-btn"
                      onClick={e => { e.stopPropagation(); handlePlayTrack(m.candidate_id, m.title); }}
                      aria-label={playingTrackId === m.candidate_id ? 'Pause' : 'Play'}
                      data-testid="child-match-play-btn"
                    >
                      {playingTrackId === m.candidate_id ? '⏸' : '▶'}
                    </button>
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

      {deleteConfirmTreeId !== null && (
        <div className="explorer-delete-overlay" onClick={() => setDeleteConfirmTreeId(null)}>
          <div className="explorer-delete-modal" onClick={e => e.stopPropagation()} data-testid="tree-delete-modal">
            <h3>Delete Tree</h3>
            <p className="text-muted">
              Delete &ldquo;{trees?.find(t => t.id === deleteConfirmTreeId)?.name}&rdquo;? All nodes and edges in this tree will be removed.
            </p>
            <div className="explorer-delete-buttons">
              <button
                className="set-action-btn set-action-btn--danger"
                onClick={handleConfirmDelete}
                data-testid="tree-delete-confirm"
              >Delete</button>
              <button
                className="set-action-btn"
                onClick={() => setDeleteConfirmTreeId(null)}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
