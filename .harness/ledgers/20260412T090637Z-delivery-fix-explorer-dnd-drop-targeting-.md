---
run_id: 20260412T090637Z-delivery-fix-explorer-dnd-drop-targeting-
mode: delivery
published_at: 2026-04-12T09:49:15.826387+00:00
qa_verdict: FAIL
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 76
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Fix Explorer drag-and-drop drop targeting by replacing CSS-transformed SVG zoom/pan with a `viewBox`-driven approach.
- Result: The implementation was structurally approved and automated verification stayed green, but the run did not clear completion gates because live QA could not prove the root/non-leftmost drop-target attribution criteria during drag.
- Scope: Narrow client-side Explorer change centered on `SetExplorerCanvas`, viewport sizing/clipping, and matching test updates.

## Key Decisions
- Decision: Move Explorer zoom/pan from SVG CSS `transform` to SVG `viewBox` math tied to pan, zoom, and viewport dimensions.
  - Why: `@dnd-kit` relies on `getBoundingClientRect()`, and CSS-transformed SVG children were being measured in the wrong screen position, causing inverted and column-shifted drop targeting.
  - Tradeoff: The Explorer now depends on viewport measurement and pan behavior instead of scrollbar-style overflow, so sizing and first-paint behavior need explicit verification.
- Decision: Preserve existing node layout and connect-drag logic while only changing how the SVG maps coordinates to the screen.
  - Why: `svg.getScreenCTM()` already adapts to `viewBox`, so the fix could stay narrow and avoid unnecessary changes to edge or connection behavior.
  - Tradeoff: Narrow scope reduced regression risk, but also concentrated correctness on a few formulas that needed stronger targeted assertions.

## Verification Learnings
- Typecheck, targeted tests, full Vitest suite, and DOM inspection all passed, confirming the no-transform SVG contract, non-zero `viewBox`, hidden viewport overflow, and console-clean rendering.
- Live QA still failed because browser automation could not capture any `.explorer-node-group.drop-zone--active` transition for either the top/root node or a non-leftmost column target, leaving the core user-facing acceptance criteria unproven.
- Breaker review showed the automated suite gave false confidence around the new behavior: ResizeObserver propagation, SVG `width`/`height`, `viewBox` origin sign, and cursor-anchored zoom pan adjustment were effectively untested.

## Product / Stakeholder Learnings
- For Explorer DnD regressions, "drop succeeded" is weaker evidence than proving the correct node became the active target during hover; future acceptance should require target attribution evidence, especially for root-vs-leaf and cross-column cases.
- Replacing viewport scrollbars with clipped viewBox-based pan is acceptable for this interaction model, but it is a behavior change that should be treated as part of the UX contract rather than incidental CSS cleanup.

## Technical / Architecture Learnings
- CSS transforms on the Explorer SVG are incompatible with reliable `@dnd-kit` droppable measurement for nested SVG groups; viewBox-based coordinate mapping is the safer pattern for zoomable/drop-targeted SVG canvases in this repo.
- ResizeObserver-backed viewport sizing is now part of Explorer correctness. If it is mocked without firing callbacks, tests only exercise fallback defaults and miss the real runtime path.
- The current zoom clamp prevents divide-by-zero issues in `viewBox` calculations, so future refactors should preserve that invariant.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For zoomable SVG canvases that participate in drag/drop hit testing, prefer `viewBox`/native SVG coordinate transforms over CSS `transform` on the SVG root.
- Scope: subsystem-specific
  - Guidance: When a fix depends on ResizeObserver or coordinate formulas, add assertions for the observer callback path and for exact origin/size math, not just "value changed" checks.
- Scope: repo-wide
  - Guidance: Treat live QA as incomplete when tooling can show a successful drag/drop but cannot prove the intermediate target attribution required by the acceptance criteria.

## Deferred / Follow-up
- Breaker findings triggered follow-on maintenance run `20260412T094752Z-maintenance-development-contract-source-inpu` to harden tests around the viewBox fix rather than broadening this delivery run.
- Optional regression check remains worthwhile after pane resize or hidden-to-visible mount, since Explorer sizing now depends on ResizeObserver settling before interaction.
