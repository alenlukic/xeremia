# Review Notes

## [Contract 5] Backend Phase C Version/Slot/Candidate CRUD API

### What was implemented

**Service layer** (`src/set_workspace/service.py`):
- Version CRUD: `version_create`, `version_rename`, `version_delete`, `version_reorder`
- Slot CRUD: `slot_create`, `slot_delete`, `slot_reorder`, `slot_update_note`
- Candidate CRUD: `candidate_add`, `candidate_remove`, `candidate_select`
- Branch: `version_branch` — deep-copies slots/candidates through branch point, creates linked explorer tree, sets `is_inherited=True`
- `_clear_inherited` helper called by all slot mutation paths

**API routes** (`src/api/routes.py`):
- `POST /sets/{set_id}/versions` — create version (409 on max-10)
- `PATCH /sets/{set_id}/versions/{version_id}` — rename version
- `DELETE /sets/{set_id}/versions/{version_id}` — delete version with cascade
- `POST /sets/{set_id}/versions/reorder` — reorder versions
- `POST /sets/{set_id}/versions/{version_id}/branch` — branch from slot position
- `POST /sets/{set_id}/versions/{version_id}/slots` — create slot (409 on max-250)
- `DELETE /sets/{set_id}/versions/{version_id}/slots/{slot_id}` — delete slot
- `POST /sets/{set_id}/versions/{version_id}/slots/reorder` — reorder slot
- `PATCH /sets/{set_id}/versions/{version_id}/slots/{slot_id}/note` — update note
- `POST /sets/{set_id}/slots/{slot_id}/candidates` — add candidate (409 on max-5)
- `DELETE /sets/{set_id}/slots/{slot_id}/candidates/{candidate_id}` — remove candidate
- `PATCH /sets/{set_id}/slots/{slot_id}/candidates/{candidate_id}/select` — select candidate

**Schemas** (`src/api/schemas.py`):
- `VersionCreateRequest`, `VersionRenameRequest`, `VersionReorderRequest`, `VersionBranchRequest`
- `SlotCreateRequest`, `SlotReorderRequest`, `SlotNoteUpdateRequest`
- `CandidateAddRequest`

### Service-level constraints enforced
- Max 10 versions per set → 409
- Max 250 slots per version → 409
- Max 5 candidates per slot → 409
- Exactly one selected candidate per non-empty slot (auto-select first, promote on remove)
- Auto-delete slot when last candidate removed (with position compaction)
- Contiguous slot positions on insert/delete/reorder
- Contiguous version display_order on delete
- Branch deep-copy with `is_inherited=True`; all mutation paths clear `is_inherited`

### Test coverage (52 new tests)
- Version: create, rename, delete (cascade), reorder, limit violations
- Slot: create (position shifting), delete (cascade + compaction), reorder (forward/backward/noop/inherited clearing), note update
- Candidate: add (auto-select first), remove (last-candidate-deletes-slot, selected-promotes-next, position compaction), select (exactly-one invariant)
- Branch: slot copying, inherited flags, explorer tree creation, candidate copying, limit enforcement, duplicate name rejection
- Inherited lifecycle: end-to-end branch → inherited → mutation clears
- Transition score cache: write-on-compute, repeated-call cache hits, directional keys, clear invalidation
- Hydration: full CRUD cycle → `hydrate_set` consistency

### Items for reviewer attention
1. The `CandidateSelectRequest` schema was added but not used by the route (select uses path params only). Removed the unused import per lint.
2. The `slot_reorder` noop path (same position) intentionally does NOT clear `is_inherited` — a noop is not a mutation.
3. Route hydration for version rename and branch responses re-queries `_hydrate_versions` to return the full nested shape. This is consistent with the hydration contract but adds a read.
