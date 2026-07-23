from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Sequence,
    String,
    UniqueConstraint,
    func,
)

from src.db import metadata, Base


class SetPoolEntry(Base):
    __tablename__ = "set_pool_entry"
    __table_args__ = (
        UniqueConstraint("set_id", "track_id", name="uq_pool_set_track"),
        {"extend_existing": True},
    )

    id = Column(
        Integer,
        Sequence("set_pool_entry_id_seq", metadata=metadata),
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
    insertion_order = Column("insertion_order", Integer, nullable=False, default=0)
    # Optional per-track highlight color (#RRGGBB) rendered as a bar in the pool.
    highlight_color = Column("highlight_color", String(9), nullable=True)
    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
