"""Tests for feature-extraction worker partitioning."""

import pytest

from src.feature_extraction.batching import chunk_contiguous, chunk_round_robin


def test_chunk_contiguous_balances_remainder_without_reordering():
    assert chunk_contiguous([1, 2, 3, 4, 5], 3) == [[1, 2], [3, 4], [5]]


def test_chunk_contiguous_caps_worker_count_at_item_count():
    assert chunk_contiguous([1, 2, 3], 10) == [[1], [2], [3]]


def test_chunk_round_robin_stratifies_ordered_work():
    assert chunk_round_robin([1, 2, 3, 4, 5, 6, 7], 3) == [
        [1, 4, 7],
        [2, 5],
        [3, 6],
    ]


@pytest.mark.parametrize("chunker", [chunk_contiguous, chunk_round_robin])
def test_chunkers_return_no_chunks_for_empty_input(chunker):
    assert chunker([], 3) == []


@pytest.mark.parametrize("chunker", [chunk_contiguous, chunk_round_robin])
def test_chunkers_reject_non_positive_worker_counts(chunker):
    with pytest.raises(ValueError, match="worker_count"):
        chunker([1], 0)
