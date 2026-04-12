from sqlalchemy import Column, DateTime, ForeignKey, Integer, Sequence, String, UniqueConstraint, func

from src.db import metadata, Base


class SetExplorerTree(Base):
    __tablename__ = "set_explorer_tree"
    __table_args__ = (
        UniqueConstraint("set_id", "name", name="uq_explorer_tree_set_name"),
        {"extend_existing": True},
    )

    id = Column(
        Integer,
        Sequence("set_explorer_tree_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    set_id = Column("set_id", ForeignKey("dj_set.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column("name", String(256), nullable=False, default="Main")
    created_at = Column("created_at", DateTime, server_default=func.now(), nullable=False)
