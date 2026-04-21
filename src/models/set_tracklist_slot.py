from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Sequence, Text, func

from src.db import metadata, Base


class SetTracklistSlot(Base):
    __tablename__ = "set_tracklist_slot"
    __table_args__ = {"extend_existing": True}

    id = Column(
        Integer,
        Sequence("set_tracklist_slot_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    version_id = Column(
        "version_id",
        ForeignKey("set_tracklist_version.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position = Column("position", Integer, nullable=False, default=0)
    note = Column("note", Text, nullable=False, default="", server_default="")
    is_inherited = Column("is_inherited", Boolean, nullable=False, default=False, server_default="false")
    created_at = Column("created_at", DateTime, server_default=func.now(), nullable=False)
