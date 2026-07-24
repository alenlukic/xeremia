from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Sequence,
    String,
    UniqueConstraint,
    func,
)

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

    set_id = Column(
        "set_id",
        ForeignKey("dj_set.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_id = Column("node_id", String(64), nullable=False)
    track_id = Column(
        "track_id",
        ForeignKey("track.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Free-canvas position (grid-snapped coordinates in SVG user-space). The
    # Explorer is a graph on an infinite canvas: `x`/`y` are the source of truth
    # for placement. `level`/`col_index` are retained for backward compatibility
    # with existing rows but are no longer used for layout.
    x = Column("x", Float, nullable=False, default=0.0)
    y = Column("y", Float, nullable=False, default=0.0)
    level = Column("level", Integer, nullable=False, default=0)
    col_index = Column("col_index", Integer, nullable=False, default=0)
    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
