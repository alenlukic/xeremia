---
run_id: 20260409T062402Z-delivery-column-config-size-order-toggled
mode: delivery
published_at: 2026-04-09T07:04:02.335424+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 94
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Preserve Matches-tab column widths, column order, and score-column visibility in-session and across sessions.
- Result: Implemented browser-only persistence in `MatchesPanel.tsx` using one bundled `localStorage` record, added missing restore tests, and finished with evaluation `94 / A / PASS`.
- Scope: Matches-table column configuration only; no backend/API changes and no state lift into `App.tsx`.

## Key Decisions
- Decision: Keep persistence co-located in `client/src/components/MatchesPanel.tsx` instead of lifting config state to `client/src/App.tsx`.
  - Why: `MatchesPanel` already owns `columnSizing`, `columnOrder`, and `columnVisibility`, so the narrowest correct ownership boundary was already in place.
  - Tradeoff: Accepts component-local storage wiring in exchange for avoiding wider app-state plumbing and prop churn.
- Decision: Persist one bundled JSON object under `dj-tools-matches-column-config`.
  - Why: `columnSizing`, `columnOrder`, and `columnVisibility` change together and restore together, so one key keeps the config coherent and versionable.
  - Tradeoff: Any future schema expansion must update one sanitizer/loader path rather than independent keys.
- Decision: Use a defensive `loadColumnConfig()` helper with `unknown` narrowing, shape checks, and sanitization.
  - Why: Saved browser state is untrusted; the loader filters `columnOrder` to known IDs, filters `columnVisibility` to configurable columns, and rejects non-finite sizing values before state initialization.
  - Tradeoff: Slightly more code up front, but safer restores and better tolerance for stale or malformed saved data.

## Verification Learnings
- The highest-signal verification gap was missing restore coverage for `columnOrder` and `columnSizing`; that breaker-important concern was closed in-run by adding two focused restore tests, so no follow-on was needed.
- Focused persistence testing passed, while four failures in `client/src/components/MatchesPanel.test.tsx` around sizing constants remained pre-existing and unrelated to this feature.
- The feature’s confidence comes from both code-path inspection and targeted localStorage round-trip tests rather than broader UI/browser validation.

## Product / Stakeholder Learnings
- For this table, users treat width, order, and visibility as one preference set rather than three separate behaviors; bundling them under one storage key matches that expectation and avoids partial restores.
- Safe fallback to defaults matters more than preserving malformed saved preferences; broken or stale localStorage should never destabilize the Matches table.

## Technical / Architecture Learnings
- Lazy restore plus save-on-change is sufficient for remount and reload persistence when the component already owns the full preference state.
- Sanitizing saved `columnOrder` against known IDs and appending missing defaults gives forward compatibility when columns change over time.
- Restricting `columnVisibility` restores to configurable columns keeps storage data from leaking into non-toggleable table structure.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: When a UI component already owns a tightly related preference bundle, prefer co-located `localStorage` persistence over lifting state upward just to persist it.
- Scope: subsystem-specific
  - Guidance: Persist related table preferences as one JSON record and validate restored data with `unknown` narrowing plus per-field sanitization before hydrating state.
- Scope: one-off
  - Guidance: Do not treat unrelated pre-existing test failures as feature regressions; document them explicitly and keep scoped verification focused on the new behavior.

## Deferred / Follow-up
- No follow-on run is required for the scoped Matches persistence work.
- Minor non-blocking cleanup remains available if this area is touched again: avoid triple parsing during initialization and keep persistence test names aligned with what they actually assert.
