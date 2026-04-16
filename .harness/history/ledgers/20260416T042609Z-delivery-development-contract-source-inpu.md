---
run_id: 20260416T042609Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-16T05:37:33.816756+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 88
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Complete `DEVELOPMENT_CONTRACT_3` for DnD parity and multi-select drag/drop between `Explorer` and `Set`.
- Result: Accepted stop state based on `APPROVE` review, `PASS` QA on `http://localhost:5174`, `PASS` build verification for Contract 3 scope, `LOW` non-blocking regression, `WATCH/CONTINUE` bad-state, and evaluation `PASS` at `88/80`.
- Scope: Shared client DnD behavior only: preserve multi-select payloads, restore Set track-table drops into tracklist and pool, and keep Contract 4 empty-row insertion out of scope. Completion of this run unblocks `DEVELOPMENT_CONTRACT_4` empty-row insertion work.

## Key Decisions
- Decision: Treat Contract 3 as complete once refreshed scoped evidence converged, even though earlier run artifacts had stale failure state.
  - Why: Current artifacts agree on acceptance: review is `APPROVE`, QA shows live Set drag-start and drop-success evidence for both destinations on `5174`, build verification passes for the contract, regression is non-blocking, and evaluation passes threshold.
  - Tradeoff: Close-out depended on refreshed artifact trust rather than older bookkeeping fields, so finalization required explicitly preferring current evidence over stale intermediate metadata.
- Decision: Do not treat mixed-worktree contamination in `PATCH.diff` as a Contract 3 failure.
  - Why: Review, QA, build verification, regression, and breaker artifacts all isolated the DnD repair as sound and scoped contamination as sibling-run drift rather than a defect in the Contract 3 deliverable.
  - Tradeoff: The mixed diff still reduces handoff clarity, so downstream readers must rely on scoped verification artifacts instead of assuming `PATCH.diff` alone defines the contract boundary.
- Decision: Elevate breaker concerns into a separate follow-on contract/run instead of reopening Contract 3.
  - Why: Breaker verdict was `CONCERNS` with four IMPORTANT items but no blocker; the core DnD acceptance already passed, and the repo policy prefers fresh follow-on runs for actionable breaker findings.
  - Tradeoff: Some edge cases and coverage gaps remain after stop, but they are tracked cleanly in `BREAKER_FOLLOW_ON_CONTRACT.md` and run `20260416T053438Z-delivery-development-contract-source-inpu`.

## Verification Learnings
- Contract-scoped acceptance was best proven by combining targeted automated evidence with live browser validation, not by whole-worktree cleanliness.
- The decisive QA evidence was live on `http://localhost:5174`: Set drag start and successful drop screenshots for both tracklist and pool, DOM snapshots for Set/Explorer workspace integrity, and clean console/runtime output.
- DnD-scoped React evidence was strong enough to support stop: `143/143` passing scoped tests, including parity and multi-select drop handling, while unrelated sibling failures stayed outside the contract boundary.
- A mixed diff can still yield a valid stop when review, QA, build verification, regression, and breaker artifacts independently agree on the scoped outcome.

## Product / Stakeholder Learnings
- The user-visible win for this run was restoring dependable parity between `Explorer` and `Set` for the main drag/drop flows rather than expanding behavior.
- Empty-row insertion remained intentionally deferred; keeping it out of Contract 3 preserved a cleaner prerequisite boundary and left Contract 4 explicitly unblocked once parity landed.
- Breaker follow-on items are quality hardening, not reopeners of the core product acceptance for Contract 3.

## Technical / Architecture Learnings
- Shared DnD state and ID normalization were the right leverage point for restoring parity across `Explorer` and `Set`; the fix did not require broader UI redesign.
- Prefix-based droppable IDs and multi-select payload construction create seam-level risks: core flows can pass while secondary reorder targeting or payload-construction coverage still need separate hardening.
- Contract-scoped build judgment in a mixed worktree is viable when the supporting evidence explicitly distinguishes in-scope DnD behavior from sibling-run fallout.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: When a run’s `PATCH.diff` is contaminated by sibling work, final stop should anchor on scoped review, QA, build, regression, and breaker evidence rather than treating mixed diff breadth as automatic failure.
- Scope: subsystem-specific
  - Guidance: For client DnD contracts, pair focused handler-level tests with live DOM/drag verification so parity fixes are validated in both automated and runtime paths.
- Scope: repo-wide
  - Guidance: If breaker findings are important but non-blocking after acceptance criteria are met, formalize them as a fresh follow-on contract/run instead of churning the accepted delivery scope.

## Deferred / Follow-up
- Breaker follow-on remains open in `BREAKER_FOLLOW_ON_CONTRACT.md` and run `20260416T053438Z-delivery-development-contract-source-inpu` for four IMPORTANT items: alt-prefixed row collision targeting, production multi-select payload construction coverage, title fallback coverage, and all-duplicates pool-drop behavior.
- Stale bookkeeping was the main bad-state signal for this run; final ledger should preserve that it was resolved by refreshed evidence rather than by expanding Contract 3 scope.
