from sqlalchemy import Column, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB

from src.db import Base


class TablePreference(Base):
    """Installation-global table column preferences (one row per table id)."""

    __tablename__ = "table_preference"
    __table_args__ = {"extend_existing": True}

    table_id = Column(String(32), primary_key=True)
    column_order = Column(JSONB, nullable=False)
    column_visibility = Column(JSONB, nullable=False)
    column_widths = Column(JSONB, nullable=False)
    updated_at = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
