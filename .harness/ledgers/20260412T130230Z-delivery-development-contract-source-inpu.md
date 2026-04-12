---
run_id: 20260412T130230Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-12T16:30:55.905019+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 95
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Contract 5 playback v1: add shared audition playback across Browse, Matches, Pool, Tracklist, and Explorer, backed by a new `/api/tracks/{id}/audio` endpoint.
- Result: PASS overall. QA `PASS`, build verification `PASS`, evaluation `PASS` at `95/A` over threshold `80`, breaker `CONCERNS` with no blocker findings, regression severity `LOW`.
- Scope: One backend audio-streaming endpoint plus one centralized client playback system with a shared bottom player bar and play entry points across all five surfaces.

## Key Decisions
- Decision: Centralize playback in `AudioPlayerProvider` / `useAudioPlayer` with thin `PlayButton` consumers and one shared `PlayerBar`.
  - Why: The contract required global, transferable playback rather than per-surface players, and review judged the centralized architecture as the right fit.
  - Tradeoff: A single context now carries time-based playback state, which is acceptable for v1 but creates re-render pressure that should be optimized before scaling.
- Decision: Enforce single-track playback through one audio element and request-ownership guards.
  - Why: This gives consistent "start another track, stop the current one" semantics across all surfaces and protects against stale async completions during track switches.
  - Tradeoff: The control path is simple and reliable, but the primary toggle path and audio event handling still need more direct tests.
- Decision: Satisfy the cache requirement with a memory-only validation LRU of about 20 entries rather than blob caching.
  - Why: It preserves streaming via `audio.src`, keeps memory bounded, and reduces repeat validation fetches without introducing persistent storage or full-file predownload.
  - Tradeoff: The first play of a cold track still pays a validation fetch plus the browser audio request, so duplicate first-hit network work remains a follow-up.

## Verification Learnings
- Live browser plus DB-backed QA was enough to verify the user-visible contract: play controls appeared on all required surfaces, playback promoted into the global bar, console stayed clean, and sampled database-backed files resolved under `PROCESSED_MUSIC_DIR`.
- Breaker outcome was non-blocking but meaningful: the shipped behavior is credible, while follow-up work is still warranted around backend endpoint tests, path-containment hardening, playback-control/component tests, and removing the first-play double fetch.
- Bad-state `WATCH` in this run came from artifact integrity, not product failure: contaminated diff artifacts and a stale review note weakened diff-first trust, and the durable fix was to treat `REVIEW_NOTES.md = APPROVE` as authoritative and avoid over-trusting stale patch artifacts.

## Product / Stakeholder Learnings
- Audition playback works best as a workspace-level capability. Users should be able to start from any surface and keep control in one persistent player bar instead of managing separate local players.
- Explicit user-visible errors for missing files and unsupported formats are part of the minimum acceptable playback UX, not optional polish.

## Technical / Architecture Learnings
- Thin per-surface playback affordances over one shared controller are a good repo pattern for cross-cutting client features: additive, consistent, and easier to verify than duplicated local state machines.
- A memory-only validation cache is a practical compromise for v1 streaming playback: it meets the contract intent without storing audio payloads, but it should be described clearly as validation-result caching rather than content caching.
- Backend streaming passed runtime QA, but new endpoints still need direct regression tests and defense-in-depth containment checks even when the current data path is DB-backed and low risk.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: When a run adds a cross-surface feature, prefer one shared controller/provider with thin consumers instead of parallel surface-specific implementations.
- Scope: repo-wide
  - Guidance: Do not let diff-first gates rely on contaminated artifacts. If `PATCH.diff` or review notes drift from the real run state, refresh them before breaker/eval/regression conclusions are treated as authoritative.
- Scope: subsystem-specific
  - Guidance: For media/file-serving endpoints, pair live QA with explicit backend path/format/error-path coverage; happy-path browser proof alone is not strong enough long-term.

## Deferred / Follow-up
- Add focused backend coverage for `/api/tracks/{id}/audio`, including MP3/WAV happy paths, unsupported format, missing track, missing file, unconfigured directory, and traversal rejection.
- Harden the audio endpoint with a path-containment check before serving DB-derived file names.
- Add direct tests for `togglePlayPause`, `PlayButton`, `PlayerBar`, and audio-element event/error handling so the main playback controls are not protected only by hook internals and mocked surfaces.
- Remove the first-play double fetch, likely by switching validation to `HEAD` or by relying more directly on audio-element error handling.
- Revisit playback-state fanout before larger browse tables or richer playback UI features; the current single-context design is good for v1 but not the likely long-term scaling point.
