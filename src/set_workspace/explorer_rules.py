"""Pure validation helpers for explorer graph constraints.

The Explorer is a directed graph on a free-form canvas: any node may be both a
parent and a child, and there is no "root" or level concept. Directed edges are
allowed to form *indirect* cycles (a -> b -> c -> a), but not *direct* ones — a
node may not point at itself, and two nodes may not point at each other
(a -> b together with b -> a).
"""

from typing import List, Optional, Tuple

MAX_TOTAL_NODES = 500


def is_direct_cycle(
    edges: List[Tuple[str, str]],
    parent: str,
    child: str,
) -> bool:
    """Return True if ``parent -> child`` would form a direct loop.

    A direct loop is either a self-edge (``parent == child``) or a reciprocal
    edge — i.e. ``child -> parent`` already exists. Longer, indirect cycles are
    permitted and are not reported here.
    """
    if parent == child:
        return True
    return (child, parent) in edges


def check_total_nodes(current_count: int, adding: int = 1) -> bool:
    """Return True if adding nodes stays within the total cap."""
    return (current_count + adding) <= MAX_TOTAL_NODES


def validate_add_node(
    edges: List[Tuple[str, str]],
    total_node_count: int,
    parent_node_id: Optional[str],
    child_node_id: str,
) -> Optional[str]:
    """Validate constraints for adding a node. Returns error message or None."""
    if not check_total_nodes(total_node_count):
        return f"Explorer exceeds maximum of {MAX_TOTAL_NODES} nodes per set"

    if parent_node_id is not None:
        if is_direct_cycle(edges, parent_node_id, child_node_id):
            return "Adding this edge would create a direct loop"

    return None


def validate_add_edge(
    edges: List[Tuple[str, str]],
    parent_node_id: str,
    child_node_id: str,
) -> Optional[str]:
    """Validate a standalone edge addition. Returns error message or None."""
    if is_direct_cycle(edges, parent_node_id, child_node_id):
        return "Adding this edge would create a direct loop"
    return None
