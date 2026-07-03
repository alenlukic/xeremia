from sqlalchemy import Column, DateTime, Integer, Sequence, String, func

from src.db import metadata, Base


class DjSet(Base):
    __tablename__ = "dj_set"
    __table_args__ = {"extend_existing": True}

    id = Column(
        Integer,
        Sequence("dj_set_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    name = Column("name", String(256), nullable=False)
    created_at = Column(
        "created_at", DateTime, server_default=func.now(), nullable=False
    )
    updated_at = Column(
        "updated_at",
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
