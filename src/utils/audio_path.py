"""Resolve audio paths whose stored names differ from filesystem entries.

The processed-music directory may live on an SMB-mounted volume. Direct path
lookups can fail when the database name and the directory entry differ by
Unicode normalization, case, or historical filename substitutions. Resolution
therefore falls back to directory enumeration and only accepts unambiguous
matches.
"""

from __future__ import annotations

from collections import OrderedDict, defaultdict
from collections.abc import Mapping
import os
from os import PathLike
from os.path import dirname, isfile, join
import re
import unicodedata
from typing import Union

PathInput = Union[str, PathLike[str]]
AudioNameIndex = dict[str, tuple[str, ...]]

# Bounded LRU of directory indexes. Without a cap, a long-running server that
# serves audio from many distinct directories would accumulate a permanent
# filename index per directory for the life of the process. The cap trades a
# little repeated scandir work for bounded memory.
_INDEX_CACHE_MAX = 256
_INDEX_CACHE: "OrderedDict[str, AudioNameIndex]" = OrderedDict()
_DISK_SUBSTITUTE_CHARS = str.maketrans({"*": "_", "?": "_"})


def build_audio_index(directory: PathInput) -> AudioNameIndex:
    """Index directory-entry names by normalized lookup keys.

    Each key maps to every matching on-disk name rather than arbitrarily choosing
    one. Callers can therefore reject case or normalization collisions safely.
    """
    buckets: dict[str, set[str]] = defaultdict(set)
    try:
        with os.scandir(directory) as entries:
            for entry in entries:
                name = entry.name
                if not name:
                    continue
                for key in _lookup_keys(name):
                    buckets[key].add(name)
    except OSError:
        return {}

    return {key: tuple(sorted(names)) for key, names in buckets.items()}


def clear_audio_path_cache() -> None:
    """Discard cached directory indexes.

    Long-running ingestion processes should call this after mutating the
    processed-music directory so later fallback lookups see the new contents.
    """
    _INDEX_CACHE.clear()


def resolve_audio_path(
    music_dir: PathInput,
    file_name: str,
    *,
    index: Mapping[str, tuple[str, ...]] | None = None,
) -> str | None:
    """Return the existing path for ``file_name``, or ``None`` if unresolved.

    Resolution scans the requested file's parent directory and returns the
    on-disk directory-entry spelling when a unique match is found. Fallback
    matching covers Unicode NFC/NFD differences, unique case-insensitive matches,
    ``*``/``?`` to ``_`` substitutions, and unique legacy placeholder matches.
    Ambiguous matches are rejected. A direct ``isfile`` check is used only when
    index matching does not find an entry.
    """
    if not file_name:
        return None

    root = os.fspath(music_dir)
    relative_directory = dirname(file_name)
    requested_name = os.path.basename(file_name)
    if not requested_name:
        return None

    search_directory = join(root, relative_directory)
    if index is not None:
        directory_index = index
    else:
        cache_key = os.path.abspath(search_directory)
        directory_index = _get_audio_index(cache_key)

    match = _match_index(directory_index, requested_name)
    if match is not None:
        return join(search_directory, match)

    direct_path = join(root, file_name)
    if isfile(direct_path):
        entry_name = _directory_entry_name(search_directory, requested_name)
        if entry_name is not None:
            return join(search_directory, entry_name)
        return direct_path

    return None


def _get_audio_index(directory: str) -> AudioNameIndex:
    index = _INDEX_CACHE.get(directory)
    if index is None:
        index = build_audio_index(directory)
        _INDEX_CACHE[directory] = index
        _INDEX_CACHE.move_to_end(directory)
        while len(_INDEX_CACHE) > _INDEX_CACHE_MAX:
            _INDEX_CACHE.popitem(last=False)
    else:
        _INDEX_CACHE.move_to_end(directory)
    return index


def _directory_entry_name(directory: str, requested_name: str) -> str | None:
    """Return the on-disk file name when it differs from ``requested_name``."""
    requested_keys = set(_lookup_keys(requested_name))
    try:
        with os.scandir(directory) as entries:
            for entry in entries:
                if not entry.is_file():
                    continue
                if requested_keys.intersection(_lookup_keys(entry.name)):
                    return entry.name
    except OSError:
        return None
    return None


def _lookup_keys(name: str) -> tuple[str, ...]:
    nfc = unicodedata.normalize("NFC", name)
    nfd = unicodedata.normalize("NFD", name)
    return tuple(dict.fromkeys((name, nfc, nfd, nfc.casefold())))


def _match_index(
    index: Mapping[str, tuple[str, ...]], requested_name: str
) -> str | None:
    for variant in _name_variants(requested_name):
        for key in _lookup_keys(variant):
            match = _unique_index_match(index, key)
            if match is not None:
                return match

    wildcard_match = _match_question_mark_placeholder(index, requested_name)
    if wildcard_match is not None:
        return wildcard_match

    return _match_legacy_uncertain_prefix(index, requested_name)


def _name_variants(file_name: str) -> tuple[str, ...]:
    substituted = file_name.translate(_DISK_SUBSTITUTE_CHARS)
    if substituted == file_name:
        return (file_name,)
    return (file_name, substituted)


def _unique_index_match(
    index: Mapping[str, tuple[str, ...]], lookup_key: str
) -> str | None:
    matches = index.get(lookup_key, ())
    return matches[0] if len(matches) == 1 else None


def _unique_names(index: Mapping[str, tuple[str, ...]]) -> tuple[str, ...]:
    return tuple(sorted({name for names in index.values() for name in names}))


def _match_question_mark_placeholder(
    index: Mapping[str, tuple[str, ...]], requested_name: str
) -> str | None:
    placeholder_position = requested_name.find("?")
    if placeholder_position <= 0:
        return None

    normalized = unicodedata.normalize("NFC", requested_name)
    pattern_parts = []
    for character in normalized:
        if character == "?":
            pattern_parts.append(".")
        elif character == "*":
            pattern_parts.append(re.escape("_"))
        else:
            pattern_parts.append(re.escape(character))
    pattern = re.compile("".join(pattern_parts), re.IGNORECASE)

    matches = [
        name
        for name in _unique_names(index)
        if pattern.fullmatch(unicodedata.normalize("NFC", name)) is not None
    ]
    return matches[0] if len(matches) == 1 else None


def _match_legacy_uncertain_prefix(
    index: Mapping[str, tuple[str, ...]], requested_name: str
) -> str | None:
    prefix_end = next(
        (
            position
            for position, character in enumerate(requested_name)
            if character == "?" or unicodedata.category(character).startswith("C")
        ),
        None,
    )
    if prefix_end in (None, 0):
        return None

    prefix = requested_name[:prefix_end]
    matches = [name for name in _unique_names(index) if name.startswith(prefix)]
    return matches[0] if len(matches) == 1 else None
