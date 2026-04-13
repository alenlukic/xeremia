# Development Contract

## Source Inputs
- `SME_RECOMMENDATIONS.md` P1-2 Option A: wire fusion weights into scoring
- Repo inspection: `src/harmonic_mixing/weight_service.py`, `src/feature_extraction/track_similarity.py`, `src/harmonic_mixing/transition_match.py`, `src/api/routes.py`, `client/src/components/WeightControls.tsx`, `src/tests/test_weight_service.py`, `src/tests/test_track_similarity.py`

## Selected Intent
- delivery

## Deferred Inputs / Non-goals
- Do not redesign the weight-controls UI or tooltip copy beyond any minimal clarifying text required by the implementation
- Do not add brand-new top-level scoring factors; this contract only makes the existing fusion controls materially affect scoring
- Save-status UX remains in `03-weight-save-status-indicator.md`

## Contract
```md
DEVDSL-1
MODE: STRICT
TASK_KIND: code_change
FLAGS: NO_EARLY_STOP PATCH_ONLY(require_file_read=true) TEST_GATE(full, flake_policy=rerun_once, extend_on_new_failure=true) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Make fusion subweights materially affect similarity-driven scoring
SCOPE: Integrate the persisted fusion subweights into the similarity/scoring path so the UI controls for harmonic, rhythm, timbre, and energy have observable impact on match ordering and factor output.
DO: Wire the existing fusion weights from `WeightService` into the similarity computation used by transition scoring, ensuring they modulate the late-fusion descriptor logic rather than remaining inert metadata. Preserve current API surfaces where possible, preserve cache invalidation on weight updates, and ensure the resulting scores remain bounded and stable. If detail or response payloads need clarifying labels or tests, update them narrowly.
NON_GOALS: Do not invent a separate UI workflow for fusion weights; do not refactor the whole scoring architecture; do not rename existing persisted weight keys; do not broaden into playlist or chaining features.
AFFECTED_AREAS: `src/feature_extraction/track_similarity.py`, `src/harmonic_mixing/transition_match.py`, `src/harmonic_mixing/weight_service.py`, `src/api/routes.py` only if response handling must change, plus backend tests such as `src/tests/test_weight_service.py`, `src/tests/test_track_similarity.py`, `src/tests/test_transition_match.py`, and `src/tests/test_api_routes.py`.
DEPENDENCIES: none
VALIDATION: Run targeted backend tests for weight service, similarity computation, transition scoring, and API weight propagation; add coverage proving that changing fusion weights changes output scores and that persisted fusion weights survive round-trip through the API/service stack. Manually verify from the client or API that adjusting fusion sliders produces different match scores/orderings after cache invalidation.
ACCEPTANCE: Fusion weights are no longer inert; changing harmonic/rhythm/timbre/energy fusion weights changes similarity-driven scoring in a reproducible way; score outputs remain finite and within expected bounds; persisted fusion weights continue to round-trip through `GET /api/weights` and `PUT /api/weights`; cache-clearing and weight-propagation behavior still work after updates.
OUTPUT: schema=default
```

## Notes to Orchestrator
- The repository already has dynamic-fusion primitives and tests in place; prefer completing the integration path over inventing a parallel mechanism.
- This contract is backend-heavy but should still include one evidence path showing the user-facing controls now affect results.
