# Development Contract

## Source Inputs
- Migration dry-run artifacts from `.harness/history/runs/20260414T000852Z-maintenance-sme-harness-migrator-template_so/`:
  - `MIGRATION_ANALYSIS.md` — § "Critical Conflicts" items 1–4 (MANIFEST.yaml schema, pipeline.py divergence, run directory structure)
  - `MIGRATION_DIFF.md` — `MANIFEST.yaml` full schema diff, `pipeline.yaml` structural diff, `pipeline.py` summary
- Upstream template: `/Users/alen/Dev/agentic-harness-template` at version 7
- Downstream pipeline extensions: `.harness/control/bin/_discovery.py`, `_merge.py`, `_state.py`, `_validate.py`

## Selected Intent
- maintenance

## Contract Driver
- infrastructure-driven

## Selected Recommendation IDs
- Migration Analysis § "Critical Conflicts" item 1: "Replace MANIFEST.yaml with template schema"
- Migration Analysis § "Critical Conflicts" item 3: "pipeline.py detailed review required"
- Migration Analysis § "Critical Conflicts" item 4: "Adopt runs/active/ + runs/archive/ directory structure"
- Migration Analysis § "Deferred to follow-on" recommendations 1–2

## Deferred Inputs / Non-goals
- Do not modify product code, agent specs, or index files — those are handled in Phases 1–3
- Do not remove downstream pipeline extensions (`_discovery.py`, `_merge.py`, `_state.py`, `_validate.py`); reconcile around them
- Do not remove downstream-specific `pipeline.yaml` stages, commands, retry/artifacts blocks, or policy entries
- Do not change the downstream's test, lint, format, or build commands
- Do not modify protected surfaces
- Do not upstream downstream innovations to the template

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Migrate `MANIFEST.yaml` to the template's versioning schema, reconcile `pipeline.py` with template improvements while preserving downstream extensions, and optionally adopt the `runs/active/` + `runs/archive/` directory structure. This is the highest-risk migration phase and must be executed with full validation.
DO: 1. Replace the downstream `MANIFEST.yaml` with the template's versioning schema structure. Populate the new schema fields: set `name` to `dj-tools`, set `version` to `7`, preserve `min_supported_version: 5`, reference `HARNESS_CHANGELOG.md` and `HARNESS_CHANGELOG.json`, set `bootstrap.cursor` to the downstream's existing `.harness/control/bin/setup.sh` (or the new `bin/bootstrap-cursor.sh` if Phase 1 added it), populate `scheduler_installers` from the template, and define `critical_paths` appropriate for the dj-tools repo structure. Document any downstream-specific metadata from the legacy schema (`scripts:`, `configure:`, `runtime:`, `knowledge:` entries) in a comment block or in `MIGRATIONS.md` so it is not silently lost. 2. Perform a line-by-line diff review of `.harness/control/bin/pipeline.py` between downstream and template. Identify template improvements to backport: (a) run ID generation changes, (b) `STAGE_RESULT.json` and `STAGE_HISTORY.jsonl` artifact support, (c) `RUN_SUMMARY.md` generation, (d) `record-follow-on` CLI argument naming updates. Apply these selectively without breaking the downstream's existing helper module imports (`_discovery`, `_merge`, `_state`, `_validate`) or its existing `start`, `stop`, `status` subcommands. 3. In `pipeline.yaml`, change `run_root` from `.harness/history/runs` to `.harness/history/runs/active` only if `pipeline.py` has been updated to support the active/archive layout. If `pipeline.py` does not yet handle the split, leave `run_root` unchanged and document this as a follow-on. 4. If the `runs/active/` + `runs/archive/` structure is adopted: create the `active/` and `archive/` directories, move existing runs into `archive/`, and update `.harness/history/README.md` to document the new layout. If deferred, document the deferral in `MIGRATIONS.md`. 5. Update `.harness/control/bin/setup.sh` to source `bootstrap-helpers.sh` (added in Phase 1) if the helper provides useful bootstrap functions. 6. Validate the migration-touched surfaces: YAML and JSON files created or modified by this phase parse successfully, cross-reference consistency holds for the migrated indexes/manifests/configuration, and `pipeline.yaml` stage references resolve to existing agent specs. Pre-existing invalid legacy artifacts under protected surfaces such as `.harness/history/` do not block acceptance unless this phase intentionally migrates or modifies them.
ACCEPTANCE: 1. `MANIFEST.yaml` uses the template's versioning schema with `version: 7` and all required fields populated. No legacy schema keys remain as top-level YAML fields. 2. All downstream-specific metadata from the legacy schema is documented and recoverable (in comments or `MIGRATIONS.md`). 3. `pipeline.py` incorporates identified template improvements while preserving all downstream extension imports and existing subcommands. 4. `pipeline.py` passes its existing test suite (`.harness/control/tests/test_bootstrap.py` and any other tests). 5. If run directory migration was performed: `runs/active/` exists and is used for new runs, `runs/archive/` contains prior runs, `history/README.md` documents the new layout. If deferred: `MIGRATIONS.md` documents the deferral. 6. Validation passes for files created or changed by the migration: YAML parse check, JSON parse check, index/manifests/config cross-reference check, and `pipeline.yaml` self-consistency. Pre-existing invalid legacy artifacts under protected surfaces such as `.harness/history/` do not block acceptance unless they were intentionally migrated or modified in this phase. 7. No downstream pipeline extensions were broken or removed. 8. No protected surface was intentionally modified except the optional history-layout migration explicitly allowed by this contract.
OUTPUT: schema=default
```

## Ordering Constraints
- `depends_on: DEVELOPMENT_CONTRACT_1_harness-migration-additive-files` — `HARNESS_CHANGELOG.md`, `HARNESS_CHANGELOG.json`, and `MIGRATIONS.md` must exist
- `depends_on: DEVELOPMENT_CONTRACT_2_harness-migration-wiring-indexes` — `pipeline.yaml` must have `ingest`/`housekeeping` stages before reconciliation
- `soft_depends_on: DEVELOPMENT_CONTRACT_3_harness-migration-agent-cherry-picks` — agent improvements should land first so validation can verify the final state, but this is not a hard blocker
- This is Phase 4 and should execute last

## Notes to Orchestrator
- **This is the highest-risk phase.** Schedule it last and ensure Phases 1–3 are verified before starting.
- Use the maintenance pipeline with extra validation rigor.
- The `pipeline.py` reconciliation is the most complex item. If the template's `pipeline.py` has diverged too far to reconcile safely, it is acceptable to adopt only specific functions/features rather than attempting a full merge. Document what was adopted, what was skipped, and why.
- The run directory structure migration (`runs/active/` + `runs/archive/`) is optional in this phase. If `pipeline.py` reconciliation does not include active/archive support, defer the directory migration entirely and note it in `MIGRATIONS.md` for a future phase.
- If any step in this phase introduces failures that cannot be resolved within 2 retry rounds, stop and produce a partial report rather than spiraling. The operator can then scope a follow-on contract for the remaining items.
- After completion, the downstream should be at harness version 7 with a valid `MANIFEST.yaml` that the migrator can use for future version comparisons.
