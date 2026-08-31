# Workflows

This document describes the core workflows in Xeremia: how data moves through the
system, what each pipeline does, and how users interact with the application.

For the structural overview (layering, dependency rules, module map), see
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Metadata Agent

The metadata agent is the single ingestion path for the library. It is a batch
processor that discovers newly downloaded audio files, enriches their metadata,
finalizes the files, and upserts them into PostgreSQL. It runs as a standalone
script and operates on files in a configured download directory.

**Entry point:** `python -m src.track_metadata.metadata_agent [--rekordbox-tsv PATH]`

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
    ├─ cursor-sdk fallback agent (when TRACK_METADATA_ENABLE_CURSOR_SDK=1)
    └─ Merge: best year, label fallback, remixer extraction
    │
    ▼
Post-merge field resolution (genre and label, independent)
    ├─ Genre: artist-history DB aggregate → Beatport artist genres (optional)
    └─ Label: catalog-number (title, then album) → direct label search → Beatport track page → qualified `CDR`
    │
    ▼
Resolve BPM and key independently
    ├─ Optional Rekordbox TSV + existing ID3 agreement → accept without analyzers
    ├─ Rekordbox + Essentia agreement → accept without madmom/librosa
    ├─ Otherwise require 3-of-4 Rekordbox/analyzer consensus
    ├─ Broad disagreement with Rekordbox present → use Rekordbox
    └─ Without Rekordbox: Essentia-first consensus with octave-error protection
    │
    ▼
Format: canonicalize key, derive Camelot code, compose display title
    │
    ▼
Persist or route
    ├─ All mission-critical fields present:
    │  write enriched ID3 tags → rename (Artist - Title.ext)
    │  → upsert track/artist/artist_track into PostgreSQL
    │  → copy to Augmented Dir
    └─ Missing mission-critical fields:
       route to Remediation Dir for later finalization
