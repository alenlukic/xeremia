# Recommendation Registry

This file is the human-readable snapshot of the durable recommendation registry.

Purpose:
- dedupe repeated findings across design, customer, product, and technical feedback runs
- preserve the highest-signal open recommendations over time
- track which recommendations were promoted into development contracts
- track which recommendations were resolved, deferred, or rejected

Canonical store: `RECOMMENDATION_REGISTRY.json`

Updated: `2026-04-10T03:45:00Z`

## Recommendations

| ID | Title | Phase | Priority | Status | Readiness | Blocking |
|---|---|---|---|---|---|---|
| `REC-001` | Establish the design token migration foundation | 0 | P1 | `open` | `ready_now` | None |
| `REC-002` | Ship control primitives and minimum target sizing | 1 | P1 | `open` | `ready_now` | `REC-001` |
| `REC-003` | Align top-level navigation and flat-surface visual hierarchy | 1 | P2 | `open` | `ready_now` | `REC-001` |
| `REC-004` | Restructure WeightControls and SearchPanel around the primary entry flow | 2 | P1 | `open` | `blocked` | `REC-001`, `REC-002`, `REC-003` |
| `REC-005` | Refine Matches table persistence and navigation clarity | 2 | P1 | `open` | `blocked` | `REC-001`, `REC-002`, `REC-003` |
| `REC-006` | Add the shared motion and loading-state layer | 3 | P1 | `open` | `blocked` | `REC-004`, `REC-005` |
| `REC-007` | Make source-track pivots explicit in the Matches workflow | 4 | P0 | `open` | `blocked` | `REC-004`, `REC-005`, `REC-006` |
| `REC-008` | Redesign DJ filtering workflows for key and BPM | 4 | P1 | `open` | `blocked` | `REC-004`, `REC-005`, `REC-006` |
| `REC-009` | Reduce Set Builder first-track friction | 4 | P2 | `open` | `blocked` | `REC-004`, `REC-005`, `REC-006` |
| `REC-010` | Harden set workspace trust boundaries before broader rollout | follow_on | P1 | `promoted` | `promoted` | None |
| `REC-011` | Strengthen explorer interaction proof for the set workspace | follow_on | P1 | `promoted` | `promoted` | None |
| `REC-012` | Harden Tracks workspace regression proof for notes, toasts, and table contracts | follow_on | P2 | `open` | `ready_now` | None |

## Promotion-Ready Now

| ID | Why now | Suggested intent |
|---|---|---|
| `REC-001` | The overhaul still makes token migration the zero-visual-change prerequisite for later design-system and workflow cleanup. | `delivery` |
| `REC-002` | Recent set-workspace feedback reaffirmed that minimum target sizing and shared control treatment remain recurring debt across new surfaces. | `delivery` |
| `REC-003` | Tab hierarchy and flat-surface alignment remain compact, high-leverage Phase 1 corrections with explicit acceptance criteria. | `delivery` |
| `REC-012` | Recent breaker runs converged on one coherent verification-hardening scope for notes, toasts, pool state, and table-contract assertions. | `delivery` |

## Recently Promoted

| ID | Why promoted | Suggested intent |
|---|---|---|
| `REC-010` | The security follow-on already has a scoped contract, so it no longer belongs in the ready-now queue. | `delivery` |
| `REC-011` | Explorer interaction proof has now been specified twice by breaker outputs and converted into an explicit follow-on contract. | `delivery` |

## Recommendation Details

### `REC-001` — Establish the design token migration foundation
- Source: `SME Design Perfectionist`
- Source runs: `20260409T012055Z-product_feedback-design-perfectionist-review-of-c`, `20260409T025541Z-product_feedback-design-system-overhaul-proposal-`, `20260410T003620Z-product_feedback-design-perfectionist-review-of-s`
- Type: `design_system`
- Phase: `0`
- Status: `open`
- Promotion readiness: `ready_now`
- Summary: Replace the thin root token set with the overhaul's canonical token foundation, preserve legacy aliases during migration, and eliminate remaining hardcoded spacing, radius, and status-color values so later UI work lands on named primitives instead of ad hoc styling.
- Acceptance criteria:
  - The stylesheet adopts the overhaul token foundation with legacy aliases so existing references continue to resolve during migration.
  - Panel-spacing, radius, and status-color hardcodes called out in the reviews are replaced with named tokens including `--panel-inner` and `--radius-sm`.
  - Numeric display styles use tabular figures via the shared mono treatment so later surface work inherits stable data alignment.
