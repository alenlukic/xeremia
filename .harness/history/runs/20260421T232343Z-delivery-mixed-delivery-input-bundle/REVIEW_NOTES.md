# Review Notes

Run: `20260421T232343Z-delivery-mixed-delivery-input-bundle`

## Contract 2 — Phase A Shell Rewrite (Client)

### Blockers
- None.

### Important
- **Explorer toggle hides pool zone.** When the explorer toggle is active, `App.tsx` replaces the entire `SetWorkspacePanel` (which contains both tracklist *and* pool) with `ExplorerNodesView`. This means the pool zone disappears during explorer view. The contract states "The tracklist and pool areas scroll independently and remain visible at the same time" (A-3) and the explorer toggle should "replace the visible tracklist content" (A-4, DO-3). Strict reading: explorer should swap only the tracklist table, keeping the pool visible below. Current behavior may be a deliberate full-screen explorer UX choice, but it deviates from the contract's separation of "tracklist content" and "pool zone." Not blocking because the toggle is reversible and the contract language is somewhat ambiguous about explorer-mode layout, but this should be confirmed as intentional before QA.
- **No explicit test for pool-sort isolation across views.** The `sortByView` state map keyed by `String(activeTab)` correctly isolates sort state per pool view (All, subgroup tabs). However, acceptance item A-6 ("Sorting changes in the pool All view do not alter subgroup sort state") lacks a dedicated test. The implementation is correct by inspection, but there is no test that switches between All and a subgroup tab to verify sort state doesn't leak.

### Nits
- "Column configuration" (A-5 pool, DO-3 tracklist) is interpreted as sort-tier configuration via `SortTierBar`. If the intent was column visibility toggling, that is missing. Current interpretation is reasonable given the SortTierBar provides column-level configuration.
- `tracklist-zone-outer` naming is slightly misleading since it wraps the entire workspace (including pool) when explorer is off, not just the tracklist zone. This is cosmetic and does not affect behavior.

### Requirement Fit
- Status: Substantially met.
- DO-1 through DO-6 are all addressed.
- Acceptance items A-1, A-2, A-3 (default mode), A-4, A-5, A-7, A-8, A-9 are confirmed by implementation and tests.
- A-6 (sort isolation): implementation correct, test evidence missing.
- A-10 (player bar push-up): `PlayerBar` renders at bottom of `app-shell-v2` flex column; existing behavior preserved by layout structure. 706 client tests pass including existing PlayerBar tests.
- A-11 (focused client tests): tests cover header rendering, zone structure, explorer toggle round-trip, explorer Row/Position copy, no DockBar/Browse/Matches. Missing: sort-isolation cross-view test.
- Deferred items respected: no search modal, no candidate/version UI, no edges in explorer, no draggable split.

### Notes
- All 706 client tests pass, 0 failures.
- No scope violations detected — changes are limited to client shell files.

---

## Contract 5 — Backend Phase C CRUD

### Blockers
- None.

### Important
- None.

### Nits
- None.

### Requirement Fit
- Status: Fully met.
- DO-1: Version create/rename/delete/reorder, branch, slot create/delete/reorder/note-update, candidate add/remove/select — all implemented under the set-workspace API surface.
- DO-2: Constraints enforced — `MAX_VERSIONS_PER_SET = 10`, `MAX_SLOTS_PER_VERSION = 250`, `MAX_CANDIDATES_PER_SLOT = 5`. Auto-selection of first candidate, auto-delete of slot on last candidate removal, contiguous position shifting — all implemented and tested.
- DO-3: `version_branch()` deep-copies slots/candidates through `branch_point`, creates linked `SetExplorerTree`, sets `is_inherited=True` on copied slots. `_clear_inherited()` called in `slot_reorder`, `slot_update_note`, `candidate_add`, `candidate_remove`, `candidate_select`.
- DO-4: Transition score cache tests prove write-on-compute invariant, repeated-call cache hit, directional key preservation, and cache clearing.
- A-1 through A-9: All acceptance items confirmed by implementation and test evidence:
  - A-2: 11th version → 409, 251st slot → 409, 6th candidate → 409.
  - A-3: Forward/backward reorder tests confirm contiguous shifting.
  - A-4: `test_remove_last_candidate_deletes_slot`, `test_remove_selected_candidate_promotes_next`.
  - A-5: `test_branch_creates_explorer_tree`, `test_branch_slots_marked_inherited`, `test_branch_copies_candidates`.
  - A-6: `test_reorder_clears_inherited`, `test_note_update_clears_inherited`, `test_add_candidate_clears_inherited`, `test_remove_candidate_clears_inherited`.
  - A-7: `test_hydrate_after_full_crud_cycle` confirms hydration consistency.
  - A-8: `test_cache_populated_after_first_compute`, `test_cache_not_bypassed_by_new_code_paths`.
  - A-9: Comprehensive test suite covers happy paths, limits, cascades, lifecycle, caching.
- Deferred items respected: no frontend changes, no dormant table removal, no scoring algorithm changes, no materialized node writes.

### Notes
- All 809 backend tests pass, 0 failures, ruff clean.
- No scope violations detected — changes are limited to backend CRUD.

---

## Verdict

**APPROVE**

Both contracts are correctly implemented with strong test coverage. Contract 5 is clean with no issues. Contract 2 has two Important items (pool visibility during explorer mode, missing sort-isolation test) that are worth confirming intent before QA but are not blocking: the pool-during-explorer behavior is a reversible toggle with ambiguous contract language, and the sort-isolation implementation is correct by code inspection. 1,515 total tests pass (706 client + 809 backend) with no failures.
