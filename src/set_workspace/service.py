"""Set workspace orchestration service.

Handles set CRUD, pool/tracklist mutations with mutual exclusivity,
and explorer graph mutations with constraint validation.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from src.models.dj_set import DjSet
from src.models.set_pool_entry import SetPoolEntry
from src.models.set_pool_subgroup import SetPoolSubgroup
from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
from src.models.set_tracklist_entry import SetTracklistEntry
from src.models.set_explorer_tree import SetExplorerTree
from src.models.set_explorer_node import SetExplorerNode
from src.models.set_explorer_edge import SetExplorerEdge
from src.set_workspace.explorer_rules import validate_add_node, validate_move_node

logger = logging.getLogger(__name__)


class SetWorkspaceService:
    def __init__(self, session):
        self.session = session

    # --- Set CRUD ---

    def list_sets(self) -> List[DjSet]:
        return self.session.query(DjSet).order_by(DjSet.created_at.desc()).all()

    def create_set(self, name: str) -> DjSet:
        dj_set = DjSet(name=name)
        self.session.add(dj_set)
        self.session.flush()
        return dj_set

    def get_set(self, set_id: int) -> Optional[DjSet]:
        return self.session.query(DjSet).filter_by(id=set_id).first()

    def update_set(self, set_id: int, name: str) -> Optional[DjSet]:
        dj_set = self.get_set(set_id)
        if dj_set is None:
            return None
        dj_set.name = name
        self.session.flush()
        return dj_set

    def delete_set(self, set_id: int) -> bool:
        dj_set = self.get_set(set_id)
        if dj_set is None:
            return False
        self.session.query(SetExplorerEdge).filter_by(set_id=set_id).delete()
        self.session.query(SetExplorerNode).filter_by(set_id=set_id).delete()
        self.session.query(SetExplorerTree).filter_by(set_id=set_id).delete()
        self.session.query(SetTracklistEntry).filter_by(set_id=set_id).delete()
        subgroup_ids = [
            sg.id for sg in
            self.session.query(SetPoolSubgroup.id).filter_by(set_id=set_id).all()
        ]
        if subgroup_ids:
            self.session.query(SetPoolSubgroupMember).filter(
                SetPoolSubgroupMember.subgroup_id.in_(subgroup_ids),
            ).delete(synchronize_session="fetch")
        self.session.query(SetPoolSubgroup).filter_by(set_id=set_id).delete()
        self.session.query(SetPoolEntry).filter_by(set_id=set_id).delete()
        self.session.delete(dj_set)
        self.session.flush()
        return True

    # --- Hydration ---

    def hydrate_set(self, set_id: int) -> Optional[Dict[str, Any]]:
        dj_set = self.get_set(set_id)
        if dj_set is None:
            return None

        pool = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        tracklist = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id)
            .order_by(SetTracklistEntry.position)
            .all()
        )
        trees = (
            self.session.query(SetExplorerTree)
            .filter_by(set_id=set_id)
            .order_by(SetExplorerTree.created_at)
            .all()
        )
        nodes = self.session.query(SetExplorerNode).filter_by(set_id=set_id).all()
        edges = self.session.query(SetExplorerEdge).filter_by(set_id=set_id).all()

        subgroups = (
            self.session.query(SetPoolSubgroup)
            .filter_by(set_id=set_id)
            .order_by(SetPoolSubgroup.display_order)
            .all()
        )
        subgroup_ids = [sg.id for sg in subgroups]
        memberships: List[SetPoolSubgroupMember] = []
        if subgroup_ids:
            memberships = (
                self.session.query(SetPoolSubgroupMember)
                .filter(SetPoolSubgroupMember.subgroup_id.in_(subgroup_ids))
                .all()
            )

        return {
            "set": dj_set,
            "pool": pool,
            "tracklist": tracklist,
            "explorer_trees": trees,
            "explorer_nodes": nodes,
            "explorer_edges": edges,
            "pool_subgroups": subgroups,
            "pool_subgroup_memberships": memberships,
        }

    # --- Pool operations ---

    def pool_add(self, set_id: int, track_id: int) -> Tuple[Optional[SetPoolEntry], Optional[str]]:
        existing = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if existing:
            return existing, None

        in_tracklist = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if in_tracklist:
            return None, "Track is already in the tracklist for this set"

        max_order = (
            self.session.query(SetPoolEntry.insertion_order)
            .filter_by(set_id=set_id)
            .order_by(SetPoolEntry.insertion_order.desc())
            .first()
        )
        next_order = (max_order[0] + 1) if max_order else 0

        entry = SetPoolEntry(set_id=set_id, track_id=track_id, insertion_order=next_order)
        self.session.add(entry)
        self.session.flush()
        return entry, None

    def pool_remove(self, set_id: int, track_id: int) -> bool:
        entry = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if entry is None:
            return False
        self.session.query(SetPoolSubgroupMember).filter_by(
            pool_entry_id=entry.id,
        ).delete()
        self.session.delete(entry)
        self.session.flush()
        return True

    def pool_list(self, set_id: int) -> List[SetPoolEntry]:
        return (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )

    def pool_clear(self, set_id: int) -> int:
        pool_ids = [
            e.id for e in
            self.session.query(SetPoolEntry.id).filter_by(set_id=set_id).all()
        ]
        if pool_ids:
            self.session.query(SetPoolSubgroupMember).filter(
                SetPoolSubgroupMember.pool_entry_id.in_(pool_ids),
            ).delete(synchronize_session="fetch")
        count = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id)
            .delete()
        )
        self.session.flush()
        return count

    def pool_move_to_tracklist(self, set_id: int, track_id: int) -> Tuple[bool, Optional[str]]:
        pool_entry = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if pool_entry is None:
            return False, "Track not found in pool"

        max_pos = (
            self.session.query(SetTracklistEntry.position)
            .filter_by(set_id=set_id)
            .order_by(SetTracklistEntry.position.desc())
            .first()
        )
        next_pos = (max_pos[0] + 1) if max_pos else 0

        starred = pool_entry.starred
        self.session.query(SetPoolSubgroupMember).filter_by(
            pool_entry_id=pool_entry.id,
        ).delete()
        self.session.delete(pool_entry)
        tracklist_entry = SetTracklistEntry(
            set_id=set_id, track_id=track_id, position=next_pos,
            starred=starred,
        )
        self.session.add(tracklist_entry)
        self.session.flush()
        return True, None

    # --- Pool subgroup operations ---

    def subgroup_create(self, set_id: int, name: str) -> SetPoolSubgroup:
        max_order = (
            self.session.query(SetPoolSubgroup.display_order)
            .filter_by(set_id=set_id)
            .order_by(SetPoolSubgroup.display_order.desc())
            .first()
        )
        next_order = (max_order[0] + 1) if max_order else 0
        sg = SetPoolSubgroup(set_id=set_id, name=name, display_order=next_order)
        self.session.add(sg)
        self.session.flush()
        return sg

    def subgroup_rename(self, set_id: int, subgroup_id: int, name: str) -> Optional[SetPoolSubgroup]:
        sg = (
            self.session.query(SetPoolSubgroup)
            .filter_by(id=subgroup_id, set_id=set_id)
            .first()
        )
        if sg is None:
            return None
        sg.name = name
        self.session.flush()
        return sg

    def subgroup_delete(self, set_id: int, subgroup_id: int) -> bool:
        sg = (
            self.session.query(SetPoolSubgroup)
            .filter_by(id=subgroup_id, set_id=set_id)
            .first()
        )
        if sg is None:
            return False
        self.session.query(SetPoolSubgroupMember).filter_by(
            subgroup_id=subgroup_id,
        ).delete()
        removed_order = sg.display_order
        self.session.delete(sg)
        later = (
            self.session.query(SetPoolSubgroup)
            .filter(
                SetPoolSubgroup.set_id == set_id,
                SetPoolSubgroup.display_order > removed_order,
            )
            .order_by(SetPoolSubgroup.display_order)
            .all()
        )
        for s in later:
            s.display_order -= 1
        self.session.flush()
        return True

    def subgroup_reorder(self, set_id: int, subgroup_ids: List[int]) -> bool:
        subgroups = (
            self.session.query(SetPoolSubgroup)
            .filter(
                SetPoolSubgroup.set_id == set_id,
                SetPoolSubgroup.id.in_(subgroup_ids),
            )
            .all()
        )
        sg_map = {sg.id: sg for sg in subgroups}
        for idx, sg_id in enumerate(subgroup_ids):
            sg = sg_map.get(sg_id)
            if sg is not None:
                sg.display_order = idx
        self.session.flush()
        return True

    def subgroup_add_track(
        self, subgroup_id: int, pool_entry_id: int,
    ) -> Tuple[Optional[SetPoolSubgroupMember], bool]:
        existing = (
            self.session.query(SetPoolSubgroupMember)
            .filter_by(subgroup_id=subgroup_id, pool_entry_id=pool_entry_id)
            .first()
        )
        if existing:
            return existing, False
        member = SetPoolSubgroupMember(
            subgroup_id=subgroup_id, pool_entry_id=pool_entry_id,
        )
        self.session.add(member)
        self.session.flush()
        return member, True

    def subgroup_remove_track(self, subgroup_id: int, pool_entry_id: int) -> bool:
        member = (
            self.session.query(SetPoolSubgroupMember)
            .filter_by(subgroup_id=subgroup_id, pool_entry_id=pool_entry_id)
            .first()
        )
        if member is None:
            return False
        self.session.delete(member)
        self.session.flush()
        return True

    # --- Tracklist operations ---

    def tracklist_add(self, set_id: int, track_id: int) -> Tuple[Optional[SetTracklistEntry], Optional[str]]:
        existing = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if existing:
            return existing, None

        in_pool = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if in_pool:
            return None, "Track is already in the pool for this set"

        max_pos = (
            self.session.query(SetTracklistEntry.position)
            .filter_by(set_id=set_id)
            .order_by(SetTracklistEntry.position.desc())
            .first()
        )
        next_pos = (max_pos[0] + 1) if max_pos else 0

        entry = SetTracklistEntry(set_id=set_id, track_id=track_id, position=next_pos)
        self.session.add(entry)
        self.session.flush()
        return entry, None

    def tracklist_clear(self, set_id: int) -> int:
        count = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id)
            .delete()
        )
        self.session.flush()
        return count

    def tracklist_remove(self, set_id: int, track_id: int) -> bool:
        entry = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if entry is None:
            return False
        removed_pos = entry.position
        self.session.delete(entry)
        self.session.flush()
        later = (
            self.session.query(SetTracklistEntry)
            .filter(
                SetTracklistEntry.set_id == set_id,
                SetTracklistEntry.position > removed_pos,
            )
            .order_by(SetTracklistEntry.position)
            .all()
        )
        for e in later:
            e.position -= 1
        self.session.flush()
        return True

    def tracklist_reorder(self, set_id: int, track_id: int, new_position: int) -> Tuple[bool, Optional[str]]:
        entry = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if entry is None:
            return False, "Track not found in tracklist"

        old_pos = entry.position
        if old_pos == new_position:
            return True, None

        entries = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id)
            .order_by(SetTracklistEntry.position)
            .all()
        )
        max_pos = len(entries) - 1
        new_position = max(0, min(new_position, max_pos))

        if old_pos < new_position:
            for e in entries:
                if old_pos < e.position <= new_position:
                    e.position -= 1
        else:
            for e in entries:
                if new_position <= e.position < old_pos:
                    e.position += 1
        entry.position = new_position
        self.session.flush()
        return True, None

    def update_tracklist_note(self, set_id: int, track_id: int, note: str) -> Tuple[bool, Optional[str]]:
        entry = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if entry is None:
            return False, "Track not found in tracklist"
        entry.note = note
        self.session.flush()
        return True, None

    def tracklist_move_to_pool(self, set_id: int, track_id: int) -> Tuple[bool, Optional[str]]:
        tl_entry = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if tl_entry is None:
            return False, "Track not found in tracklist"

        removed_pos = tl_entry.position
        starred = tl_entry.starred
        self.session.delete(tl_entry)
        self.session.flush()
        later = (
            self.session.query(SetTracklistEntry)
            .filter(
                SetTracklistEntry.set_id == set_id,
                SetTracklistEntry.position > removed_pos,
            )
            .order_by(SetTracklistEntry.position)
            .all()
        )
        for e in later:
            e.position -= 1

        max_order = (
            self.session.query(SetPoolEntry.insertion_order)
            .filter_by(set_id=set_id)
            .order_by(SetPoolEntry.insertion_order.desc())
            .first()
        )
        next_order = (max_order[0] + 1) if max_order else 0

        pool_entry = SetPoolEntry(
            set_id=set_id, track_id=track_id, insertion_order=next_order,
            starred=starred,
        )
        self.session.add(pool_entry)
        self.session.flush()
        return True, None

    # --- Star toggle (set-scoped, synchronized across pool+tracklist) ---

    def toggle_pool_star(self, set_id: int, track_id: int, starred: bool) -> Tuple[bool, Optional[str]]:
        entry = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if entry is None:
            return False, "Track not found in pool"
        entry.starred = starred
        tl_entry = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if tl_entry is not None:
            tl_entry.starred = starred
        self.session.flush()
        return True, None

    def toggle_tracklist_star(self, set_id: int, track_id: int, starred: bool) -> Tuple[bool, Optional[str]]:
        entry = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if entry is None:
            return False, "Track not found in tracklist"
        entry.starred = starred
        pool_entry = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if pool_entry is not None:
            pool_entry.starred = starred
        self.session.flush()
        return True, None

    # --- Explorer tree operations ---

    def list_explorer_trees(self, set_id: int) -> List[SetExplorerTree]:
        return (
            self.session.query(SetExplorerTree)
            .filter_by(set_id=set_id)
            .order_by(SetExplorerTree.created_at)
            .all()
        )

    def get_or_create_default_tree(self, set_id: int) -> SetExplorerTree:
        tree = (
            self.session.query(SetExplorerTree)
            .filter_by(set_id=set_id, name="Main")
            .first()
        )
        if tree is None:
            tree = SetExplorerTree(set_id=set_id, name="Main")
            self.session.add(tree)
            self.session.flush()
        return tree

    def create_explorer_tree(
        self,
        set_id: int,
        name: str,
        mode: str = "empty",
        source_tree_id: Optional[int] = None,
        source_node_id: Optional[str] = None,
    ) -> Tuple[Optional[SetExplorerTree], Optional[str]]:
        existing = (
            self.session.query(SetExplorerTree)
            .filter_by(set_id=set_id, name=name)
            .first()
        )
        if existing:
            return None, f"A tree named '{name}' already exists in this set"

        tree = SetExplorerTree(set_id=set_id, name=name)
        self.session.add(tree)
        self.session.flush()

        if mode == "full_copy" and source_tree_id is not None:
            err = self._copy_tree(set_id, source_tree_id, tree.id, subtree_root_node_id=None)
            if err:
                return None, err
        elif mode == "subtree_copy" and source_tree_id is not None and source_node_id is not None:
            err = self._copy_tree(set_id, source_tree_id, tree.id, subtree_root_node_id=source_node_id)
            if err:
                return None, err

        return tree, None

    def rename_explorer_tree(
        self,
        set_id: int,
        tree_id: int,
        new_name: str,
    ) -> Tuple[Optional[SetExplorerTree], Optional[str]]:
        tree = (
            self.session.query(SetExplorerTree)
            .filter_by(id=tree_id, set_id=set_id)
            .first()
        )
        if tree is None:
            return None, "Tree not found"
        dup = (
            self.session.query(SetExplorerTree)
            .filter_by(set_id=set_id, name=new_name)
            .filter(SetExplorerTree.id != tree_id)
            .first()
        )
        if dup:
            return None, f"A tree named '{new_name}' already exists in this set"
        tree.name = new_name
        self.session.flush()
        return tree, None

    def delete_explorer_tree(
        self,
        set_id: int,
        tree_id: int,
    ) -> Tuple[bool, Optional[str]]:
        tree = (
            self.session.query(SetExplorerTree)
            .filter_by(id=tree_id, set_id=set_id)
            .first()
        )
        if tree is None:
            return False, "Tree not found"
        self.session.query(SetExplorerEdge).filter_by(
            set_id=set_id, tree_id=tree_id,
        ).delete()
        self.session.query(SetExplorerNode).filter_by(
            set_id=set_id, tree_id=tree_id,
        ).delete()
        self.session.delete(tree)
        self.session.flush()
        return True, None

    def _copy_tree(
        self,
        set_id: int,
        source_tree_id: int,
        target_tree_id: int,
        subtree_root_node_id: Optional[str],
    ) -> Optional[str]:
        source_nodes = (
            self.session.query(SetExplorerNode)
            .filter_by(set_id=set_id, tree_id=source_tree_id)
            .all()
        )
        source_edges = (
            self.session.query(SetExplorerEdge)
            .filter_by(set_id=set_id, tree_id=source_tree_id)
            .all()
        )

        if subtree_root_node_id is not None:
            descendants = self._collect_descendants(
                subtree_root_node_id, source_nodes, source_edges,
            )
            node_ids_to_copy = descendants | {subtree_root_node_id}
            source_nodes = [n for n in source_nodes if n.node_id in node_ids_to_copy]
            source_edges = [
                e for e in source_edges
                if e.parent_node_id in node_ids_to_copy and e.child_node_id in node_ids_to_copy
            ]

        node_id_map: Dict[str, str] = {}
        for n in source_nodes:
            new_id = str(uuid.uuid4())[:8]
            node_id_map[n.node_id] = new_id
            new_node = SetExplorerNode(
                set_id=set_id,
                tree_id=target_tree_id,
                node_id=new_id,
                track_id=n.track_id,
                level=n.level,
                col_index=n.col_index,
            )
            self.session.add(new_node)

        for e in source_edges:
            if subtree_root_node_id is not None and e.child_node_id == subtree_root_node_id:
                continue
            new_parent = node_id_map.get(e.parent_node_id)
            new_child = node_id_map.get(e.child_node_id)
            if new_parent and new_child:
                new_edge = SetExplorerEdge(
                    set_id=set_id,
                    tree_id=target_tree_id,
                    parent_node_id=new_parent,
                    child_node_id=new_child,
                )
                self.session.add(new_edge)

        self.session.flush()
        return None

    def _collect_descendants(
        self,
        root_node_id: str,
        nodes: List[SetExplorerNode],
        edges: List[SetExplorerEdge],
    ) -> set:
        children_map: Dict[str, List[str]] = {}
        for e in edges:
            children_map.setdefault(e.parent_node_id, []).append(e.child_node_id)

        result: set = set()
        stack = list(children_map.get(root_node_id, []))
        while stack:
            nid = stack.pop()
            if nid not in result:
                result.add(nid)
                stack.extend(children_map.get(nid, []))
        return result

    # --- Explorer operations ---

    def _get_explorer_state(self, set_id: int, tree_id: Optional[int] = None):
        q_nodes = self.session.query(SetExplorerNode).filter_by(set_id=set_id)
        q_edges = self.session.query(SetExplorerEdge).filter_by(set_id=set_id)
        if tree_id is not None:
            q_nodes = q_nodes.filter_by(tree_id=tree_id)
            q_edges = q_edges.filter_by(tree_id=tree_id)
        nodes = q_nodes.all()
        edges = q_edges.all()
        edge_tuples = [(e.parent_node_id, e.child_node_id) for e in edges]
        nodes_by_level: Dict[int, int] = {}
        for n in nodes:
            nodes_by_level[n.level] = nodes_by_level.get(n.level, 0) + 1
        return nodes, edges, edge_tuples, nodes_by_level

    def explorer_add_node(
        self,
        set_id: int,
        track_id: int,
        parent_node_id: Optional[str] = None,
        level: int = 0,
        tree_id: Optional[int] = None,
        col_index: Optional[int] = None,
    ) -> Tuple[Optional[SetExplorerNode], Optional[str]]:
        if tree_id is None:
            tree = self.get_or_create_default_tree(set_id)
            tree_id = tree.id

        nodes, edges, edge_tuples, nodes_by_level = self._get_explorer_state(set_id, tree_id)
        node_id = str(uuid.uuid4())[:8]

        error = validate_add_node(
            edge_tuples, nodes_by_level, len(nodes),
            parent_node_id, node_id, level,
        )
        if error:
            return None, error

        occupied = {n.col_index for n in nodes if n.level == level}

        if col_index is not None:
            if col_index < 0 or col_index > 4:
                return None, f"col_index must be 0–4, got {col_index}"
            if col_index in occupied:
                return None, f"Slot ({level}, {col_index}) is already occupied"
        else:
            col_index = next(i for i in range(len(occupied) + 1) if i not in occupied)

        node = SetExplorerNode(
            set_id=set_id, tree_id=tree_id, node_id=node_id, track_id=track_id,
            level=level, col_index=col_index,
        )
        self.session.add(node)

        if parent_node_id is not None:
            edge = SetExplorerEdge(
                set_id=set_id,
                tree_id=tree_id,
                parent_node_id=parent_node_id,
                child_node_id=node_id,
            )
            self.session.add(edge)

        self.session.flush()
        return node, None

    def explorer_add_edge(
        self, set_id: int, parent_node_id: str, child_node_id: str,
        tree_id: Optional[int] = None,
    ) -> Tuple[Optional[SetExplorerEdge], Optional[str]]:
        if tree_id is None:
            parent_node = (
                self.session.query(SetExplorerNode)
                .filter_by(set_id=set_id, node_id=parent_node_id)
                .first()
            )
            if parent_node:
                tree_id = parent_node.tree_id
            else:
                tree = self.get_or_create_default_tree(set_id)
                tree_id = tree.id

        _, _, edge_tuples, _ = self._get_explorer_state(set_id, tree_id)

        from src.set_workspace.explorer_rules import detect_cycle
        if detect_cycle(edge_tuples, parent_node_id, child_node_id):
            return None, "Adding this edge would create a cycle"

        existing = (
            self.session.query(SetExplorerEdge)
            .filter_by(
                set_id=set_id,
                parent_node_id=parent_node_id,
                child_node_id=child_node_id,
            )
            .first()
        )
        if existing:
            return existing, None

        edge = SetExplorerEdge(
            set_id=set_id,
            tree_id=tree_id,
            parent_node_id=parent_node_id,
            child_node_id=child_node_id,
        )
        self.session.add(edge)
        self.session.flush()
        return edge, None

    def explorer_delete_node(
        self,
        set_id: int,
        node_id: str,
        rewire_edges: Optional[List[Dict[str, str]]] = None,
    ) -> Tuple[bool, Optional[str]]:
        node = (
            self.session.query(SetExplorerNode)
            .filter_by(set_id=set_id, node_id=node_id)
            .first()
        )
        if node is None:
            return False, "Node not found"

        incoming = (
            self.session.query(SetExplorerEdge)
            .filter_by(set_id=set_id, child_node_id=node_id)
            .all()
        )
        outgoing = (
            self.session.query(SetExplorerEdge)
            .filter_by(set_id=set_id, parent_node_id=node_id)
            .all()
        )

        parent_ids = {e.parent_node_id for e in incoming}
        child_ids = {e.child_node_id for e in outgoing}

        if rewire_edges:
            for re in rewire_edges:
                if re["parent_node_id"] not in parent_ids:
                    return False, f"Rewire parent {re['parent_node_id']} is not a parent of deleted node"
                if re["child_node_id"] not in child_ids:
                    return False, f"Rewire child {re['child_node_id']} is not a child of deleted node"

        for edge in incoming + outgoing:
            self.session.delete(edge)

        if rewire_edges:
            for re in rewire_edges:
                existing = (
                    self.session.query(SetExplorerEdge)
                    .filter_by(
                        set_id=set_id,
                        parent_node_id=re["parent_node_id"],
                        child_node_id=re["child_node_id"],
                    )
                    .first()
                )
                if not existing:
                    new_edge = SetExplorerEdge(
                        set_id=set_id,
                        tree_id=node.tree_id,
                        parent_node_id=re["parent_node_id"],
                        child_node_id=re["child_node_id"],
                    )
                    self.session.add(new_edge)

        self.session.delete(node)
        self.session.flush()
        return True, None

    def delete_explorer_edge(
        self, set_id: int, edge_id: int,
    ) -> Tuple[bool, Optional[str]]:
        edge = (
            self.session.query(SetExplorerEdge)
            .filter_by(id=edge_id, set_id=set_id)
            .first()
        )
        if edge is None:
            return False, "Edge not found"
        self.session.delete(edge)
        self.session.flush()
        return True, None

    def explorer_swap(
        self, set_id: int, node_a_id: str, node_b_id: str,
    ) -> Tuple[bool, Optional[str]]:
        if node_a_id == node_b_id:
            return False, "Cannot swap a node with itself"

        node_a = (
            self.session.query(SetExplorerNode)
            .filter_by(set_id=set_id, node_id=node_a_id)
            .first()
        )
        node_b = (
            self.session.query(SetExplorerNode)
            .filter_by(set_id=set_id, node_id=node_b_id)
            .first()
        )
        if node_a is None or node_b is None:
            return False, "Node not found"

        node_a.track_id, node_b.track_id = node_b.track_id, node_a.track_id
        self.session.flush()
        return True, None

    def explorer_move_node(
        self,
        set_id: int,
        node_id: str,
        target_level: Optional[int] = None,
        target_col_index: Optional[int] = None,
        new_parent_node_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[str]]:
        node = (
            self.session.query(SetExplorerNode)
            .filter_by(set_id=set_id, node_id=node_id)
            .first()
        )
        if node is None:
            return False, "Node not found"

        tree_id = node.tree_id
        nodes, edges, edge_tuples, nodes_by_level = self._get_explorer_state(set_id, tree_id)

        if new_parent_node_id is not None:
            parent_node = next((n for n in nodes if n.node_id == new_parent_node_id), None)
            if parent_node is None:
                return False, "Parent node not found"

            new_level = parent_node.level + 1
            error = validate_move_node(
                edge_tuples, nodes_by_level, node_id,
                node.level, new_level, new_parent_node_id,
            )
            if error:
                return False, error

            occupied = {n.col_index for n in nodes if n.level == new_level and n.node_id != node_id}
            free_col = next((i for i in range(5) if i not in occupied), None)
            if free_col is None:
                return False, f"No free slot at level {new_level}"

            self.session.query(SetExplorerEdge).filter_by(
                set_id=set_id, child_node_id=node_id,
            ).delete()

            new_edge = SetExplorerEdge(
                set_id=set_id, tree_id=tree_id,
                parent_node_id=new_parent_node_id,
                child_node_id=node_id,
            )
            self.session.add(new_edge)
            node.level = new_level
            node.col_index = free_col
        else:
            if target_level is None or target_col_index is None:
                return False, "target_level and target_col_index are required for relocation"
            if target_col_index < 0 or target_col_index > 4:
                return False, f"col_index must be 0–4, got {target_col_index}"

            error = validate_move_node(
                edge_tuples, nodes_by_level, node_id,
                node.level, target_level,
            )
            if error:
                return False, error

            occupant = next(
                (n for n in nodes if n.level == target_level and n.col_index == target_col_index and n.node_id != node_id),
                None,
            )
            if occupant is not None:
                return False, f"Slot ({target_level}, {target_col_index}) is already occupied"

            node.level = target_level
            node.col_index = target_col_index

        self.session.flush()
        return True, None

    def explorer_node_add_to_tracklist(
        self, set_id: int, node_id: str,
    ) -> Tuple[bool, Optional[str]]:
        node = (
            self.session.query(SetExplorerNode)
            .filter_by(set_id=set_id, node_id=node_id)
            .first()
        )
        if node is None:
            return False, "Node not found"

        existing = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=node.track_id)
            .first()
        )
        if existing:
            return True, None

        in_pool = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=node.track_id)
            .first()
        )
        if in_pool:
            self.session.delete(in_pool)

        max_pos = (
            self.session.query(SetTracklistEntry.position)
            .filter_by(set_id=set_id)
            .order_by(SetTracklistEntry.position.desc())
            .first()
        )
        next_pos = (max_pos[0] + 1) if max_pos else 0

        entry = SetTracklistEntry(
            set_id=set_id, track_id=node.track_id, position=next_pos,
        )
        self.session.add(entry)
        self.session.flush()
        return True, None