```

### Key modules

| Module | Role |
|--------|------|
| `src/track_metadata/metadata_agent.py` | CLI entry point |
| `src/track_metadata/run_pipeline.py` | Assembles the stage pipeline, runs it over discovered files, writes the run report |
| `src/track_metadata/pipeline/` | Stage framework, stage definitions, DB persistence, run report, cursor-sdk fallback agent |
| `src/track_metadata/sources/hydrator.py` | `MetadataHydrator` — merges data from AcoustID, MusicBrainz, Discogs, and the fallback agent |
| `src/track_metadata/tags.py` | ID3 read/write via mutagen |
| `src/track_metadata/audio_features.py` | Staged BPM/key resolution and analyzer fusion |
| `src/track_metadata/rekordbox.py` | Rekordbox TSV parsing and deterministic track matching |
| `src/track_metadata/key_utils.py` | Named-key and Camelot canonicalization |
| `src/track_metadata/matching.py` | Filename seeding, fuzzy matching, field merging |
| `src/track_metadata/genre.py`, `label.py`, `research.py` | Genre/label field-resolution heuristics |
| `src/track_metadata/remediate_track.py` | Remediation finalization entry point |
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

### Remediation

Tracks missing mission-critical fields (for example when the cursor-sdk fallback is
disabled) are routed to the remediation directory instead of being finalized. After
researching the missing fields, finalize a remediation track without re-running the
whole pipeline:

```bash
python -m src.track_metadata.remediate_track <remediation_file> <resolved.json>
```

`resolved.json` maps `SimpleMetadata` field names (`title`, `artist`, `album`,
`label`, `genre`, `remixer`, `year`, `bpm`, `key`) to their resolved values; only the
listed fields are overridden. The command writes the resolved tags, finalizes the
file into the augmented library, and upserts it into PostgreSQL.

### Typical usage

1. Drop new audio files into the download directory.
2. Optionally export a Rekordbox metadata TSV containing at least `Track Title`
   and, when available, `BPM` and `Key`. Named musical keys and Camelot keys
   such as `4A`/`04A` are accepted.
3. Run `python -m src.track_metadata.metadata_agent`, or pass the export with
   `python -m src.track_metadata.metadata_agent --rekordbox-tsv /path/to/export.tsv`.
4. Enriched files appear in the augmented directory and their tracks are upserted
   into PostgreSQL, ready for feature extraction and indexing. Anything routed to
   the remediation directory can be finalized later with `remediate_track`.

---

## 2. Feature Extraction

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
| `extract_features.sh` | Shell wrapper that runs the full feature pipeline |

---

## 3. Harmonic Mixing Engine

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
| `BPM` | `BPM` | Track metadata | How close the BPMs are |
| `CAMELOT` | `Camelot` | Camelot priority | Harmonic distance of the key transition |
| `ENERGY` | `Energy` | Descriptors | Energy level compatibility |
| `FRESHNESS` | `Freshness` | Track metadata | Recency of the candidate track |
| `SIMILARITY` | `Cosine Similarity` | 75-D vectors | Timbral/rhythmic descriptor similarity |
| `GENRE_SIMILARITY` | `Genre Similarity` | ONNX genre traits | Cosine similarity between genre vectors |
| `MOOD_CONTINUITY` | `Mood Continuity` | ONNX mood traits | Cosine similarity between mood vectors |
| `VOCAL_CLASH` | `Vocal Clash` | ONNX voice trait | Vocal overlap penalty |
| `INSTRUMENT_SIMILARITY` | `Instrument Similarity` | ONNX instrument tags | Shared instrument presence |

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
pairs in a background thread. The Admin dashboard exposes cache statistics (hit rate,
capacity, key/BPM distributions).

---

## 4. Web Client

The web client is a React 19 + TypeScript SPA built with Vite. It communicates with
the FastAPI backend over HTTP, proxied through Vite's dev server in development.

**Start all services:** `bash src/scripts/start_web.sh`

This launches Elasticsearch (Docker), the FastAPI API server (port 8000), and the
Vite dev server (port 5173).

### Application layout

The app offers two shells, toggled from the header and persisted per device:

```
Workspace shell (default):
┌──────────────────────────────────────────────────┐
│  Header: set picker · shell toggle · admin gear  │
├──────────────────────────────────────────────────┤
│  WorkspaceGrid — free-form widget canvas (8px    │
│  snap grid): Browser, Matches, Pool, Explorer,   │
│  Sequencer widgets; move / resize / lock /       │
│  remove / re-add from the widget tray            │
├──────────────────────────────────────────────────┤
│  PlaybackBar (global audition playback)          │
└──────────────────────────────────────────────────┘

