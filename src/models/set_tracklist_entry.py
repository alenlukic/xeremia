from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Sequence,
    Text,
    UniqueConstraint,
    func,
)

from src.db import metadata, Base


class SetTracklistEntry(Base):
    __tablename__ = "set_tracklist_entry"
    __table_args__ = (
        UniqueConstraint("set_id", "track_id", name="uq_tracklist_set_track"),
        {"extend_existing": True},
    )

    id = Column(
        Integer,
        Sequence("set_tracklist_entry_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    set_id = Column(
        "set_id",
        ForeignKey("dj_set.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    track_id = Column(
        "track_id",
        ForeignKey("track.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position = Column("position", Integer, nullable=False, default=0)
    note = Column("note", Text, nullable=False, default="", server_default="")

    # Sequencer overrides. Each is null until the DJ sets it, and null means
    # "derive from the track": play length from the play fraction, end time from
    # packing, played BPM from the original BPM.
    play_minutes = Column("play_minutes", Numeric(6, 2))
    pinned_end_minutes = Column("pinned_end_minutes", Numeric(7, 2))
    bpm_override = Column("bpm_override", Numeric(5, 2))

    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
