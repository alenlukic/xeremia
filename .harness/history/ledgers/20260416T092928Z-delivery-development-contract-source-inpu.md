---
run_id: 20260416T092928Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-16T17:15:15.339079+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: PASS
eval_verdict: PASS
eval_score: 84
regression_severity: MEDIUM
---
---
ledger_schema_version: 2
tags: []
recommendation_ids: []
---

# Run Ledger

## Outcome
- Task: Reduce cached match-results render latency on `http://localhost:5174` without changing server/cache/API behavior.
- Result: PASS. The candidate removed `react-virtual` from `MatchesPanel`, kept direct row rendering, and met the cached render gate with live evidence.
- Scope: Intended scope was the client-side cached render path only; the shipped candidate also includes adjacent DnD/set-builder plumbing that passed focused verification but remains outside the strict contract.

## Key Decisions
- Decision: Keep the simpler non-virtualized `MatchesPanel` render path for the current candidate.
  - Why: Fresh QA showed `84.0ms` average cached-data-to-final-DOM timing, `63.6%` improvement versus the recorded `231ms` baseline, full row completeness (`Same 6/6`, `Higher 36/36`, `Lower 14/14`), and no console issues.
  - Tradeoff: This favors a simpler and fully rendered DOM path over theoretical scaling benefits from virtualization; residual risk remains for materially larger buckets than the ones exercised live.
- Decision: Accept the current candidate with adjacent DnD/set-builder plumbing changes noted as residual risk instead of blocker findings.
  - Why: Broad review approved, focused tests/build passed, and breaker found no actionable `BLOCKER` or `IMPORTANT` issues.
  - Tradeoff: The run closes with a broader diff than the narrow perf contract, so supervisor messaging must call out the out-of-contract surfaces explicitly.

## Verification Learnings
- Live QA on `http://localhost:5174` is the decisive evidence for this run: cached-data-to-final-DOM averaged `84.0ms`, improvement versus the recorded baseline was `63.6%`, bucket row counts stayed complete, and browser console warnings/errors stayed at zero.
- Build verification passed with focused client tests, `npx tsc -b`, and `npm run build`; evaluator finished at score `84`, grade `B`, verdict `PASS`.
- Breaker PASS supersedes earlier virtualization-specific concerns because those concerns targeted an obsolete candidate; fresh evidence must be tied to the current diff, not stale artifacts.
- Regression remained `MEDIUM` but non-blocking because adjacent DnD/set-builder changes broadened the candidate beyond the strict perf-path contract.

## Product / Stakeholder Learnings
- For the observed live bucket sizes, correctness and completeness of the rendered match rows mattered more than preserving a more complex virtualization approach.
- A candidate can still be completion-worthy when it over-solves slightly beyond contract scope, but the extra behavior must be called out clearly as residual caveat rather than hidden inside the perf success story.

## Technical / Architecture Learnings
- In this UI path, removing render-path complexity was sufficient to beat the performance gate; virtualization was not required for the currently exercised cached result sizes.
- When a perf fix touches nearby interaction plumbing, the technical risk shifts from the original bottleneck to change-discipline and adjacent workflow coverage.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For `MatchesPanel`, prefer the simplest render path that satisfies the live cached-render gate; only reintroduce virtualization if fresh evidence on larger real buckets shows direct rendering no longer meets latency or completeness requirements.
- Scope: repo-wide
  - Guidance: If a candidate changes during the run, stale breaker concerns tied to an earlier implementation must be explicitly superseded by fresh QA/build evidence against the current diff.
- Scope: repo-wide
  - Guidance: When delivery scope broadens beyond the contract but verification stays green, record the adjacent surfaces as residual regression caveats and recommended follow-up checks rather than silently treating the run as perfectly narrow.

## Deferred / Follow-up
- Run focused live QA for the adjacent set-builder workflows introduced by the new empty-row targeting and `addToTracklistAtPosition` plumbing.
- Re-check `MatchesPanel` responsiveness and row completeness with materially larger live match buckets if those datasets become available.
