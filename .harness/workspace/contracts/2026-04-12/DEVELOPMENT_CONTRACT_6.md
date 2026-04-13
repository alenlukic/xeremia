# Development Contract

## Source Inputs
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/CONVENTIONS.md`
- `.harness/runs/20260412T-product-thought-partner-client-features/PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User-resolved decisions from the 2026-04-12 contract request: multiple trees follow R2 and R1; migration must map existing explorer data to a default `Main` tree; subtree copy creates a true root

## Selected Intent
- delivery

## Contract Driver
- mixed

## Selected Recommendation IDs
- `R3`

## Deferred Inputs / Non-goals
- No tree-scoped Pool or Tracklist; all trees share the set's Pool and Tracklist
- No tree export/import workflow in v1
- No rename or delete tree workflows in this contract unless required as part of the migration or creation UX
- No hard cap on tree count in v1
- No changes to starring or playback beyond compatibility with tree-aware explorer behavior

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Add multi-tree explorer support within a single set by introducing a dedicated `SetExplorerTree` model plus tree-scoped nodes and edges, a backward-compatible migration for existing explorer data, and the minimal UI/API needed to switch among trees and create new ones by the three approved creation modes.
DO: Add a `SetExplorerTree` persistence model keyed to a set; add `tree_id` foreign keys on `SetExplorerNode` and `SetExplorerEdge`; create a backward-compatible migration that assigns all existing explorer data in each set to a default tree named `Main`; update explorer APIs and services so reads and writes are scoped to the active tree; add a tab bar above the explorer canvas for active-tree selection; support creating a brand-new empty tree, deep-copying the full active tree into a new named tree, and copying a subtree from a selected node into a new named tree where the copied node becomes a true root with no parent edges carried over from the source tree.
ACCEPTANCE: Existing sets retain all explorer content after migration under a default `Main` tree with no data loss; each set can own multiple named trees while still sharing one Pool and one Tracklist; the tab bar switches the active tree and the canvas rerenders the correct graph for that tree; fresh-create yields an empty tree; full-copy preserves all nodes and intra-tree edges from the source tree into the new tree; subtree-copy clones the selected node and all descendants into a standalone tree whose copied root has no parent edges from the original tree; subsequent explorer mutations and drag/drop actions apply to the active tree only; automated coverage verifies migration correctness, tree-scoped API behavior, and the three creation modes.
OUTPUT: schema=default
```

## Ordering Constraints
- Depends on stable completion of `DEVELOPMENT_CONTRACT_3.md` and `DEVELOPMENT_CONTRACT_4.md`; recommended after `DEVELOPMENT_CONTRACT_5.md`

## Notes to Orchestrator
- This is the highest-risk contract because it combines a schema migration with explorer-behavior changes; keep the delivery branch tightly scoped to tree support.
- Validation should emphasize migration safety, active-tree scoping, and subtree-copy correctness, especially the "true root" rule.

