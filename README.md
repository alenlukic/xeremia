# Xeremia

## Overview

A toolkit for DJs that manages a music collection database, runs a multi-source track ingestion pipeline, computes audio-similarity features, and provides both a live CLI assistant and a browser-based client for finding harmonically compatible transition matches.

### Library ingestion & tagging

Processes new audio through a four-step pipeline that reconciles BPM and key from Mixed In Key, Rekordbox, and raw ID3 tags into canonical database records. Files are renamed, tagged, and copied to a processed music directory. Companion scripts sync tags and fields between disk and database, convert lossless formats, and restore backups from Google Drive.

### Metadata enrichment

A batch metadata agent hydrates ID3 tags from AcoustID, MusicBrainz, Discogs, and an optional OpenAI fallback. It estimates missing BPM and key, writes enriched tags back to files, and stages output for ingestion.

### Audio features & similarity

Computes compact CQT-based descriptor vectors and ONNX-derived audio traits for tracks, storing results in PostgreSQL. Pairwise cosine similarity feeds harmonic-mixing scores during transition matching.

### Harmonic mixing & transition matching

Ranks transition candidates using weighted factors — Camelot key compatibility, BPM proximity, genre and mood continuity, vocal clash, danceability, energy, timbre, and audio-similarity. Available via an interactive CLI REPL and the web client's Matches tab, with live-adjustable scoring weights.

### Web client & set building

A React SPA backed by FastAPI provides Elasticsearch-powered search, collection browsing with filters, transition match exploration, DJ set building (pool, tracklist, and visual set explorer), scoring-weight administration, and M3U8 export. See [Web Client & API](#web-client--api) below.

Further architecture and workflow detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/WORKFLOWS.md](docs/WORKFLOWS.md).

---

## Setup

### Prerequisites

