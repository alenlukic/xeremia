"""Tests for explorer graph rules and validation."""

from src.set_workspace.explorer_rules import (
    is_direct_cycle,
    check_total_nodes,
    validate_add_node,
    validate_add_edge,
    MAX_TOTAL_NODES,
)


class TestDirectCycle:
    def test_self_loop_is_direct_cycle(self):
        assert is_direct_cycle([], "a", "a") is True

    def test_reciprocal_edge_is_direct_cycle(self):
        edges = [("b", "a")]
        assert is_direct_cycle(edges, "a", "b") is True

    def test_forward_edge_is_not_a_cycle(self):
        edges = [("a", "b")]
        assert is_direct_cycle(edges, "b", "c") is False

    def test_indirect_cycle_is_allowed(self):
        # a -> b -> c already exists; closing the loop with c -> a is an
        # *indirect* cycle and is explicitly permitted.
        edges = [("a", "b"), ("b", "c")]
        assert is_direct_cycle(edges, "c", "a") is False

    def test_unrelated_nodes(self):
        edges = [("a", "b"), ("c", "d")]
        assert is_direct_cycle(edges, "b", "e") is False


class TestTotalNodes:
    def test_within_cap(self):
        assert check_total_nodes(100) is True

    def test_at_cap(self):
        assert check_total_nodes(MAX_TOTAL_NODES) is False


class TestValidateAddNode:
    def test_valid_root_add(self):
        assert validate_add_node([], 0, None, "n1") is None

    def test_exceeds_total_cap(self):
        result = validate_add_node([], MAX_TOTAL_NODES, None, "n1")
        assert result is not None
        assert "500" in result

    def test_direct_cycle_rejected(self):
        edges = [("b", "a")]
        result = validate_add_node(edges, 0, "a", "b")
        assert result is not None
        assert "loop" in result.lower()

    def test_indirect_cycle_allowed(self):
        edges = [("a", "b"), ("b", "c")]
        # Adding node c' under c that also points back at a is fine.
        assert validate_add_node(edges, 3, "c", "a") is None


class TestValidateAddEdge:
    def test_forward_edge_allowed(self):
        assert validate_add_edge([("a", "b")], "b", "c") is None

    def test_self_loop_rejected(self):
        result = validate_add_edge([], "a", "a")
        assert result is not None
        assert "loop" in result.lower()

    def test_reciprocal_edge_rejected(self):
        result = validate_add_edge([("a", "b")], "b", "a")
        assert result is not None
        assert "loop" in result.lower()

    def test_indirect_cycle_allowed(self):
        edges = [("a", "b"), ("b", "c")]
        assert validate_add_edge(edges, "c", "a") is None
