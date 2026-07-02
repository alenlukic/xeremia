from __future__ import annotations

from datetime import datetime, timedelta

from src.data_management.utils import normalize_key_symbols
from src.track_metadata.label import (
    album_group_key,
    apply_album_label_consistency,
    canonicalize_label,
    is_album_title_candidate,
    is_rejected_catalog_label,
    resolve_album_label_for_group,
    resolve_label,
    tracks_share_album_window,
)
from src.track_metadata.models import SimpleMetadata


def test_canonicalize_label_maps_cdr_and_white_label():
    assert canonicalize_label("Cdr") == "CDR"
    assert canonicalize_label("white-label") == "CDR"
    assert canonicalize_label("Self Release") == "CDR"


def test_reject_catalog_and_album_title_candidates():
    assert is_rejected_catalog_label("Spotify") is True
    assert is_rejected_catalog_label("https://deezer.com/track/1") is True
    assert is_rejected_catalog_label("Songlyrics page") is True
    assert is_album_title_candidate("My Album", album="My Album", title="Song") is True
    assert resolve_label("Spotify", album="Album", title="Song") is None
    assert resolve_label("My Album", album="My Album", title="Song") is None


def test_resolve_label_accepts_cdr_db_and_web():
    assert resolve_label("CDR") == "CDR"
    assert resolve_label("Warp Records", web_verifier=lambda label: label == "Warp Records") == "Warp Records"
    assert resolve_label("Unknown Label", web_verifier=lambda _label: False) is None


class _SessionWithLabel:
    def __init__(self, labels: list[str]):
        self.labels = labels

    class _Query:
        def __init__(self, labels):
            self.labels = labels

        def filter(self, *_args, **_kwargs):
            return self

        def first(self):
            return object() if self.labels else None

    def query(self, _model):
        return self._Query(self.labels)


def test_resolve_label_accepts_existing_db_label():
    session = _SessionWithLabel(["Label"])
    assert resolve_label("label", session=session) == "label"


def test_album_grouping_and_consistency():
    left = datetime(2024, 1, 1, 12, 0, 0)
    right = left + timedelta(hours=12)
    assert tracks_share_album_window(left, right) is True
    assert album_group_key(source_catalog_id="mb-123") == "catalog:mb-123"
    assert album_group_key(album_tag="Album", creation_timestamp=left).startswith("album:album:")

    shared_state: dict = {}
    metadata = SimpleMetadata(label="Warp Records", album="Album")
    apply_album_label_consistency(
        metadata,
        shared_state,
        source_catalog_id="mb-1",
        web_verifier=lambda _label: True,
    )
    metadata_two = SimpleMetadata(label="warp records", album="Album")
    apply_album_label_consistency(
        metadata_two,
        shared_state,
        source_catalog_id="mb-1",
        web_verifier=lambda _label: True,
    )
    assert metadata.label == metadata_two.label == "Warp Records"


def test_album_label_conflict_is_reported():
    shared_state: dict = {}
    chosen, conflicts = resolve_album_label_for_group(
        "catalog:1",
        "Label A",
        shared_state,
        web_verifier=lambda label: label in {"Label A", "Label B"},
    )
    assert chosen == "Label A"
    assert conflicts == []
    chosen_two, conflicts_two = resolve_album_label_for_group(
        "catalog:1",
        "Label B",
        shared_state,
        web_verifier=lambda label: label in {"Label A", "Label B"},
    )
    assert chosen_two == "Label A"
    assert conflicts_two


def test_normalize_key_symbols():
    assert normalize_key_symbols("C♯m") == "C#m"
    assert normalize_key_symbols("E♭m") == "Ebm"
