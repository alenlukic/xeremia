---
run_id: 20260416T062729Z-delivery-empty-row-insertion-in-tracklist
mode: delivery
published_at: 2026-04-16T10:48:07.386034+00:00
qa_verdict: FAIL
build_status: FAIL
breaker_verdict: BLOCKED
eval_verdict: FAIL
eval_score: 52
regression_severity: HIGH
---
# Run Ledger

## Outcome
- Task: Validate and deliver empty-row insertion and fill behavior for set tracklist/pool flows.
- Result: Blocked and superseded. Live validation confirmed the tracklist fill-in-place contract was broken, the run was not safe to finalize, and remediation was moved to follow-on run `20260416T104603Z-delivery-development-contract-source-inpu`.
- Scope: Client-side empty-row insertion/fill behavior plus adjacent React verification for tracklist and pool; this ledger records durable lessons from the blocked run rather than implementation details.

## Key Decisions
- Decision: Treat the runtime reorder failure as a blocker instead of accepting green unit tests and build output.
  - Why: QA, Design QA, Build Verification, and Breaker evidence all showed that search-fill could append a track and then fail the reorder with a `400`, violating the core "fill in place" contract.
  - Tradeoff: This stopped same-run closure even though targeted tests were `172/172` green and the client build passed.
- Decision: Escalate to a fresh follow-on run instead of spending more retries inside this run.
  - Why: Bad-state evidence showed contradictory stage metadata, exhausted retry bookkeeping, and a mismatched `PATCH.diff`, so additional in-run remediation would not be auditable.
  - Tradeoff: Slower short-term recovery, but preserved traceability and kept breaker findings first-class.

## Verification Learnings
- The confirmed race pattern is "fire add, then fire reorder without awaiting add." In the tracklist search-fill path, the reorder request can reach the backend before the add commits, producing `POST /api/sets/{id}/tracklist/reorder` `400` and placing the filled track at the end instead of the chosen empty-row position.
- The drag-fill tracklist path uses the same async shape, so structurally similar code should be treated as suspect even when runtime reproduction is incomplete.
- Green tests were false confidence here. Mock-level checks that only assert both callbacks were invoked did not exercise the dependency that reorder must wait for add completion.
- Passing build and focused unit tests are not sufficient acceptance evidence for UI workflows that depend on live async sequencing; live QA on the actual stack caught the defect the tests missed.

## Product / Stakeholder Learnings
- The user-facing promise of an empty row is positional: selecting "Fill" implies "put this track in this slot," not "append now and try to repair position later."
- Design-level clarity was largely sound, but good placeholder UI did not offset the functional trust break caused by the mispositioned fill and incomplete drag-fill proof.

## Technical / Architecture Learnings
- Any fill workflow implemented as separate add and reorder calls needs explicit sequencing or a single atomic backend operation. Without that, latency-dependent races can convert a clean UI flow into a runtime contract failure.
- Test suites around DnD and fill behavior need at least one async-aware path using delayed Promise resolution or integration-style coverage; otherwise they can report green while masking ordering and commit-timing bugs.
- When a breaker exposes a real async dependency, the highest-value follow-up is usually a narrow contract focused on sequencing plus test hardening, not broader UI churn.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For set-builder fill flows, do not model "fill in place" as fire-and-forget add plus immediate reorder unless the reorder waits for the add or the backend performs both operations atomically.
- Scope: repo-wide
  - Guidance: Treat fully mocked synchronous tests as insufficient proof for async UI contracts; add at least one verification path that can fail when operation ordering is wrong.
- Scope: repo-wide
  - Guidance: Do not continue or finalize a run when run metadata, retry history, context manifest, and stored diff disagree with the validated scope; open a fresh follow-on run after repairing traceability instead.

## Deferred / Follow-up
- Fix the add-then-reorder race in the tracklist search-fill and drag-fill paths in the follow-on run.
- Add false-green-breaking tests that prove reorder happens only after add resolves and that failure paths are observable.
- Rebuild run-state hygiene before reuse: keep `PATCH.diff`, stage metadata, retry bookkeeping, and context packaging aligned with the actual scoped work.
