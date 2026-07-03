# Workflows

This document describes the core workflows in Xeremia: how data moves through the
system, what each pipeline does, and how users interact with the application.

For the structural overview (layering, dependency rules, module map), see
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Metadata Agent

The metadata agent is a batch processor that prepares newly downloaded audio files
for ingestion into the library. It runs as a standalone script and operates on files
in a configured download directory.

**Entry point:** `python -m src.track_metadata.metadata_agent`

### Pipeline

```
Download Dir
    │
    ├─ discover_new_audio_files()
    │  Scan for supported audio formats (.mp3, .aiff, .flac, .wav)
    │
    ▼
Stage file → Processing Dir
    │
    ├─ WAV files converted to AIFF (via ffmpeg)
    │
    ▼
Read existing ID3 tags
    │
    ▼
Hydrate metadata (MetadataHydrator)
    ├─ AcoustID fingerprint → MusicBrainz recording lookup
    ├─ MusicBrainz search (title + artist fuzzy match)
    ├─ Discogs search (title + artist, rate-limited)
    ├─ OpenAI fallback (when OPENAI_API_KEY is set)
    └─ Merge: best year, label fallback, remixer extraction
    │
    ▼
Post-merge field resolution (genre and label, independent)
    ├─ Genre: artist-history DB aggregate → Beatport artist genres (optional)
    └─ Label: catalog-number (title, then album) → direct label search → Beatport track page → qualified `CDR`
    │
    ▼
Analyze missing audio features
    ├─ BPM estimation (librosa beat tracking, if missing)
    └─ Key estimation (Krumhansl-Schmuckler, if missing)
    │
    ▼
Write enriched ID3 tags back to file
    │
    ▼
Rename file (Artist - Title.ext)
    │
    ▼
Copy to Augmented Dir
```

### Key modules

| Module | Role |
|--------|------|
| `src/track_metadata/metadata_agent.py` | Orchestrates per-file processing |
| `src/track_metadata/sources/hydrator.py` | `MetadataHydrator` — merges data from AcoustID, MusicBrainz, Discogs, OpenAI |
| `src/track_metadata/tags.py` | ID3 read/write via mutagen |
| `src/track_metadata/audio_features.py` | BPM/key estimation for tracks missing that data |
| `src/track_metadata/matching.py` | Filename seeding, fuzzy matching, field merging |
| `src/track_metadata/utils.py` | Directory layout, staging, discovery, format conversion |

### Caching

The hydrator maintains a disk cache at `AUGMENTED_DIR/.metadata_cache.json`, keyed by
a hash of the file path. Cached results skip redundant API calls on re-runs.

### Field-resolution fallback

After catalog and web merge, `MetadataHydrator` runs an explicit field-resolution pass
for missing `genre` and `label` values. Each field resolves independently, never
overwrites a non-empty value, stops on the first successful heuristic, and fails open
when external research is unavailable.

**Genre order:** existing merge result → artist-history DB aggregate → Beatport artist
genre counts (requires `TRACK_METADATA_ENABLE_CURSOR_SDK=1`).

**Label order:** existing merge result → artist/title catalog-number search →
artist/album catalog-number search (album must already be hydrated) → artist/title
direct label search → artist/album direct label search → Beatport track page →
qualified `CDR` (self-release / free-download inference with explicit supporting
indicators; follower count alone is insufficient).

Disable external research with `TRACK_METADATA_RESOLUTION_LABEL_WEB_SEARCH=0`,
`TRACK_METADATA_RESOLUTION_GENRE_BEATPORT=0`, and related toggles documented in
`.env.example`. DB artist-history genre inference remains enabled unless
`TRACK_METADATA_RESOLUTION_GENRE_ARTIST_HISTORY=0`.

Inspect per-heuristic provenance in each track's `agent_events` and in the run report
appendix written to `TRACK_METADATA_LOG_DIR`.

### Typical usage

1. Drop new audio files into the download directory
2. Run `python -m src.track_metadata.metadata_agent`
3. Enriched files appear in the augmented directory, ready for ingestion

---

## 2. Ingestion Pipeline

