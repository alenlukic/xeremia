# Recommendation Registry Sync

## Sources Ingested
- `.harness/product-feedback/RECOMMENDATION_REGISTRY.json`
- `.harness/product-feedback/RECOMMENDATION_REGISTRY.md`
- `.harness/runs/20260409T184735Z-product_feedback-design-red-team-explorer-ux-fixe/DESIGN_RECOMMENDATIONS.md`
- `.harness/runs/20260409T230523Z-product_feedback-design-thought-partner-explorer-/DESIGN_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- `.harness/runs/20260410T003620Z-product_feedback-design-perfectionist-review-of-s/DESIGN_PERFECTIONIST_REVIEW.md`
- Delivery breaker reports from `20260409T190051Z-delivery-development-contract-source-inpu`, `20260409T192223Z-delivery-development-contract-source-inpu`, `20260409T231234Z-delivery-development-contract-source-inpu`, `20260409T231235Z-delivery-development-contract-source-inpu`, `20260409T234239Z-delivery-development-contract-source-inpu`, `20260410T002011Z-delivery-development-contract-source-inpu`, `20260410T002519Z-delivery-development-contract-source-inpu`, `20260410T004351Z-delivery-development-contract-source-inpu`, and `20260410T004356Z-delivery-development-contract-source-inpu`
- `.harness/contracts/2026-04-09/set-workspace-core-regressions-and-note-restoration.md`
- `.harness/contracts/2026-04-09/set-workspace-explorer-ux-polish.md`
- `.harness/contracts/2026-04-09/DEVELOPMENT_CONTRACT_2_set-workspace-tracks-layout-note-toast.md`
- `.harness/contracts/2026-04-09/DEVELOPMENT_CONTRACT_3_set-workspace-table-consistency.md`
- `.harness/contracts/2026-04-09/DEVELOPMENT_CONTRACT_4_set-workspace-explorer-accordion-polish.md`
- `.harness/contracts/2026-04-09/set-workspace-security-hardening.md`

## Added
- ID: `REC-012`
  - Title: `Harden Tracks workspace regression proof for notes, toasts, and table contracts`
  - Why new: Recent breaker output converged on one durable follow-on theme that was not yet represented in the registry: the shipped Tracks workspace still needs direct hook-level and negative-case regression proof for toast dismissal, friendly error mapping, note save edge cases, pool accordion state transitions, and Tracklist table-contract assertions.

## Updated
- ID: `REC-001`
  - What changed: Added fresh evidence from the latest design-perfectionist review that token drift and hardcoded status colors are still recurring set-workspace concerns; evidence count increased to `3`.
- ID: `REC-002`
  - What changed: Added corroborating evidence from the design-red-team and design-perfectionist set-workspace reviews that minimum target sizing and control affordance consistency remain recurring debt; evidence count increased to `4`.
- ID: `REC-010`
  - What changed: Moved from `open` / `ready_now` to `promoted` because the security hardening recommendation has already been converted into the scoped follow-on contract `set-workspace-security-hardening.md`.
- ID: `REC-011`
  - What changed: Moved from `open` / `ready_now` to `promoted`, expanded source runs to include the newer explorer breaker passes, and refreshed the summary/acceptance language to match the now-explicit follow-on contract around swap/delete completion, sibling-add coverage, and edge-score rendering.

## Promotion Candidates
- ID: `REC-001`
  - Recommendation: Establish the design token migration foundation.
  - Why now: It remains the prerequisite for later design-system and workflow cleanup, and recent set-workspace reviews reaffirmed the token drift risk.
  - Suggested intent: `delivery`
- ID: `REC-002`
  - Recommendation: Ship control primitives and minimum target sizing.
  - Why now: New set-workspace evidence keeps reinforcing the same target-size and control-affordance debt across fresh surfaces.
  - Suggested intent: `delivery`
- ID: `REC-003`
  - Recommendation: Align top-level navigation and flat-surface visual hierarchy.
  - Why now: The recommendation is still compact, clearly scoped, and not superseded by the newer set-workspace contracts.
  - Suggested intent: `delivery`
- ID: `REC-012`
  - Recommendation: Harden Tracks workspace regression proof for notes, toasts, and table contracts.
  - Why now: The breaker findings are already concrete and contractable, and the scope stays narrow to verification-depth work around already-shipped behavior.
  - Suggested intent: `delivery`

## Deferred / Closed
- ID: `None`
  - Status: `deferred`
  - Why: No additional durable registry item was closed in this sync. The major design-red-team, thought-partner, and perfectionist findings were mostly absorbed into already-created set-workspace delivery contracts and recent deliveries, while the remaining single-source P2 polish items were intentionally left out of the durable registry until they gather more evidence or are grouped into a deliberate finish-pass contract.
