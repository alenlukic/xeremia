---
run_id: 20260410T060143Z-delivery-spectral-score-computing-as-0-fo
mode: delivery
published_at: 2026-04-10T06:52:06.938217+00:00
qa_verdict: PASS
build_status: CONDITIONAL
breaker_verdict: PASS
eval_verdict: PASS
eval_score: 85
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Restore non-zero spectral scoring for recently ingested tracks by fixing the combined feature-extraction orchestrator used for explicit track IDs.
- Result: The orchestrator now runs compact descriptor generation before trait extraction and cosine similarity, closing the missing-prerequisite path that caused descriptor-less tracks to be skipped and spectral scoring to fall back to `0.0`.
- Scope: Narrow patch in the feature-extraction orchestration path plus focused regression coverage; no redesign of descriptor storage, scoring logic, or standalone worker scripts.

## Key Decisions
- Decision: Fix the bug at the orchestration layer instead of changing cosine/runtime scoring behavior.
  - Why: The root cause was a missing prerequisite step in `compute_features_for_tracks.py`, not a defect in cosine computation itself.
  - Tradeoff: This restores the intended pipeline with minimal risk, but leaves the underlying descriptor-step interface unchanged.
- Decision: Preserve best-effort step sequencing and add session cleanup to Step 1 rather than redesigning the whole pipeline runner.
  - Why: The task called for the smallest coherent fix, and targeted remediation closed the concrete session-leak path found during verification.
  - Tradeoff: The script remains a simple linear sequencer with uneven step interfaces, which is acceptable now but not ideal long-term.

## Verification Learnings
- Targeted verification was strong enough to pass the run: reviewer `APPROVE`, QA `PASS`, breaker `PASS`, and eval `PASS` (`85/B`).
- The highest-value test remediation was making module-global wiring and descriptor argument passthrough visible to tests; this closed the main false-green risks in the original test shape.
- Acceptance was validated primarily by orchestration logic and targeted tests, not by a live replay of track IDs `9217`-`9296`; that remains a known verification limitation for this run.
- Repository-wide build confidence is still bounded by pre-existing unrelated failures (`test_layer_dependency_direction` and `test_cache_miss_falls_through_to_compute_and_stores`), which were not introduced by this patch.

## Product / Stakeholder Learnings
- Recently ingested tracks depend on descriptor generation being part of the explicit feature-preparation path; trait extraction alone is not enough to make spectral scoring work after reindexing.

## Technical / Architecture Learnings
- `compute_cosine_similarities` requires a current `TrackDescriptor` row; when descriptors are missing, both precompute and runtime spectral scoring degrade to `0.0`.
- The descriptor step still uses module-global state (`session`, `tracks`) while later steps use explicit `(track_ids, session)` parameters. This is workable in the current sequential CLI flow but is the main maintainability and concurrency risk left behind.
- Session ownership in orchestration code must be explicit on failure paths; the Step 1 `try/finally: session.close()` fix is a reusable reminder for similar wrapper scripts.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: In feature-extraction orchestration, treat compact descriptor generation as a hard prerequisite for cosine similarity and any runtime path that expects spectral scores.
- Scope: subsystem-specific
  - Guidance: When tests patch modules that rely on module-global wiring, assert the actual injected objects and argument passthrough explicitly; otherwise orchestration regressions can stay falsely green.
- Scope: one-off
  - Guidance: Do not treat unrelated baseline test failures elsewhere in the repo as evidence against a narrowly scoped fix unless the touched path intersects them.

## Deferred / Follow-up
- Unify the descriptor step interface with the traits/cosine steps so all orchestrated workers use the same `run(track_ids, session)` style instead of external module-global mutation.
- If stronger end-to-end confidence is needed, replay the real recently ingested IDs against a live database/runtime path and confirm the previous `no descriptor (v1)` skip signal is gone.
---
ledger_schema_version: 2
tags: []
recommendation_ids: []
---

# Run Ledger

## Outcome
- Task: Spectral score computing as 0 for all matches for most recently ingested tracks even though server restarted with --reindex flag. Investigate and fix.
- Mode: delivery
- Result: UNKNOWN
- Scope:
- Key files changed:
- Follow-on runs:

## Key decisions
- 

## Verification and breaker
- Tests/build:
- Breaker stack summary:
- Verification gaps:

## Bad-state signals
- 

## Token efficiency notes
- Approx context size:
- Optimizations used:

## Durable learnings
- 

## Deferred or follow-up
- 
