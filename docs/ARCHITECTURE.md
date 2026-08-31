# Architecture

## Overview

Xeremia is a Python application for DJ library management. A batch metadata agent
ingests and enriches audio files, feature extraction computes descriptors and semantic
traits, a harmonic mixing engine finds and scores transition matches, and a
browser-based web client provides search, browsing, matching, and set building.

All application code lives under `src/`. Configuration is environment-driven (`.env`).
Data is persisted in PostgreSQL via SQLAlchemy ORM models. Search is powered by
Elasticsearch (via Docker).

For detailed workflow descriptions and user flows, see [WORKFLOWS.md](WORKFLOWS.md).

## Domain Map

```
┌──────────────────────────────────────────────────────────────┐
│  client/            React 19 + TypeScript SPA (Vite)         │
│                     Workspace shell: Browser · Matches ·     │
│                     Pool · Explorer · Sequencer widgets      │
│                     communicates over HTTP (/api/*)          │
└────────┬─────────────────────────────────────────────────────┘
         │ HTTP (Vite proxy → :8000)
┌────────▼─────────────────────────────────────────────────────┐
│                       Entry Points                           │
│  src/api/*           FastAPI (routes, search, schemas,       │
│                      weights, cache stats, set workspace,    │
│                      table preferences, audio streaming)     │
│  src/scripts/*       run_api, index_tracks, init_db,         │
│                      start_web.sh, migrate_*,                │
│                      feature_extraction/*, repair_genre_label│
│  src/track_metadata/ metadata_agent (batch processor),       │
│     metadata_agent.py    remediate_track                     │
│  src/set_workspace/  Set workspace service (pool, subgroups, │
│                      tracklist, explorer, edge scoring)      │
└────────┬──────────────────────────────┬──────────────────────┘
         │                              │
┌────────▼──────────────────┐ ┌─────────▼──────────────────────┐
│ harmonic_mixing/          │ │ feature_extraction/            │
│ TransitionMatchFinder     │ │ 75-D compact descriptors       │
│ TransitionMatch scoring   │ │ ONNX trait classifiers         │
│ CosineCache, WeightService│ │ pairwise cosine similarity     │
└────────┬──────────────────┘ └─────────┬──────────────────────┘
         │                              │
┌────────▼──────────────────────────────▼──────────────────────┐
│  data_management/   AudioFile, track loading,                │
│                     MappingRegistry (artist/genre/label      │
│                     canonicalization), genre vocabulary      │
└────────┬─────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────┐
│                       Foundation                             │
│  models/           ORM: Track, Artist, ArtistTrack,          │
│                    TrackDescriptor, TrackTrait,              │
│                    TrackCosineSimilarity,                    │
│                    ScoringWeightOverride, *Mapping,          │
│                    DjSet, SetPoolEntry, SetPoolSubgroup,     │
│                    SetPoolSubgroupMember, SetTracklistEntry, │
│                    SetExplorerNode, SetExplorerEdge,         │
│                    TablePreference                           │
│  db/               Engine, session, Base (PostgreSQL)        │
│  config.py         .env-driven configuration                 │
│  errors.py         Exception hierarchy                       │
│  utils/            File ops, logging, shared helpers         │
└──────────────────────────────────────────────────────────────┘

External services:
  PostgreSQL           Primary data store
  Elasticsearch 8.17   Title-weighted autocomplete search
  Docker               Runs Elasticsearch locally
  AcoustID / MusicBrainz / Discogs   Metadata enrichment APIs
  cursor-sdk (optional)              Fallback metadata resolution
```

## Package Layering

Dependency flows downward. Upper layers may import from lower layers but not vice versa.

### Layer 1 -- Foundation

| Package | Responsibility |
|---------|---------------|
| `src/models/` | SQLAlchemy ORM models (Track, Artist, ArtistTrack, TrackDescriptor, TrackTrait, TrackCosineSimilarity, ScoringWeightOverride, ArtistMapping, GenreMapping, LabelMapping, DjSet, SetPoolEntry, SetPoolSubgroup, SetPoolSubgroupMember, SetTracklistEntry, SetExplorerNode, SetExplorerEdge, TablePreference) |
| `src/db/` | Database engine, session management, schema helpers |
| `src/config.py` | Environment variable loading via python-dotenv |
| `src/errors.py` | Custom exception classes |
| `src/utils/` | File operations, logging, shared helpers |

### Layer 2 -- Domain Services

| Package | Responsibility |
|---------|---------------|
| `src/track_metadata/` | External metadata hydration (AcoustID, MusicBrainz, Discogs, cursor-sdk fallback), genre/label field resolution, BPM/key analyzer fusion, ID3 tag read/write |
| `src/data_management/` | Audio file I/O (`AudioFile`), track loading, `MappingRegistry` (artist/genre/label canonicalization), genre vocabulary |
| `src/feature_extraction/` | 75-D compact descriptors (CQT/MFCC/tempogram), ONNX trait classifiers (genre, mood, instruments), pairwise cosine similarity |

### Layer 3 -- Orchestration

| Package | Responsibility |
|---------|---------------|
| `src/harmonic_mixing/` | `TransitionMatchFinder`, `TransitionMatch` scoring, `CosineCache` (LRU with BFS warming), `WeightService` (persisted overrides) |
| `src/set_workspace/` | Set workspace service: set CRUD, pool membership (reorder, highlight, subgroups), tracklist (ordering, notes, sequencer overrides), explorer graph (nodes, edges, scoring), batch track hydration |

