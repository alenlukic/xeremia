# Architecture

## Overview

Xeremia is a Python application for DJ library management. It processes audio files
through an ingestion pipeline, extracts features, finds harmonic mixing matches,
hydrates metadata from external sources, and provides both an interactive CLI assistant
and a browser-based web client.

All application code lives under `src/`. Configuration is environment-driven (`.env`).
Data is persisted in PostgreSQL via SQLAlchemy ORM models. Search is powered by
Elasticsearch (via Docker).

For detailed workflow descriptions and user flows, see [WORKFLOWS.md](WORKFLOWS.md).

## Domain Map

```
┌──────────────────────────────────────────────────────────────┐
│  client/            React 19 + TypeScript SPA (Vite)         │
│                     Tabs: Matches · Browse · Sets · Admin    │
│                     communicates over HTTP (/api/*)           │
└────────┬─────────────────────────────────────────────────────┘
         │ HTTP (Vite proxy → :8000)
┌────────▼─────────────────────────────────────────────────────┐
│                       Entry Points                           │
│  src/api/*           FastAPI (routes, search, schemas,       │
│                      weights, cache stats)                   │
│  src/scripts/*       run_api, launch_assistant,              │
│                      index_tracks, start_web.sh, ...         │
│  src/track_metadata/ metadata_agent (batch processor)        │
│     metadata_agent.py                                        │
│  src/set_workspace/  Set workspace service (pool,            │
│                      tracklist, explorer, edge scoring)      │
└────────┬──────────┬──────────────┬──────────┬────────────────┘
         │          │              │          │
┌────────▼───┐ ┌────▼──────────┐ ┌▼──────────▼──────────────┐
│ assistant/ │ │ ingestion_    │ │ harmonic_mixing/          │
│ CLI REPL   │ │ pipeline/     │ │ TransitionMatchFinder     │
│ match,     │ │ 4-stage tag   │ │ TransitionMatch scoring   │
│ reload,    │ │ record flow   │ │ CosineCache, WeightService│
│ ingest     │ │               │ │                           │
└────────┬───┘ └──────┬────────┘ └──────┬───────────────────┘
         │            │                 │
    ┌─────────────────▼─────┐    ┌──────▼───────────────────┐
    │ data_management/      │    │ feature_extraction/      │
    │ AudioFile, ingest,    │    │ 75-D compact descriptors │
    │ tag/field sync,       │    │ ONNX trait classifiers   │
    │ MappingRegistry       │    │ pairwise cosine sim      │
    └─────────┬─────────────┘    └──────┬───────────────────┘
              │                         │
┌─────────────▼─────────────────────────▼───────────────────┐
│                       Foundation                          │
│  models/           ORM: Track, Artist, ArtistTrack,       │
│                    TagRecord (4 types), TrackDescriptor,   │
│                    TrackTrait, TrackCosineSimilarity,      │
│                    ScoringWeightOverride, *Mapping,        │
│                    DjSet, SetPoolEntry, SetTracklistEntry, │
│                    SetExplorerTree, SetExplorerNode,       │
│                    SetExplorerEdge                         │
│  db/               Engine, session, Base (PostgreSQL)     │
│  config.py         .env-driven configuration              │
│  errors.py         Exception hierarchy                    │
│  utils/            File ops, logging, shared helpers      │
│  track_metadata/   MetadataHydrator (AcoustID,            │
│    sources/        MusicBrainz, Discogs, OpenAI)          │
│  postprocessing/   Sliding loudness normalization         │
└───────────────────────────────────────────────────────────┘

External services:
  PostgreSQL           Primary data store
  Elasticsearch 8.17   Title-weighted autocomplete search
  Docker               Runs Elasticsearch locally
  AcoustID / MusicBrainz / Discogs   Metadata enrichment APIs
  OpenAI (optional)    Fallback metadata resolution
```

## Package Layering

Dependency flows downward. Upper layers may import from lower layers but not vice versa.

### Layer 1 -- Foundation

| Package | Responsibility |
|---------|---------------|
| `src/models/` | SQLAlchemy ORM models (Track, Artist, ArtistTrack, TagRecord ×4, TrackDescriptor, TrackTrait, TrackCosineSimilarity, ScoringWeightOverride, ArtistMapping, GenreMapping, LabelMapping, DjSet, SetPoolEntry, SetTracklistEntry, SetExplorerTree, SetExplorerNode, SetExplorerEdge) |
| `src/db/` | Database engine, session management, schema helpers |
| `src/config.py` | Environment variable loading via python-dotenv |
| `src/errors.py` | Custom exception classes |
| `src/utils/` | File operations, logging, shared helpers |

### Layer 2 -- Domain Services

| Package | Responsibility |
|---------|---------------|
| `src/track_metadata/` | External metadata hydration (AcoustID, MusicBrainz, Discogs, OpenAI), audio feature analysis, ID3 tag read/write |
| `src/data_management/` | Audio file I/O, ingest/sync/delete, `MappingRegistry` (artist/genre/label canonicalization) |
| `src/feature_extraction/` | 75-D compact descriptors (CQT/MFCC/tempogram), ONNX trait classifiers (genre, mood, instruments), pairwise cosine similarity |
| `src/postprocessing/` | Sliding loudness normalization (pydub) |

### Layer 3 -- Orchestration