- Evidence count: `3`
- Related findings: `D017`, `D018`, `R06`

### `REC-002` — Ship control primitives and minimum target sizing
- Source: `SME Design Perfectionist`
- Source runs: `20260409T012055Z-product_feedback-design-perfectionist-review-of-c`, `20260409T025541Z-product_feedback-design-system-overhaul-proposal-`, `20260409T184735Z-product_feedback-design-red-team-explorer-ux-fixe`, `20260410T003620Z-product_feedback-design-perfectionist-review-of-s`
- Type: `controls`
- Phase: `1`
- Status: `open`
- Promotion readiness: `ready_now`
- Blocking: `REC-001`
- Summary: Define the shared button, input, chip, badge, focus, and label primitives from the overhaul and enforce a 28px minimum action target so dense controls read as intentional, reliable, and consistent across the app.
- Acceptance criteria:
  - Shared button, input, chip, badge, focus-ring, and label primitives exist and are used by existing dense controls instead of one-off local styling.
  - No interactive action button renders below the 28px minimum target size defined by the design system.
  - Section labels and field labels use distinct hierarchy treatments so the UI no longer collapses headings and metadata into the same visual role.
- Evidence count: `4`
- Related findings: `D006`, `F-004`, `R02`, `R03`, `R04`

### `REC-003` — Align top-level navigation and flat-surface visual hierarchy
- Source: `SME Design Perfectionist`
- Source runs: `20260409T012055Z-product_feedback-design-perfectionist-review-of-c`, `20260409T025541Z-product_feedback-design-system-overhaul-proposal-`
- Type: `design_system`
- Phase: `1`
- Status: `open`
- Promotion readiness: `ready_now`
- Blocking: `REC-001`
- Summary: Bring the shell into the overhaul's intended hierarchy by reordering the primary tabs around the creative workflow and removing the glass-morphism mismatch from the weight controls so top-level navigation and surfaces feel like one coherent professional tool.
- Acceptance criteria:
  - The top-level tab order is `Matches | Browse | Set | Admin`, with Admin visually de-emphasized as a utility surface.
  - Weight gauge groups use the same flat surface and border model as the rest of the application rather than a glass treatment.
  - The resulting shell reads as one consistent visual system, not a mix of flat panels and separate depth metaphors.
- Evidence count: `2`
- Related findings: `D009`, `D012`

### `REC-004` — Restructure WeightControls and SearchPanel around the primary entry flow
- Source: `SME Design Perfectionist`
- Source runs: `20260409T012055Z-product_feedback-design-perfectionist-review-of-c`, `20260409T025541Z-product_feedback-design-system-overhaul-proposal-`
- Type: `layout`
- Phase: `2`
- Status: `open`
- Promotion readiness: `blocked`
- Blocking: `REC-001`, `REC-002`, `REC-003`
- Summary: Apply the overhaul's surface-level shell refinement by making WeightControls collapsible, moving Normalize/Reset into that surface, and simplifying SearchPanel so search becomes the first prominent action and weight-state copy is contextual instead of cryptic.
- Acceptance criteria:
  - WeightControls supports a persisted collapsed summary strip and no longer dominates the top of the viewport by default.
  - Normalize and Reset live with the weight controls, not in the search row, and the displayed sum clearly communicates total context toward 100.
  - When weights are collapsed, the search input is the first prominent interactive element in the shell.
- Evidence count: `2`
- Related findings: `D002`, `D003`, `D011`

