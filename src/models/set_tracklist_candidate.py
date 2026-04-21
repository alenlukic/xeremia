from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Sequence, func

from src.db import metadata, Base


class SetTracklistCandidate(Base):
    __tablename__ = "set_tracklist_candidate"
    __table_args__ = {"extend_existing": True}

    id = Column(
        Integer,
        Sequence("set_tracklist_candidate_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    slot_id = Column(
        "slot_id",
        ForeignKey("set_tracklist_slot.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    track_id = Column("track_id", ForeignKey("track.id", ondelete="SET NULL"), nullable=True, index=True)
    is_selected = Column("is_selected", Boolean, nullable=False, default=False, server_default="false")
    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