| Package | Responsibility |
|---------|---------------|
| `src/harmonic_mixing/` | `TransitionMatchFinder`, `TransitionMatch` scoring, `CosineCache` (LRU with BFS warming), `WeightService` (persisted overrides) |
| `src/ingestion_pipeline/` | 4-stage tag-record pipeline: initial → post-MIK → post-Rekordbox → final (write tags, update DB, copy to processed dir) |
| `src/set_workspace/` | Set workspace service: set CRUD, pool/tracklist membership (with starring and bulk clear), multi-tree explorer graph (nodes, edges, scoring), batch track hydration, and transition-score caching |

### Layer 4 -- Entry Points / Adapters

| Package | Responsibility |
|---------|---------------|
| `src/assistant/` | Interactive CLI REPL with command registry (`match`, `reload`, `ingest`, `exit`) |
| `src/scripts/` | Runnable scripts: API server, CLI assistant, indexing, pipeline stages, feature computation, migrations |
| `src/api/` | FastAPI HTTP adapter: search, track listing, transition matches, match detail, weights, cache stats, audio streaming, set workspace CRUD/membership/starring/bulk-clear/multi-tree-explorer |
| `src/api/es.py` | Elasticsearch client, autocomplete index management, title-weighted search |
| `src/track_metadata/metadata_agent.py` | Batch metadata processor: discover → stage → hydrate → analyze → tag → rename → copy |

### Client

| Directory | Responsibility |
|-----------|---------------|
| `client/` | React + TypeScript SPA (Vite); communicates with `src/api/` over HTTP; no direct Python/DB dependency |

### Infrastructure

| Service | Role |
|---------|------|
| PostgreSQL | Primary data store for tracks, artists, features, traits, cosine similarities, weight overrides, sets, pool/tracklist membership (with starring), multi-tree explorer graphs |
| Elasticsearch 8.17 | Title-weighted autocomplete index; populated from PostgreSQL via `src/scripts/index_tracks.py` |
| Docker | Runs Elasticsearch locally |
| AcoustID / MusicBrainz / Discogs | External metadata enrichment APIs (rate-limited HTTP) |
| OpenAI (optional) | Fallback metadata resolution when structured sources are incomplete |

## Dependency Rules

1. **Foundation (L1)** must not import from L2, L3, or L4
2. **Domain services (L2)** may import from L1 only
3. **Orchestration (L3)** may import from L1 and L2
4. **Entry points (L4)** may import from any layer
5. No circular imports between modules at the same layer
6. `src/scripts/` files are leaf nodes -- they import but are never imported

## Data Flow

```
  Download Folder                    Unprocessed Music Dir
        │                                     │
        ▼                                     ▼
  Metadata Agent                     Ingestion Pipeline (4 stages)
  discover → hydrate                 Initial → PostMIK → PostRB → Final
  → analyze → tag                    tag records → DB (tracks, artists)
  → rename → copy                           │
        │                                   ├──► Elasticsearch index
        ▼                                   │    (via index_tracks.py)
  Augmented Dir                             │
  (enriched audio files)                    ▼
                                    Feature Extraction
                                    ├─ 75-D compact descriptors → DB (track_descriptors)
                                    ├─ ONNX trait classifiers   → DB (track_traits)
                                    └─ pairwise cosine sim      → DB (track_cosine_similarity)
                                            │
                                            ▼
                                    Harmonic Mixing Analysis
                                    Camelot key map + BPM range + scoring
                                            │
                                    ┌───────┴───────┐
                                    ▼               ▼
                              CLI Assistant    Web Client
                              (match REPL)     (React SPA)
```

## Test Structure

- `src/tests/test_api_routes.py` -- API route tests
- `src/tests/test_assistant_service.py` -- CLI assistant tests
- `src/tests/test_config.py` -- config loading, env-var mapping, defaults
- `src/tests/test_compact_descriptor.py` -- feature extraction unit tests
- `src/tests/test_compute_track_traits.py` -- trait computation tests
- `src/tests/test_cosine_cache.py` -- LRU cache tests
- `src/tests/test_cosine_similarity.py` -- pairwise similarity tests
- `src/tests/test_es_search.py` -- Elasticsearch indexing and search tests (requires running ES)
- `src/tests/test_structure.py` -- structural / import tests
- `src/tests/test_track_similarity.py` -- multi-scorer similarity tests
- `src/tests/test_trait_extractor.py` -- ONNX trait pipeline tests
- `src/tests/test_transition_match.py` -- transition match scoring tests
- `src/tests/test_weight_service.py` -- weight persistence tests
- `src/tests/test_set_workspace_api.py` -- set workspace API route tests
- `src/tests/test_set_workspace_explorer.py` -- explorer graph logic tests
- `src/tests/track_metadata/` -- metadata subsystem tests (audio features, ID3, hydrator, utils)
- Test data: `src/tests/track_metadata/test_data/`
- Client tests: `client/src/*.test.ts`, `client/src/*.test.tsx` (Vitest + Testing Library)
- Runner (Python): `python -m pytest src/tests/ -v`
- Runner (client): `npm test` in `client/`

### Known baseline failures

- `src/tests/test_structure.py::test_layer_dependency_direction` — fails because
  `feature_extraction/track_similarity.py` imports from `harmonic_mixing`. This is
  pre-existing structural debt. Do not attribute this failure to narrow feature
  delivery branches. Treat as baseline until a contract explicitly changes that
  import edge.

## Configuration

Runtime configuration via environment variables (`.env`). See `.env.example` for
the full configuration surface.

Key configuration domains: DATA, DB, HARMONIC_MIXING, INGESTION_PIPELINE,
TRACK_METADATA, LOG_LOCATION. Additional env vars control Elasticsearch, feature
extraction workers, and external API keys (see `.env.example`).
