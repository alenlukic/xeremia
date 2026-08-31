from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Sequence,
    UniqueConstraint,
    func,
)

from src.db import metadata, Base


class ExplorerCrateMember(Base):
    __tablename__ = "explorer_crate_member"
    __table_args__ = (
        UniqueConstraint("crate_id", "track_id", name="uq_explorer_crate_member"),
        {"extend_existing": True},
    )

    id = Column(
        Integer,
        Sequence("explorer_crate_member_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    crate_id = Column(
        "crate_id",
        ForeignKey("explorer_crate.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    track_id = Column(
        "track_id",
        ForeignKey("track.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