The ingestion pipeline moves audio files from the augmented/unprocessed directory into
the database, through a 4-stage tag-record process that captures metadata at each step
of the DJ workflow.

**Entry point:** `python -m src.scripts.ingestion_pipeline.run_ingestion_pipeline`

### Stages

```
Stage 0: Initial
    Unprocessed Dir → ingest_tracks() → DB (tracks, artists)
    Create InitialTagRecord from raw ID3 tags
    Move files to Processing Dir

        ▼ (user analyzes tracks in Mixed In Key)

Stage 1: Post-MIK
    Processing Dir → read updated ID3 tags
    Create PostMIKTagRecord (captures MIK key/energy values)

        ▼ (user imports into Rekordbox, exports tag file)

Stage 2: Post-Rekordbox
    Processing Dir → load Rekordbox tab-separated export
    Create PostRekordboxTagRecord (Rekordbox BPM/key overrides)

        ▼

Stage 3: Final
    Processing Dir → merge best values across all tag records
    Create FinalTagRecord
    Write finalized BPM/key tags back to audio files
    Update Track table with final metadata + formatted title
    Copy to Processed Music Dir (DJ-ready library)
```

### Interactive runner

The `run_ingestion_pipeline.py` script runs interactively. At each stage boundary it
waits for user confirmation (`next` to proceed, `cancel` to abort). This allows the
user to perform external tool steps (Mixed In Key analysis, Rekordbox import) between
stages.

### One-shot stage scripts

Each stage can also be run independently:

| Script | Stage |
|--------|-------|
| `src/scripts/ingestion_pipeline/load_initial_tag_records.py` | Stage 0 |
| `src/scripts/ingestion_pipeline/load_post_mik_tag_records.py` | Stage 1 |
| `src/scripts/ingestion_pipeline/load_post_rekordbox_tag_records.py` | Stage 2 |
| `src/scripts/ingestion_pipeline/load_final_tag_records.py` | Stage 3 |

### Key modules

| Module | Role |
|--------|------|
| `src/ingestion_pipeline/track_ingestion_pipeline.py` | `PipelineStage`, `InitialPipelineStage`, `PostRBPipelineStage`, `FinalPipelineStage` |
| `src/ingestion_pipeline/tag_record_factory.py` | Factories that build tag-record ORM rows from ID3 data |
| `src/ingestion_pipeline/config.py` | Directory layout, `TagRecordType` enum, factory registry |
| `src/data_management/service.py` | `ingest_tracks()`, `load_tracks()`, bulk DB updates |
| `src/data_management/audio_file.py` | ID3 read/write wrapper for tracks on disk |

### Directory layout

```
INGESTION_PIPELINE_ROOT/
├── 0_unprocessed/     Raw audio files awaiting ingestion
├── 1_processing/      Files actively being processed through stages
├── 2_finalized/       Files after final tag writes (staging area)
└── rb_tags.txt        Rekordbox tab-separated export (BPM, key)
```

---

## 3. Feature Extraction

After tracks are ingested, feature extraction computes audio descriptors and semantic
traits used by the harmonic mixing engine for transition scoring.

### Compact descriptors (75-D)

Each track is segmented into zones and a 75-dimensional vector is extracted per zone:

| Dimensions | Content | Domain |
|-----------|---------|--------|
| 0–23 | Beat-synchronous chroma CQT (mean + std) | Harmonic |
| 24 | Normalized BPM scalar | Rhythm |
| 25–40 | Tempogram histogram (16 bins) | Rhythm |
| 41–66 | MFCC (mean + std, 13 coefficients) | Timbre |
| 67 | RMS mean | Energy |
| 68–74 | Spectral: centroid, bandwidth, rolloff, contrast, flatness, ZCR, onset strength | Texture |

**Entry point:** `python -m src.scripts.feature_extraction.compute_compact_descriptors`

### Semantic traits (ONNX)

ONNX models classify tracks along semantic dimensions:

- **Binary classifiers** (EffNet): danceability, aggressiveness, happiness, party, relaxation, sadness, tonal/atonal, electronic/acoustic, voice/instrumental
- **Multi-label classifiers**: mood tags, instrument tags
- **Genre** (MAEST): 519-class Discogs taxonomy
- **Librosa extras**: onset density, spectral flatness