Legacy quadrant shell:
┌──────────────────────────────────────────────────┐
│  Top row: Track Browser │ Matches                │
│  (collapsible quadrants, draggable dividers)     │
├──────────────────────────────────────────────────┤
│  Bottom row: SetBuilder — Tracklist + Pool       │
│  tables, or the Explorer canvas (sub-tabs)       │
├──────────────────────────────────────────────────┤
│  PlaybackBar                                     │
└──────────────────────────────────────────────────┘
```

Key shell behaviors:
- The workspace layout (shell choice, widget placements) is persisted per device via
  the `workspace-layout` table preference.
- Admin opens as a modal overlay from the header gear (cache statistics, weight
  controls, table preferences) and closes on `Escape`.
- Drag-and-drop flows from Browser/Matches into Pool, Explorer, and Sequencer
  targets.
- Search input clearing resets both `searchText` and the browse selection.

### User flows

#### Flow 1: Find transition matches for a track

1. **Search** — User types in the search bar. Elasticsearch autocomplete returns
   suggestions as the user types (debounced, < 500ms).
2. **Select track** — User clicks a search suggestion. The Matches panel fetches
   transition matches from `GET /api/tracks/{id}/matches`.
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

1. **Browser** — The full track collection is loaded from `GET /api/tracks`
   (cached in the `useCollectionCache` hook), with trait rows from
   `GET /api/track-traits`.
2. **Apply filters** — User sets Camelot code(s), exact BPM, or BPM range in the
   `FilterBar`. The track table updates immediately (client-side filtering).
3. **Select from browse** — User clicks a track row. The Matches panel loads
   transition matches for that track (same as Flow 1, step 2).

#### Flow 3: Adjust scoring weights

1. **Weight controls** — The Admin overlay shows all scoring factors with sliders
   (0–100 scale). Loaded from `GET /api/weights` on open; factory defaults are
   available from `GET /api/weights/defaults`.
2. **Adjust** — User drags sliders to change individual factor weights. The raw sum
   and validity indicator update in real time.
3. **Normalize** — User clicks normalize to distribute weights proportionally.
4. **Save** — Weights are persisted via `PUT /api/weights`. The `WeightService`
   updates the `scoring_weight_override` table and the `TransitionMatchFinder`
   re-syncs its effective weights.
5. **Re-score** — If a track is selected, matches are automatically re-fetched with
   the new weights applied.

#### Flow 4: Build a set

Sets are server-persisted in PostgreSQL. Each set contains a **pool** (candidate
tracks with optional highlight colors and named subgroups), a **tracklist** (ordered
performance sequence with per-entry notes and sequencer overrides), and an
**explorer** (visual graph canvas for planning transitions).

1. **Create or select a set** — User creates a named set from the header set picker
   or selects an existing one. Sets are fetched from `GET /api/sets` and created via
   `POST /api/sets`.
2. **Add tracks to pool** — User drags tracks from Browser or Matches into the Pool,
   or uses explicit add controls. Pool additions go through
   `POST /api/sets/{id}/pool` with duplicate-add protection at the hook level.
3. **Organize the pool** — Pool entries can be reordered
   (`POST /api/sets/{id}/pool/reorder`) and color-highlighted
   (`POST /api/sets/{id}/pool/{track_id}/highlight`). Named subgroups group pool
   entries (`POST /api/sets/{id}/pool/subgroups`, member add/remove/reorder, and
   drag-in `.../subgroups/{subgroup_id}/drop`).
4. **Promote to tracklist** — Tracks move from pool to tracklist
   (`POST /api/sets/{id}/pool/move-to-tracklist`) or are added directly
   (`POST /api/sets/{id}/tracklist`).
5. **Sequence the set** — The Sequencer lays the tracklist out on a committed time
   lane, with pool subgroups as alternative lanes holding benched candidates.
   Per-entry play minutes, pinned end times, and BPM overrides are saved via
   `PUT /api/sets/{id}/tracklist/{track_id}/overrides`; free-form notes via
   `PATCH /api/sets/{id}/tracklist/{track_id}/note`. Sequencer view state is
   persisted on the set via `PUT /api/sets/{id}/sequencer`.
6. **Reorder** — User reorders the tracklist (`POST /api/sets/{id}/tracklist/reorder`).
   Tracks can also move back from tracklist to pool
   (`POST /api/sets/{id}/tracklist/move-to-pool`).
7. **Explorer canvas** — The explorer provides a free-form graph for planning
   transitions. Nodes and edges represent tracks and potential transitions
   (`POST /api/sets/{id}/explorer/nodes`, `POST /api/sets/{id}/explorer/edges`,
   `DELETE /api/sets/{id}/explorer/edges/{edge_id}`). Node positions are persisted
   as grid-snapped `x`/`y` coordinates (`POST .../explorer/move-node`,
   `POST .../explorer/positions`). Edge scores are computed via
   `POST /api/sets/{id}/explorer/edge-scores`. The explorer uses a `viewBox`-based
   SVG camera for zoom/pan.
8. **Audition playback** — Play buttons on Browser, Matches, Pool, Tracklist, and
   Explorer surfaces trigger `GET /api/tracks/{id}/audio` for in-browser audition
   via a shared global `PlaybackBar`. Single-track playback with automatic
   stop-on-switch.
9. **Export** — User exports the tracklist as an `.m3u8` playlist file for use in
   DJ software (`POST /api/sets/export-m3u8`).

#### Flow 5: Monitor cache statistics

1. **Admin overlay** — User opens Admin from the header gear. Cache statistics are
   fetched from `GET /api/admin/cache-stats`.
2. **Review** — The `AdminDashboard` displays: cache usage (used/capacity), hit rate,
   key distribution (which Camelot codes are cached), BPM distribution histogram,
   and recent cache entries/exits with timestamps.

### API endpoints

Search, tracks, and matching:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/search?q=` | Elasticsearch autocomplete |
| GET | `/api/tracks` | List tracks (filters: `camelot_code`, `bpm`, `bpm_min`, `bpm_max`) |
| GET | `/api/track-traits` | Current-version ONNX trait rows for all tracks |
| GET | `/api/tracks/{track_id}/matches` | Transition matches for a track |
| GET | `/api/tracks/{track_id}/match-detail/{candidate_id}` | Per-factor score breakdown + trait snapshots |
| GET | `/api/tracks/{track_id}/audio` | Stream audio file for in-browser audition playback (GET/HEAD) |

