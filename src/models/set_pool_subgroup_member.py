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


class SetPoolSubgroupMember(Base):
    __tablename__ = "set_pool_subgroup_member"
    __table_args__ = (
        UniqueConstraint("subgroup_id", "pool_entry_id", name="uq_subgroup_member"),
        {"extend_existing": True},
    )

    id = Column(
        Integer,
        Sequence("set_pool_subgroup_member_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    subgroup_id = Column(
        "subgroup_id",
        ForeignKey("set_pool_subgroup.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pool_entry_id = Column(
        "pool_entry_id",
        ForeignKey("set_pool_entry.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
