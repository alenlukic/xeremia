"""Pure validation helpers for explorer graph constraints."""

from typing import Dict, List, Optional, Set, Tuple

MAX_NODES_PER_LEVEL = 5
MAX_DEPTH = 100
MAX_TOTAL_NODES = 500


def detect_cycle(
    edges: List[Tuple[str, str]],
    new_parent: str,
    new_child: str,
) -> bool:
    """Return True if adding new_parent -> new_child would create a cycle."""
    adj: Dict[str, List[str]] = {}
    for p, c in edges:
        adj.setdefault(p, []).append(c)
    adj.setdefault(new_parent, []).append(new_child)

    visited: Set[str] = set()
    stack: Set[str] = set()

    def dfs(node: str) -> bool:
        if node in stack:
            return True
        if node in visited:
            return False
        visited.add(node)
        stack.add(node)
        for neighbor in adj.get(node, []):
            if dfs(neighbor):
                return True
        stack.discard(node)
        return False

    for start in adj:
        if start not in visited:
            if dfs(start):
                return True
    return False


def check_level_width(
    nodes_by_level: Dict[int, int],
    target_level: int,
    adding: int = 1,
) -> bool:
    """Return True if adding `adding` nodes at `target_level` stays within cap."""
    current = nodes_by_level.get(target_level, 0)
    return (current + adding) <= MAX_NODES_PER_LEVEL


def check_depth(level: int) -> bool:
    """Return True if the level is within the depth cap."""
    return level < MAX_DEPTH


def check_total_nodes(current_count: int, adding: int = 1) -> bool:
    """Return True if adding nodes stays within the total cap."""
    return (current_count + adding) <= MAX_TOTAL_NODES


def validate_add_node(
    edges: List[Tuple[str, str]],
    nodes_by_level: Dict[int, int],
    total_node_count: int,
    parent_node_id: Optional[str],
    child_node_id: str,
    child_level: int,
) -> Optional[str]:
    """Validate constraints for adding a node. Returns error message or None."""
    if not check_total_nodes(total_node_count):
        return f"Explorer exceeds maximum of {MAX_TOTAL_NODES} nodes per set"

    if not check_depth(child_level):
        return f"Explorer exceeds maximum depth of {MAX_DEPTH}"

    if not check_level_width(nodes_by_level, child_level):
        return f"Explorer exceeds maximum of {MAX_NODES_PER_LEVEL} nodes at level {child_level}"

    if parent_node_id is not None:
        if detect_cycle(edges, parent_node_id, child_node_id):
            return "Adding this edge would create a cycle"

    return None


def validate_swap(
    edges: List[Tuple[str, str]],
    node_a: str,
    node_b: str,
) -> Optional[str]:
    """Validate that node_a and node_b are directly connected (parent/child)."""
    for p, c in edges:
        if (p == node_a and c == node_b) or (p == node_b and c == node_a):
            return None
    return "Swap is only allowed between directly connected parent and child nodes"
