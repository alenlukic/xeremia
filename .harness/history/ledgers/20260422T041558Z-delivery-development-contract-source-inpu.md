---
run_id: 20260422T041558Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-22T04:58:11.396218+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 85
regression_severity: UNKNOWN
---
# Run Ledger

## Outcome
- Task: Deliver Contract 3 Phase B universal search modal, replacing Browse/Matches with a header-triggered and `Cmd/Ctrl+K` full-viewport overlay.
- Result: Core modal shipped and all formal gates passed (728 client tests, TypeScript clean, QA PASS, Broad Review PASS, Design QA PASS), but breaker found 1 BLOCKER and 9 IMPORTANT findings, so remediation was split into a follow-on contract/run.
- Scope: `client/src/` modal component, App/Header wiring, modal styles, and focused tests.

## Key Decisions
- Decision: Reset transient modal state by unmounting the inner modal component when closed.
  - Why: This gave a simple, reliable reset mechanism for query, filters, sort, and transition state without bespoke reset code.
  - Tradeoff: The reset is implicit, so tests must verify every important state dimension rather than only query text.
- Decision: Reuse existing search/matches/table patterns inside one modal-owned workflow instead of preserving separate Browse/Matches surfaces.
  - Why: It kept Phase B scoped to one coherent UI delivery and preserved existing playback/add APIs.
  - Tradeoff: Legacy assumptions leaked into the new surface and hid bugs around Escape ownership, transition depth, and virtualized rendering coverage.
- Decision: Treat breaker findings as follow-on work instead of widening this run.
  - Why: The harness policy favors breaker-driven follow-on contracts for auditability and clean scope control.
  - Tradeoff: The run closed as `PASS_WITH_NOTES` rather than as a fully remediated feature.

## Verification Learnings
- Passing gates did not prove nested-surface Escape correctness; sibling `document.addEventListener` handlers are FIFO, so a modal-level Escape listener can fire before popup-local handlers.
- Read-side `localStorage` fallback testing was not enough; corrupt-data resilience has to be validated on the write path too.
- Vitest/jsdom could not exercise the production virtualized row path because zero-height containers produce zero virtual items; duplicated virtualized/fallback render logic created false-green coverage.
- Unmount-based reset worked, but the tests only asserted query reset; filters, sorting, and transition state need explicit coverage to prevent hidden drift.

## Product / Stakeholder Learnings
- A universal search overlay is the right Phase B interaction model, but the primary header trigger must look enabled; disabled styling on a live entry point is a real UX regression.
- "Source" navigation in this surface is not a one-hop detail view; users expect chained exploration with breadcrumb depth, not a single-level replacement.
- Keeping add actions and playback in-modal preserves workflow continuity and should remain the default expectation for future search/discovery surfaces.

## Technical / Architecture Learnings
- Nested modal surfaces need a shared open-state guard such as `nestedPopoverOpenRef`; popup-local Escape suppression alone is not reliable when sibling listeners register in different order.
- `localStorage` persistence helpers should not depend on read-parse-merge when the stored value can be corrupt; overwrite-on-save is safer unless merge is truly required and hardened.
- Multi-level chained navigation should start with a stack/array model, not a single `sourceTrack`, whenever the contract implies breadcrumb depth can grow beyond one hop.
- If production and test environments exercise different render branches, factor shared row rendering into one function or add browser-level coverage so behavior cannot diverge silently.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: For any modal with nested popovers/trays, centralize Escape ownership with a shared ref/context that nested surfaces update; do not rely on independent `document` listeners to resolve ordering correctly.
- Scope: repo-wide
  - Guidance: Review both read and write paths for `localStorage` corruption handling; a safe read fallback does not make a poisoned write path safe.
- Scope: subsystem-specific
  - Guidance: In React table surfaces that use virtualization, treat jsdom coverage as fallback-path coverage unless the virtualizer is mocked or real-browser tests are added.
- Scope: subsystem-specific
  - Guidance: For search/transition workflows, model breadcrumb chains as stacks from the start whenever repeated "Source" navigation is in scope.

## Deferred / Follow-up
- Fix the Escape ordering blocker and make the search trigger look enabled.
- Harden `saveMatchColumnVis` against corrupt stored data.
- Replace single-step transition state with a stack-based breadcrumb chain.
- Add tests for nested Escape stages, full state reset coverage, corrupt `localStorage` shapes, and the virtualized render path.
