from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pytest

from src.models.artist import Artist
from src.models.artist_track import ArtistTrack
from src.models.track import Track
from src.track_metadata.db_matching import (
    MATCH_THRESHOLD,
    TrackMatch,
    apply_db_fields,
    artist_compatible,
    artists_for_track,
    find_matching_tracks,
    remixer_matches,
    score_track_match,
    track_remixer_hint,
)
from src.track_metadata.matching import seed_metadata_from_filename
from src.track_metadata.models import SimpleMetadata


@dataclass
class _FakeQuery:
    records: list[object]
    criteria: dict[str, object] = field(default_factory=dict)

    def filter_by(self, **kwargs):
        merged = dict(self.criteria)
        merged.update(kwargs)
        return _FakeQuery(self.records, merged)

    def _matching(self):
        return [
            record
            for record in self.records
            if all(
                getattr(record, key, None) == value
                for key, value in self.criteria.items()
            )
        ]

    def first(self):
        matching = self._matching()
        return matching[0] if matching else None

    def all(self):
        return self._matching()


class _FakeSession:
    """Minimal session stub keyed by model class with filter_by/first/all."""

    def __init__(self):
        self.data = {
            Track: [],
            Artist: [],
            ArtistTrack: [],
        }

    def query(self, model):
        return _FakeQuery(self.data[model])


def _artist(session, name, artist_id):
    artist = Artist()
    artist.id = artist_id
    artist.name = name
    artist.track_count = 0
    session.data[Artist].append(artist)
    return artist


def _link(session, track_id, artist_id):
    link = ArtistTrack()
    link.id = len(session.data[ArtistTrack]) + 1
    link.track_id = track_id
    link.artist_id = artist_id
    session.data[ArtistTrack].append(link)
    return link


def _track(session, *, track_id, file_name, title, bpm=None, genre=None, label=None):
    track = Track()
    track.id = track_id
    track.file_name = file_name
    track.title = title
    track.bpm = bpm
    track.genre = genre
    track.label = label
    session.data[Track].append(track)
    return track


# --- seed_metadata_from_filename ------------------------------------------------


def test_seed_metadata_from_filename_lets_imported_tags_win_for_plain_filename():
    source = Path("ATC - Around The World.mp3")
    existing = SimpleMetadata(
        artist="ATC",
        title="Around The World",
        remixer=None,
    )

    seed = seed_metadata_from_filename(source, existing)

    assert seed.artist == "ATC"
    assert seed.title == "Around The World"
    assert seed.remixer is None


def test_seed_metadata_from_filename_fills_remixer_from_title_annotation():
    source = Path("ATC - Around The World.mp3")
    existing = SimpleMetadata(title="Around The World (LonelyFans Remix)")

    seed = seed_metadata_from_filename(source, existing)

    assert seed.remixer == "LonelyFans"


def test_seed_metadata_from_filename_remix_prefix_preserves_original_work():
    source = Path("[Remix of ATC - Around The World] LonelyFans - Na Na Na.mp3")
    existing = SimpleMetadata(artist="LonelyFans", title="Na Na Na")

    seed = seed_metadata_from_filename(source, existing)

    # Remix-prefix filenames encode the original work identity.
    assert seed.artist == "ATC"
    assert seed.title == "Around The World"
    assert seed.remixer == "LonelyFans"


def test_seed_metadata_from_filename_remix_prefix_keeps_existing_artist_format():
    # Existing tags carry higher-fidelity formatting (KI/KI vs parsed KI KI);
    # when the existing artist matches the parsed remixer, keep the formatting.
    source = Path("[Remix of Foo - Bar] KI KI - Remix.wav")
    existing = SimpleMetadata(artist="KI/KI", title="Bar")

    seed = seed_metadata_from_filename(source, existing)

    assert seed.remixer == "KI/KI"


# --- artists_for_track / track_remixer_hint -------------------------------------


