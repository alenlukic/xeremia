---
run_id: 20260411T235027Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-12T00:33:47.557410+00:00
qa_verdict: PASS_WITH_NOTES
build_status: PASS_WITH_NOTES
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 78
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Harden `TrackTable` virtualization remediation for horizontal scroll parity with focused regression coverage for the production virtual branch, near-end load-more behavior, and bidirectional scroll sync.
- Result: Production behavior was validated in live QA and scoped tests passed, but the run did not clear completion gates because the breaker showed the root-cause `ResizeObserver`-driven spacer-width fix still lacks durable automated protection; evaluator verdict remained `FAIL` (`78/80`) and a breaker follow-on contract was spawned.
- Scope: Narrow delivery on `client/src/components/TrackTable.tsx` and `client/src/components/TrackTable.test.tsx`, with known `SetExplorerCanvas.tsx` build failures treated as pre-existing and out of scope.

## Key Decisions
- Decision: Keep the remediation patch narrowly centered on `TrackTable` implementation plus a dedicated focused test file instead of reopening adjacent drag-and-drop, app-shell, or server code.
  - Why: The originating contract and plan both emphasized patch-only scope and isolated regression hardening for a breaker follow-on.
  - Tradeoff: The run preserved change discipline, but broader client build health and unrelated UI debt stayed unresolved.
- Decision: Accept the validated production fix as functionally correct for this run, then treat breaker-discovered test-confidence gaps as a new contract rather than continuing in-run patch churn.
  - Why: Review, QA, and build verification all supported live correctness for scroll parity, virtualization, drag overlay, and single-fire load-more, while the breaker produced falsification evidence against long-term regression protection rather than a live product failure.
  - Tradeoff: The user-facing issue is fixed, but the area is not yet durably protected by automation and therefore remains below completion threshold.

## Verification Learnings
- Live QA is the deciding proof for virtualization and scroll-sync behavior in this area: it confirmed far-right parity (`maxWrapper == maxTop`), bounded rendered row count, drag-overlay movement, single-fire bottom load-more, responsive live search, and no console/network errors.
- Focused unit coverage can appear comprehensive while still missing the actual root-cause path. Here, all scoped tests stayed green even if the `ResizeObserver` measurement wiring was removed, so passing tests did not prove the spacer-width fix.
- Build verification can be `PASS_WITH_NOTES` for a narrow remediation when the only remaining failure is a documented pre-existing out-of-scope issue, but evaluator completion should still fail if breaker evidence leaves the primary fix unprotected.

## Product / Stakeholder Learnings
- For browse-surface table work, durable acceptance depends on both live interaction quality and automated regression proof. A run that feels correct in the browser is still incomplete if the tests cannot catch removal of the root-cause fix.
- The most stakeholder-relevant behaviors in this table remain concrete and user-visible: right-edge scroll parity, bounded DOM row count under virtualization, drag-preview fidelity, and single-fire near-bottom loading.

## Technical / Architecture Learnings
- Horizontal parity depends on measuring the wrapper's real `scrollWidth`, not just theoretical table width. Absolutely positioned virtual rows can make the reachable wrapper range diverge from `table.getTotalSize()` unless spacer width is derived from live geometry.
- Symmetric scroll-sync handlers need symmetric tests. Code symmetry reduced review risk, but leaving wrapper-to-top clamp behavior untested still created a meaningful regression gap.
- Threshold-driven virtual-range behavior needs exact-edge assertions, not only far-from-boundary cases. Otherwise small off-by-one changes can slip through despite apparently good near-end coverage.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: Treat breaker findings that invalidate regression confidence as first-class failures even when live QA passes; convert them into a fresh contract instead of silently folding them back into the original run.
- Scope: subsystem-specific
  - Guidance: For virtualized table UI fixes, test harnesses must exercise live measurement paths such as `ResizeObserver` callbacks with non-fallback values; otherwise tests may only prove the pre-fix path.
- Scope: subsystem-specific
  - Guidance: When acceptance language says "both directions" or depends on a numeric threshold, add mirror-path and exact-boundary tests rather than relying on code symmetry or distant sample values.

## Deferred / Follow-up
- Breaker disposition: unresolved blocker was not a new production defect but a missing automated guard for the measured `wrapperScrollWidth` path, so the run should not be published as complete.
- Spawned follow-on: `BREAKER_FOLLOW_ON_CONTRACT.md` opens a new delivery run to add `ResizeObserver`-aware spacer-width coverage, wrapper-to-top clamp coverage, and exact `rows.length - 5` / `rows.length - 6` load-more boundary tests without reopening the validated production fix.