**Entry point:** `python -m src.scripts.feature_extraction.compute_track_traits`

### Pairwise cosine similarity

Pre-computed cosine similarity between track descriptor vectors, stored in
`track_cosine_similarity` for fast lookup during match scoring.

**Entry point:** `python -m src.scripts.feature_extraction.compute_cosine_similarities`

### Batch scripts

| Script | Purpose |
|--------|---------|
| `compute_compact_descriptors.py` | Batch 75-D descriptors for all tracks |
| `compute_track_traits.py` | Batch ONNX traits (parallelized via `TRAIT_WORKERS`) |
| `compute_cosine_similarities.py` | Precompute pairwise similarities (`COSINE_WORKERS`) |
| `compute_features_for_tracks.py` | Traits + cosine for specific track IDs |
| `backfill_genre_mood.py` | Re-extract stale trait versions |
| `retry_failed_traits.py` | Retry previously failed extractions |

---

## 4. Harmonic Mixing Engine

The harmonic mixing engine finds and scores transition candidates for a given source
track using Camelot key compatibility, BPM proximity, and multi-factor scoring.

### Match finding

`TransitionMatchFinder` loads the full track collection into a Camelot map (keyed by
Camelot code → BPM → track metadata). For a given source track:

1. Compute all harmonically compatible Camelot codes (same key, ±1 key, ±2 keys,
   octave jump, major/minor flip, adjacent jumps)
2. For each compatible code, find tracks within configured BPM bounds
3. Score each candidate via `TransitionMatch`

### Scoring factors

| Factor | API display name | Source | What it measures |
|--------|-----------------|--------|-----------------|
| `BPM_PROXIMITY` | `BPM Proximity` | Track metadata | How close the BPMs are |
| `KEY_COMPATIBILITY` | `Key Compatibility` | Camelot priority | Harmonic distance penalty |
| `DESCRIPTOR_SIMILARITY` | `Cosine Similarity` | 75-D vectors | Timbral/rhythmic similarity |
| `GENRE_SIMILARITY` | `Genre Similarity` | ONNX genre traits | Cosine similarity between genre vectors |
| `MOOD_CONTINUITY` | `Mood Continuity` | ONNX mood traits | Cosine similarity between mood vectors |
| `ENERGY_COMPATIBILITY` | `Energy Compatibility` | Descriptors | Energy level compatibility |
| `DANCEABILITY_COMPATIBILITY` | `Danceability Compatibility` | ONNX binary trait | Danceability score proximity |
| `INSTRUMENT_OVERLAP` | `Instrument Overlap` | ONNX instrument tags | Shared instrument presence |

The API and UI surfaces use the "API display name" (e.g., `Cosine Similarity`, not
`Similarity` or `Descriptor Similarity`). Internal Python code uses the constant names.

### Weights

Scoring weights are configurable via the `WeightService`. Defaults come from
`MATCH_WEIGHTS` in `harmonic_mixing/config.py` but can be overridden at runtime
through the API or persisted in `scoring_weight_override` DB rows.

Fusion subweights (harmonic, rhythm, timbre, energy) are normalized at the scoring
boundary before combining into the late-fusion similarity score, so proportional
intent survives arbitrary scaling in the persisted values.

### Cosine cache

`CosineCache` is a thread-safe LRU cache for pairwise cosine similarity lookups.
When a track is selected, BFS warming pre-populates the cache with likely-needed
pairs in a background thread. The Admin tab exposes cache statistics (hit rate,
capacity, key/BPM distributions).

---

## 5. Web Client (Assistant UI)

The web client is a React 19 + TypeScript SPA built with Vite. It communicates with
the FastAPI backend over HTTP, proxied through Vite's dev server in development.

**Start all services:** `bash src/scripts/start_web.sh`

This launches Elasticsearch (Docker), the FastAPI API server (port 8000), and the
Vite dev server (port 5173).

### Application layout

The app uses a single-pane shell with a persistent upper zone (search, browse,
matches) and a dockable lower zone for set workspace, explorer, and admin.

