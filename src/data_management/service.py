from src.db import database
from src.models.track import Track


def load_tracks(sesh=None):
    session = sesh or database.create_session()
    try:
        return session.query(Track).all()
    finally:
        if sesh is None:
            session.close()
