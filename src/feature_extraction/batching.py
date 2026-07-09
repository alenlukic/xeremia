"""Batch partitioning helpers for feature-extraction workers."""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeVar

T = TypeVar("T")


def chunk_contiguous(items: Sequence[T], worker_count: int) -> list[list[T]]:
    """Split ``items`` into roughly equal contiguous chunks.

    Contiguous chunks are appropriate when each item has similar processing cost
    and preserving source order improves locality.
    """
    _validate_worker_count(worker_count)
    if not items:
        return []

    chunk_count = min(worker_count, len(items))
    size, remainder = divmod(len(items), chunk_count)
    chunks: list[list[T]] = []
    start = 0

    for chunk_index in range(chunk_count):
        stop = start + size + (1 if chunk_index < remainder else 0)
        chunks.append(list(items[start:stop]))
        start = stop

    return chunks


def chunk_round_robin(items: Sequence[T], worker_count: int) -> list[list[T]]:
    """Distribute ordered items across workers in round-robin order.

    This strategy is useful when processing cost correlates with item order. Each
    worker receives a stratified sample from the full sequence instead of one
    potentially expensive contiguous region.
    """
    _validate_worker_count(worker_count)
    if not items:
        return []

    chunk_count = min(worker_count, len(items))
    chunks: list[list[T]] = [[] for _ in range(chunk_count)]
    for item_index, item in enumerate(items):
        chunks[item_index % chunk_count].append(item)

    return chunks


def _validate_worker_count(worker_count: int) -> None:
    if worker_count < 1:
        raise ValueError("worker_count must be at least 1")
