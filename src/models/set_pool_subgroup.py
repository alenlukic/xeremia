from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Sequence,
    String,
    func,
)

from src.db import metadata, Base


class SetPoolSubgroup(Base):
    __tablename__ = "set_pool_subgroup"
    __table_args__ = {"extend_existing": True}

    id = Column(
        Integer,
        Sequence("set_pool_subgroup_id_seq", metadata=metadata),
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
    name = Column("name", String(256), nullable=False)
    display_order = Column("display_order", Integer, nullable=False, default=0)
    created_at = Column("created_at", DateTime, server_default=func.now(), nullable=False)
