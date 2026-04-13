---
run_id: 20260409T190051Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-09T19:22:13.655657+00:00
qa_verdict: PASS_WITH_NOTES
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 85
regression_severity: UNKNOWN
---
# Run Ledger

## Outcome
- Task: Restore the P0 set-workspace regressions blocking explorer use and persisted tracklist notes without broadening into deferred explorer polish.
- Result: PASS overall with evaluator score `85/B`; QA passed with notes after live API note persistence, frontend build, frontend tests, and backend set-workspace tests all succeeded.
- Scope:
- Explorer viewport visibility, cleaned title display, explicit child-add workflow, node action visibility, and end-to-end note persistence for `set_tracklist_entry`.

## Key Decisions
- Decision: Restore tracklist notes with a schema-backed field and a dedicated patch path instead of folding note edits into broader tracklist rewrites.
  - Why: The run needed durable note persistence across reloads, so the backend now treats `set_tracklist_entry.note` as `TEXT NOT NULL DEFAULT ''` and exposes `PATCH /api/sets/{set_id}/tracklist/{track_id}/note`, with the frontend hook performing an optimistic update.
  - Tradeoff: This adds a narrow single-purpose API surface, but it avoids destructive rewrites and keeps note edits isolated from reorder and move flows.
- Decision: Extract title cleanup into `client/src/utils/trackTitle.ts` and reuse `cleanTitle()` across Explorer, Pool, and Tracklist.
  - Why: The regression was not just an Explorer labeling issue; the product requirement was a shared user-facing title path that strips the metadata prefix consistently.
  - Tradeoff: Shared normalization slightly increases coupling between surfaces, but it removes repeated logic and prevents future title drift.
- Decision: Fix Explorer SVG rendering with computed explicit pixel dimensions instead of `width="100%"` and `height="100%"`.
  - Why: Static sizing from layout bounds plus a matching `viewBox` restored visible nodes in the usable viewport while preserving pan and zoom.
  - Tradeoff: The canvas now depends on measured layout values, but the render path is more reliable than percentage sizing in this codebase.
- Decision: Replace the invisible child drop-zone workflow with an explicit `+Child` button that opens search and selection for the target node.
  - Why: The prior primary child-add path was effectively undiscoverable and blocked a P0 workflow.
  - Tradeoff: This is less drag-centric than the previous idea, but it is visible, direct, and testable.
- Decision: Keep node actions visible at rest with baseline `opacity: 0.5` and hover `opacity: 1`.
  - Why: The regression contract required functional visible actions, not hidden-until-hover controls.
  - Tradeoff: Persistent action chrome adds some visual density, but it restores affordance and reduces missed controls.

## Verification Learnings
- Live API validation mattered for the note-restoration claim: `PATCH` returned success and a follow-up `GET /api/sets/3` showed the persisted note in the hydrated tracklist entry.
- Build and focused regression coverage were healthy enough to support closure here: frontend build passed, frontend tests passed (`174/174`), and backend set-workspace tests passed (`35/35`).
- QA still recorded a note: Explorer visibility and child-add behavior were validated through code and tests rather than a live browser click-through, so the run passed with notes even though the overall evaluator verdict was PASS.
- Migration behavior in this repo needs explicit verification: `engine.execute()` does not auto-commit reliably for this codebase's migration pattern, so idempotent migrations should verify the column exists after execution rather than assuming success.

## Product / Stakeholder Learnings
- For explorer authoring, explicit visible controls beat hidden gesture targets when the workflow is core to the feature.
- Title cleanup is a product concern, not just a rendering nicety; users read the same track identity across Explorer, Pool, and Tracklist and notice mismatches immediately.
- Inline notes must stay row-bound in the Tracklist surface; detached note areas or drifting alignment undermine trust even when persistence works.

## Technical / Architecture Learnings
- The set-workspace note path is now a narrow vertical slice: migration -> model -> schema -> route -> service -> typed client -> optimistic hook update -> inline control.
- Shared presentation helpers such as `cleanTitle()` are worth extracting once the same normalization rule appears in multiple set-workspace surfaces.
- Explorer SVGs in this app render more predictably when width and height are computed in pixels from layout bounds and paired with an explicit `viewBox`.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: Treat repo migrations as needing explicit post-run verification; if a migration uses `engine.execute()`, confirm the schema change actually landed because execution alone is not proof of commit.
- Scope: subsystem-specific
  - Guidance: In set-workspace UI, prefer explicit visible action buttons over invisible drag/drop affordances for core authoring flows.
- Scope: subsystem-specific
  - Guidance: Reuse `client/src/utils/trackTitle.ts` for user-facing track labels across set-workspace surfaces instead of re-implementing prefix stripping locally.
- Scope: subsystem-specific
  - Guidance: For Explorer canvas sizing, use computed pixel dimensions and a matching `viewBox` rather than percentage-only SVG sizing when initial visibility matters.

## Deferred / Follow-up
- Deferred explorer polish remains out of scope: orthogonal edge routing, grid layout, and broader visual restyling were intentionally not taken on in this regression-restoration run.
- If a future run needs stronger UX evidence, add live browser validation for Explorer viewport and child-add interactions to close the remaining QA note.
