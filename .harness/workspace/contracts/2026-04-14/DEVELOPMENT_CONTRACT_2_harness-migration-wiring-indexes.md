# Development Contract

## Source Inputs
- Migration dry-run artifacts from `.harness/history/runs/20260414T000852Z-maintenance-sme-harness-migrator-template_so/`:
  - `MIGRATION_ANALYSIS.md` — file classification table, § "Template-Only" (5 new agents, 6 new commands), § "Customized" index files
  - `MIGRATION_DIFF.md` — `AGENTS.md`, `pipeline.yaml`, and index file recommendations
- Upstream template: `/Users/alen/Dev/agentic-harness-template` at version 7
- Phase 1 contract: `2026-04-14/DEVELOPMENT_CONTRACT_1_harness-migration-additive-files.md` (prerequisite — new files must exist)

## Selected Intent
- maintenance

## Contract Driver
- infrastructure-driven

## Selected Recommendation IDs
- Migration Analysis § "Manual review required" recommendation 5: "Update `AGENTS.md`, `INDEX.md` files to include new agents/commands"
- Migration Analysis § "Manual review required" recommendation 3: "Cherry-pick `ingest`/`housekeeping` stages into `pipeline.yaml`"

## Deferred Inputs / Non-goals
- Do not modify agent spec content or cherry-pick agent improvements; that is Phase 3
- Do not touch `MANIFEST.yaml` or `pipeline.py`; that is Phase 4
- Do not adopt the `runs/active/` + `runs/archive/` directory structure
- Do not modify `CLAUDE.md`, `HUMANS.md`, or `BOOTSTRAP.md`
- Do not change model references, execution commands, or existing pipeline stage definitions
- Do not remove or reorder existing entries in any index; only append

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Wire the 5 new agent specs and 6 new command specs (added in Phase 1) into the downstream index files, `AGENTS.md`, and `pipeline.yaml` so they are discoverable and executable.
DO: 1. In `.harness/spec/agents/INDEX.md`, add entries for the 5 new agents: `meta-context-ingest-classifier`, `meta-context-router`, `sme-harness-engineer`, `sme-subagent-spec-advisor`, `spec-delta-producer`. Follow the existing table format and prefix conventions (`meta-`, `sme-`, `spec-`). 2. In `.harness/spec/commands/INDEX.md`, add entries for the 6 new commands: `run-context-ingest`, `run-ecosystem-housekeeping`, `run-meta-doc-sync-all`, `run-sme-harness-engineer`, `run-sme-harness-migrator`, `run-sme-subagent-spec-advisor`. Follow the existing table format. 3. In `AGENTS.md`, add the 5 new agents to their appropriate role-prefix sections in the agent tables (meta- agents under "Harness governance agents", sme- agents under "SME and research agents", spec- agents under "Specification agents"). Add the 6 new commands to the Commands table. Add new agents to the Agent Naming Convention table if a new prefix category is introduced. 4. In `.harness/control/pipeline.yaml`, add `ingest` and `housekeeping` stage definitions as new stages (do not modify existing stages). The `ingest` stage should reference `meta_context_ingest_classifier`, `meta_context_router`, `spec_delta_producer`. The `housekeeping` stage should reference `meta_ledger_doc_steward`, `meta_memory_sync_steward`, `meta_bad_state_monitor`. Also add `archive_root: .harness/history/runs/archive` and `db: []` placeholder to the `commands:` section if not present. 5. In `.harness/INDEX.md`, add references to any new top-level documents added in Phase 1 (e.g., `HARNESS_CHANGELOG.md`, `MIGRATIONS.md`) if those are typically listed there. 6. Regenerate or update the `.cursor/commands/` symlinks by running `.harness/control/bin/setup.sh` if new command specs require IDE-visible slash commands.
ACCEPTANCE: 1. `.harness/spec/agents/INDEX.md` lists all 5 new agents with correct paths, roles, and prefix categorization. 2. `.harness/spec/commands/INDEX.md` lists all 6 new commands with correct paths. 3. `AGENTS.md` contains entries for all 5 new agents in the correct role-prefix sections and all 6 new commands in the Commands table. 4. `pipeline.yaml` has `ingest` and `housekeeping` stages with the correct agent references, and an `archive_root` key exists. 5. All existing index entries, agent entries, and pipeline stages are preserved unmodified. 6. `.harness/INDEX.md` references new top-level harness documents. 7. Within a dirty worktree, no file outside the scoped Phase 2 target set is intentionally modified by this phase; pre-existing unrelated dirty files and previously created contract/run artifacts outside this phase do not count as Phase 2 scope violations.
OUTPUT: schema=default
```

## Ordering Constraints
- `depends_on: DEVELOPMENT_CONTRACT_1_harness-migration-additive-files` — the new agent/command spec files must exist before they can be indexed
- Must complete before Phase 3 (agent improvements) begins, so indexes reflect the full agent roster

## Notes to Orchestrator
- Use the maintenance pipeline.
- When adding to `AGENTS.md`, preserve the existing dj-tools specific content (repo description, operating model, memory surfaces, anti-drift rules). Only append to the existing tables; do not restructure.
- When adding stages to `pipeline.yaml`, insert them after the existing stages. Do not change `run_root` from `.harness/history/runs` to `.harness/history/runs/active` yet — that requires Phase 4's `pipeline.py` reconciliation.
- The `archive_root` key can be added now even though the archive directory structure is not yet active; it will be a no-op until Phase 4 activates it.