```
┌──────────────────────────────────────────────────┐
│  Search + Filter Bar (unified row)               │
│  Weight Controls (collapsible sidebar)           │
├──────────────────────────────────────────────────┤
│  Upper zone: Browse / Matches (always mounted)   │
│  TrackTable (virtualized, sortable, draggable)   │
│                                                  │
├──────── draggable resize handle ─────────────────┤
│  Dock tabs: [ Set ] [ Explorer ] [ Admin ]       │
│  Lower zone: active panel content                │
│  (panels stay mounted; visibility via activePanel)│
├──────────────────────────────────────────────────┤
│  PlayerBar (global audition playback)            │
└──────────────────────────────────────────────────┘
```

Key shell behaviors:
- Panels are always mounted; `activePanel` controls visibility, not mount/unmount.
- Panel height is shared and constant across panel switches (safe for DnD).
- Dock tabs stretch to fill the bar (`flex: 1`) and support hover-to-open during drag.
- Drag-and-drop flows from Browse/Matches into Set/Explorer dock targets.
- Search input clearing resets both `searchText` and `selectedTrack`.

### User flows

#### Flow 1: Find transition matches for a track

1. **Search** — User types in the search bar. Elasticsearch autocomplete returns
   suggestions as the user types (debounced, < 500ms).
2. **Select track** — User clicks a search suggestion. The app switches to the
   Matches tab and fetches transition matches from `GET /api/tracks/{id}/matches`.
3. **Review matches** — Matches are displayed in three groups (same key, higher key,
   lower key), sorted by overall score. Each row shows the candidate track, score,
   cosine similarity, and key info.
4. **Inspect match detail** — User clicks a track title in the matches table to open
   the detail view. `MatchDetail` shows the overall score, per-factor scores and
   weights, and trait snapshots for both the source and candidate tracks.
5. **Use as source (transition chaining)** — From the matches table or detail view,
   user clicks "Use as source" on a candidate. The candidate becomes the new source
   track and its matches are loaded, building a transition chain (A→B→C). A breadcrumb
   trail shows the chain history and supports back-navigation.
6. **Back to matches** — User clicks back to return to the full match list, or
   navigates the breadcrumb chain.

#### Flow 2: Browse and filter the collection

1. **Browse tab** — User switches to the Browse tab. The full track collection is
   loaded from `GET /api/tracks` (cached in the `useCollectionCache` hook).
2. **Apply filters** — User sets Camelot code(s), exact BPM, or BPM range in the
   `FilterBar`. The track table updates immediately (client-side filtering).
3. **Select from browse** — User clicks a track row. The app switches to the Matches
   tab and loads transition matches for that track (same as Flow 1, step 2).

#### Flow 3: Adjust scoring weights

1. **Weight controls** — The weight panel shows all scoring factors with sliders
   (0–100 scale). Loaded from `GET /api/weights` on mount.
2. **Adjust** — User drags sliders to change individual factor weights. The raw sum
   and validity indicator update in real time.
3. **Normalize** — User clicks normalize to distribute weights proportionally.
4. **Save** — Weights are persisted via `PUT /api/weights`. The `WeightService`
   updates the `scoring_weight_override` table and the `TransitionMatchFinder`
   re-syncs its effective weights.
5. **Re-score** — If a track is selected, matches are automatically re-fetched with
   the new weights applied.

#### Flow 4: Build a set

Sets are server-persisted in PostgreSQL. Each set contains a **pool** (unordered
candidate tracks), a **tracklist** (ordered performance sequence), and an
**explorer** (visual graph canvas for planning transitions). Sets also support
**starring** (per-entry favorites) and **bulk clear** actions.

1. **Create or select a set** — User creates a named set via the dock Set panel or
   selects an existing one. Sets are fetched from `GET /api/sets` and created via
   `POST /api/sets`.
2. **Add tracks to pool** — User drags tracks from Browse or Matches into the Set
   dock tab, or uses explicit add controls. Pool additions go through
   `POST /api/sets/{id}/pool` with duplicate-add protection at the hook level.
3. **Promote to tracklist** — Tracks move from pool to tracklist
   (`POST /api/sets/{id}/pool/move-to-tracklist`) or are added directly
   (`POST /api/sets/{id}/tracklist`).
