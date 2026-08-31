# Xeremia

## Overview

A toolkit for DJs that manages a music collection database, enriches and ingests track metadata from multiple sources, computes audio-similarity features, and provides a browser-based client for finding harmonically compatible transition matches and building DJ sets.

### Metadata agent (ingestion & enrichment)

The metadata agent is the single ingestion path. It discovers new audio files, stages them (converting WAV to AIFF), hydrates ID3 tags from AcoustID, MusicBrainz, and Discogs with an optional cursor-sdk fallback agent, resolves genre and label through layered heuristics, and fuses BPM/key from an optional Rekordbox TSV export with essentia/madmom/librosa analyzer consensus. It writes enriched tags back to each file, renames and copies it to the augmented directory, and upserts `track`/`artist`/`artist_track` records into PostgreSQL. Tracks missing mission-critical fields route to a remediation directory for later finalization.

### Audio features & similarity

Computes compact CQT-based descriptor vectors and ONNX-derived audio traits for tracks, storing results in PostgreSQL. Pairwise cosine similarity feeds harmonic-mixing scores during transition matching.

### Harmonic mixing & transition matching

Ranks transition candidates using weighted factors — Camelot key compatibility, BPM proximity, freshness, genre and mood continuity, vocal clash, energy, and compact audio descriptor similarity. Available in the web client's Matches view, with live-adjustable scoring weights.

### Web client & set building

A React SPA backed by FastAPI provides Elasticsearch-powered search, collection browsing with filters, transition match exploration, DJ set building (pool with subgroups, tracklist with notes and sequencer overrides, visual explorer canvas, sequencer), scoring-weight and cache administration, per-device table and workspace-layout preferences, audio playback, and M3U8 export. See [Web Client & API](#web-client--api) below.

Further architecture and workflow detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/WORKFLOWS.md](docs/WORKFLOWS.md).

---

## Setup

### Prerequisites

