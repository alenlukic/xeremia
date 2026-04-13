# Development Contract

## Source Inputs
- `DESIGN_RECOMMENDATIONS.md` P1-1: BPM exact and BPM range conflict
- `DESIGN_RECOMMENDATIONS.md` P1-2: Camelot multi-select closes after each click
- Repo inspection: `client/src/components/FilterBar.tsx`, `client/src/hooks/useTrackFilters.ts`, `client/src/App.tsx`, `client/src/App.test.tsx`

## Selected Intent
- delivery

## Deferred Inputs / Non-goals
- Do not convert filtering to server-side execution; current client-side filtering remains in place
- Do not add new filter categories or redesign the Browse tab layout
- Matches-tab restructuring and transition-chaining behaviors are out of scope

## Contract
```md
DEVDSL-1
MODE: STRICT
TASK_KIND: ui_change
FLAGS: NO_EARLY_STOP PATCH_ONLY(require_file_read=true) TEST_GATE(full, flake_policy=rerun_once, extend_on_new_failure=true) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Make BPM modes exclusive and keep Camelot multi-select open
SCOPE: Refine the Browse filter bar so BPM exact and BPM range cannot both remain active, and so Camelot multi-select behaves like a true multi-select instead of dismissing after each choice.
DO: Update filter state transitions and FilterBar interactions so entering an exact BPM clears any active range values, while entering or editing a range clears any active exact BPM value. Ensure the UI communicates the active mode by reflecting the cleared counterpart immediately. Keep the Camelot dropdown open after each code toggle, closing only on outside click, Escape, or an explicit close affordance if one is added without broadening scope.
NON_GOALS: Do not redesign filtering semantics beyond exclusivity for BPM; do not add a new toggle-based BPM mode switch unless it is the smallest way to satisfy the exclusivity requirement within the existing layout; do not introduce backend query changes.
AFFECTED_AREAS: `client/src/components/FilterBar.tsx`, `client/src/hooks/useTrackFilters.ts`, `client/src/App.tsx`, supporting styles if needed, and focused client tests in `client/src/App.test.tsx`.
DEPENDENCIES: none
VALIDATION: Extend client tests to verify that exact BPM input clears range state, range edits clear exact BPM state, and Camelot selection can add multiple codes during a single open session. Manually verify outside-click dismissal still works and Browse pagination reset behavior remains intact after filter changes.
ACCEPTANCE: Setting an exact BPM clears any active BPM range and visibly leaves only exact mode active; setting a BPM min or max clears any active exact BPM and visibly leaves only range mode active; clicking Camelot codes toggles selections without closing the dropdown; multiple Camelot codes can be selected in one open interaction; existing Browse filtering still updates correctly after these interactions.
OUTPUT: schema=default
```

## Notes to Orchestrator
- Keep this contract narrowly UI-focused; the current filter engine already supports the needed predicates.
- `client/src/App.test.tsx` already covers filter-driven pagination reset, so it is the best place to add regression coverage.
