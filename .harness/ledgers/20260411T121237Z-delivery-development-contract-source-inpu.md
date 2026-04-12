---
run_id: 20260411T121237Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-11T12:42:31.871817+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: FAIL
eval_score: 75
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Apply the breaker follow-on fixes for exact-BPM `Clear Filters` behavior and focused `DockBar` keyboard-navigation coverage.
- Result: The contracted behavior is functionally correct and was verified live and in targeted automated tests, but the run remained non-finalizable because the recorded diff still captured unrelated dirty-worktree client shell changes.
- Scope: Intended scope was limited to clearing exact BPM through `App.tsx` shell state and adding narrow `DockBar` keyboard tests; artifact scope drift was recorded in `PATCH.diff` and called out by bad-state/evaluation artifacts.

## Key Decisions
- Decision: Fix the exact-BPM clear path at the shell-state layer in `client/src/App.tsx`, not only in `FilterBar` local input state.
  - Why: The contract required `Clear Filters` to remove the actual filter effect from browse results, not just empty the visible control.
  - Tradeoff: This preserved the existing local input sync pattern, but it also meant a visual-only test could still miss stale shell state.
- Decision: Add focused `DockBar` keyboard tests instead of broadening the follow-on into panel-shell behavior.
  - Why: The follow-on contract was narrow and specifically targeted tablist navigation and semantics.
  - Tradeoff: The targeted tests improved coverage for required keys and roving-tabindex semantics, but the breaker still found missing adversarial assertions around activation side effects.
- Decision: Treat the broader recorded patch as an auditability problem, not as evidence that the narrow functional fixes were wrong.
  - Why: QA, review, and build verification all supported the contracted behavior, while bad-state/evaluation artifacts showed the run diff still contained pre-existing dirty-worktree shell changes.
  - Tradeoff: The run can preserve the functional learning, but it should not be treated as a clean narrow closeout until the effective diff is re-cut.

## Verification Learnings
- Live client validation on port `5173` was the decisive proof for the BPM-clear fix: setting exact BPM to `128` reduced visible rows, and `Clear Filters` restored the unfiltered row count and emptied the exact-BPM control.
- For filter-clearing regressions, automated tests must assert both the visible input reset and the browse-result reset. A visual-only assertion can go false-green when local input sync masks stale shell state.
- For `DockBar` keyboard tests, focus-movement coverage is not enough by itself. Reusable coverage should also assert that arrow/Home/End navigation preserves `aria-selected` state unless activation is intentional.

## Product / Stakeholder Learnings
- For this browsing workflow, `Clear Filters` is only credible when users see both signals at once: the exact filter control clears and the result set broadens immediately.
- Keyboard navigation quality in the dock is a user-facing accessibility contract, not just an implementation detail. Roving-tabindex and non-activating arrow-key behavior are worth preserving explicitly in tests.

## Technical / Architecture Learnings
- In this client shell, filter truth lives above `FilterBar`; local control state can mirror shell props but cannot substitute for clearing shell-owned filter state.
- Dirty worktree overlap in `client/src/` can easily leak unrelated shell/panel work into a breaker follow-on `PATCH.diff`, creating an audit trail that is broader than the contract even when the intended functional fix is small.
- The exact-BPM debounce path still has a low-confidence latent race watch item: standard blur/click ordering prevented a real defect in QA, but future non-blur clear paths should remember that pending timers can outlive external resets.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: In narrow breaker follow-on runs on a dirty worktree, do not rely on functional PASS artifacts alone. Re-cut the effective diff so review, evaluation, bad-state, and ledger artifacts all describe the same scoped change set before finalization.
- Scope: subsystem-specific
  - Guidance: For client filter-reset tests, assert the data effect as well as the control state. Clearing a filter must prove that browse results return to the expected baseline, not only that the input looks empty.
- Scope: subsystem-specific
  - Guidance: For tablist keyboard coverage, treat “focus moves without activation” as a first-class invariant and encode it directly with `aria-selected` assertions alongside roving-tabindex checks.

## Deferred / Follow-up
- Strengthen the exact-BPM `Clear Filters` regression test so it fails if the input clears visually while browse results remain filtered.
- Add `DockBar` keyboard assertions that arrow/Home/End focus movement does not activate a different panel.
- Re-spin or narrow the recorded diff for this run before using it as a clean audit reference for the breaker follow-on contract.
