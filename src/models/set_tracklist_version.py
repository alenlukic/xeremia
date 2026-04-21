from sqlalchemy import Column, DateTime, ForeignKey, Integer, Sequence, String, UniqueConstraint, func

from src.db import metadata, Base


class SetTracklistVersion(Base):
    __tablename__ = "set_tracklist_version"
    __table_args__ = (
        UniqueConstraint("set_id", "name", name="uq_tracklist_version_set_name"),
        {"extend_existing": True},
    )

    id = Column(
        Integer,
        Sequence("set_tracklist_version_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    set_id = Column("set_id", ForeignKey("dj_set.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column("name", String(256), nullable=False, default="v1")
    display_order = Column("display_order", Integer, nullable=False, default=0)
    explorer_tree_id = Column(
        "explorer_tree_id",
        ForeignKey("set_explorer_tree.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    created_at = Column("created_at", DateTime, server_default=func.now(), nullable=False)
