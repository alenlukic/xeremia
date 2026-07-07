from __future__ import annotations

import csv
import io
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from src.track_metadata.key_utils import canonicalize_key
from src.track_metadata.models import SimpleMetadata

_TITLE_HEADERS = ("Track Title", "Title", "Name")
_ARTIST_HEADERS = ("Artist", "Artists")
_BPM_HEADERS = ("BPM", "Tempo")
_KEY_HEADERS = ("Key", "Musical Key", "Camelot Key")
_FILENAME_HEADERS = ("File Name", "Filename")
_METADATA_PREFIX = re.compile(r"^\[[^\]]+\]\s*")
_GENERIC_MIX = re.compile(r"\b(?:original|extended)\s+mix\b", re.IGNORECASE)


@dataclass(frozen=True)
class RekordboxMetadata:
    title: str
    bpm: float | None = None
    key: str | None = None
    artist: str | None = None
    file_name: str | None = None
    row_number: int | None = None

    def to_simple_metadata(self) -> SimpleMetadata:
        return SimpleMetadata(
            title=self.title, artist=self.artist, bpm=self.bpm, key=self.key
        )


class RekordboxMetadataIndex:
    def __init__(self, rows: list[RekordboxMetadata]) -> None:
        self.rows = rows
        self._aliases: dict[str, list[RekordboxMetadata]] = {}
        for row in rows:
            for alias in _row_aliases(row):
                self._aliases.setdefault(alias, []).append(row)

    @classmethod
    def from_tsv(cls, path: Path) -> "RekordboxMetadataIndex":
        text = _decode_tsv(path)
        reader = csv.DictReader(io.StringIO(text), delimiter="\t")
        if reader.fieldnames is None:
            raise ValueError(f"Rekordbox TSV has no header row: {path}")

        fieldnames = [field.strip().lstrip("\ufeff") for field in reader.fieldnames]
        reader.fieldnames = fieldnames
        title_header = _find_header(fieldnames, _TITLE_HEADERS)
        if title_header is None:
            raise ValueError(
                "Rekordbox TSV must include a Track Title, Title, or Name column"
            )

        artist_header = _find_header(fieldnames, _ARTIST_HEADERS)
        bpm_header = _find_header(fieldnames, _BPM_HEADERS)
        key_header = _find_header(fieldnames, _KEY_HEADERS)
        filename_header = _find_header(fieldnames, _FILENAME_HEADERS)

        rows: list[RekordboxMetadata] = []
        for row_number, raw in enumerate(reader, start=2):
            title = _clean_cell(raw.get(title_header))
            if not title:
                continue
            rows.append(
                RekordboxMetadata(
                    title=title,
                    artist=(
                        _clean_cell(raw.get(artist_header)) if artist_header else None
                    ),
                    bpm=_parse_bpm(raw.get(bpm_header)) if bpm_header else None,
                    key=canonicalize_key(raw.get(key_header)) if key_header else None,
                    file_name=(
                        _clean_cell(raw.get(filename_header))
                        if filename_header
                        else None
                    ),
                    row_number=row_number,
                )
            )
        return cls(rows)

    def match(
        self,
        *,
        source: Path,
        metadata: SimpleMetadata,
    ) -> RekordboxMetadata | None:
        matches: dict[int, RekordboxMetadata] = {}
        for alias in _track_aliases(source, metadata):
            for row in self._aliases.get(alias, []):
                matches[id(row)] = row

        if len(matches) == 1:
            return next(iter(matches.values()))

        if len(matches) > 1 and metadata.artist:
            artist_alias = _normalize_text(metadata.artist)
            artist_matches = [
                row
                for row in matches.values()
                if row.artist and _normalize_text(row.artist) == artist_alias
            ]
            if len(artist_matches) == 1:
                return artist_matches[0]
        return None


def _decode_tsv(path: Path) -> str:
    raw = path.read_bytes()
    encodings = (("utf-16",) if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else ()) + (
        "utf-8-sig",
        "utf-16",
        "cp1252",
    )
    for encoding in encodings:
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Unable to decode Rekordbox TSV: {path}")


def _find_header(fieldnames: list[str], candidates: tuple[str, ...]) -> str | None:
    by_casefold = {field.casefold(): field for field in fieldnames}
    for candidate in candidates:
        match = by_casefold.get(candidate.casefold())
        if match is not None:
            return match
    return None


def _clean_cell(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _parse_bpm(value: str | None) -> float | None:
    cleaned = _clean_cell(value)
    if cleaned is None:
        return None
    try:
        bpm = float(cleaned.replace(",", "."))
    except ValueError:
        return None
    return bpm if bpm > 0 else None


def _normalize_text(value: str | None, *, remove_generic_mix: bool = False) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = _METADATA_PREFIX.sub("", normalized)
    if remove_generic_mix:
        normalized = _GENERIC_MIX.sub("", normalized)
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[^\w]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _aliases(value: str | None) -> set[str]:
    aliases = {
        _normalize_text(value),
        _normalize_text(value, remove_generic_mix=True),
    }
    return {alias for alias in aliases if alias}


def _row_aliases(row: RekordboxMetadata) -> set[str]:
    aliases = set(_aliases(row.title))
    if row.artist:
        aliases.update(_aliases(f"{row.artist} - {row.title}"))
    if row.file_name:
        aliases.update(_aliases(Path(row.file_name).stem))
    title_without_prefix = _METADATA_PREFIX.sub("", row.title).strip()
    if " - " in title_without_prefix:
        _left, right = title_without_prefix.split(" - ", 1)
        aliases.update(_aliases(right))
    return aliases


def _parse_source_seed(source: Path) -> SimpleMetadata:
    stem = _METADATA_PREFIX.sub("", source.stem).strip()
    remix_match = re.match(
        r"^\[Remix of (.+?) - (.+?)\]", source.stem, flags=re.IGNORECASE
    )
    if remix_match:
        return SimpleMetadata(
            artist=remix_match.group(1).strip(),
            title=remix_match.group(2).strip(),
        )
    if " - " in stem:
        artist, title = stem.split(" - ", 1)
        return SimpleMetadata(artist=artist.strip(), title=title.strip())
    return SimpleMetadata(title=stem or None)


def _track_aliases(source: Path, metadata: SimpleMetadata) -> set[str]:
    parsed = _parse_source_seed(source)
    values = {
        metadata.title,
        parsed.title,
        source.stem,
    }
    if metadata.artist and metadata.title:
        values.add(f"{metadata.artist} - {metadata.title}")
    if parsed.artist and parsed.title:
        values.add(f"{parsed.artist} - {parsed.title}")

    aliases: set[str] = set()
    for value in values:
        aliases.update(_aliases(value))
        value_without_prefix = _METADATA_PREFIX.sub("", value).strip() if value else ""
        if " - " in value_without_prefix:
            _left, right = value_without_prefix.split(" - ", 1)
            aliases.update(_aliases(right))
    return aliases
