"""Set workspace orchestration service.

Handles set CRUD, pool/tracklist mutations with mutual exclusivity,
and explorer graph mutations with constraint validation.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from src.models.dj_set import DjSet
from src.models.set_pool_entry import SetPoolEntry
from src.models.set_tracklist_entry import SetTracklistEntry
from src.models.set_explorer_node import SetExplorerNode
from src.models.set_explorer_edge import SetExplorerEdge
from src.set_workspace.explorer_rules import validate_add_node, validate_swap

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
        self.session.query(SetTracklistEntry).filter_by(set_id=set_id).delete()
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
        nodes = self.session.query(SetExplorerNode).filter_by(set_id=set_id).all()
        edges = self.session.query(SetExplorerEdge).filter_by(set_id=set_id).all()

        return {
            "set": dj_set,
            "pool": pool,
            "tracklist": tracklist,
            "explorer_nodes": nodes,
            "explorer_edges": edges,
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

        self.session.delete(pool_entry)
        tracklist_entry = SetTracklistEntry(
            set_id=set_id, track_id=track_id, position=next_pos
        )
        self.session.add(tracklist_entry)
        self.session.flush()
        return True, None

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

        pool_entry = SetPoolEntry(set_id=set_id, track_id=track_id, insertion_order=next_order)
        self.session.add(pool_entry)
        self.session.flush()
        return True, None

    # --- Explorer operations ---

    def _get_explorer_state(self, set_id: int):
        nodes = self.session.query(SetExplorerNode).filter_by(set_id=set_id).all()
        edges = self.session.query(SetExplorerEdge).filter_by(set_id=set_id).all()
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
    ) -> Tuple[Optional[SetExplorerNode], Optional[str]]:
        nodes, edges, edge_tuples, nodes_by_level = self._get_explorer_state(set_id)
        node_id = str(uuid.uuid4())[:8]

        error = validate_add_node(
            edge_tuples, nodes_by_level, len(nodes),
            parent_node_id, node_id, level,
        )
        if error:
            return None, error

        node = SetExplorerNode(
            set_id=set_id, node_id=node_id, track_id=track_id, level=level,
        )
        self.session.add(node)

        if parent_node_id is not None:
            edge = SetExplorerEdge(
                set_id=set_id,
                parent_node_id=parent_node_id,
                child_node_id=node_id,
            )
            self.session.add(edge)

        self.session.flush()
        return node, None

    def explorer_add_edge(
        self, set_id: int, parent_node_id: str, child_node_id: str,
    ) -> Tuple[Optional[SetExplorerEdge], Optional[str]]:
        _, _, edge_tuples, _ = self._get_explorer_state(set_id)

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
                        parent_node_id=re["parent_node_id"],
                        child_node_id=re["child_node_id"],
                    )
                    self.session.add(new_edge)

        self.session.delete(node)
        self.session.flush()
        return True, None

    def explorer_swap(
        self, set_id: int, node_a_id: str, node_b_id: str,
    ) -> Tuple[bool, Optional[str]]:
        _, _, edge_tuples, _ = self._get_explorer_state(set_id)
        error = validate_swap(edge_tuples, node_a_id, node_b_id)
        if error:
            return False, error

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
        node_a.level, node_b.level = node_b.level, node_a.level
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
