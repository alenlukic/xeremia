"""Explorer crate orchestration service.

Crates are library-scoped named track subsets shown by the Explorer matrix.
The immutable "global" crate (every track) is virtual and never stored, so
this service only manages user-created crates and their track memberships.
"""

import logging
from typing import List, Optional, Tuple

from src.models.explorer_crate import ExplorerCrate
from src.models.explorer_crate_member import ExplorerCrateMember

logger = logging.getLogger(__name__)


class CrateService:
    def __init__(self, session):
        self.session = session

    def get_crate(self, crate_id: int) -> Optional[ExplorerCrate]:
        return (
            self.session.query(ExplorerCrate).filter_by(id=crate_id).first()
        )

    def list_crates(self) -> List[ExplorerCrate]:
        return (
            self.session.query(ExplorerCrate)
            .order_by(ExplorerCrate.display_order, ExplorerCrate.id)
            .all()
        )

    def list_memberships(self) -> List[ExplorerCrateMember]:
        return (
            self.session.query(ExplorerCrateMember)
            .order_by(ExplorerCrateMember.crate_id, ExplorerCrateMember.id)
            .all()
        )

    def crate_create(self, name: str) -> ExplorerCrate:
        current_max = (
            self.session.query(ExplorerCrate.display_order)
            .order_by(ExplorerCrate.display_order.desc())
            .first()
        )
        next_order = (current_max[0] + 1) if current_max else 0
        crate = ExplorerCrate(name=name, display_order=next_order)
        self.session.add(crate)
        self.session.flush()
        return crate

    def crate_rename(self, crate_id: int, name: str) -> Optional[ExplorerCrate]:
        crate = self.get_crate(crate_id)
        if crate is None:
            return None
        crate.name = name
        self.session.flush()
        return crate

    def crate_delete(self, crate_id: int) -> bool:
        crate = self.get_crate(crate_id)
        if crate is None:
            return False
        self.session.query(ExplorerCrateMember).filter_by(
            crate_id=crate_id,
        ).delete()
        removed_order = crate.display_order
        self.session.delete(crate)
        self.session.flush()
        remaining = (
            self.session.query(ExplorerCrate)
            .filter(ExplorerCrate.display_order > removed_order)
            .all()
        )
        for other in remaining:
            other.display_order -= 1
        self.session.flush()
        return True

    def crate_add_track(
        self, crate_id: int, track_id: int
    ) -> Tuple[Optional[ExplorerCrateMember], Optional[str]]:
        crate = self.get_crate(crate_id)
        if crate is None:
            return None, "Crate not found"

        existing = (
            self.session.query(ExplorerCrateMember)
            .filter_by(crate_id=crate_id, track_id=track_id)
            .first()
        )
        if existing:
            return existing, None
        member = ExplorerCrateMember(crate_id=crate_id, track_id=track_id)
        self.session.add(member)
        self.session.flush()
        return member, None

    def crate_remove_track(
        self, crate_id: int, track_id: int
    ) -> Tuple[bool, Optional[str]]:
        crate = self.get_crate(crate_id)
        if crate is None:
            return False, "Crate not found"

        member = (
            self.session.query(ExplorerCrateMember)
            .filter_by(crate_id=crate_id, track_id=track_id)
            .first()
        )
        if member is None:
            return False, "Membership not found"
        self.session.delete(member)
        self.session.flush()
        return True, None
