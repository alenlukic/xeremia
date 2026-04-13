---
run_id: 20260412T063636Z-delivery-fix-remove-hover-to-open-layout-
mode: delivery
published_at: 2026-04-12T07:03:32.834088+00:00
qa_verdict: FAIL
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 63
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Remove hover-open behavior from the dock-drag path in `App.tsx` and verify Matches-to-Set / Explorer dock-drop acceptance.
- Result: Partial success. The run established that drag-hover no longer auto-opens panels before drop, but completion stayed blocked because live QA could not prove Matches-to-Set or Explorer dock-drop acceptance on the current Chrome DevTools drag path.
- Scope: Durable signal is limited to the `App.tsx` hover-open regression, the retry needed to align `App.test.tsx` with the already-shared panel-height model, and the verification/follow-on outcomes. Unrelated dirty-worktree edits were carried through as evidence noise, not as remediation scope.

## Key Decisions
- Decision: Treat hover-open removal as a verification-backed outcome rather than forcing a synthetic code change.
  - Why: Review and QA evidence showed the baseline already had no `hoverTimer`, `onDragMove`, `DragMoveEvent`, or timer-driven panel switch during drag.
  - Tradeoff: The task closed the hover-open concern with evidence instead of a meaningful `App.tsx` diff, which can look vacuous unless the ledger records that the targeted behavior was already absent.
- Decision: Use the one retry to align `App.test.tsx` with the existing shared panel-height persistence model.
  - Why: Build verification initially failed because the test still assumed per-panel split heights while the app reads and writes a shared localStorage key.
  - Tradeoff: The retry restored green build evidence, but it also confirms that the candidate still bundles an out-of-scope panel-height semantic change that should not be confused with the hover-open fix itself.
- Decision: Convert breaker-important gaps into a follow-on run instead of expanding this run.
  - Why: Breaker findings were about missing DnD coverage and scope traceability, not a reviewed-correct blocker defect.
  - Tradeoff: This preserves auditability and scope lock, but leaves the current run incomplete from a quality-threshold perspective until the follow-on coverage work lands.

## Verification Learnings
- Chrome DevTools drag completion is not sufficient evidence for dock-drop acceptance in this UI. QA observed "dropped" status text while `/api/sets/5` tracklist and explorer-node state remained unchanged.
- For dock DnD acceptance, the durable proof standard is backend state delta or a pointer path that is known to trigger the app's actual sensor flow; hover-open evidence alone is not enough.
- Build retries should first check whether failing tests reflect a real regression or stale expectations. In this run, the retry was justified because `App.test.tsx` lagged behind the app's shared height key, not because the production change was broken.

## Product / Stakeholder Learnings
- User-visible drag success cues can be misleading in this flow. Acceptance for Matches-to-Set and Explorer dock-drop should require persisted state change, not only tab/drop affordance evidence.
- The scoped customer-facing win from this run is narrower than the original task framing: hover-open layout shift is gone, but the end-to-end dock-drop experience remains unproven under live QA.

## Technical / Architecture Learnings
- The app/test pair now treats panel height as one shared persisted value rather than per-panel values; any future work that touches panel height must account for that as current behavior.
- When the committed baseline already lacks the behavior named in a contract, the run should explicitly record "verified absent in baseline" to avoid inventing unnecessary code churn.
- Dirty-worktree diffs from adjacent UI work reduce signal in review, regression, and breaker stages even when they are intentionally preserved.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: If a task targets behavior that is already absent in the committed baseline, record the outcome as verification-backed absence and keep remediation scope narrow instead of manufacturing extra edits.
- Scope: subsystem-specific
  - Guidance: For dock DnD in the client shell, require proof of backend or state mutation when validating drag acceptance; DevTools drag-path success text alone is not a PASS signal.
- Scope: repo-wide
  - Guidance: When build/test failures come from stale expectations after carried-forward worktree changes, use the bounded retry to realign tests, then document the semantic coupling so later runs do not misread it as part of the scoped fix.
- Scope: repo-wide
  - Guidance: Keep unrelated dirty-worktree files out of remediation contracts and follow-on scope unless they are directly required by confirmed failure evidence.

## Deferred / Follow-up
- Breaker-important DnD coverage gaps were promoted to follow-on run `20260412T070101Z-delivery-add-dnd-coverage-for-dock-set-gu`.
- Live QA still needs a verification path that can conclusively prove Matches-to-Set and Explorer dock-drop acceptance, or surface a real app defect if manual/pointer-accurate dragging also fails.
