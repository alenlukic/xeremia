import { useState, useCallback, type MutableRefObject } from 'react';
import type { HydratedSet, ExplorerTree } from '../types';
import { friendlyError } from './useWorkspaceState';
import {
  explorerAddNode, explorerDeleteNode, explorerAddEdge, explorerDeleteEdge,
  explorerSwap, explorerMoveNode, explorerNodeToTracklist, explorerEdgeScores,
  explorerCreateTree, explorerRenameTree, explorerDeleteTree,
  emptyRowAdd as apiEmptyRowAdd,
  emptyRowDelete as apiEmptyRowDelete,
  emptyRowReorder as apiEmptyRowReorder,
} from '../api/http';

interface ExplorerDeps {
  activeSetId: number | null;
  activeSet: HydratedSet | null;
  refreshActive: () => Promise<void>;
  setErrorWithAutoClear: (msg: string) => void;
  mountedRef: MutableRefObject<boolean>;
}

export function useExplorerState({
  activeSetId, activeSet, refreshActive, setErrorWithAutoClear, mountedRef,
}: ExplorerDeps) {
  const [activeTreeId, setActiveTreeId] = useState<number | null>(null);

  const syncTreeId = useCallback((data: HydratedSet) => {
    if (data.explorer_trees.length > 0) {
      setActiveTreeId(prev => {
        if (prev !== null && data.explorer_trees.some(t => t.id === prev)) return prev;
        return data.explorer_trees[0].id;
      });
    } else {
      setActiveTreeId(null);
    }
  }, []);

  const addExplorerNode = useCallback(async (
    trackId: number, parentNodeId?: string, level: number = 0, colIndex?: number,
  ) => {
    if (activeSetId === null) return null;
    try {
      const treeNodes = activeTreeId !== null && activeSet
        ? activeSet.explorer_nodes.filter(n => n.tree_id === activeTreeId)
        : activeSet?.explorer_nodes ?? [];
      if (colIndex === undefined && parentNodeId && activeSet) {
        const parentNode = treeNodes.find(n => n.node_id === parentNodeId);
        if (parentNode) {
          const targetLevel = parentNode.level + 1;
          const existing = treeNodes.find(
            n => n.track_id === trackId && n.level === targetLevel,
          );
          if (existing) {
            await explorerAddEdge(activeSetId, parentNodeId, existing.node_id);
            await refreshActive();
            return { node_id: existing.node_id, track_id: trackId, level: targetLevel };
          }
        }
      }
      const result = await explorerAddNode(activeSetId, trackId, parentNodeId, level, activeTreeId ?? undefined, colIndex);
      await refreshActive();
      return result;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add node.'));
      return null;
    }
  }, [activeSetId, activeSet, activeTreeId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const deleteExplorerNode = useCallback(async (
    nodeId: string,
    rewireEdges?: { parent_node_id: string; child_node_id: string }[],
  ) => {
    if (activeSetId === null) return;
    try {
      await explorerDeleteNode(activeSetId, nodeId, rewireEdges);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete node.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const addExplorerEdge = useCallback(async (parentNodeId: string, childNodeId: string) => {
    if (activeSetId === null) return;
    if (activeSet?.explorer_edges.some(
      e => e.parent_node_id === parentNodeId && e.child_node_id === childNodeId,
    )) {
      return;
    }
    try {
      await explorerAddEdge(activeSetId, parentNodeId, childNodeId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add edge.'));
    }
  }, [activeSetId, activeSet, refreshActive, setErrorWithAutoClear, mountedRef]);

  const deleteExplorerEdgeAction = useCallback(async (edgeId: number) => {
    if (activeSetId === null) return;
    try {
      await explorerDeleteEdge(activeSetId, edgeId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete edge.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const addSiblingNode = useCallback(async (
    trackId: number,
    inheritParentIds: string[],
    level: number,
    colIndex?: number,
  ) => {
    if (activeSetId === null) return null;
    try {
      const firstParent = inheritParentIds[0];
      const result = await explorerAddNode(activeSetId, trackId, firstParent, level, activeTreeId ?? undefined, colIndex);
      if (!result) return null;
      for (let i = 1; i < inheritParentIds.length; i++) {
        await explorerAddEdge(activeSetId, inheritParentIds[i], result.node_id);
      }
      await refreshActive();
      return result;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add sibling.'));
      return null;
    }
  }, [activeSetId, activeTreeId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const swapExplorerNodes = useCallback(async (nodeAId: string, nodeBId: string) => {
    if (activeSetId === null) return;
    try {
      await explorerSwap(activeSetId, nodeAId, nodeBId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not swap nodes.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const moveExplorerNodeAction = useCallback(async (
    nodeId: string,
    targetLevel?: number,
    targetColIndex?: number,
    newParentNodeId?: string,
  ) => {
    if (activeSetId === null) return;
    try {
      await explorerMoveNode(activeSetId, nodeId, targetLevel, targetColIndex, newParentNodeId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not move node.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const explorerNodeAddToTracklist = useCallback(async (nodeId: string) => {
    if (activeSetId === null) return;
    try {
      await explorerNodeToTracklist(activeSetId, nodeId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add to tracklist.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const fetchEdgeScores = useCallback(async (pairs: [number, number][]) => {
    if (activeSetId === null) return { scores: [] as (number | null)[] };
    return explorerEdgeScores(activeSetId, pairs);
  }, [activeSetId]);

  const selectTree = useCallback((treeId: number) => {
    setActiveTreeId(treeId);
  }, []);

  const createTree = useCallback(async (
    name: string,
    mode: 'empty' | 'full_copy' | 'subtree_copy' = 'empty',
    sourceTreeId?: number,
    sourceNodeId?: string,
  ): Promise<ExplorerTree | null> => {
    if (activeSetId === null) return null;
    try {
      const tree = await explorerCreateTree(activeSetId, name, mode, sourceTreeId, sourceNodeId);
      await refreshActive();
      if (mountedRef.current) setActiveTreeId(tree.id);
      return tree;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not create tree.'));
      return null;
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const renameTree = useCallback(async (treeId: number, name: string): Promise<boolean> => {
    if (activeSetId === null) return false;
    try {
      await explorerRenameTree(activeSetId, treeId, name);
      await refreshActive();
      return true;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not rename tree.'));
      return false;
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const deleteTree = useCallback(async (treeId: number): Promise<boolean> => {
    if (activeSetId === null) return false;
    try {
      await explorerDeleteTree(activeSetId, treeId);
      await refreshActive();
      return true;
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete tree.'));
      return false;
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const addEmptyRows = useCallback(async (surface: 'tracklist' | 'pool', count: number, position: number) => {
    if (activeSetId === null) return;
    try {
      await apiEmptyRowAdd(activeSetId, surface, count, position);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not add empty rows.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const deleteEmptyRow = useCallback(async (emptyRowId: number) => {
    if (activeSetId === null) return;
    try {
      await apiEmptyRowDelete(activeSetId, emptyRowId);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not delete empty row.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  const reorderEmptyRow = useCallback(async (emptyRowId: number, newPosition: number) => {
    if (activeSetId === null) return;
    try {
      await apiEmptyRowReorder(activeSetId, emptyRowId, newPosition);
      await refreshActive();
    } catch (err) {
      if (mountedRef.current) setErrorWithAutoClear(friendlyError(err, 'Could not reorder empty row.'));
    }
  }, [activeSetId, refreshActive, setErrorWithAutoClear, mountedRef]);

  return {
    activeTreeId,
    syncTreeId,
    selectTree,
    createTree,
    renameTree,
    deleteTree,
    addExplorerNode,
    deleteExplorerNode,
    addExplorerEdge,
    deleteExplorerEdge: deleteExplorerEdgeAction,
    addSiblingNode,
    swapExplorerNodes,
    moveExplorerNode: moveExplorerNodeAction,
    explorerNodeAddToTracklist,
    fetchEdgeScores,
    addEmptyRows,
    deleteEmptyRow,
    reorderEmptyRow,
  };
}
