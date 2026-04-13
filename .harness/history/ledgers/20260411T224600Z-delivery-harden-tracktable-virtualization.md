---
run_id: 20260411T224600Z-delivery-harden-tracktable-virtualization
mode: delivery
published_at: 2026-04-11T23:52:06.071745+00:00
qa_verdict: FAIL
build_status: CONDITIONAL
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 61.3
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Harden `TrackTable` virtualization by restoring bidirectional horizontal scroll sync, removing the sentinel load-more path, and validating virtualized drag/pagination behavior without widening scope beyond `TrackTable.tsx`.
- Result: Blocked. The run successfully removed the sentinel pagination path, preserved bounded virtualized row rendering, kept drag-overlay behavior acceptable in live QA, and avoided duplicate load-more firing, but it failed closure because horizontal scroll ranges still mismatched at the right edge and evaluation confidence stayed below threshold.
- Scope: `client/src/components/TrackTable.tsx` only; no `App.tsx`, server, or `SetExplorerCanvas.tsx` changes.

## Key Decisions
- Decision: Keep pagination ownership in the virtual-range trigger and remove the `IntersectionObserver` sentinel path.
  - Why: Dual mechanisms were a duplicate-fire risk and the contract explicitly required a single load-more path.
  - Tradeoff: Existing sentinel-based tests became stale immediately and required explicit replacement work.
- Decision: Preserve the narrow component-only scope even after drag-overlay concerns were raised.
  - Why: The contract prohibited `App.tsx` drag-system changes and live QA did not produce evidence of a `TrackTable`-local drag defect.
  - Tradeoff: The run could validate behavior, but not use broader drag-system edits as an escape hatch.
- Decision: Stop after the targeted retry once QA still showed a right-edge scroll mismatch.
  - Why: Retry budget was exhausted and the remaining defect was a concrete acceptance failure, not an ambiguous intermittent.
  - Tradeoff: The run closed as blocked and required a breaker-driven follow-on instead of continued patching.

## Verification Learnings
- Live QA is necessary for virtualized table geometry: the blocking defect was a 4px right-edge range mismatch (`maxWrapper=108`, `maxTop=104`) that typecheck and targeted tests did not detect.
- Runtime behavior was otherwise stable: row count stayed bounded (`6`, then `12`), load-more expanded once with no immediate duplicate fire, drag overlay tracked the pointer acceptably, and console logs stayed clean.
- JSDOM-based tests gave false confidence because they exercised the non-virtual fallback rather than the production `virtualItems.length > 0` path.

## Product / Stakeholder Learnings
- For browse-table UX, "mostly correct" is not enough when scroll affordances are user-visible; a small range mismatch at the right edge is still a release blocker.
- Removing a user-facing loading mechanism must be paired with test expectation updates, or the repo keeps broadcasting false regressions after an intentional UX improvement.

## Technical / Architecture Learnings
- Scroll-sync correctness in virtualized layouts depends on matching `maxScrollLeft`, not just mirroring intermediate `scrollLeft` values; asymmetric client widths can leave the final pixels unreachable.
- Single-owner pagination is the safer pattern for this table: the virtual-range trigger plus dedupe guard is easier to reason about than mixing observer and range-based triggers.
- The current test environment does not naturally exercise the production virtualized render branch, so virtualization behavior must be forced or mocked explicitly.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For virtualized `TrackTable` work, treat exact right-edge `maxScrollLeft` parity as a first-class acceptance check rather than assuming bidirectional sync is proven by mid-range scroll mirroring.
- Scope: repo-wide
  - Guidance: When removing a legacy mechanism that tests assert on, replacement coverage is part of closure work, not optional cleanup.
- Scope: repo-wide
  - Guidance: Treat green typecheck and targeted smoke tests as insufficient evidence for geometry-sensitive UI behavior; preserve a live QA probe for overflow, range limits, and duplicate-trigger behavior.

## Deferred / Follow-up
- Fix the remaining horizontal scroll range mismatch so the top scrollbar and wrapper share the exact same far-right limit.
- Replace the stale sentinel-based `App.test.tsx` expectations with automated coverage for the virtual-range load-more path, including the dedupe-reset behavior.
- Add tests that force the real virtualized render branch and scroll-sync handlers, since current passing tests do not protect the production path.
