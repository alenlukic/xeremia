# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260409T230523Z-product_feedback-design-thought-partner-explorer-/DESIGN_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User-stated outcome: Explorer must be working, intuitive, and easy to scan, with compact nodes sized around `120px` wide by `40px` tall and `12-13px` text
- User grouping for Contract A: frontend-only Explorer fixes in `client/src/components/SetExplorerCanvas.tsx` plus title-cleaning utility work

## Selected Intent
- delivery

## Contract Driver
- design-driven

## Selected Recommendation IDs
- `R1`
- `R2`
- `R3`
- `R4`
- `R5`

## Deferred Inputs / Non-goals
- Do not change backend Explorer rules or broaden swap permissions beyond the existing parent/child constraint
- Do not refactor the Explorer to a different graph library or redesign pan/zoom behavior
- Do not implement broader workspace layout, Pool/Tracklist accordion behavior, Note restoration, or toast UX here; those belong to Contract 2
- Do not introduce new frontend dependencies for this work
- Do not silently widen scope into general Explorer feature work outside title cleanup, node sizing, action-row clarity, and click-target fixes

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Frontend-only remediation of the Set Explorer canvas so node titles are readable, action controls are visible and correctly clickable, and node chrome matches the agreed compact design. Limit changes to `client/src/components/SetExplorerCanvas.tsx`, `client/src/utils/trackTitle.ts`, related targeted tests, and minimal supporting style adjustments only if required by the canvas implementation.
DO: 1. In `client/src/utils/trackTitle.ts`, harden `cleanTitle()` so it strips both bracketed metadata prefixes and strict unbracketed prefixes in the form `10A - Bm - 100.01`; keep the regex narrow enough to avoid stripping legitimate titles like `10A Remix`; if stripping yields an empty string, fall back to `Track #<id>`. 2. In `client/src/components/SetExplorerCanvas.tsx`, reduce node sizing to the agreed compact values: `NODE_W=120`, `NODE_H=40`, title font `12px` or `13px`, and resize any dependent slot/action geometry to fit that footprint cleanly; preserve readability and truncation behavior for the narrower node width. 3. Consolidate node actions into a single horizontal row above each node rather than scattering them on edges; keep a consistent minimum control size of `12px` text/icon sizing, use a base visible opacity of `0.7`, and color-code action affordances for scanability with `delete=#e53935`, `swap=var(--accent)`, `sibling-add=#43a047`, `child-add=var(--accent)`, and tracklist-add matching the accent family. 4. Fix the child-add interaction by moving the click handler from the inner SVG text element onto the wrapping interactive target (`<g>` or equivalent visible hit target), so clicking anywhere in the rendered child-add control triggers the same action; keep the cursor and hit area behavior aligned with the visible control. 5. Replace the swap glyph `⇄` with `⇅` and expose copy equivalent to `Swap with parent or child` via tooltip/title text so the icon matches the existing vertical parent/child-only rule. 6. Ensure the tracklist-add and related action labels/icons are visually coherent inside the new top action row and do not overlap nodes or edges. 7. Update or add focused frontend tests for `cleanTitle()` and Explorer action rendering/interaction so the compact-node and click-target behavior is covered.
ACCEPTANCE: 1. Explorer nodes render at approximately `120px x 40px`, with title text at `12px` or `13px`, and no control overlap around the node perimeter. 2. Titles that begin with unbracketed metadata like `10A - Bm - 100.01` render as the human title rather than raw metadata; null or effectively blank results fall back to `Track #<id>`. 3. All node actions appear together in one horizontal row above the node, use a visible default opacity of about `0.7`, and remain legible at default zoom without hover. 4. Action affordances are color-coded by type, with delete clearly red and sibling-add clearly green. 5. Clicking anywhere on the visible child-add control opens the child-add flow; the interaction must not require clicking tiny inner text only. 6. The swap control uses `⇅` rather than `⇄` and exposes tooltip/title copy indicating parent/child swapping. 7. No workspace layout, toast/error, Note-field, or backend rule changes are included in this contract. 8. Targeted automated tests covering title cleanup and Explorer interactions pass.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`

## Notes to Orchestrator
- This contract is intentionally limited to the Explorer canvas and title-cleaning utility so it can run in parallel with the Tracks/Pool workspace contract.
- If implementation reveals that title hydration warnings are still needed on the backend, capture that as a follow-on contract rather than expanding this one.
- Prefer Design QA after delivery because the acceptance is heavily visual and interaction-specific.
