from sqlalchemy import Column, DateTime, ForeignKey, Integer, Sequence, String, UniqueConstraint, func

from src.db import metadata, Base


class SetExplorerEdge(Base):
    __tablename__ = "set_explorer_edge"
    __table_args__ = (
        UniqueConstraint("set_id", "parent_node_id", "child_node_id", name="uq_explorer_edge"),
        {"extend_existing": True},
    )

    id = Column(
        Integer,
        Sequence("set_explorer_edge_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    set_id = Column("set_id", ForeignKey("dj_set.id", ondelete="CASCADE"), nullable=False, index=True)
    tree_id = Column("tree_id", ForeignKey("set_explorer_tree.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_node_id = Column("parent_node_id", String(64), nullable=False)
    child_node_id = Column("child_node_id", String(64), nullable=False)
    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