Weights and admin:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/weights` | Current scoring weights (UI scale 0–100) |
| GET | `/api/weights/defaults` | Factory default scoring weights |
| PUT | `/api/weights` | Update and persist scoring weights |
| GET | `/api/admin/cache-stats` | Cosine cache statistics and distributions |
| GET | `/api/admin/table-preferences` | List table/workspace-layout preferences for the calling device |
| PUT | `/api/admin/table-preferences/{table_id}` | Save a table or workspace-layout preference |

Sets:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sets` | List all sets |
| POST | `/api/sets` | Create a new set |
| GET | `/api/sets/{set_id}` | Get hydrated set (pool + subgroups + tracklist + explorer) |
| PUT | `/api/sets/{set_id}` | Update set metadata (name) |
| PUT | `/api/sets/{set_id}/sequencer` | Merge Sequencer view state into the set |
| DELETE | `/api/sets/{set_id}` | Delete a set |
| POST | `/api/sets/export-m3u8` | Export tracklist as m3u8 playlist |

Pool:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sets/{set_id}/pool` | Add track to pool |
| DELETE | `/api/sets/{set_id}/pool/{track_id}` | Remove track from pool |
| POST | `/api/sets/{set_id}/pool/reorder` | Reorder pool entries |
| POST | `/api/sets/{set_id}/pool/{track_id}/highlight` | Set or clear a pool entry's highlight color |
| POST | `/api/sets/{set_id}/pool/move-to-tracklist` | Move pool track to tracklist |

Pool subgroups:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sets/{set_id}/pool/subgroups` | Create a pool subgroup |
| PATCH | `/api/sets/{set_id}/pool/subgroups/{subgroup_id}` | Rename a subgroup |
| DELETE | `/api/sets/{set_id}/pool/subgroups/{subgroup_id}` | Delete a subgroup |
| POST | `/api/sets/{set_id}/pool/subgroups/reorder` | Reorder subgroups |
| POST | `/api/sets/{set_id}/pool/subgroups/{subgroup_id}/reorder` | Reorder entries within a subgroup |
| POST | `/api/sets/{set_id}/pool/subgroups/{subgroup_id}/members` | Add a pool entry to a subgroup |
| DELETE | `/api/sets/{set_id}/pool/subgroups/{subgroup_id}/members/{pool_entry_id}` | Remove a pool entry from a subgroup |
| POST | `/api/sets/{set_id}/pool/subgroups/{subgroup_id}/drop` | Drop a track directly into a subgroup |