def test_artists_for_track_joins_secondary_artists_with_ampersand():
    session = _FakeSession()
    track = _track(session, track_id=1, file_name="a.mp3", title="Track")
    _link(session, track_id=1, artist_id=10)
    _link(session, track_id=1, artist_id=11)
    _artist(session, "Alpha", 10)
    _artist(session, "Beta", 11)

    primary, secondary = artists_for_track(session, track)

    assert primary == "Alpha"
    assert secondary == "Beta"


def test_artists_for_track_with_single_artist_fills_remixer_from_title():
    session = _FakeSession()
    track = _track(
        session,
        track_id=1,
        file_name="a.mp3",
        title="[12A - C#m - 128.00] ATC - Around The World (LonelyFans Remix)",
    )
    _link(session, track_id=1, artist_id=10)
    _artist(session, "ATC", 10)

    primary, secondary = artists_for_track(session, track)

    assert primary == "ATC"
    assert secondary == "LonelyFans"


def test_artists_for_track_returns_none_when_no_links():
    session = _FakeSession()
    track = _track(session, track_id=1, file_name="a.mp3", title="Track")

    primary, secondary = artists_for_track(session, track)

    assert primary is None
    assert secondary is None


def test_track_remixer_hint_prefers_linked_secondary_artist():
    session = _FakeSession()
    track = _track(
        session,
        track_id=1,
        file_name="a.mp3",
        title="Around The World (LonelyFans Remix)",
    )
    _link(session, track_id=1, artist_id=10)
    _link(session, track_id=1, artist_id=11)
    _artist(session, "ATC", 10)
    _artist(session, "LonelyFans", 11)

    assert track_remixer_hint(session, track) == "LonelyFans"


def test_track_remixer_hint_falls_back_to_title_when_single_artist():
    session = _FakeSession()
    track = _track(
        session,
        track_id=1,
        file_name="a.mp3",
        title="Around The World (LonelyFans Remix)",
    )
    _link(session, track_id=1, artist_id=10)
    _artist(session, "ATC", 10)

    assert track_remixer_hint(session, track) == "LonelyFans"


# --- artist_compatible ----------------------------------------------------------


def test_artist_compatible_accepts_direct_similarity():
    assert artist_compatible("ATC", "ATC")
    assert artist_compatible("ATC", "atc")


def test_artist_compatible_accepts_substring_containment():
    assert artist_compatible("Sasha", "Sasha & Digweed")


def test_artist_compatible_accepts_multi_token_seed_match():
    assert artist_compatible("Sasha, Digweed", "Digweed")


def test_artist_compatible_rejects_unrelated_artist():
    assert not artist_compatible("ATC", "Completely Different Artist")


def test_artist_compatible_treats_missing_inputs_as_compatible():
    assert artist_compatible(None, "ATC")
    assert artist_compatible("ATC", None)


# --- remixer_matches ------------------------------------------------------------


def test_remixer_matches_missing_source_remixer_is_always_true():
    assert remixer_matches(None, "Anyone", "Any Title")


def test_remixer_matches_similar_hint():
    assert remixer_matches("LonelyFans", "Lonely Fans", "Around The World")


def test_remixer_matches_substring_in_title():
    assert remixer_matches("LonelyFans", None, "Around The World (LonelyFans Remix)")


def test_remixer_matches_rejects_unrelated_remixer():
    assert not remixer_matches("LonelyFans", "Other DJ", "Around The World")


# --- score_track_match ----------------------------------------------------------


def test_score_track_match_returns_none_below_threshold():
    session = _FakeSession()
    track = _track(session, track_id=1, file_name="a.mp3", title="Unrelated Title")
    source = Path("ATC - Around The World.mp3")
    seed = SimpleMetadata(artist="ATC", title="Around The World")
    seed_full = "ATC - Around The World"

    assert score_track_match(session, source, seed, seed_full, track, None) is None


