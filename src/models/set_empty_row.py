from sqlalchemy import Column, DateTime, ForeignKey, Integer, Sequence, String, func

from src.db import metadata, Base


class SetEmptyRow(Base):
    __tablename__ = "set_empty_row"
    __table_args__ = {"extend_existing": True}

    id = Column(
        Integer,
        Sequence("set_empty_row_id_seq", metadata=metadata),
        primary_key=True,
        index=True,
        unique=True,
    )

    set_id = Column("set_id", ForeignKey("dj_set.id", ondelete="CASCADE"), nullable=False, index=True)
    surface = Column("surface", String(16), nullable=False)
    position = Column("position", Integer, nullable=False, default=0)
    added_at = Column("added_at", DateTime, server_default=func.now(), nullable=False)
