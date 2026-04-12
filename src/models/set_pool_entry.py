from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Sequence, UniqueConstraint, func

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

    set_id = Column("set_id", ForeignKey("dj_set.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column("track_id", ForeignKey("track.id", ondelete="CASCADE"), nullable=False, index=True)
    insertion_order = Column("insertion_order", Integer, nullable=False, default=0)
    starred = Column("starred", Boolean, nullable=False, default=False, server_default="false")
    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