def test_score_track_match_returns_none_when_artist_incompatible():
    session = _FakeSession()
    track = _track(
        session,
        track_id=1,
        file_name="a.mp3",
        title="Around The World",
    )
    _link(session, track_id=1, artist_id=10)
    _artist(session, "Completely Different Artist", 10)
    source = Path("ATC - Around The World.mp3")
    seed = SimpleMetadata(artist="ATC", title="Around The World")
    seed_full = "ATC - Around The World"

    assert score_track_match(session, source, seed, seed_full, track, None) is None


def test_score_track_match_awards_remixer_bonus_when_remixer_in_title():
    session = _FakeSession()
    track = _track(
        session,
        track_id=1,
        file_name="a.mp3",
        title="Around The World (LonelyFans Remix)",
    )
    _link(session, track_id=1, artist_id=10)
    _artist(session, "ATC", 10)
    source = Path("ATC - Around The World (LonelyFans Remix).mp3")
    seed_full = "ATC - Around The World (LonelyFans Remix)"

    base_seed = SimpleMetadata(
        artist="ATC", title="Around The World (LonelyFans Remix)"
    )
    remixer_seed = SimpleMetadata(
        artist="ATC",
        title="Around The World (LonelyFans Remix)",
        remixer="LonelyFans",
    )

    base = score_track_match(session, source, base_seed, seed_full, track, None)
    with_remixer = score_track_match(
        session, source, remixer_seed, seed_full, track, None
    )

    assert base is not None
    assert with_remixer is not None
    assert with_remixer > base
    # Bonus is 0.1 over the same base similarity.
    assert abs((with_remixer - base) - 0.1) < 1e-9


@dataclass
class _RbRow:
    bpm: float | None = None


def test_score_track_match_awards_bpm_bonus_for_close_rekordbox_bpm():
    session = _FakeSession()
    track = _track(
        session,
        track_id=1,
        file_name="a.mp3",
        title="Around The World",
        bpm=128.0,
    )
    _link(session, track_id=1, artist_id=10)
    _artist(session, "ATC", 10)
    source = Path("ATC - Around The World.mp3")
    seed = SimpleMetadata(artist="ATC", title="Around The World")
    seed_full = "ATC - Around The World"

    without_rb = score_track_match(session, source, seed, seed_full, track, None)
    with_rb = score_track_match(session, source, seed, seed_full, track, _RbRow(bpm=128.0))

    assert without_rb is not None
    assert with_rb is not None
    assert with_rb > without_rb


def test_score_track_match_penalties_large_bpm_drift():
    session = _FakeSession()
    track = _track(
        session,
        track_id=1,
        file_name="a.mp3",
        title="Around The World",
        bpm=128.0,
    )
    _link(session, track_id=1, artist_id=10)
    _artist(session, "ATC", 10)
    source = Path("ATC - Around The World.mp3")
    seed = SimpleMetadata(artist="ATC", title="Around The World")
    seed_full = "ATC - Around The World"

    without_rb = score_track_match(session, source, seed, seed_full, track, None)
    with_drift = score_track_match(
        session, source, seed, seed_full, track, _RbRow(bpm=140.0)
    )

    assert without_rb is not None
    assert with_drift is not None
    assert with_drift < without_rb


def test_score_track_match_remixer_credit_covers_missing_artist_match():
    # Seed artist doesn't match the DB primary artist, but the seed remixer
    # does — the candidate survives via the remixer-credit escape hatch. The
    # DB and seed titles both carry the remix annotation so title similarity
    # clears the threshold before the artist gate runs.
    session = _FakeSession()
    track = _track(
        session,
        track_id=1,
        file_name="a.mp3",
        title="Around The World (ATC Remix)",
    )
    _link(session, track_id=1, artist_id=10)
    _artist(session, "ATC", 10)
    source = Path("[Remix of Foo - Around The World] ATC - Remix.mp3")
    seed = SimpleMetadata(
        artist="Foo",
        title="Around The World (ATC Remix)",
        remixer="ATC",
    )
    seed_full = "Foo - Around The World"

    score = score_track_match(session, source, seed, seed_full, track, None)

    assert score is not None
    assert score >= MATCH_THRESHOLD


