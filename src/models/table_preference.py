from sqlalchemy import Column, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB

from src.db import Base


# Sentinel device hash for legacy installation-global rows created before
# preferences became device-scoped. A new device with no rows of its own reads
# these as its starting configuration (see routes.api_get_table_preferences).
GLOBAL_DEVICE_HASH = "__global__"


class TablePreference(Base):
    """Device-scoped table column preferences (one row per device + table id).

    ``device_hash`` is a client-generated hash of the browser's device id, so
    each device keeps its own column order/visibility/width configuration.
    """

    __tablename__ = "table_preference"
    __table_args__ = {"extend_existing": True}

    device_hash = Column(
        String(64),
        primary_key=True,
        nullable=False,
        server_default=GLOBAL_DEVICE_HASH,
    )
    table_id = Column(String(32), primary_key=True)
    column_order = Column(JSONB, nullable=False)
    column_visibility = Column(JSONB, nullable=False)
    column_widths = Column(JSONB, nullable=False)
    updated_at = Column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
