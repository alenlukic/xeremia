"""Set workspace orchestration service.

Handles set CRUD, pool/tracklist mutations, and explorer graph mutations
with constraint validation. A track MAY belong to the pool and the tracklist
at the same time; the two memberships are independent.
"""

import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from src.models.dj_set import DjSet
from src.models.set_pool_entry import SetPoolEntry
from src.models.set_pool_subgroup import SetPoolSubgroup
from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
from src.models.set_tracklist_entry import SetTracklistEntry
from src.models.set_explorer_node import SetExplorerNode
from src.models.set_explorer_edge import SetExplorerEdge
from src.set_workspace.explorer_rules import validate_add_node, validate_add_edge

logger = logging.getLogger(__name__)

_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _normalize_hex_color(value: Optional[str]) -> Optional[str]:
    """Return a normalized #rrggbb string, or None for empty/invalid input."""
    if value is None:
        return None
    candidate = value.strip().lower()
    if candidate == "":
        return None
    return candidate if _HEX_COLOR_RE.match(candidate) else None


class SetWorkspaceService:
    def __init__(self, session):
        self.session = session

    # --- Internal helpers ---

    def _next_order(self, order_column, set_id: int) -> int:
        """Next value for a per-set ordering column: max + 1, or 0 when empty."""
        current_max = (
            self.session.query(order_column)
            .filter_by(set_id=set_id)
            .order_by(order_column.desc())
            .first()
        )
        return (current_max[0] + 1) if current_max else 0

    def _next_member_order(self, subgroup_id: int) -> int:
        """Next dense display_order for a subgroup's memberships."""
        current_max = (
            self.session.query(SetPoolSubgroupMember.display_order)
            .filter_by(subgroup_id=subgroup_id)
            .order_by(SetPoolSubgroupMember.display_order.desc())
            .first()
        )
        return (current_max[0] + 1) if current_max else 0

    def _renumber_subgroup_members(self, subgroup_id: int) -> None:
        members = (
            self.session.query(SetPoolSubgroupMember)
            .filter_by(subgroup_id=subgroup_id)
            .order_by(
                SetPoolSubgroupMember.display_order,
                SetPoolSubgroupMember.added_at,
                SetPoolSubgroupMember.id,
            )
            .all()
        )
        for idx, member in enumerate(members):
            member.display_order = idx
        self.session.flush()

    def _delete_pool_memberships(self, pool_entry_id: int) -> None:
        subgroup_ids = [
            row[0]
            for row in self.session.query(SetPoolSubgroupMember.subgroup_id)
            .filter_by(pool_entry_id=pool_entry_id)
            .distinct()
            .all()
        ]
        self.session.query(SetPoolSubgroupMember).filter_by(
            pool_entry_id=pool_entry_id,
        ).delete()
        self.session.flush()
        for subgroup_id in subgroup_ids:
            self._renumber_subgroup_members(subgroup_id)

    def _get_subgroup(self, set_id: int, subgroup_id: int) -> Optional[SetPoolSubgroup]:
        """Fetch a subgroup only when it belongs to the given set."""
        return (
            self.session.query(SetPoolSubgroup)
            .filter_by(id=subgroup_id, set_id=set_id)
            .first()
        )

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
        subgroup_ids = [
            row[0]
            for row in self.session.query(SetPoolSubgroup.id)
            .filter_by(set_id=set_id)
            .all()
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
                .order_by(
                    SetPoolSubgroupMember.subgroup_id,
                    SetPoolSubgroupMember.display_order,
                    SetPoolSubgroupMember.added_at,
                    SetPoolSubgroupMember.id,
                )
                .all()
            )

        return {
            "set": dj_set,
            "pool": pool,
            "tracklist": tracklist,
            "explorer_nodes": nodes,
            "explorer_edges": edges,
            "pool_subgroups": subgroups,
            "pool_subgroup_memberships": memberships,
        }

    # --- Pool operations ---

    def pool_add(
        self, set_id: int, track_id: int
    ) -> Tuple[Optional[SetPoolEntry], Optional[str]]:
        existing = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if existing:
            return existing, None

        next_order = self._next_order(SetPoolEntry.insertion_order, set_id)
        entry = SetPoolEntry(
            set_id=set_id, track_id=track_id, insertion_order=next_order
        )
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
        self._delete_pool_memberships(entry.id)
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

    def pool_reorder(
        self, set_id: int, track_id: int, new_position: int
    ) -> Tuple[bool, Optional[str]]:
        entries = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        entry = next((e for e in entries if e.track_id == track_id), None)
        if entry is None:
            return False, "Track not found in pool"

        new_position = max(0, min(new_position, len(entries) - 1))
        entries.remove(entry)
        entries.insert(new_position, entry)
        # Reassign densely: insertion_order may have gaps after removals.
        for idx, e in enumerate(entries):
            e.insertion_order = idx
        self.session.flush()
        return True, None

    def pool_set_highlight(
        self, set_id: int, track_id: int, highlight_color: Optional[str]
    ) -> Tuple[bool, Optional[str]]:
        """Set (or clear, when None) a pool entry's highlight color."""
        color = _normalize_hex_color(highlight_color)
        if highlight_color is not None and color is None:
            return False, "Invalid highlight color"
        entry = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if entry is None:
            return False, "Track not found in pool"
        entry.highlight_color = color
        self.session.flush()
        return True, None

    def pool_move_to_tracklist(
        self, set_id: int, track_id: int
    ) -> Tuple[bool, Optional[str]]:
        pool_entry = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if pool_entry is None:
            return False, "Track not found in pool"

        next_pos = self._next_order(SetTracklistEntry.position, set_id)
        self._delete_pool_memberships(pool_entry.id)
        self.session.delete(pool_entry)
        tracklist_entry = SetTracklistEntry(
            set_id=set_id, track_id=track_id, position=next_pos
        )
        self.session.add(tracklist_entry)
        self.session.flush()
        return True, None

    # --- Pool subgroup operations ---

    def subgroup_create(self, set_id: int, name: str) -> SetPoolSubgroup:
        next_order = self._next_order(SetPoolSubgroup.display_order, set_id)
        sg = SetPoolSubgroup(set_id=set_id, name=name, display_order=next_order)
        self.session.add(sg)
        self.session.flush()
        return sg

    def subgroup_rename(
        self, set_id: int, subgroup_id: int, name: str
    ) -> Optional[SetPoolSubgroup]:
        sg = self._get_subgroup(set_id, subgroup_id)
        if sg is None:
            return None
        sg.name = name
        self.session.flush()
        return sg

    def subgroup_delete(self, set_id: int, subgroup_id: int) -> bool:
        sg = self._get_subgroup(set_id, subgroup_id)
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

    def subgroup_reorder(
        self, set_id: int, subgroup_ids: List[int]
    ) -> Tuple[bool, Optional[str]]:
        if len(subgroup_ids) != len(set(subgroup_ids)):
            return False, "Duplicate subgroup IDs in reorder list"

        current = self.session.query(SetPoolSubgroup).filter_by(set_id=set_id).all()
        current_ids = {sg.id for sg in current}
        if set(subgroup_ids) != current_ids:
            return (
                False,
                "Submitted subgroup IDs do not match current subgroups for this set",
            )

        sg_map = {sg.id: sg for sg in current}
        for idx, sg_id in enumerate(subgroup_ids):
            sg_map[sg_id].display_order = idx
        self.session.flush()
        return True, None

    def subgroup_add_track(
        self, set_id: int, subgroup_id: int, pool_entry_id: int
    ) -> Tuple[Optional[SetPoolSubgroupMember], Optional[str]]:
        sg = self._get_subgroup(set_id, subgroup_id)
        if sg is None:
            return None, "Subgroup does not belong to this set"

        pool_entry = (
            self.session.query(SetPoolEntry)
            .filter_by(id=pool_entry_id, set_id=set_id)
            .first()
        )
        if pool_entry is None:
            return None, "Pool entry does not belong to this set"

        existing = (
            self.session.query(SetPoolSubgroupMember)
            .filter_by(subgroup_id=subgroup_id, pool_entry_id=pool_entry_id)
            .first()
        )
        if existing:
            return existing, None
        member = SetPoolSubgroupMember(
            subgroup_id=subgroup_id,
            pool_entry_id=pool_entry_id,
            display_order=self._next_member_order(subgroup_id),
        )
        self.session.add(member)
        self.session.flush()
        return member, None

    def subgroup_remove_track(
        self, set_id: int, subgroup_id: int, pool_entry_id: int
    ) -> Tuple[bool, Optional[str]]:
        sg = self._get_subgroup(set_id, subgroup_id)
        if sg is None:
            return False, "Subgroup does not belong to this set"

        member = (
            self.session.query(SetPoolSubgroupMember)
            .filter_by(subgroup_id=subgroup_id, pool_entry_id=pool_entry_id)
            .first()
        )
        if member is None:
            return False, "Membership not found"
        self.session.delete(member)
        self.session.flush()
        self._renumber_subgroup_members(subgroup_id)
        return True, None

    def subgroup_member_reorder(
        self,
        set_id: int,
        subgroup_id: int,
        pool_entry_id: int,
        new_position: int,
    ) -> Tuple[bool, Optional[str]]:
        sg = self._get_subgroup(set_id, subgroup_id)
        if sg is None:
            return False, "Subgroup does not belong to this set"

        members = (
            self.session.query(SetPoolSubgroupMember)
            .filter_by(subgroup_id=subgroup_id)
            .order_by(
                SetPoolSubgroupMember.display_order,
                SetPoolSubgroupMember.added_at,
                SetPoolSubgroupMember.id,
            )
            .all()
        )
        member = next(
            (m for m in members if m.pool_entry_id == pool_entry_id),
            None,
        )
        if member is None:
            return False, "Membership not found"

        new_position = max(0, min(new_position, len(members) - 1))
        members.remove(member)
        members.insert(new_position, member)
        for idx, row in enumerate(members):
            row.display_order = idx
        self.session.flush()
        return True, None

    def subgroup_drop_track(
        self,
        set_id: int,
        subgroup_id: int,
        track_id: int,
        source: str,
    ) -> Tuple[Optional[SetPoolSubgroupMember], Optional[str]]:
        """Atomically pool/move a track when needed, then assign subgroup membership."""
        sg = self._get_subgroup(set_id, subgroup_id)
        if sg is None:
            return None, "Subgroup does not belong to this set"

        pool_entry = (
            self.session.query(SetPoolEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if pool_entry is not None:
            return self.subgroup_add_track(set_id, subgroup_id, pool_entry.id)

        if source == "browse":
            entry, err = self.pool_add(set_id, track_id)
            if err:
                return None, err
            pool_entry = entry
        elif source == "tracklist":
            tl_entry = (
                self.session.query(SetTracklistEntry)
                .filter_by(set_id=set_id, track_id=track_id)
                .first()
            )
            if tl_entry is None:
                return None, "Track not found in tracklist"
            ok, err = self.tracklist_move_to_pool(set_id, track_id)
            if not ok:
                return None, err
            pool_entry = (
                self.session.query(SetPoolEntry)
                .filter_by(set_id=set_id, track_id=track_id)
                .first()
            )
        elif source == "pool":
            return None, "Track not found in pool"
        else:
            return None, f"Invalid source: {source}"

        if pool_entry is None:
            return None, "Pool entry not found after move"
        return self.subgroup_add_track(set_id, subgroup_id, pool_entry.id)

    # --- Tracklist operations ---

    def tracklist_add(
        self, set_id: int, track_id: int
    ) -> Tuple[Optional[SetTracklistEntry], Optional[str]]:
        existing = (
            self.session.query(SetTracklistEntry)
            .filter_by(set_id=set_id, track_id=track_id)
            .first()
        )
        if existing:
            return existing, None

        next_pos = self._next_order(SetTracklistEntry.position, set_id)
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

    def tracklist_reorder(
        self, set_id: int, track_id: int, new_position: int
    ) -> Tuple[bool, Optional[str]]:
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

    def update_tracklist_note(
        self, set_id: int, track_id: int, note: str
    ) -> Tuple[bool, Optional[str]]:
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

    def tracklist_move_to_pool(
        self, set_id: int, track_id: int
    ) -> Tuple[bool, Optional[str]]:
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

        next_order = self._next_order(SetPoolEntry.insertion_order, set_id)
        pool_entry = SetPoolEntry(
            set_id=set_id, track_id=track_id, insertion_order=next_order
        )
        self.session.add(pool_entry)
        self.session.flush()
        return True, None

    # --- Explorer operations ---

    def _get_explorer_state(self, set_id: int):
        nodes = self.session.query(SetExplorerNode).filter_by(set_id=set_id).all()
        edges = self.session.query(SetExplorerEdge).filter_by(set_id=set_id).all()
        edge_tuples = [(e.parent_node_id, e.child_node_id) for e in edges]
        return nodes, edges, edge_tuples

    def explorer_add_node(
        self,
        set_id: int,
        track_id: int,
        x: float = 0.0,
        y: float = 0.0,
        parent_node_id: Optional[str] = None,
    ) -> Tuple[Optional[SetExplorerNode], Optional[str]]:
        nodes, edges, edge_tuples = self._get_explorer_state(set_id)
        node_id = str(uuid.uuid4())[:8]

        error = validate_add_node(
            edge_tuples,
            len(nodes),
            parent_node_id,
            node_id,
        )
        if error:
            return None, error

        node = SetExplorerNode(
            set_id=set_id,
            node_id=node_id,
            track_id=track_id,
            x=x,
            y=y,
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

    def explorer_move_node(
        self,
        set_id: int,
        node_id: str,
        x: float,
        y: float,
    ) -> Tuple[bool, Optional[str]]:
        node = (
            self.session.query(SetExplorerNode)
            .filter_by(set_id=set_id, node_id=node_id)
            .first()
        )
        if node is None:
            return False, "Node not found"
        node.x = x
        node.y = y
        self.session.flush()
        return True, None

    def explorer_set_positions(
        self,
        set_id: int,
        positions: List[Dict[str, object]],
    ) -> Tuple[bool, Optional[str]]:
        """Batch-update node coordinates (used by auto-layout)."""
        nodes = {
            n.node_id: n
            for n in self.session.query(SetExplorerNode)
            .filter_by(set_id=set_id)
            .all()
        }
        for pos in positions:
            node = nodes.get(pos["node_id"])
            if node is None:
                continue
            node.x = float(pos["x"])
            node.y = float(pos["y"])
        self.session.flush()
        return True, None

    def explorer_add_edge(
        self,
        set_id: int,
        parent_node_id: str,
        child_node_id: str,
    ) -> Tuple[Optional[SetExplorerEdge], Optional[str]]:
        _, _, edge_tuples = self._get_explorer_state(set_id)

        error = validate_add_edge(edge_tuples, parent_node_id, child_node_id)
        if error:
            return None, error

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
                    return (
                        False,
                        f"Rewire parent {re['parent_node_id']} is not a parent of deleted node",
                    )
                if re["child_node_id"] not in child_ids:
                    return (
                        False,
                        f"Rewire child {re['child_node_id']} is not a child of deleted node",
                    )

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

    def delete_explorer_edge(
        self,
        set_id: int,
        edge_id: int,
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
        self,
        set_id: int,
        node_a_id: str,
        node_b_id: str,
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

    def explorer_node_add_to_tracklist(
        self,
        set_id: int,
        node_id: str,
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

        next_pos = self._next_order(SetTracklistEntry.position, set_id)
        entry = SetTracklistEntry(
            set_id=set_id,
            track_id=node.track_id,
            position=next_pos,
        )
        self.session.add(entry)
        self.session.flush()
        return True, None