4. **Inspect transitions** — Adjacent tracklist pairs are scored for transition quality.
   Weak transitions are highlighted. Null/unscored transitions display a distinct
   warning state.
5. **Reorder** — User reorders the tracklist (`POST /api/sets/{id}/tracklist/reorder`).
   Tracks can also move back from tracklist to pool
   (`POST /api/sets/{id}/tracklist/move-to-pool`).
6. **Star tracks** — Pool and tracklist entries support a per-entry `starred` boolean
   toggled via `PATCH /api/sets/{id}/pool/{track_id}/star` or
   `PATCH /api/sets/{id}/tracklist/{track_id}/star`.
7. **Bulk clear** — Each surface (Pool, Tracklist) has a separate `Clear All` action
   (`DELETE /api/sets/{id}/pool/clear`, `DELETE /api/sets/{id}/tracklist/clear`) that
   removes all entries from that surface only, with confirmation dialog showing count.
8. **Explorer canvas** — The explorer provides a visual graph for planning transitions.
   Nodes and edges represent tracks and potential transitions
   (`POST /api/sets/{id}/explorer/nodes`, `POST /api/sets/{id}/explorer/edges`,
   `DELETE /api/sets/{id}/explorer/edges/{edge_id}`). Edge scores are computed via
   `POST /api/sets/{id}/explorer/edge-scores`. The explorer uses a `viewBox`-based
   SVG camera for zoom/pan, with persisted `col_index` for stable horizontal layout.
   Multiple explorer trees per set are supported via `SetExplorerTree` records with
   `tree_id` scoping.
9. **Audition playback** — Play buttons on Browse, Matches, Pool, Tracklist, and
   Explorer surfaces trigger `GET /api/tracks/{id}/audio` for in-browser audition
   via a shared global `PlayerBar`. Single-track playback with automatic stop-on-switch.
10. **Export** — User exports the tracklist as an `.m3u8` playlist file for use in
   DJ software (`POST /api/sets/export-m3u8`).

#### Flow 5: Monitor cache statistics

1. **Admin tab** — User switches to the Admin tab. Cache statistics are fetched from
   `GET /api/admin/cache-stats`.
2. **Review** — The `AdminDashboard` displays: cache usage (used/capacity), hit rate,
   key distribution (which Camelot codes are cached), BPM distribution histogram,
   and recent cache entries/exits with timestamps.

### API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/search?q=` | Elasticsearch autocomplete |
| GET | `/api/tracks` | List tracks (filters: `camelot_code`, `bpm`, `bpm_min`, `bpm_max`) |
| GET | `/api/tracks/{track_id}/matches` | Transition matches for a track |
| GET | `/api/tracks/{track_id}/match-detail/{candidate_id}` | Per-factor score breakdown + trait snapshots |
| GET | `/api/tracks/{track_id}/audio` | Stream audio file for in-browser audition playback |
| GET | `/api/admin/cache-stats` | Cosine cache statistics and distributions |
| GET | `/api/weights` | Current scoring weights (UI scale 0–100) |
| PUT | `/api/weights` | Update and persist scoring weights |
| GET | `/api/sets` | List all sets |
| POST | `/api/sets` | Create a new set |
| GET | `/api/sets/{set_id}` | Get hydrated set (pool + tracklist + explorer) |
| PUT | `/api/sets/{set_id}` | Update set metadata (name) |
| DELETE | `/api/sets/{set_id}` | Delete a set |
| POST | `/api/sets/{set_id}/pool` | Add track to pool |
| DELETE | `/api/sets/{set_id}/pool/{track_id}` | Remove track from pool |
| PATCH | `/api/sets/{set_id}/pool/{track_id}/star` | Toggle pool entry starred flag |
| DELETE | `/api/sets/{set_id}/pool/clear` | Bulk clear all pool entries |
| POST | `/api/sets/{set_id}/pool/move-to-tracklist` | Move pool track to tracklist |
| POST | `/api/sets/{set_id}/tracklist` | Add track to tracklist |
| DELETE | `/api/sets/{set_id}/tracklist/{track_id}` | Remove track from tracklist |
| PATCH | `/api/sets/{set_id}/tracklist/{track_id}/star` | Toggle tracklist entry starred flag |
| DELETE | `/api/sets/{set_id}/tracklist/clear` | Bulk clear all tracklist entries |
| POST | `/api/sets/{set_id}/tracklist/reorder` | Reorder tracklist entries |
| POST | `/api/sets/{set_id}/tracklist/move-to-pool` | Move tracklist track to pool |
| POST | `/api/sets/{set_id}/explorer/nodes` | Add explorer node |
| POST | `/api/sets/{set_id}/explorer/edges` | Add explorer edge |
| DELETE | `/api/sets/{set_id}/explorer/edges/{edge_id}` | Delete explorer edge |
| POST | `/api/sets/{set_id}/explorer/delete-node` | Delete explorer node and edges |
| POST | `/api/sets/{set_id}/explorer/swap` | Swap explorer node track assignments |
| POST | `/api/sets/{set_id}/explorer/node-to-tracklist` | Promote explorer node to tracklist |
| POST | `/api/sets/{set_id}/explorer/edge-scores` | Compute transition scores for edges |
| GET | `/api/sets/{set_id}/explorer/trees` | List explorer trees for a set |
| POST | `/api/sets/{set_id}/explorer/trees` | Create a new explorer tree |
| POST | `/api/sets/transition-scores` | Batch transition scores for tracklist |
| POST | `/api/sets/export-m3u8` | Export tracklist as m3u8 playlist |