### `REC-005` — Refine Matches table persistence and navigation clarity
- Source: `SME Design Perfectionist`
- Source runs: `20260409T012055Z-product_feedback-design-perfectionist-review-of-c`, `20260409T025541Z-product_feedback-design-system-overhaul-proposal-`, `20260408T214806Z-delivery-development-contract-source-inpu`, `20260409T062402Z-delivery-column-config-size-order-toggled`
- Type: `workflow`
- Phase: `2`
- Status: `open`
- Promotion readiness: `blocked`
- Blocking: `REC-001`, `REC-002`, `REC-003`
- Summary: Bring the Matches surface in line with the overhaul by persisting table preferences, separating chain navigation semantics from generic back affordances, and making sort-versus-drag behavior predictable in dense table headers.
- Acceptance criteria:
  - Matches column visibility and order persist across track changes and reloads in the same way Browse preferences already do.
  - Chain navigation communicates destination distinctly from the MatchDetail back action so the two paths are no longer visually interchangeable.
  - Sortable headers rest in a sort-first state and only present a drag affordance during active reorder interaction.
- Evidence count: `4`
- Related findings: `D008`, `D013`, `D014`

### `REC-006` — Add the shared motion and loading-state layer
- Source: `SME Design Perfectionist`
- Source runs: `20260409T012055Z-product_feedback-design-perfectionist-review-of-c`, `20260409T025541Z-product_feedback-design-system-overhaul-proposal-`
- Type: `motion`
- Phase: `3`
- Status: `open`
- Promotion readiness: `blocked`
- Blocking: `REC-004`, `REC-005`
- Summary: Introduce the overhaul's shared motion contract so popovers, breadcrumb transitions, and search loading states communicate change without layout instability or roughness, while preserving the product's speed-first character.
- Acceptance criteria:
  - Popover and dropdown surfaces use a shared enter/exit motion pattern instead of appearing abruptly.
  - The transition breadcrumb no longer causes vertical layout shift when it appears or disappears.
  - Search communicates in-flight work during the debounce and fetch window with an explicit loading state.
- Evidence count: `2`
- Related findings: `D004`, `D010`, `D016`

### `REC-007` — Make source-track pivots explicit in the Matches workflow
- Source: `SME Design Perfectionist`
- Source runs: `20260409T012055Z-product_feedback-design-perfectionist-review-of-c`, `20260409T025541Z-product_feedback-design-system-overhaul-proposal-`
- Type: `workflow`
- Phase: `4`
- Status: `open`
- Promotion readiness: `blocked`
- Blocking: `REC-004`, `REC-005`, `REC-006`
- Summary: Remove the product's most severe affordance trap by separating `Use as source` from the track title and turning source pivots into an explicit, labeled action within each match row.
- Acceptance criteria:
  - Clicking the track title no longer pivots the source track unexpectedly.
  - Each row exposes an explicit, labeled source-pivot action distinct from title inspection or detail access.
  - Existing chain behavior is preserved once the user intentionally chooses the source-pivot action.
- Evidence count: `2`
- Related findings: `D001`

### `REC-008` — Redesign DJ filtering workflows for key and BPM
- Source: `SME Design Perfectionist`
- Source runs: `20260409T012055Z-product_feedback-design-perfectionist-review-of-c`, `20260409T025541Z-product_feedback-design-system-overhaul-proposal-`, `20260408T214807Z-delivery-development-contract-source-inpu`
- Type: `workflow`
- Phase: `4`
- Status: `open`
- Promotion readiness: `blocked`
- Blocking: `REC-004`, `REC-005`, `REC-006`
- Summary: Refactor the DJ-specific filter controls so harmonic key selection matches the Camelot mental model and BPM filtering behaves as one coherent control instead of two silently competing inputs.
- Acceptance criteria:
  - The Camelot picker is laid out in an ordered structure that makes harmonic adjacency obvious at a glance.
  - BPM filtering is represented as a single coherent control area rather than separate exact and range groups that clear one another implicitly.
  - Multi-select and clearing behavior remain explicit and understandable for repeated prep workflows.
- Evidence count: `3`
- Related findings: `D005`, `D007`

