from __future__ import annotations

import os

# --- Endpoints -------------------------------------------------------------
MUSICBRAINZ_BASE_URL = "https://musicbrainz.org/ws/2"
DISCOGS_BASE_URL = "https://api.discogs.com"
LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/"
WEB_SEARCH_URL = "https://html.duckduckgo.com/html/"

# --- Transport -------------------------------------------------------------
HTTP_TIMEOUT_SECONDS = 15
MUSICBRAINZ_MIN_INTERVAL_SECONDS = 1.05
DISCOGS_MIN_INTERVAL_SECONDS = 1.05

DEFAULT_USER_AGENT = os.getenv(
    "MUSIC_METADATA_USER_AGENT",
    os.getenv(
        "DISCOGS_USER_AGENT",
        "metadata-hydrator/1.0 (https://example.com/contact)",
    ),
)

# --- AcoustID --------------------------------------------------------------
ACOUSTID_MIN_SCORE = 0.80

# --- MusicBrainz recording search -----------------------------------------
MUSICBRAINZ_SEARCH_LIMIT = 5
MUSICBRAINZ_MATCH_THRESHOLD = 0.72
MUSICBRAINZ_TITLE_WEIGHT = 0.50
MUSICBRAINZ_ARTIST_WEIGHT = 0.35
MUSICBRAINZ_RELEASE_WEIGHT = 0.15
MUSICBRAINZ_MISSING_ARTIST_SCORE = 0.80
MUSICBRAINZ_MISSING_RELEASE_SCORE = 0.50

# --- Discogs release search -----------------------------------------------
DISCOGS_PER_PAGE = 5
DISCOGS_MATCH_THRESHOLD = 0.72
DISCOGS_TITLE_WEIGHT = 0.55
DISCOGS_ARTIST_WEIGHT = 0.45
DISCOGS_MISSING_ARTIST_SCORE = 0.80

# --- Web search ------------------------------------------------------------
WEB_SEARCH_MAX_RESULTS = 10
WEB_SEARCH_MIN_SCORE = 0.55
WEB_SEARCH_TITLE_WEIGHT = 0.65
WEB_SEARCH_ARTIST_WEIGHT = 0.35

# --- Genre resolution ------------------------------------------------------
BEATPORT_TAG_CONFIDENCE = 0.98
