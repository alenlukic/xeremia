# Development Contract

## Source Inputs
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/CONVENTIONS.md`
- `.harness/runs/20260412T-product-thought-partner-client-features/PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User-resolved decisions from the 2026-04-12 contract request: global fixed player bar at the bottom of the viewport; AIFF/FLAC deferred; MP3/WAV only in v1

## Selected Intent
- delivery

## Contract Driver
- mixed

## Selected Recommendation IDs
- `R4`

## Deferred Inputs / Non-goals
- No inline per-row scrubbers
- No waveform rendering
- No EQ, cue points, dual-deck preview, or mixing controls
- No persistent browser storage for playback cache; v1 cache is memory-only
- No AIFF or FLAC playback support in v1; those formats are deferred to a follow-on contract

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Add v1 track audition playback across Browse, Matches, Pool, Tracklist, and Explorer by pairing a new backend audio-streaming endpoint with a single global fixed player bar at the bottom of the viewport; support one active track at a time and only MP3/WAV source files in v1.
DO: Implement a `GET /api/tracks/{id}/audio` streaming endpoint that resolves track file paths via `PROCESSED_MUSIC_DIR` and serves MP3/WAV content for valid track IDs; add play affordances to every track row and every explorer node; build a single shared client playback controller with play/pause, seekable progress bar, elapsed/total time, and volume slider; ensure starting a new track stops the currently playing one; add a memory-only client LRU cache with a default capacity of about 20 recently fetched tracks to reduce repeat fetches; handle missing files and unsupported formats with explicit user-visible errors instead of silent failure.
ACCEPTANCE: Browse, Matches, Pool, Tracklist, and Explorer each expose a play control for every track-bearing item; clicking play starts or resumes playback through the global bottom player bar and clicking a different track transfers playback so only one track plays at a time; the global player bar exposes play/pause, progress with seek, elapsed/total time, and volume control; audio begins via streaming without requiring a complete file download before playback can start; the backend resolves files from `PROCESSED_MUSIC_DIR`; the client cache is memory-only and defaults to roughly 20 tracks; MP3 and WAV are supported in v1; AIFF/FLAC are explicitly out of scope and surface a clear unsupported-format experience; automated coverage verifies endpoint behavior and client controller state transitions.
OUTPUT: schema=default
```

## Ordering Constraints
- No hard dependency; recommended after `DEVELOPMENT_CONTRACT_4.md` and before `DEVELOPMENT_CONTRACT_6.md`

## Notes to Orchestrator
- Keep the player architecture centralized; do not let delivery sprawl into per-surface audio implementations.
- Validation should include backend streaming behavior, unsupported-format handling, and cross-surface client playback state with the single global player bar.

