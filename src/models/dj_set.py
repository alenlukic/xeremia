from sqlalchemy import JSON, Column, DateTime, Integer, Sequence, String, func
from sqlalchemy.dialects.postgresql import JSONB

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
    # Sequencer view state for this set: start/end minutes, zoom and the
    # selected view. It belongs to the set rather than the device, because a
    # set's start and end times are a property of the gig itself.
    sequencer = Column("sequencer", JSONB().with_variant(JSON, "sqlite"), nullable=True)
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