### Client architecture

| Directory | Contents |
|-----------|----------|
| `client/src/components/` | `SearchPanel`, `MatchesPanel`, `MatchDetail`, `FilterBar`, `TrackTable` (virtualized), `WeightControls`, `AdminDashboard`, `SetBuilder`, `SetPoolTable`, `SetTracklist`, `SetExplorerCanvas`, `SetExplorerDeleteModal`, `PlayButton`, `PlayerBar`, `DockBar` |
| `client/src/hooks/` | `useSelectedTrack`, `useTrackFilters`, `useCollectionCache`, `useCacheStats`, `useWeights`, `useSetBuilder`, `useAudioPlayer` |
| `client/src/utils/` | `trackTitle.ts` (shared `cleanTitle()` for user-facing track labels), `explorer.ts` (Explorer layout grid, edge routing, color palette helpers) |
| `client/src/api/http.ts` | Typed fetch wrappers for all API endpoints |
| `client/src/types.ts` | TypeScript type definitions (Track, TransitionMatch, MatchDetail, CacheStats, etc.) |

---

## 6. CLI Assistant

The CLI assistant is an interactive REPL for finding transition matches from the
terminal. It wraps the same harmonic mixing engine used by the web client.

**Entry point:** `python -m src.scripts.launch_assistant`

### Commands

| Command | Aliases | Args | Action |
|---------|---------|------|--------|
| `match` | `m`, or start input with `[` | track title | Find and print transition matches |
| `reload` | `r` | — | Reload track data and mapping tables |
| `ingest` | — | — | Trigger ingestion pipeline |
| `exit` | `quit`, `q` | — | Shut down the assistant |

### Cache warming

When a `match` command completes, the assistant starts a background thread to warm
the `CosineCache` via BFS from the matched track. This pre-populates similarity
values for likely follow-up queries, reducing latency on subsequent matches.

---

## 7. Elasticsearch Indexing

The search index powers autocomplete in both the web client and the API.

**Entry point:** `python -m src.scripts.index_tracks`

### Process

1. Connect to Elasticsearch at `ES_URL` (default `http://127.0.0.1:9200`)
2. Delete and recreate the `dj_tracks` index with autocomplete-optimized mappings
   (edge_ngram analyzer on title, standard analyzer on artist names)
3. Bulk index all tracks from PostgreSQL with fields: `id`, `title`, `artist_names`,
   `bpm`, `key`, `camelot_code`

### When to re-index

- After ingesting new tracks
- After modifying track metadata (title, artist)
- On first run (`start_web.sh` auto-indexes if the index doesn't exist)
- Manually with `start_web.sh --reindex`
