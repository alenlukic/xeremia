"""Tests for explorer graph rules and validation."""

from src.set_workspace.explorer_rules import (
    detect_cycle,
    check_level_width,
    check_depth,
    check_total_nodes,
    validate_add_node,
    validate_swap,
    MAX_NODES_PER_LEVEL,
    MAX_DEPTH,
    MAX_TOTAL_NODES,
)


class TestDetectCycle:
    def test_no_cycle_in_simple_chain(self):
        edges = [("a", "b"), ("b", "c")]
        assert detect_cycle(edges, "c", "d") is False

    def test_cycle_detected_back_to_root(self):
        edges = [("a", "b"), ("b", "c")]
        assert detect_cycle(edges, "c", "a") is True

    def test_cycle_detected_self_loop(self):
        edges = []
        assert detect_cycle(edges, "a", "a") is True

    def test_no_cycle_in_forest(self):
        edges = [("a", "b"), ("c", "d")]
        assert detect_cycle(edges, "b", "e") is False

    def test_cycle_in_diamond(self):
        edges = [("a", "b"), ("a", "c"), ("b", "d"), ("c", "d")]
        assert detect_cycle(edges, "d", "a") is True


class TestLevelWidth:
    def test_within_cap(self):
        assert check_level_width({0: 3}, 0) is True

    def test_at_cap(self):
        assert check_level_width({0: MAX_NODES_PER_LEVEL}, 0) is False

    def test_empty_level(self):
        assert check_level_width({}, 5) is True


class TestDepth:
    def test_within_cap(self):
        assert check_depth(50) is True

    def test_level_199_within_cap(self):
        assert check_depth(199) is True

    def test_at_cap(self):
        assert check_depth(MAX_DEPTH) is False

    def test_level_200_exceeds_cap(self):
        assert check_depth(200) is False

    def test_zero(self):
        assert check_depth(0) is True


class TestTotalNodes:
    def test_within_cap(self):
        assert check_total_nodes(100) is True

    def test_at_cap(self):
        assert check_total_nodes(MAX_TOTAL_NODES) is False


class TestValidateAddNode:
    def test_valid_root_add(self):
        result = validate_add_node([], {}, 0, None, "n1", 0)
        assert result is None

    def test_exceeds_total_cap(self):
        result = validate_add_node([], {}, MAX_TOTAL_NODES, None, "n1", 0)
        assert result is not None
        assert "500" in result

    def test_exceeds_depth(self):
        result = validate_add_node([], {}, 0, None, "n1", MAX_DEPTH)
        assert result is not None
        assert "depth" in result.lower()

    def test_exceeds_level_width(self):
        result = validate_add_node([], {0: MAX_NODES_PER_LEVEL}, 0, None, "n1", 0)
        assert result is not None
        assert "level" in result.lower()

    def test_cycle_detected(self):
        edges = [("b", "a")]
        result = validate_add_node(edges, {}, 0, "a", "b", 1)
        assert result is not None
        assert "cycle" in result.lower()


class TestValidateSwap:
    def test_valid_swap(self):
        edges = [("a", "b")]
        assert validate_swap(edges, "a", "b") is None

    def test_valid_swap_reversed(self):
        edges = [("a", "b")]
        assert validate_swap(edges, "b", "a") is None

    def test_not_connected(self):
        edges = [("a", "b"), ("c", "d")]
        result = validate_swap(edges, "a", "d")
        assert result is not None
        assert "directly connected" in result.lower()

    def test_empty_edges(self):
        result = validate_swap([], "a", "b")
        assert result is not None
