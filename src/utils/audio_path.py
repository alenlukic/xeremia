"""Robust audio-path resolution for tracks on the processed-music volume.

The processed-music directory lives on an SMB-mounted volume whose
``stat``/``open``-by-name lookups are unreliable for filenames containing
non-ASCII characters: ``readdir`` (``os.scandir``) reliably enumerates the
files, but a direct ``os.path.isfile``/``open`` on the joined path can fail
due to Unicode-normalization mismatches (NFC vs NFD), stale directory
caches, or historical ``?`` placeholders.  This module resolves a track's
``file_name`` to an on-disk path by indexing the directory once via
``os.scandir`` and matching against the bytes that ``readdir`` actually
returned.

Callers should first attempt ``os.path.join(music_dir, file_name)`` directly
and only invoke :func:`resolve_audio_path` as a fallback on ``OSError``; it
returns ``None`` when no readdir entry matches so the caller can treat the
track as not-found.
"""

import os
import unicodedata
from os.path import join, splitext

from src.utils.file_operations import AUDIO_TYPES

_INDEX_CACHE = {}

# Characters that the SMB/macOS volume replaces with ``_`` on write, so a DB
# ``file_name`` may store the original glyph while the on-disk basename has an
# underscore (e.g. ``A*S*Y*S`` -> ``A_S_Y_S``, ``F*cking`` -> ``F_cking``).
_DISK_SUBSTITUTE_CHARS = str.maketrans({"*": "_", "?": "_"})


def _name_variants(file_name):
    """Yield lookup variants of ``file_name``: raw, then ``*``/``?`` -> ``_``."""
    yield file_name
    substituted = file_name.translate(_DISK_SUBSTITUTE_CHARS)
    if substituted != file_name:
        yield substituted


def build_audio_index(music_dir):
    """Return a dict of lookup keys -> on-disk basename for audio files.

    Keys populated per entry are the raw readdir basename plus its NFC, NFD,
    and casefolded-NFC forms, so a DB ``file_name`` in any of those forms can
    be matched back to the bytes the filesystem actually stores.  Building
    the index once per process avoids a per-track ``os.listdir`` round-trip.
    """
    index = {}
    try:
        with os.scandir(music_dir) as it:
            for entry in it:
                name = entry.name
                if not name or splitext(name)[1].lower() not in AUDIO_TYPES:
                    continue
                nfc = unicodedata.normalize("NFC", name)
                nfd = unicodedata.normalize("NFD", name)
                for key in (name, nfc, nfd, nfc.casefold()):
                    index.setdefault(key, name)
    except OSError:
        pass
    return index


def _get_index(music_dir):
    idx = _INDEX_CACHE.get(music_dir)
    if idx is None:
        idx = build_audio_index(music_dir)
        _INDEX_CACHE[music_dir] = idx
    return idx


def resolve_audio_path(music_dir, file_name, index=None):
    """Resolve ``file_name`` to an on-disk path via the readdir index.

    Returns the resolved path string, or ``None`` if no indexed entry matches.
    Match strategy, in order: exact bytes, NFC, NFD, casefolded-NFC, then a
    unique prefix match for ``?``-placeholder names (longest leading run of
    ASCII, non-``?`` characters).
    """
    if index is None:
        index = _get_index(music_dir)
    if not index:
        return None

    for variant in _name_variants(file_name):
        for key in (
            variant,
            unicodedata.normalize("NFC", variant),
            unicodedata.normalize("NFD", variant),
            unicodedata.normalize("NFC", variant).casefold(),
        ):
            hit = index.get(key)
            if hit is not None:
                return join(music_dir, hit)

    prefix = ""
    for ch in file_name:
        if ch == "?" or ord(ch) > 127:
            break
        prefix += ch
    if prefix:
        matches = []
        seen = set()
        for name in index.values():
            if name.startswith(prefix) and name not in seen:
                seen.add(name)
                matches.append(name)
        if len(matches) == 1:
            return join(music_dir, matches[0])

    return None
