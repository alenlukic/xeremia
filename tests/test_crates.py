"""Service-level tests for library-scoped Explorer crates.

Crates are named subsets of the whole track library; membership references
track ids directly and is independent of any DJ set.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from src.db import Base
from src.crates.service import CrateService
from src.models.explorer_crate import ExplorerCrate
from src.models.explorer_crate_member import ExplorerCrateMember


_TABLES = [
    ExplorerCrate.__table__,
    ExplorerCrateMember.__table__,
]


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=_TABLES)
    _Session = sessionmaker(bind=engine)
    s = _Session()
    yield s
    s.close()


@pytest.fixture
def svc(session):
    return CrateService(session)


class TestCrateCRUD:
    def test_create_assigns_incrementing_display_order(
        self, svc: CrateService, session: Session
    ):
        c1 = svc.crate_create("Peak Time")
        c2 = svc.crate_create("Closers")
        session.commit()
        assert c1.display_order == 0
        assert c2.display_order == 1

    def test_list_orders_by_display_order(
        self, svc: CrateService, session: Session
    ):
        svc.crate_create("A")
        svc.crate_create("B")
        session.commit()
        assert [c.name for c in svc.list_crates()] == ["A", "B"]

    def test_rename(self, svc: CrateService, session: Session):
        crate = svc.crate_create("Peak Time")
        session.commit()
        renamed = svc.crate_rename(crate.id, "After Hours")
        assert renamed is not None
        assert renamed.name == "After Hours"

    def test_rename_missing_returns_none(
        self, svc: CrateService, session: Session
    ):
        assert svc.crate_rename(999, "Nope") is None

    def test_delete_compacts_display_order_and_removes_members(
        self, svc: CrateService, session: Session
    ):
        c1 = svc.crate_create("A")
        c2 = svc.crate_create("B")
        c3 = svc.crate_create("C")
        session.commit()
        svc.crate_add_track(c1.id, 10)
        session.commit()
        assert svc.crate_delete(c1.id) is True
        session.commit()
        assert c2.display_order == 0
        assert c3.display_order == 1
        assert session.query(ExplorerCrateMember).count() == 0

    def test_delete_missing_returns_false(
        self, svc: CrateService, session: Session
    ):
        assert svc.crate_delete(999) is False


class TestCrateMembership:
    def test_add_and_remove_track(self, svc: CrateService, session: Session):
        crate = svc.crate_create("Peak Time")
        session.commit()
        member, err = svc.crate_add_track(crate.id, 10)
        assert err is None
        assert member is not None
        assert member.track_id == 10
        ok, err = svc.crate_remove_track(crate.id, 10)
        assert ok is True
        assert err is None
        assert session.query(ExplorerCrateMember).count() == 0

    def test_add_track_dedup(self, svc: CrateService, session: Session):
        crate = svc.crate_create("Peak Time")
        session.commit()
        m1, _ = svc.crate_add_track(crate.id, 10)
        m2, err = svc.crate_add_track(crate.id, 10)
        assert err is None
        assert m1.id == m2.id
        assert session.query(ExplorerCrateMember).count() == 1

    def test_add_track_to_missing_crate_errors(
        self, svc: CrateService, session: Session
    ):
        member, err = svc.crate_add_track(999, 10)
        assert member is None
        assert err is not None

    def test_remove_missing_membership_errors(
        self, svc: CrateService, session: Session
    ):
        crate = svc.crate_create("Peak Time")
        session.commit()
        ok, err = svc.crate_remove_track(crate.id, 42)
        assert ok is False
        assert err is not None

    def test_list_memberships_groups_by_crate(
        self, svc: CrateService, session: Session
    ):
        c1 = svc.crate_create("A")
        c2 = svc.crate_create("B")
        session.commit()
        svc.crate_add_track(c2.id, 30)
        svc.crate_add_track(c1.id, 10)
        svc.crate_add_track(c1.id, 20)
        session.commit()
        memberships = svc.list_memberships()
        assert [(m.crate_id, m.track_id) for m in memberships] == [
            (c1.id, 10),
            (c1.id, 20),
            (c2.id, 30),
        ]