Tracklist:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sets/{set_id}/tracklist` | Add track to tracklist |
| DELETE | `/api/sets/{set_id}/tracklist/{track_id}` | Remove track from tracklist |
| POST | `/api/sets/{set_id}/tracklist/reorder` | Reorder tracklist entries |
| PATCH | `/api/sets/{set_id}/tracklist/{track_id}/note` | Update a tracklist entry's note |
| PUT | `/api/sets/{set_id}/tracklist/{track_id}/overrides` | Replace Sequencer overrides (play minutes, pinned end, BPM) |
| POST | `/api/sets/{set_id}/tracklist/move-to-pool` | Move tracklist track to pool |

Explorer:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sets/{set_id}/explorer/nodes` | Add explorer node |
| POST | `/api/sets/{set_id}/explorer/edges` | Add explorer edge |
| DELETE | `/api/sets/{set_id}/explorer/edges/{edge_id}` | Delete explorer edge |
| POST | `/api/sets/{set_id}/explorer/move-node` | Move a node (persist x/y) |
| POST | `/api/sets/{set_id}/explorer/positions` | Batch-persist node positions |
| POST | `/api/sets/{set_id}/explorer/delete-node` | Delete explorer node (optionally rewiring edges) |
| POST | `/api/sets/{set_id}/explorer/swap` | Swap explorer node track assignments |
| POST | `/api/sets/{set_id}/explorer/node-to-tracklist` | Promote explorer node to tracklist |
| POST | `/api/sets/{set_id}/explorer/edge-scores` | Compute transition scores for edges |

### Client architecture

| Directory | Contents |
|-----------|----------|
| `client/src/components/` | `SearchPanel`, `BrowserWidget`, `MatchesWidget`, `MatchesPanel`, `MatchDetail`, `FilterBar`, `TrackTable` (virtualized), `WeightControls`, `AdminDashboard`, `SetBuilder`, `SetPoolTable`, `SetTracklist`, `SetExplorerCanvas`, `SetExplorerDeleteModal`, `ExplorerMatrix`, `Sequencer`, `WorkspaceGrid`, `WidgetFrame`, `WidgetTray`, `LayoutPicker`, `QuadrantControls`, `SetPickerControls`, `SortTierBar`, `TableColumnControls`, `TrackSearchModal`, `PlayButton`, `PlaybackBar` |
| `client/src/hooks/` | `useSelectedTrack`, `useTrackFilters`, `useCollectionCache`, `useCacheStats`, `useWeights`, `useSetBuilder`, `useAudioPlayer`, `useWorkspaceLayout`, `useTablePreferences`, `useSequencer`, `useSequencerSettings`, `useTrackSearch`, `useExplorerMatrix`, `useExternalTrackDrop`, `useResizableColumns`, `useDragAutoScroll` |
| `client/src/utils/` | `trackTitle.ts` (shared `cleanTitle()` for user-facing track labels), `explorer.ts` and `graphLayout.ts` (Explorer layout and routing helpers), `harmonic.ts`, `time.ts`, `trackSearch.ts` |
| `client/src/api/http.ts` | Typed fetch wrappers for all API endpoints |
| `client/src/types.ts` | TypeScript type definitions (Track, TransitionMatch, MatchDetail, CacheStats, etc.) |

---

## 5. Elasticsearch Indexing

The search index powers autocomplete in the web client.

**Entry point:** `python -m src.scripts.index_tracks`

### Process

1. Connect to Elasticsearch at `ES_URL` (default `http://127.0.0.1:9200`)
2. Delete and recreate the `dj_tracks` index with autocomplete-optimized mappings
   (edge_ngram analyzer on title, standard analyzer on artist names)
3. Bulk index all tracks from PostgreSQL with fields: `id`, `title`, `artist_names`,
   `bpm`, `key`, `camelot_code`, `genre`, `label`

### When to re-index

- After ingesting new tracks
- After modifying track metadata (title, artist)
- On first run (`start_web.sh` auto-indexes if the index doesn't exist)
- Manually with `start_web.sh --reindex`
