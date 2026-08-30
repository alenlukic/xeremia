"""Repair genre and label rows damaged by prior ingestion.

Usage::

    .venv/bin/python -m src.scripts.repair_genre_label --snapshot PATH
    .venv/bin/python -m src.scripts.repair_genre_label --snapshot PATH --apply
    .venv/bin/python -m src.scripts.repair_genre_label --snapshot PATH --verify-only

The snapshot is pretty-formatted JSON holding one object per track the write
classes will change. Each object carries its repair classes and an explicit
`old -> new` delta per touched field; fields that do not change are omitted,
and `null` inside a delta stands for an empty pre-write value. To restore by
hand, split each delta on the last " -> " and take the left side — target
values are canonical vocabulary or label names and never contain the
delimiter.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from src.data_management.genre_vocabulary import resolve_canonical_genre
from src.track_metadata.label import resolve_label
from src.track_metadata.underground import LEGACY_TRACK_ID_CEILING, UNDERGROUND_MIN_BPM

NAMED_GENRE_OVERRIDES: dict[int, str] = {
    9565: "Soundtracks",
    9566: "Soundtracks",
    9567: "Soundtracks",
    9910: "Drum & Bass",
    9922: "House",
}

NAMED_LABEL_OVERRIDES: dict[int, str] = {
    9565: "Supergiant Games",
    9566: "Supergiant Games",
    9567: "Supergiant Games",
}

WRITE_CLASSES = frozenset(
    {
        "genre_named_override",
        "genre_soundtrack_collision",
        "genre_alias",
        "genre_whitespace",
        "label_named_override",
        "label_canonical_mismatch",
        "label_soundtrack_publisher",
        "label_underground_default",
    }
)

REPORT_CLASSES = frozenset(
    {
        "genre_off_vocabulary",
        "label_rejected",
        "label_held_below_threshold",
        "label_legacy_excluded",
    }
)

ALL_CLASSES = tuple(sorted(WRITE_CLASSES | REPORT_CLASSES))


@dataclass
class RepairRow:
    row_id: int
    file_name: str
    genre: str | None
    label: str | None
    bpm: float | None


@dataclass
class ClassifiedRow:
    row_id: int
    class_name: str
    genre_target: str | None = None
    label_target: str | None = None


@dataclass
class RepairReport:
    classes: dict[str, list[ClassifiedRow]] = field(default_factory=dict)

    def add(self, entry: ClassifiedRow) -> None:
        self.classes.setdefault(entry.class_name, []).append(entry)


@dataclass
class ChangeRow:
    """One row the write classes will change, with its pre-write values."""

    row_id: int
    file_name: str
    class_names: list[str] = field(default_factory=list)
    genre_old: str | None = None
    genre_new: str | None = None
    label_old: str | None = None
    label_new: str | None = None


def _candidate_rows(session: Any) -> list[RepairRow]:
    from src.models.track import Track

    rows: list[RepairRow] = []
    for track in session.query(Track).all():
        rows.append(
            RepairRow(
                row_id=int(track.id),
                file_name=str(track.file_name or ""),
                genre=track.genre,
                label=track.label,
                bpm=float(track.bpm) if track.bpm is not None else None,
            )
        )
    return rows


def _classify_genre(row: RepairRow) -> tuple[ClassifiedRow | None, str | None]:
    """Return the genre repair class and the genre the label rules must use.

    The vocabulary lookup appends a review-queue record for every rejected
    value, so one row resolves its genre at most once.
    """
    if row.genre is None or not str(row.genre).strip():
        return None, None

    if row.row_id in NAMED_GENRE_OVERRIDES:
        target = NAMED_GENRE_OVERRIDES[row.row_id]
        if row.genre == target:
            return None, target
        entry = ClassifiedRow(row.row_id, "genre_named_override", genre_target=target)
        return entry, target

    stripped = str(row.genre).strip()
    lowered = stripped.casefold()
    if lowered in {"soundtrack", "soundtracks"} and stripped != "Soundtracks":
        entry = ClassifiedRow(
            row.row_id,
            "genre_soundtrack_collision",
            genre_target="Soundtracks",
        )
        return entry, "Soundtracks"

    canonical = resolve_canonical_genre(stripped, context="repair_genre_label")

    if stripped != row.genre:
        target = canonical if canonical is not None else stripped
        entry = ClassifiedRow(row.row_id, "genre_whitespace", genre_target=target)
        return entry, target

    if canonical is not None and canonical != stripped:
        entry = ClassifiedRow(row.row_id, "genre_alias", genre_target=canonical)
        return entry, canonical

    if canonical is None:
        return ClassifiedRow(row.row_id, "genre_off_vocabulary"), stripped

    return None, canonical


def _classify_label(
    row: RepairRow, genre_target: str | None
) -> ClassifiedRow | None:
    label = row.label
    if row.row_id in NAMED_LABEL_OVERRIDES:
        target = NAMED_LABEL_OVERRIDES[row.row_id]
        if label == target:
            return None
        return ClassifiedRow(
            row.row_id,
            "label_named_override",
            label_target=target,
        )

    if label is not None and str(label).strip():
        resolved = resolve_label(label, authoritative=True)
        if resolved is None:
            return ClassifiedRow(row.row_id, "label_rejected")
        if resolved != label:
            return ClassifiedRow(
                row.row_id,
                "label_canonical_mismatch",
                label_target=resolved,
            )
        return None

    if row.row_id < LEGACY_TRACK_ID_CEILING:
        return ClassifiedRow(row.row_id, "label_legacy_excluded")

    if genre_target == "Soundtracks":
        return ClassifiedRow(
            row.row_id,
            "label_soundtrack_publisher",
            label_target="Supergiant Games",
        )

    if row.bpm is not None and row.bpm >= UNDERGROUND_MIN_BPM:
        return ClassifiedRow(
            row.row_id,
            "label_underground_default",
            label_target="CDR",
        )

    return ClassifiedRow(row.row_id, "label_held_below_threshold")


def classify(session: Any) -> RepairReport:
    """Sort every candidate row into a named repair class."""
    report = RepairReport()
    for row in _candidate_rows(session):
        genre_class, genre_target = _classify_genre(row)
        if genre_class is not None:
            report.add(genre_class)

        label_class = _classify_label(row, genre_target)
        if label_class is not None:
            if label_class.class_name in WRITE_CLASSES:
                label_class.genre_target = (
                    genre_class.genre_target if genre_class is not None else None
                )
            report.add(label_class)
    return report


def plan_changes(rows: list[RepairRow], report: RepairReport) -> list[ChangeRow]:
    """Join the write-class entries against the candidate rows.

    One record per changing row, with the pre-write value and the target
    value for each field the repair touches. Report-only classes never
    appear, because they write nothing.
    """
    rows_by_id = {row.row_id: row for row in rows}
    changes: dict[int, ChangeRow] = {}
    for class_name in sorted(WRITE_CLASSES):
        for entry in report.classes.get(class_name, []):
            row = rows_by_id.get(entry.row_id)
            if row is None:
                continue
            change = changes.setdefault(
                entry.row_id,
                ChangeRow(row_id=row.row_id, file_name=row.file_name),
            )
            change.class_names.append(class_name)
            if entry.genre_target is not None:
                change.genre_old = row.genre
                change.genre_new = entry.genre_target
            if entry.label_target is not None:
                change.label_old = row.label
                change.label_new = entry.label_target
    return [changes[row_id] for row_id in sorted(changes)]


def _render_delta(old: str | None, new: str | None) -> str:
    if new is None:
        return ""
    old_text = "null" if old is None or old == "" else str(old)
    return f"{old_text} -> {new}"


def write_snapshot(path: Path, changes: list[ChangeRow]) -> None:
    """Write the rollback JSON for the rows the write classes will change.

    The file doubles as the pre-apply review artifact, so each object names
    its repair classes and carries an `old -> new` delta under the touched
    field's own key; untouched fields are omitted. Never overwritten.
    """
    if path.exists():
        raise FileExistsError(f"snapshot already exists: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    payload: list[dict[str, Any]] = []
    for change in changes:
        entry: dict[str, Any] = {
            "id": change.row_id,
            "repair_classes": change.class_names,
        }
        if change.file_name:
            entry["file_name"] = change.file_name
        if change.genre_new is not None:
            entry["genre"] = _render_delta(change.genre_old, change.genre_new)
        if change.label_new is not None:
            entry["label"] = _render_delta(change.label_old, change.label_new)
        payload.append(entry)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def apply(session: Any, report: RepairReport) -> None:
    """Write every repair the write classes hold, then commit once.

    The class order is fixed, so two runs against the same report write the
    same values in the same order.
    """
    from src.models.track import Track

    for class_name in sorted(WRITE_CLASSES):
        for entry in report.classes.get(class_name, []):
            track = session.query(Track).filter_by(id=entry.row_id).first()
            if track is None:
                continue
            if entry.genre_target is not None:
                track.genre = entry.genre_target
            if entry.label_target is not None:
                track.label = entry.label_target
    session.commit()


def coverage(session: Any) -> tuple[float, float]:
    """Return the filled label percentage for the new cohort, then the legacy."""
    rows = _candidate_rows(session)
    legacy = [row for row in rows if row.row_id < LEGACY_TRACK_ID_CEILING]
    newer = [row for row in rows if row.row_id >= LEGACY_TRACK_ID_CEILING]

    def _percent(group: list[RepairRow]) -> float:
        if not group:
            return 100.0
        filled = sum(1 for row in group if row.label and str(row.label).strip())
        return 100.0 * filled / len(group)

    return _percent(newer), _percent(legacy)


def _print_report(report: RepairReport) -> None:
    for class_name in ALL_CLASSES:
        entries = report.classes.get(class_name, [])
        print(f"{class_name}: {len(entries)}")
        if class_name == "label_soundtrack_publisher":
            for entry in entries:
                print(f"  id={entry.row_id}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Repair genre and label rows.")
    parser.add_argument("--snapshot", type=Path, help="CSV snapshot path")
    parser.add_argument("--apply", action="store_true", help="Write repairs")
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Exit non-zero while writable classes still hold rows",
    )
    args = parser.parse_args(argv)

    if args.snapshot is None:
        print("--snapshot is required", file=sys.stderr)
        return 1

    from src.db import database

    session = database.create_session()
    try:
        report = classify(session)
        newer_cov, legacy_cov = coverage(session)

        if not args.verify_only and not args.apply:
            write_snapshot(
                args.snapshot, plan_changes(_candidate_rows(session), report)
            )

        _print_report(report)
        print(f"new_cohort_label_coverage: {newer_cov:.1f}%")
        print(f"legacy_label_coverage: {legacy_cov:.1f}%")

        if args.verify_only:
            pending = any(
                report.classes.get(class_name) for class_name in sorted(WRITE_CLASSES)
            )
            return 1 if pending else 0

        if args.apply:
            # RISK-2 control: the rollback snapshot must reach the disk before
            # the first write, whether or not a dry run produced it already.
            if not args.snapshot.exists():
                try:
                    write_snapshot(
                        args.snapshot,
                        plan_changes(_candidate_rows(session), report),
                    )
                except OSError as error:
                    print(
                        f"snapshot write failed, no row written: {error}",
                        file=sys.stderr,
                    )
                    return 1
            apply(session, report)

        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