- Python 3.9–3.11 (see [Python version notes](#python-version-notes) below)
- PostgreSQL
- ffmpeg (required for WAV-to-AIFF conversion during metadata staging)
- A C compiler and Cython (required to build `madmom` from source; see install steps)

### Clone and configure

```bash
git clone https://github.com/alenlukic/xeremia
cd xeremia

cp .env.example .env
```

Edit `.env` with your data paths and database credentials. See [Environment variables](#environment-variables) in the Appendix for the full reference.

### Python environment

Use a dedicated virtual environment — do not install into the system Python.

```bash
# Verify interpreter first. Must be 3.9, 3.10, or 3.11.
python --version

python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# madmom has no pre-built wheel for many platforms; build it with Cython present.
pip install Cython
pip install --no-build-isolation -r requirements.txt
pip install -e .
```

If `python --version` is outside 3.9–3.11 (for example 3.8), select a supported interpreter first.
With [pyenv](https://github.com/pyenv/pyenv):

```bash
pyenv install 3.11    # skip if you already have a suitable 3.9–3.11 version
pyenv local 3.11      # optional; .python-version is gitignored

# then re-run venv creation with the selected interpreter
python -m venv .venv
```

#### Python version notes

`setup.py` declares `python_requires=">=3.9,<3.12"`. The broader `>=3,<4` range in older docs was misleading — pinned dependencies enforce a tighter band:

| Constraint | Reason |
|---|---|
| **Floor: 3.9** | `uvicorn==0.34.2` requires Python ≥ 3.9 |
| **Ceiling: 3.11** | `numpy==1.23.5` and `scipy==1.10.1` have no wheels for Python 3.12+ (and fail to build without `distutils`) |

Python 3.9 is the tested baseline on macOS and Linux.

### Database

`createdb` only creates an empty PostgreSQL database. Initialize the Xeremia schema separately:

```bash
# Local PostgreSQL (defaults to localhost:5432)
createdb music_collection    # or the value of DB_NAME in .env

# Remote or non-default port — pass connection flags matching .env:
# createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" music_collection

python -m src.scripts.init_db
python -m src.scripts.init_db --verify-only
```

This creates tables, indexes, constraints, sequences, the `pg_trgm` extension, and seeds canonical artist/genre/label mappings. Re-running against an initialized database exits with an error; use `--seed-only` to re-apply mapping seeds, or `--verify-only` to check schema health.

The `pg_trgm` extension must be installable by your database user (superuser on fresh local installs; may require an admin on managed Postgres).

---

## Testing

Python tests live in top-level `tests/`. Root `pytest.ini` and `conftest.py` configure collection and runtime safety hooks.

### Fast/default Python suite

For day-to-day local validation (unit tests only, under 60 seconds):

```bash
python -m pytest tests -m "not integration and not slow"
```

### Full mainline suite

Run the complete blocking Python suite used by the development workflow. It is
hermetic and excludes optional integration and slow tests:

```bash
python -m pytest tests -m "not integration and not slow"
```

### Subset or single file

```bash
python -m pytest tests/test_transition_match.py -v
python -m pytest tests/track_metadata/test_id3.py -v
```

### Secondary suite (integration and slow)

Tests that require live external services, downloaded ONNX models, or local
fixture corpora are marked `integration`; other heavy cases are marked `slow`.
Neither category runs in the blocking fast or full mainline suites:

```bash
python -m pytest tests -m "integration or slow"
```

Integration tests may require downloaded ONNX models in `models/traits/` and
local audio fixtures in `.test_data/`. Missing optional dependencies must skip
those tests rather than fail a mainline verification run.

### Client tests

```bash
npm --prefix client test
```

---

## Web Client & API

A browser-based client backed by a minimal FastAPI layer.

### Prerequisites

- Node.js ≥ 18
- A running PostgreSQL database with tracks already processed by the metadata agent
- Docker (for Elasticsearch)

### Quick start

Start Elasticsearch, the API, and the client in one command:

```bash
bash src/scripts/start_web.sh
```

The script will:
1. Start the Elasticsearch Docker container (creating it on first run)
2. Index tracks from PostgreSQL into Elasticsearch if the index doesn't exist
3. Start the FastAPI server on port 8000
4. Install client dependencies (if needed) and start the Vite dev server on port 5173

Use `bash src/scripts/start_web.sh --reindex` to force a re-index of tracks into Elasticsearch.

Press `Ctrl+C` to stop all services (API, client, and Elasticsearch).

### Manual startup

If you prefer to start services individually:

```bash
# 1. Elasticsearch
docker run -d --name xeremia-es -p 9200:9200 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  -e "xpack.security.enrollment.enabled=false" \
  -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  docker.elastic.co/elasticsearch/elasticsearch:8.17.0

# 2. Index tracks
python -m src.scripts.index_tracks

# 3. API server
python -m src.scripts.run_api

# 4. Client dev server
cd client && npm ci && npm run dev
```

The Vite dev server proxies `/api/*` requests to the API.

### API endpoints

Primary routes (see [docs/WORKFLOWS.md](docs/WORKFLOWS.md#api-endpoints) for the full set-workspace, explorer, and admin surface):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=<query>` | Elasticsearch-powered autocomplete (max 10 results, title-weighted). |
| `GET` | `/api/tracks?camelot_code=&bpm=&bpm_min=&bpm_max=` | Full track listing with optional filters. Camelot codes are comma-separated. |
| `GET` | `/api/track-traits` | Current-version ONNX trait rows for all tracks. |
| `GET` | `/api/tracks/{id}/matches` | Transition matches for a track, computed via `TransitionMatchFinder`. |
| `GET` | `/api/tracks/{id}/match-detail/{candidate_id}` | Per-factor score breakdown and trait snapshots for a track pair. |
| `GET` | `/api/tracks/{id}/audio` | Stream the track's audio file for in-browser playback. |
| `GET` / `PUT` | `/api/weights` | Read / persist scoring weights. |
| `GET` | `/api/admin/cache-stats` | Cosine-cache statistics and distributions. |
| `GET` | `/api/sets` … | Set workspace CRUD: pool, subgroups, tracklist, explorer, sequencer, preferences, m3u8 export. |

---

## Scripts

### Metadata Agent

**Purpose:** Enriches and ingests audio files: hydrates ID3 tags via AcoustID, MusicBrainz, Discogs, and an optional cursor-sdk fallback; resolves BPM/key with analyzer fusion; writes tags, renames files, copies them to the augmented directory, and upserts track/artist records into PostgreSQL.

**When to use:** When adding new tracks to the collection.

**Invocation:**
```bash
python -m src.track_metadata.metadata_agent

# Optional: use Rekordbox-exported BPM/key metadata
python -m src.track_metadata.metadata_agent --rekordbox-tsv /path/to/rekordbox.tsv
```

The TSV may use named musical keys or Camelot notation (`4A` and `04A` are equivalent).

**Location:** `src/track_metadata/`

---

### Remediate Track

**Purpose:** Finalizes a remediation-track after its missing fields have been resolved externally — writes the resolved tags, finalizes the file into the augmented library, and upserts it into PostgreSQL without re-running the whole pipeline.

**Invocation:**
```bash
python -m src.track_metadata.remediate_track <remediation_file> <resolved.json>
```

`resolved.json` maps `SimpleMetadata` field names (`title`, `artist`, `album`, `label`, `genre`, `remixer`, `year`, `bpm`, `key`) to their resolved values; only the listed fields are overridden.

---

### Compute Compact Descriptors

**Purpose:** Computes compact CQT-based audio descriptor vectors for tracks and stores them in the database. Used for audio-similarity scoring during transition matching.

**When to use:** After new tracks are ingested and before computing cosine similarities or generating transition matches.

**Invocation:**
```bash
# All tracks
python -m src.scripts.feature_extraction.compute_compact_descriptors

# Specific track IDs
python -m src.scripts.feature_extraction.compute_compact_descriptors <id1> <id2> ...
```

**Output:** `TrackDescriptor` rows written to DB. Computation is parallelized across `NUM_CORES`.

---

### Feature extraction batch scripts

| Script | Purpose |
|--------|---------|
| `python -m src.scripts.feature_extraction.compute_track_traits` | Batch ONNX trait classifiers (parallelized via `TRAIT_WORKERS`) |
| `python -m src.scripts.feature_extraction.compute_cosine_similarities` | Precompute pairwise descriptor similarities (`COSINE_WORKERS`) |
| `python -m src.scripts.feature_extraction.compute_features_for_tracks <ids...>` | Traits + cosine similarities for specific track IDs |
| `python -m src.scripts.feature_extraction.backfill_genre_mood` | Re-extract stale trait versions |
| `python -m src.scripts.feature_extraction.retry_failed_traits` | Retry previously failed trait extractions |
| `bash src/scripts/feature_extraction/extract_features.sh` | Shell wrapper that runs the full feature pipeline |

---

### Repair Genre/Label

**Purpose:** Repairs genre and label rows damaged by prior ingestion, driven by a JSON snapshot of per-track field deltas.

**Invocation:**
```bash
python -m src.scripts.repair_genre_label --snapshot PATH [--apply] [--verify-only]
```

---

### Database migrations

Schema migrations for existing installations live as `src/scripts/migrate_*.py` and under `src/scripts/migrations/`:

```bash
python -m src.scripts.migrate_table_preferences   # example
```

---

## Appendix

### Environment variables

See `.env.example` for a ready-to-copy template.

| Variable | Description |
|---|---|
| `DATA_ROOT` | Root directory for all data files |
| `DATA_BACKUP_RESTORE_MUSIC_DIR` | Subdirectory for restored backup files |
| `DATA_FILE_STAGING_DIR` | Temporary staging area for audio files |
| `DB_NAME` | PostgreSQL database name |
| `DB_USER` | PostgreSQL user |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_HOST` | PostgreSQL host (default: `localhost`) |
| `DB_PORT` | PostgreSQL port (default: `5432`) |
| `HM_WEIGHT_SIMILARITY` | Harmonic mixing weight — cosine similarity (default: `0.1922`) |
| `HM_WEIGHT_CAMELOT` | Harmonic mixing weight — Camelot key compatibility (default: `0.2122`) |
| `HM_WEIGHT_BPM` | Harmonic mixing weight — BPM proximity (default: `0.2122`) |
| `HM_WEIGHT_FRESHNESS` | Harmonic mixing weight — track recency (default: `0.0922`) |
| `HM_WEIGHT_GENRE_SIMILARITY` | Harmonic mixing weight — genre similarity (default: `0.0922`) |
| `HM_WEIGHT_MOOD_CONTINUITY` | Harmonic mixing weight — mood continuity (default: `0.0722`) |
| `HM_WEIGHT_VOCAL_CLASH` | Harmonic mixing weight — vocal clash penalty (default: `0.0622`) |
| `HM_WEIGHT_ENERGY` | Harmonic mixing weight — energy level compatibility (default: `0.0522`) |
| `HM_WEIGHT_INSTRUMENT_SIMILARITY` | Harmonic mixing weight — instrument similarity (default: `0.0322`) |
| `HM_MAX_RESULTS` | Max transition match candidates to return (default: `50`) |
| `HM_SCORE_THRESHOLD` | Minimum composite score to include a candidate (default: `25`) |
| `HM_RESULT_THRESHOLD` | Min result count before score threshold is enforced (default: `20`) |
| `INGESTION_PIPELINE_PROCESSED_MUSIC_DIR` | Processed music library path — used for audio playback streaming and feature-extraction jobs (legacy name retained) |
| `TRACK_METADATA_DOWNLOAD_DIR` | Input directory for track metadata enrichment |
| `TRACK_METADATA_PROCESSING_DIR` | Working directory for track-metadata (default: `processing`) |
| `TRACK_METADATA_AUGMENTED_DIR` | Output directory for enriched tracks (default: `augmented`) |
| `TRACK_METADATA_REMEDIATION_DIR` | Directory for tracks awaiting manual remediation (default: `Remediation Tracks`) |
| `TRACK_METADATA_LOG_DIR` | Log directory for track-metadata (default: `logs`) |
| `TRACK_METADATA_RUN_START` | Override timestamp for metadata run (default: current time) |
| `TRACK_METADATA_ENABLE_CURSOR_SDK` | Enable the cursor-sdk fallback resolver for missing fields (default: `0`) |
| `TRACK_METADATA_ENABLE_ESSENTIA` | Add the optional essentia BPM/key analyzer (default: `0`) |
| `TRACK_METADATA_BEATPORT_SKIP` | Skip hydration of Beatport-encoded files (default: `1`) |
| `TRACK_METADATA_RESOLUTION_GENRE_ARTIST_HISTORY` | Enable DB artist-history genre fallback (default: `1`) |
| `TRACK_METADATA_RESOLUTION_GENRE_BEATPORT` | Enable Beatport artist-page genre fallback via cursor-sdk (default: `1`) |
| `TRACK_METADATA_RESOLUTION_LABEL_WEB_SEARCH` | Enable catalog-number and direct-label web heuristics (default: `1`) |
| `TRACK_METADATA_RESOLUTION_LABEL_BEATPORT` | Enable Beatport track-page label fallback via cursor-sdk (default: `1`) |
| `TRACK_METADATA_RESOLUTION_LABEL_CDR` | Enable qualified `CDR` inference when no label is found (default: `1`) |
| `TRACK_METADATA_RESOLUTION_EXTERNAL_TIMEOUT_SECONDS` | Timeout for external research heuristics (default: `20`) |
| `TRACK_METADATA_RESOLUTION_EXTERNAL_MAX_RETRIES` | Retries for external research heuristics (default: `1`) |
| `TRACK_METADATA_RESOLUTION_CDR_MIN_SOUNDCLOUD_FOLLOWERS` | Supporting threshold for SoundCloud follower evidence (default: `5000`) |
| `LOG_LOCATION` | Global log file path (default: `logs/logs.txt`) |
| `NUM_CORES` | CPU parallelism override (default: system CPU count) |
| `ES_TRACK_INDEX` | Elasticsearch index name (default: `dj_tracks`) |
| `ES_URL` | Elasticsearch URL (default: `http://127.0.0.1:9200`) |
| `TRAIT_WORKERS` | Parallel workers for trait extraction (default: `2`) |
| `COSINE_WORKERS` | Parallel workers for cosine similarity (default: `2`) |
| `ACOUSTID_API_KEY` | AcoustID API key (optional — enables fingerprint lookup) |
| `DISCOGS_TOKEN` | Discogs API token (optional — enables Discogs search) |
| `DISCOGS_KEY` / `DISCOGS_SECRET` | Alternative Discogs API key/secret pair |
| `DISCOGS_USER_AGENT` | Custom Discogs User-Agent |
| `MUSIC_METADATA_USER_AGENT` | HTTP User-Agent for metadata API requests |

### Search architecture

Search is powered by Elasticsearch with a title-weighted multi-field query:
- `title` field uses edge-ngram analysis for autocomplete with 5x boost
- `artist_names` gets 2x boost
- `genre`, `label` are standard text fields
- `camelot_code`, `key` are keyword (exact match) fields

The index is populated from PostgreSQL via `src/scripts/index_tracks.py`. Artist names are denormalized into each search document from the `artist_track` → `artist` join.

### Artist join strategy

Track listing endpoints join `track` → `artist_track` → `artist` with SQL `string_agg` aggregation to return artist names per row in a single query (no N+1).
