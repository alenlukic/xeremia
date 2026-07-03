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
    assert (
        resolve_label(
            "Warp Records", web_verifier=lambda label: label == "Warp Records"
        )
        == "Warp Records"
    )
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
    assert album_group_key(album_tag="Album", creation_timestamp=left).startswith(
        "album:album:"
    )

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


from src.track_metadata.research import (
    CatalogNumberObservation,
    LabelSearchObservation,
)
from src.track_metadata.label import infer_cdr_label, resolve_label_fallback
from src.track_metadata.research import CdrEvidence


class _StubWebClient:
    def __init__(self, **responses):
        self.responses = responses

    def search_catalog_number_by_title(self, artist, title):
        return self.responses.get("catalog_title", [])

    def search_catalog_number_by_album(self, artist, album):
        return self.responses.get("catalog_album", [])

    def search_label_by_catalog_number(self, catalog_number):
        return self.responses.get("catalog_label", [])

    def search_label_by_title(self, artist, title):
        return self.responses.get("label_title", [])

    def search_label_by_album(self, artist, album):
        return self.responses.get("label_album", [])


class _StubCatalogClient:
    def __init__(self, label=None):
        self.label = label

    def lookup_label_by_catalog_number(self, catalog_number, **kwargs):
        return self.label


class _StubTrackBrowser:
    def __init__(self, label=None):
        self.label = label

    def inspect_beatport_track_label(self, artist, title):
        if self.label is None:
            return None
        from src.track_metadata.research import BeatportTrackLabelObservation

        return BeatportTrackLabelObservation(
            artist=artist,
            title=title,
            page_url="https://beatport.com/track",
            label=self.label,
            identity_confirmed=True,
        )


def test_catalog_number_title_runs_before_direct_label():
    web = _StubWebClient(
        catalog_title=[
            CatalogNumberObservation("ABC123", "url", True),
        ],
        catalog_label=[
            LabelSearchObservation("Warp Records", "url2", True),
        ],
        label_title=[
            LabelSearchObservation("Other Label", "url3", True),
        ],
    )
    label, events = resolve_label_fallback(
        artist="Artist",
        title="Track",
        web_client=web,
        catalog_client=_StubCatalogClient("Warp Records"),
    )
    assert label == "Warp Records"
    assert events[0].method == "catalog_number_title"


def test_album_catalog_search_runs_only_after_title_failure():
    web = _StubWebClient(
        catalog_title=[],
        catalog_album=[CatalogNumberObservation("XYZ9", "url", True)],
        catalog_label=[LabelSearchObservation("Album Label", "url", True)],
    )
    label, events = resolve_label_fallback(
        artist="Artist",
        title="Track",
        album="Album",
        web_client=web,
        catalog_client=_StubCatalogClient("Album Label"),
    )
    methods = [event.method for event in events]
    assert "catalog_number_album" in methods
    assert label == "Album Label"


def test_direct_label_rejects_distributors():
    from src.track_metadata.label import is_rejected_direct_label

    assert (
        is_rejected_direct_label(
            LabelSearchObservation("Believe", "url", True, is_distributor=True)
        )
        is True
    )


def test_cdr_requires_positive_indicator_not_followers_alone():
    assert infer_cdr_label(CdrEvidence(track_identity_confirmed=True)) is False
    assert (
        infer_cdr_label(
            CdrEvidence(
                track_identity_confirmed=True,
                free_download=True,
                indicators=["free_download"],
            )
        )
        is True
    )
    assert (
        infer_cdr_label(
            CdrEvidence(
                track_identity_confirmed=True,
                indicators=["small_soundcloud_following"],
            )
        )
        is False
    )


def test_beatport_track_label_runs_after_web_heuristics():
    web = _StubWebClient(catalog_title=[], label_title=[])
    browser = _StubTrackBrowser("Anjunadeep")
    label, events = resolve_label_fallback(
        artist="Artist",
        title="Track",
        web_client=web,
        browser=browser,
    )
    assert label == "Anjunadeep"
    assert any(event.method == "beatport_track" for event in events)


def test_normalize_key_symbols():
    assert normalize_key_symbols("C♯m") == "C#m"
    assert normalize_key_symbols("E♭m") == "Ebm"