### `REC-009` — Reduce Set Builder first-track friction
- Source: `SME Design Perfectionist`
- Source runs: `20260409T012055Z-product_feedback-design-perfectionist-review-of-c`, `20260409T025541Z-product_feedback-design-system-overhaul-proposal-`, `20260409T091130Z-delivery-development-contract-source-inpu`
- Type: `workflow`
- Phase: `4`
- Status: `open`
- Promotion readiness: `blocked`
- Blocking: `REC-004`, `REC-005`, `REC-006`
- Summary: Remove front-loaded setup friction from Set Builder so users can start building a set immediately, navigate back to track-selection surfaces quickly, and add their first track without a naming ceremony.
- Acceptance criteria:
  - A first set can be created or assumed without forcing a naming step before the user adds a track.
  - The empty state links users directly back to track-selection workflows instead of only describing the next step.
  - The first-track path is short enough to support iterative set building during active prep sessions.
- Evidence count: `3`
- Related findings: `D015`

### `REC-010` — Harden set workspace trust boundaries before broader rollout
- Source: `Delivery Ledgers`
- Source runs: `20260409T091130Z-delivery-development-contract-source-inpu`
- Type: `security`
- Phase: `follow_on`
- Status: `promoted`
- Promotion readiness: `promoted`
- Summary: Close the set-workspace trust-boundary gaps called out in the recent full-stack delivery by tightening wildcard CORS exposure and bounding edge-score request size before the persisted workspace is treated as fully hardened.
- Acceptance criteria:
  - Wildcard CORS behavior for set-workspace routes is narrowed so unsafe methods are not broadly exposed under permissive origins.
  - Edge-score requests enforce server-side size or bounds limits so oversized payloads cannot reach the scoring path unchecked.
  - Verification proves the hardened CORS and request-boundary behavior so the documented security regression is actually closed.
- Evidence count: `1`
- Related findings: None

### `REC-011` — Strengthen explorer interaction proof for the set workspace
- Source: `Delivery Ledgers`
- Source runs: `20260409T091130Z-delivery-development-contract-source-inpu`, `20260409T231234Z-delivery-development-contract-source-inpu`, `20260410T004356Z-delivery-development-contract-source-inpu`
- Type: `verification`
- Phase: `follow_on`
- Status: `promoted`
- Promotion readiness: `promoted`
- Summary: Finish the remaining high-risk explorer confidence work so the set workspace has regression proof for cleaned titles, modal labeling, swap and delete completion, sibling-add behavior, child-level arithmetic, and edge-score rendering instead of relying on partial UI-open tests.
- Acceptance criteria:
  - Explorer tests complete the swap flow, delete confirmation flow, and nonzero child-level arithmetic instead of only checking intermediate UI state.
  - Sibling-add modal coverage exercises parent selection, search, selection routing, close/reset behavior, and the same cleaned-title presentation path used by the canvas.
  - Edge-score rendering is covered end to end, including fetch inputs, non-null labels, and the `-` fallback for null scores.
- Evidence count: `3`
- Related findings: None

### `REC-012` — Harden Tracks workspace regression proof for notes, toasts, and table contracts
- Source: `Delivery Breakers`
- Source runs: `20260409T231235Z-delivery-development-contract-source-inpu`, `20260410T004351Z-delivery-development-contract-source-inpu`
- Type: `verification`
- Phase: `follow_on`
- Status: `open`
- Promotion readiness: `ready_now`
- Summary: Close the remaining false-confidence gaps in the Tracks workspace by testing the hook-owned toast/error behavior, note-save edge cases, pool accordion state transitions, and the Tracklist table contract with the same depth now used for the shipped UI.
- Acceptance criteria:
  - Hook-level coverage proves the about-4-second toast auto-dismiss timer and `friendlyError()` mappings instead of only asserting prop-injected error strings.
  - Tracklist note tests cover unchanged blur no-op, Enter-driven save/blur, retry-safe save behavior, and oversize-note validation so note edits cannot silently regress.
  - Tracks workspace tests cover collapsed-pool absence, expand/collapse round-trip, keyboard-accessible accordion controls, and full Tracklist table assertions for column order, colgroup classes, shared header classes, and title-cell metadata separation.
- Evidence count: `2`
- Related findings: None
