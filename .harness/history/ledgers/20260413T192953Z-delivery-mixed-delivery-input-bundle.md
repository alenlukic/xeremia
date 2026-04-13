---
run_id: 20260413T192953Z-delivery-mixed-delivery-input-bundle
mode: delivery
published_at: 2026-04-13T20:57:21.059806+00:00
qa_verdict: PASS_WITH_NOTES
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 81
regression_severity: HIGH
---
# Run Ledger

## Outcome
- Task: Deliver the six normalized contracts from the mixed delivery input bundle across the React/TypeScript client and the required backend support surfaces.
- Result: Functional delivery passed review, design QA, build verification, and scored `81 / B-`, but the run closed with breaker concerns and a remaining regression risk that should be handled as follow-up work rather than silently folded into completion.
- Scope: Six contracts covering audio playback recovery, explorer inbound drag plus edge autoscroll, explorer move/reparent, multi-sort across three tables, playback-row highlight with click isolation, and browse-position restore.

## Key Decisions
- Decision: Treat the audio-player failure as a cross-layer contract even though the run was primarily client-facing.
  - Why: The durable fix required a `HEAD` preflight on `/api/tracks/:id/audio`; the client alone could not validate sources safely while the backend still returned `405` for `HEAD`.
  - Tradeoff: Scope expanded slightly into the API route, but it removed a class of browser-driven playback failures and reduced preflight bandwidth compared with using `GET`.
- Decision: Use `Alt`-drag for explorer node move/reparent rather than overloading the existing drag gesture.
  - Why: Explorer already used drag for edge creation, so a modifier-based gesture preserved existing behavior and avoided ambiguous intent.
  - Tradeoff: The gesture is less discoverable, but it kept the patch narrow and prevented interference with established connect-drag flows.
- Decision: Standardize inbound explorer drags on a shared payload shape across browse, matches, tracklist, and pool sources.
  - Why: Reusing the same payload/routing model kept new drag sources aligned with existing dock/cell handling instead of adding source-specific drop code.
  - Tradeoff: The DnD layer became more central and required focused regression coverage, but future drag-source additions are cheaper.
- Decision: Reparenting currently enforces a strict parent-child hierarchy by removing existing incoming edges.
  - Why: That behavior matches the implemented move-node path and simplifies validation/cycle prevention for this contract.
  - Tradeoff: It conflicts with the surrounding explorer model, which still has multi-parent affordances elsewhere; that mismatch was correctly surfaced as a post-run regression risk.

## Verification Learnings
- Live-stack verification was strong for playback, search, cache population, DOM integrity, and the new `HEAD` audio path, but drag-heavy explorer interactions were only partially proven manually; those contracts depended heavily on focused automated coverage.
- Regression detection added real value after the main QA/review path by catching shape mismatches that contract-focused checks did not fully cover; in this run it exposed remaining explorer-model inconsistency even after other regressions were remediated.
- Artifact fidelity is part of verification, not bookkeeping: a stale `PATCH.diff` weakened auditability because it described a materially different audio-transcoding approach than the shipped code.

## Product / Stakeholder Learnings
- Playback controls inside dense data tables must be isolated from row-selection/search side effects; users treat play as a transient audition action, not as intent to change browse context.
- Browse-position restore only feels correct when it is tied to the exact filter/search context that produced the original viewport; restoring against changed filters is experienced as disorienting, not helpful.
- The explorer interaction model benefits from explicit mode separation: connect-drag and move/reparent can coexist if the gesture boundary is clear, but the underlying tree/DAG semantics must also be equally clear to users.

## Technical / Architecture Learnings
- Client media validation should prefer capability checks plus cheap preflight metadata over full-content fetches; using `GET` for validation can consume response bodies and destabilize audio-element startup.
- If a client feature relies on `HEAD`, range support, or MIME introspection, backend routes must explicitly support those semantics; assuming `GET` parity is unsafe.
- Shared drag payloads and centralized drop routing scale better than per-source branching, but they also make hidden model mismatches more dangerous because one backend invariant can affect every drag source.
- Explorer reparenting semantics must be consistent end to end: either the subsystem is strict single-parent and all multi-parent affordances/tests should be removed, or the move/reparent service must preserve/cascade graph state accordingly.
- Audio transcoding paths need defensive bounds validation and byte-level tests, not only happy-path size/type checks, because malformed media metadata can create reliability and memory risks even in a desktop-focused tool.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: When a UI fix depends on transport semantics (`HEAD`, `Range`, `Content-Type`), treat it as a cross-layer contract early and verify the live route behavior before assuming the client bug is purely frontend.
- Scope: subsystem-specific
  - Guidance: Explorer changes must keep interaction gestures, client affordances, backend move semantics, and existing canvas/test model aligned; tree-only and DAG-capable behaviors cannot coexist accidentally.
- Scope: repo-wide
  - Guidance: Verification artifacts must reflect the final implementation exactly; stale diffs create false confidence and should be treated as a correctness issue for the harness, not a documentation nit.
- Scope: subsystem-specific
  - Guidance: For state restore features, capture and validate the state key that defines content identity (for example filter/search key), not only the raw scroll offset.

## Deferred / Follow-up
- Resolve the remaining explorer model inconsistency called out by regression detection: either make explorer strictly single-parent everywhere or preserve non-target incoming edges during reparent and add focused regression coverage.
- Complete the follow-on breaker items that were intentionally left out of this delivery: descendant level cascading on reparent, stronger MatchesPanel row-order assertions, AIFF parser bounds checks, byte-level `aiffToWav` tests, and blob-URL cleanup on cache eviction.
- Regenerate `PATCH.diff` so the durable run artifacts describe the actual shipped implementation.
