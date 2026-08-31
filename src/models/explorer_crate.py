from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    Sequence,
    String,
    func,
)

from src.db import metadata, Base


class ExplorerCrate(Base):
    """A named, library-scoped subset of tracks shown by the Explorer matrix.

    The "global" crate (every track in the library) is virtual and lives
    client-side; only user-created crates are stored here. Crates are not
    tied to any DJ set.
    """

    __tablename__ = "explorer_crate"
    __table_args__ = {"extend_existing": True}

    id = Column(
        Integer,
        Sequence("explorer_crate_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    name = Column("name", String(256), nullable=False)
    display_order = Column("display_order", Integer, nullable=False, default=0)
    created_at = Column("created_at", DateTime, server_default=func.now(), nullable=False)
