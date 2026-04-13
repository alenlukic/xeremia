# Recommendation Registry

Updated: `2026-04-13T00:06:41Z`

## Promote

- **REC-001** [promote] Establish the design token migration foundation
  - Priority: `P1`
  - Recurrence: `5`
  - Sources: SME Design Perfectionist, Technical SME
  - Summary: Replace undefined and one-off styling tokens with a coherent foundation so later UI work lands on named primitives instead of ad hoc values.

- **REC-002** [promote] Ship control primitives and minimum target sizing
  - Priority: `P1`
  - Recurrence: `6`
  - Sources: SME Design Perfectionist, SME Design Red Team
  - Summary: Formalize shared control, icon, and label primitives and enforce minimum target sizing so dense controls feel intentional and consistent.

- **REC-012** [promote] Harden Tracks workspace regression proof for notes, toasts, and table contracts
  - Priority: `P2`
  - Recurrence: `3`
  - Sources: Delivery Breakers, Technical SME
  - Summary: Expand hook-level and table-contract coverage around toasts, note saves, pool state, and tracklist behavior so shipped UI does not rely on false confidence.

- **REC-013** [promote] Restore explorer legibility and user-facing copy
  - Priority: `P0`
  - Recurrence: `2`
  - Sources: SME Design Perfectionist, SME Design Red Team
  - Summary: Raise Explorer text to a usable size, remove implementation-language labels from add-track flows, and keep Explorer typography on the established UI scale.

- **REC-014** [promote] Standardize destructive confirmations in the set workspace
  - Priority: `P1`
  - Recurrence: `2`
  - Sources: SME Design Red Team, SME Design Perfectionist
  - Summary: Replace the current mix of missing confirmation and browser-native prompts with a single in-app destructive confirmation pattern for set editing.

- **REC-015** [promote] Improve search result feedback and scanability
  - Priority: `P1`
  - Recurrence: `2`
  - Sources: SME Design Red Team, SME Design Perfectionist
  - Summary: Keep empty search results visible, make artist identity easier to scan, and standardize search dropdown terminal states.

## Open

- **REC-003** [open] Align top-level navigation and flat-surface visual hierarchy
  - Priority: `P2`
  - Recurrence: `3`
  - Sources: SME Design Perfectionist, SME Design Red Team
  - Summary: Bring shell navigation and utility surfaces into one coherent visual hierarchy.

- **REC-004** [open] Restructure WeightControls and SearchPanel around the primary entry flow
  - Priority: `P1`
  - Recurrence: `2`
  - Sources: SME Design Perfectionist
  - Summary: Make search the first clear action and move secondary weight actions into a calmer, collapsible surface.

- **REC-005** [open] Refine Matches table persistence and navigation clarity
  - Priority: `P1`
  - Recurrence: `6`
  - Sources: SME Design Perfectionist, SME Design Red Team
  - Summary: Preserve matches preferences and make chain navigation distinct, readable, and non-disruptive in long sessions.

- **REC-006** [open] Add the shared motion and loading-state layer
  - Priority: `P1`
  - Recurrence: `4`
  - Sources: SME Design Perfectionist, SME Design Red Team
  - Summary: Standardize motion and search feedback so loading and empty states no longer feel abrupt or silent.

- **REC-007** [open] Make source-track pivots explicit in the Matches workflow
  - Priority: `P0`
  - Recurrence: `3`
  - Sources: SME Design Perfectionist, SME Design Red Team
  - Summary: Separate title inspection from source pivots so the main matches workflow loses its biggest affordance trap.

- **REC-008** [open] Redesign DJ filtering workflows for key and BPM
  - Priority: `P1`
  - Recurrence: `5`
  - Sources: SME Design Perfectionist, SME Design Red Team
  - Summary: Make Camelot relationships legible and BPM mode selection explicit instead of silently conflicting.

- **REC-009** [open] Reduce Set Builder first-track friction
  - Priority: `P2`
  - Recurrence: `4`
  - Sources: SME Design Perfectionist, SME Design Red Team
  - Summary: Reduce first-use ceremony and make set-workspace empty states and pool visibility support immediate progress.

- **REC-016** [open] Strengthen tracklist editing with direct manipulation and transition scoring
  - Priority: `P1`
  - Recurrence: `1`
  - Sources: SME Design Red Team
  - Summary: Add drag-first tracklist reordering and expose adjacent transition quality directly in the ordered list.

- **REC-017** [open] Modularize API routes and restore backend structural guardrails
  - Priority: `P1`
  - Recurrence: `1`
  - Sources: Technical SME
  - Summary: Split the route monolith, standardize DB session ownership, and restore structure checks for `set_workspace`.

- **REC-018** [open] Refactor transition-matching runtime state ownership
  - Priority: `P1`
  - Recurrence: `1`
  - Sources: Technical SME
  - Summary: Remove globally shared matcher state and wrapper indirection so backend correctness no longer depends on singleton lifecycle quirks.

- **REC-019** [open] Harden client and API boundary handling
  - Priority: `P2`
  - Recurrence: `1`
  - Sources: Technical SME
  - Summary: Add failure containment, shared client HTTP error handling, and tighter request validation at the app boundary.

## Promoted

- **REC-010** [promoted] Harden set workspace trust boundaries before broader rollout
  - Priority: `P0`
  - Recurrence: `3`
  - Sources: Delivery Ledgers, Technical SME
  - Summary: Tighten CORS and bound pair-score request size before treating the set workspace as hardened.

- **REC-011** [promoted] Strengthen explorer interaction proof for the set workspace
  - Priority: `P1`
  - Recurrence: `4`
  - Sources: Delivery Ledgers
  - Summary: Finish the remaining high-risk explorer confidence work so the workspace has credible regression proof.
