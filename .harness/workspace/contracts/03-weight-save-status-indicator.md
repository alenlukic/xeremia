# Development Contract

## Source Inputs
- `DESIGN_RECOMMENDATIONS.md` P1-3: weight changes auto-save silently
- `DESIGN_RECOMMENDATIONS.md` P0-2 overlap: weight warning/error state is computed but not rendered
- Repo inspection: `client/src/hooks/useWeights.ts`, `client/src/components/WeightControls.tsx`, `client/src/App.tsx`, `client/src/components/SearchPanel.tsx`, `client/src/App.test.tsx`, `client/src/components/WeightControls.test.tsx`

## Selected Intent
- delivery

## Deferred Inputs / Non-goals
- Do not change weight math, scoring semantics, or fusion-weight behavior; scoring changes belong to `06-fusion-weight-scoring-integration.md`
- Do not introduce a global notification system
- Broad load/error handling for matches or browse data belongs to `01-error-handling-silent-failures.md`

## Contract
```md
DEVDSL-1
MODE: STRICT
TASK_KIND: ui_change
FLAGS: NO_EARLY_STOP PATCH_ONLY(require_file_read=true) TEST_GATE(full, flake_policy=rerun_once, extend_on_new_failure=true) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Render weight save and warning state near the weight controls
SCOPE: Expose the existing `useWeights` save lifecycle in the UI so users can tell when a weight update is saving, when it succeeds, when it fails, and when the current raw weights violate the expected total.
DO: Thread `saving`, `error`, and `warningMessage` from `useWeights` into the rendered component tree near the weight controls or search/actions row without changing the weight-edit interaction model. Add a subtle transient success confirmation for completed saves, a visible in-context failure message when persistence fails, and visible warning copy when the weights sum is invalid and normalization is recommended. Keep the UX lightweight and local to the existing controls.
NON_GOALS: Do not redesign the gauge controls; do not replace debounce-based autosave with explicit save buttons; do not broaden into load-failure handling for unrelated API calls; do not change backend API shape.
AFFECTED_AREAS: `client/src/hooks/useWeights.ts`, `client/src/App.tsx`, `client/src/components/WeightControls.tsx`, optionally `client/src/components/SearchPanel.tsx` and client styles/tests including `client/src/App.test.tsx` and `client/src/components/WeightControls.test.tsx`.
DEPENDENCIES: none
VALIDATION: Add focused tests for visible saving/saved/error states and for rendering invalid-sum warning copy. Manually verify that changing a weight shows a saving state during the debounced PUT, a brief success signal after success, and a persistent visible error after a failed save.
ACCEPTANCE: Users can see when weight changes are being saved; a successful save produces a transient visible confirmation; a failed save produces a visible error near the weight controls; the existing invalid-sum warning message is rendered in the UI instead of being silently discarded; the autosave interaction remains debounced and does not require an explicit Save action.
OUTPUT: schema=default
```

## Notes to Orchestrator
- This contract intentionally absorbs the weight-warning visibility overlap from design P0-2 so the error-handling contract stays focused on fetch/read failures.
- Keep the success indicator subtle; the requirement is trust and visibility, not celebratory UI.