# --- find_matching_tracks --------------------------------------------------------


def test_find_matching_tracks_short_circuits_on_exact_filename():
    session = _FakeSession()
    track = _track(
        session,
        track_id=5,
        file_name="ATC - Around The World.mp3",
        title="Around The World",
    )

    matches = find_matching_tracks(
        session, Path("ATC - Around The World.mp3")
    )

    assert len(matches) == 1
    assert matches[0].track is track
    assert matches[0].score == 1.0


def test_find_matching_tracks_orders_by_score_then_id_for_ties():
    session = _FakeSession()
    # Two DB tracks with identical titles and artists both score perfectly; the
    # lower id must win the deterministic tie-break.
    _track(
        session,
        track_id=2,
        file_name="other.mp3",
        title="Around The World",
    )
    _link(session, track_id=2, artist_id=10)
    _artist(session, "ATC", 10)
    _track(
        session,
        track_id=1,
        file_name="other2.mp3",
        title="Around The World",
    )
    _link(session, track_id=1, artist_id=10)
    _artist(session, "ATC", 10)

    matches = find_matching_tracks(
        session, Path("ATC - Around The World.mp3")
    )

    assert len(matches) == 2
    assert matches[0].score == matches[1].score == 1.0
    assert [m.track.id for m in matches] == [1, 2]


def test_find_matching_tracks_deprioritizes_collaborator_annotation_on_ties():
    # Two tracks tie on score; the one whose formatted display title carries a
    # " & " collaborator annotation is sorted after the clean title. Both DB
    # titles share the `[camelot - key - bpm]` prefix, so extract_unformatted
    # title reduces them to "Around The World" and they score identically.
    session = _FakeSession()
    _track(
        session,
        track_id=1,
        file_name="other.mp3",
        title="[12A - C#m - 128.00] ATC - Around The World",
    )
    _link(session, track_id=1, artist_id=10)
    _artist(session, "ATC", 10)
    _track(
        session,
        track_id=2,
        file_name="other2.mp3",
        title="[12A - C#m - 128.00] ATC & LonelyFans - Around The World",
    )
    _link(session, track_id=2, artist_id=10)
    _artist(session, "ATC", 10)

    matches = find_matching_tracks(
        session, Path("ATC - Around The World.mp3")
    )

    assert len(matches) == 2
    assert matches[0].score == matches[1].score
    assert " & " not in (matches[0].track.title or "")
    assert " & " in (matches[1].track.title or "")


def test_find_matching_tracks_returns_empty_when_no_track_meets_threshold():
    session = _FakeSession()
    _track(session, track_id=1, file_name="a.mp3", title="Completely Unrelated")

    matches = find_matching_tracks(
        session, Path("ATC - Around The World.mp3")
    )

    assert matches == []


# --- apply_db_fields -------------------------------------------------------------


def test_apply_db_fields_overwrites_genre_and_label_from_db():
    metadata = SimpleMetadata(title="Track", artist="ATC", genre=None, label=None)
    track = Track()
    track.genre = "Trance"
    track.label = "Anjunabeats"

    merged = apply_db_fields(metadata, track)

    assert merged.genre == "Trance"
    assert merged.label == "Anjunabeats"
    # Original metadata is not mutated.
    assert metadata.genre is None
    assert metadata.title == "Track"


def test_apply_db_fields_preserves_existing_values_when_db_is_empty():
    metadata = SimpleMetadata(title="Track", genre="Techno", label="Label")
    track = Track()
    track.genre = None
    track.label = None

    merged = apply_db_fields(metadata, track)

    assert merged.genre == "Techno"
    assert merged.label == "Label"


def test_track_match_dataclass_is_frozen_and_comparable():
    track = Track()
    track.id = 1
    match = TrackMatch(track=track, score=0.9)

    assert match.score == 0.9
    with pytest.raises((AttributeError, Exception)):
        match.score = 0.5  # type: ignore[misc]