- Python 3.9–3.11 (see [Python version notes](#python-version-notes) below)
- PostgreSQL
- ffmpeg (required for lossless-to-AIFF conversion)
- A C compiler and Cython (required to build `madmom` from source; see install steps)
- Google API credentials (optional; required only for backup/restore)

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
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# madmom has no pre-built wheel for many platforms; build it with Cython present.
pip install Cython
pip install --no-build-isolation -r requirements.txt
pip install -e .
```

If you use [pyenv](https://github.com/pyenv/pyenv), install and select a 3.9–3.11 interpreter before creating the venv:

```bash
pyenv install 3.11    # skip if you already have a suitable 3.9–3.11 version
pyenv local 3.11      # optional; .python-version is gitignored
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

## Web Client & API

A browser-based alternative to the CLI assistant, backed by a minimal FastAPI layer.

### Prerequisites

- Node.js ≥ 18
- A running PostgreSQL database with tracks already ingested
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
cd client && npm install && npm run dev
```

The Vite dev server proxies `/api/*` requests to the API.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=<query>` | Elasticsearch-powered autocomplete (max 10 results, title-weighted). |
| `GET` | `/api/tracks?camelot_code=&bpm=&bpm_min=&bpm_max=` | Full track listing with optional filters. Camelot codes are comma-separated. |
| `GET` | `/api/tracks/{id}/matches` | Transition matches for a track, computed via existing `TransitionMatchFinder`. |

---

## CLI

### Mixing Assistant

**Purpose:** Interactive REPL that finds harmonically compatible transition candidates for the track currently on deck.

**When to use:** During a live set to quickly discover what to play next based on key and BPM compatibility.

**Invocation:**
```bash
python -m src.scripts.launch_assistant
```

**Commands at the prompt:**
```
match <track_title>   Find transition matches for the given track
reload                Reload track data from the database
exit                  Quit
```

**Output:** Ranked transition candidates grouped by key relationship (same key / step up / step down), scored across weighted factors (Camelot, BPM, freshness, label, genre, artist, energy, and compact audio descriptor similarity).

---

### Ingestion Pipeline

**Purpose:** Processes new audio files through a 4-step pipeline, reconciling BPM and key from Mixed In Key, Rekordbox, and raw ID3 tags into a canonical DB record, then renames and copies the final file.

**When to use:** When adding new tracks to the collection after tagging them in Mixed In Key and Rekordbox.

**Invocation (full pipeline, interactive):**
```bash
python -m src.scripts.ingestion_pipeline.run_ingestion_pipeline
```

Type `next` at each prompt to advance to the next step, or `cancel` to abort.

**Invocation (individual steps):**
```bash
python -m src.scripts.ingestion_pipeline.load_initial_tag_records       # Step 0
python -m src.scripts.ingestion_pipeline.load_post_mik_tag_records      # Step 1
python -m src.scripts.ingestion_pipeline.load_post_rekordbox_tag_records # Step 2
python -m src.scripts.ingestion_pipeline.load_final_tag_records          # Step 3
```

**Output:**
- Step 0: Track rows in DB; files copied to processing directory
- Step 1: PostMIK tag records in DB (BPM/key from Mixed In Key comment field)
- Step 2: PostRekordbox tag records in DB (BPM/key from exported Rekordbox tag file)
- Step 3: Final tag records in DB; ID3 tags written to files; files renamed and copied to `INGESTION_PIPELINE_PROCESSED_MUSIC_DIR`

---

### Compute Compact Descriptors

**Purpose:** Computes compact CQT-based audio descriptor vectors for tracks and stores them in the database. Used for audio-similarity scoring during transition matching.

**When to use:** After new tracks are ingested and before generating transition match rows.

**Invocation:**
```bash
# All tracks
python -m src.scripts.feature_extraction.compute_compact_descriptors

# Specific track IDs
python -m src.scripts.feature_extraction.compute_compact_descriptors <id1> <id2> ...
```

**Output:** `TrackDescriptor` rows written to DB. Computation is parallelized across `NUM_CORES`.

---

### Sync Tags

**Purpose:** Syncs ID3 tags on disk with the corresponding DB track records.

**When to use:** After manually editing ID3 tags outside the pipeline, to bring DB records in sync.

**Invocation:**
```bash
python -m src.scripts.sync_tags
```

---

### Sync Fields

**Purpose:** Syncs DB track fields from current on-disk ID3 metadata (reverse direction of sync_tags).

**Invocation:**
```bash
python -m src.scripts.sync_fields
```

---

### Convert Lossless to AIFF

**Purpose:** Converts FLAC and WAV files to AIFF format using ffmpeg.

**When to use:** Before ingesting lossless files into the pipeline, which expects AIFF or MP3.

**Invocation:**
```bash
python -m src.scripts.convert_all_lossless_to_aiff <input_dir>
```

**Output:** AIFF files written to the same directory as the source files.

---

### Restore Backup

**Purpose:** Restores audio file backups from Google Drive by revision date.

**Invocation:**
```bash
python -m src.scripts.restore_backup <date>
```

**Output:** Files downloaded to `DATA_BACKUP_RESTORE_MUSIC_DIR`; progress tracked in `backup_progress.json`.

---

### Delete Tracks

**Purpose:** Removes track records from the database by ID.

**Invocation:**
```bash
# Individual IDs
python -m src.scripts.delete_tracks <id1> <id2> ...

# Range
python -m src.scripts.delete_tracks <start>...<end>
```

---

### Metadata Enrichment

**Purpose:** Enriches ID3 tags for audio files using MusicBrainz, Discogs, AcoustID, and an
OpenAI LLM. Writes enriched metadata back to file tags.

**Invocation:**
```bash
python -m src.track_metadata.metadata_agent
```

**Location:** `src/track_metadata/`

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
| `HM_WEIGHT_SIMILARITY` | Harmonic mixing weight — cosine similarity (default: `0.18`) |
| `HM_WEIGHT_CAMELOT` | Harmonic mixing weight — Camelot key compatibility (default: `0.20`) |
| `HM_WEIGHT_BPM` | Harmonic mixing weight — BPM proximity (default: `0.20`) |
| `HM_WEIGHT_FRESHNESS` | Harmonic mixing weight — track recency (default: `0.08`) |
| `HM_WEIGHT_GENRE_SIMILARITY` | Harmonic mixing weight — genre similarity (default: `0.08`) |
| `HM_WEIGHT_MOOD_CONTINUITY` | Harmonic mixing weight — mood continuity (default: `0.06`) |
| `HM_WEIGHT_VOCAL_CLASH` | Harmonic mixing weight — vocal clash penalty (default: `0.05`) |
| `HM_WEIGHT_DANCEABILITY` | Harmonic mixing weight — danceability proximity (default: `0.07`) |
| `HM_WEIGHT_ENERGY` | Harmonic mixing weight — energy level proximity (default: `0.04`) |
| `HM_WEIGHT_TIMBRE` | Harmonic mixing weight — timbre similarity (default: `0.04`) |
| `HM_WEIGHT_INSTRUMENT_SIMILARITY` | Harmonic mixing weight — instrument similarity (default: `0.02`) |
| `HM_MAX_RESULTS` | Max transition match candidates to return (default: `50`) |
| `HM_SCORE_THRESHOLD` | Minimum composite score to include a candidate (default: `25`) |
| `HM_RESULT_THRESHOLD` | Min result count before score threshold is enforced (default: `20`) |
| `INGESTION_PIPELINE_ROOT` | Root directory for ingestion pipeline data |
| `INGESTION_PIPELINE_UNPROCESSED` | Subdir for incoming tracks (default: `unprocessed`) |
| `INGESTION_PIPELINE_PROCESSING` | Subdir for in-progress tracks (default: `processing`) |
| `INGESTION_PIPELINE_FINALIZED` | Subdir for finalized tracks (default: `finalized`) |
| `INGESTION_PIPELINE_REKORDBOX_TAG_FILE` | Rekordbox exported tag filename (default: `rekordbox_tags.txt`) |
| `INGESTION_PIPELINE_PROCESSED_MUSIC_DIR` | Final destination for processed music files |
| `TRACK_METADATA_DOWNLOAD_DIR` | Input directory for track metadata enrichment |
| `TRACK_METADATA_PROCESSING_DIR` | Working directory for track-metadata (default: `processing`) |
| `TRACK_METADATA_AUGMENTED_DIR` | Output directory for enriched tracks (default: `augmented`) |
| `TRACK_METADATA_LOG_DIR` | Log directory for track-metadata (default: `logs`) |
| `TRACK_METADATA_RUN_START` | Override timestamp for metadata run (default: current time) |
| `LOG_LOCATION` | Global log file path (default: `logs/logs.txt`) |
| `NUM_CORES` | CPU parallelism override (default: system CPU count) |
| `ES_TRACK_INDEX` | Elasticsearch index name (default: `dj_tracks`) |
| `ES_URL` | Elasticsearch URL (default: `http://127.0.0.1:9200`) |
| `TRAIT_WORKERS` | Parallel workers for trait extraction (default: `2`) |
| `COSINE_WORKERS` | Parallel workers for cosine similarity (default: `2`) |
| `OPENAI_API_KEY` | OpenAI API key (optional — enables LLM metadata fallback) |
| `OPENAI_METADATA_MODEL` | OpenAI model for metadata resolution (default: `gpt-5.4-mini`) |
| `ACOUSTID_API_KEY` | AcoustID API key (optional — enables fingerprint lookup) |
| `DISCOGS_TOKEN` | Discogs API token (optional — enables Discogs search) |
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