### Layer 4 -- Entry Points / Adapters

| Package | Responsibility |
|---------|---------------|
| `src/scripts/` | Runnable scripts: API server, indexing, schema init, migrations, feature computation, genre/label repair |
| `src/api/` | FastAPI HTTP adapter: search, track listing, track traits, transition matches, match detail, weights, cache stats, audio streaming, set workspace (sets, pool, subgroups, tracklist, explorer, sequencer), table/workspace-layout preferences, m3u8 export |
| `src/api/es.py` | Elasticsearch client, autocomplete index management, title-weighted search |
| `src/track_metadata/metadata_agent.py` | Batch metadata processor: discover → stage → hydrate → resolve → analyze → tag → rename → copy → upsert into PostgreSQL |

### Client

| Directory | Responsibility |
|-----------|---------------|
| `client/` | React + TypeScript SPA (Vite); communicates with `src/api/` over HTTP; no direct Python/DB dependency |

### Infrastructure

| Service | Role |
|---------|------|
| PostgreSQL | Primary data store for tracks, artists, features, traits, cosine similarities, weight overrides, sets, pool/tracklist membership, pool subgroups, explorer graphs, table preferences |
| Elasticsearch 8.17 | Title-weighted autocomplete index; populated from PostgreSQL via `src/scripts/index_tracks.py` |
| Docker | Runs Elasticsearch locally |
| AcoustID / MusicBrainz / Discogs | External metadata enrichment APIs (rate-limited HTTP) |
| cursor-sdk (optional) | Fallback metadata resolution when structured sources are incomplete |

## Dependency Rules

1. **Foundation (L1)** must not import from L2, L3, or L4
2. **Domain services (L2)** may import from L1 only
3. **Orchestration (L3)** may import from L1 and L2
4. **Entry points (L4)** may import from any layer
5. No circular imports between modules at the same layer
6. `src/scripts/` files are leaf nodes -- they import but are never imported

## Data Flow

```
  Download Dir
        │
        ▼
  Metadata Agent
  discover → stage (WAV→AIFF) → read ID3 tags
  → hydrate (AcoustID / MusicBrainz / Discogs / cursor-sdk fallback)
  → genre/label field resolution
  → BPM/key analyzer fusion (Rekordbox TSV + essentia/madmom/librosa)
  → write tags → rename → copy
        │
        ├─► Augmented Dir (enriched audio files)
        ├─► Remediation Dir (tracks missing mission-critical fields,
        │    finalized later via remediate_track)
        ▼
  PostgreSQL upsert (track, artist, artist_track)
        │
        ├──► Elasticsearch index
        │    (via index_tracks.py)
        ▼
  Feature Extraction
  ├─ 75-D compact descriptors → DB (track_descriptors)
  ├─ ONNX trait classifiers   → DB (track_traits)
  └─ pairwise cosine sim      → DB (track_cosine_similarity)
        │
        ▼
  Harmonic Mixing Analysis
  Camelot key map + BPM range + weighted scoring
        │
        ▼
  Web Client (React SPA)
```

## Test Structure

- `tests/test_api_routes.py` -- API route tests
- `tests/test_compact_descriptor.py` -- feature extraction unit tests
- `tests/test_config.py` -- config loading, env-var mapping, defaults
- `tests/test_cosine_cache.py` -- LRU cache tests
- `tests/test_cosine_similarity.py` -- pairwise similarity tests
- `tests/test_es_search.py` -- Elasticsearch indexing and search tests (requires running ES)
- `tests/test_init_db.py` -- schema initialization tests
- `tests/test_repair_genre_label.py` -- genre/label repair tests
- `tests/test_set_workspace_api.py` -- set workspace API route tests
- `tests/test_set_workspace_explorer.py` -- explorer graph logic tests
- `tests/test_structure.py` -- structural / import tests
- `tests/test_table_preferences_api.py` -- table preference API tests
- `tests/test_track_similarity.py` -- multi-scorer similarity tests
- `tests/test_trait_extractor.py` -- ONNX trait pipeline tests
- `tests/test_transition_match.py` -- transition match scoring tests
- `tests/test_weight_service.py` -- weight persistence tests
- `tests/track_metadata/` -- metadata subsystem tests (audio features, ID3, hydrator, utils)
- Test data: `tests/track_metadata/test_data/`
- Client tests: `client/src/*.test.ts`, `client/src/*.test.tsx` (Vitest + Testing Library)
- Runner (Python): `python -m pytest tests -m "not integration and not slow"`
- Runner (client): `npm --prefix client test`

### Known baseline failures

- `tests/test_structure.py::test_layer_dependency_direction` — fails because
  `feature_extraction/track_similarity.py` imports from `harmonic_mixing`. This is
  pre-existing structural debt. Do not attribute this failure to narrow feature
  delivery branches. Treat as baseline until a contract explicitly changes that
  import edge.

## Configuration

Runtime configuration via environment variables (`.env`). See `.env.example` for
the full configuration surface.

Key configuration domains: DATA, DB, HARMONIC_MIXING, TRACK_METADATA, LOG_LOCATION.
The processed-music library path (`INGESTION_PIPELINE_PROCESSED_MUSIC_DIR`) retains
its legacy name and backs audio playback and feature jobs. Additional env vars
control Elasticsearch, feature extraction workers, and external API keys (see
`.env.example`).
