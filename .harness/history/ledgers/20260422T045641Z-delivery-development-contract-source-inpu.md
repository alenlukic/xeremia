---
run_id: 20260422T045641Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-22T17:37:55.128129+00:00
qa_verdict: FAIL
build_status: PENDING
breaker_verdict: CONCERNS
eval_verdict: PASS_WITH_NOTES
eval_score: 85
regression_severity: UNKNOWN
---
# Run Ledger

## Outcome
- Task: Breaker follow-on for Contract 3 Search Modal fixes.
- Result: All six contracted P0/P1 fixes landed; QA found one more nested Escape gap in the column-config popover, which was fixed inline before closeout. Final evaluation passed with no unresolved blocker findings.
- Scope: `SearchModal` behavior/tests and search-trigger styling only; no broader Phase A/Phase C work was pulled in.

## Key Decisions
- Decision: Use a `nestedOpenRef` counter with per-surface registration for nested UI inside the modal.
  - Why: The modal must ignore Escape while a child menu or popover is open without adding render churn or fragile parent-child coupling.
  - Tradeoff: Every nested surface must both register itself and own its own Escape dismissal path, or the modal stays guarded while the child remains open.
- Decision: Replace single `sourceTrack` state with a `sourceChain` stack.
  - Why: Multi-level Source navigation, Back, and breadcrumb jumps require reversible history rather than a single current pointer.
  - Tradeoff: Navigation handlers and tests become slightly more complex because chain truncation and re-fetch behavior must stay in sync.
- Decision: Make the localStorage write path self-heal corrupt match-column state.
  - Why: Safe reads prevent crashes, but only a safe write path repairs bad persisted data on the next valid user action.
  - Tradeoff: Recovery logic must be maintained on both read and write paths for persisted UI preferences.

## Verification Learnings
- QA caught a real acceptance gap after reviewer approval: the column-config popover registered as nested but still lacked its own Escape handler. Nested-surface verification must test dismissal behavior, not only "modal did not close."
- Focused regression coverage around Escape ordering, corrupt localStorage recovery, reset-on-reopen, add-without-close, and breadcrumb chaining materially reduced false confidence for this modal subsystem.
- Final verification cleared with full client tests plus clean TypeScript and Ruff; remaining breaker items were explicitly waived as P2 hardening, not correctness blockers.

## Product / Stakeholder Learnings
- In a layered modal workflow, users expect Escape to dismiss the active child surface first, not merely block the parent modal from closing.
- Search-to-transition exploration behaves like navigation history. Breadcrumb/back UX should be modeled as a chain from the start rather than retrofitted onto a single-source design.

## Technical / Architecture Learnings
- Capture-phase `keydown` listeners are the safest pattern for nested menus/popovers inside `SearchModal` because they let the active child claim Escape before ancestor handlers run.
- Shared row-render paths for virtualized and fallback tables are worth consolidating early; otherwise interaction fixes can silently diverge between rendering modes.
- Persisted UI state needs independently safe write-path testing. A tolerant read path is not sufficient if the next save can still preserve or re-break corrupt storage.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: Any nested popup inside `SearchModal` should register with `nestedOpenRef` and implement its own capture-phase Escape handler that closes only that surface.
- Scope: repo-wide
  - Guidance: Any navigable UI chain such as breadcrumbs, history, or transition chaining should start with a stack/array model rather than a single current-item field.
- Scope: repo-wide
  - Guidance: For localStorage-backed UI state, verify the write path independently so corrupt persisted values are repaired on the next successful save.

## Deferred / Follow-up
- Remaining P2 maintenance was intentionally deferred: breadcrumb-entry styling parity, chained-navigation fetch cancellation/depth limits, and extra Escape/breadcrumb-nav test hardening.
