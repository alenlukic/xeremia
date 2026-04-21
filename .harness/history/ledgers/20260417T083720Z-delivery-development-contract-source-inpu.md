---
run_id: 20260417T083720Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-17T09:36:09.141216+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 92
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Harden mixed-row drag-and-drop and ordering coverage in `App.dnd.test.tsx` and `SetTracklist.test.tsx`.
- Result: PASS after one remediation round; QA passed all 8 ACs, build verification passed, eval passed at A- (92), regression risk remained low.
- Scope: Test-only follow-on run confined to two client test files; no production behavior changes.

## Key Decisions
- Decision: Remediate falsifiability defects before treating the breaker follow-on as complete.
  - Why: AC1 and AC5 were initially false-green because fixtures let display indices masquerade as persisted positions.
  - Tradeoff: Slightly richer fixtures were added, but scope stayed narrow and test-only.
- Decision: Stop after restoring contract compliance instead of broadening into all breaker concerns.
  - Why: The run’s job was to close the blocking gaps and preserve auditability; QA/build were already green after AC1 and AC5 were fixed.
  - Tradeoff: AC7’s loose `expect.any(Number)` assertion and P2 data-diversity gaps were deferred to a fresh follow-on.

## Verification Learnings
- Mixed-row tests must create real divergence between display order and persisted positions; otherwise index-based regressions can pass undetected.
- “Interspersed empty rows” must be present in the fixture, not simulated only by droppable ids or synthetic over-targets.
- Non-consecutive positions such as `0, 10, 20` are a reliable way to make reorder assertions falsifiable.

## Product / Stakeholder Learnings
- For breaker follow-on test work, “more tests” is not enough; the value is mutation resistance and clear regression signal.

## Technical / Architecture Learnings
- Mixed-row DnD coverage is strongest when assertions bind to persisted identifiers (`trackId`, empty-row persisted ids) rather than rendered row indices.
- Row-order tests should cover interleaving, collisions, and boundary insertions with fixtures that do not collapse to naive append/index behavior.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: In `App.dnd.test.tsx` and `SetTracklist.test.tsx`, prefer mixed fixtures with actual empty rows and non-consecutive positions so persisted-position lookups cannot be confused with display indices.
- Scope: subsystem-specific
  - Guidance: When capturing DnD droppable data, assert concrete ids where practical; avoid broad matchers like `expect.any(Number)` for contract-shape checks.

## Deferred / Follow-up
- AC7 remains open: replace the loose `expect.any(Number)` trackId check with a concrete value assertion and add empty-row droppable data-shape coverage.
- P2 follow-up: improve AC3/AC4 data diversity by asserting true interleaving and ordering, not only presence/counts.
