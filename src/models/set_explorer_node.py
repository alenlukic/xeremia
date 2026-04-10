from sqlalchemy import Column, DateTime, ForeignKey, Integer, Sequence, String, UniqueConstraint, func

from src.db import metadata, Base


class SetExplorerNode(Base):
    __tablename__ = "set_explorer_node"
    __table_args__ = (
        UniqueConstraint("set_id", "node_id", name="uq_explorer_node_set"),
        {"extend_existing": True},
    )

    id = Column(
        Integer,
        Sequence("set_explorer_node_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    set_id = Column("set_id", ForeignKey("dj_set.id", ondelete="CASCADE"), nullable=False, index=True)
    node_id = Column("node_id", String(64), nullable=False)
    track_id = Column("track_id", ForeignKey("track.id", ondelete="CASCADE"), nullable=False, index=True)
    level = Column("level", Integer, nullable=False, default=0)
    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
