# Development Contract

## Source Inputs
- Migration dry-run artifacts from `.harness/history/runs/20260414T000852Z-maintenance-sme-harness-migrator-template_so/`:
  - `MIGRATION_ANALYSIS.md` — file classification table (28 template-only files total; 27 additive files in scope here after deferring `MANIFEST.yaml` to Phase 4, plus 21 missing `.gitignore` patterns)
  - `MIGRATION_DIFF.md` — `.gitignore` additive merge specification
  - `MIGRATION_PATCH.diff` — generated patch for template-owned additions
- Upstream template: `/Users/alen/Dev/agentic-harness-template` at version 7
- Traceability run: `.harness/history/runs/20260414T003523Z-maintenance-sme-harness-migrator-create-all-`

## Selected Intent
- maintenance

## Contract Driver
- infrastructure-driven

## Selected Recommendation IDs
- Migration Analysis § "Immediate (safe to auto-apply)" recommendations 1–2

## Deferred Inputs / Non-goals
- Do not modify any existing file beyond `.gitignore` (additive append only)
- Do not wire new agents/commands into `AGENTS.md`, `INDEX.md` files, or `pipeline.yaml`; that is Phase 2
- Do not touch `MANIFEST.yaml`, `pipeline.py`, or any customized file
- Do not modify protected surfaces (`.harness/knowledge/memory/`, `.harness/history/`, `.harness/control/runtime/`, `.harness/workspace/`)
- Do not adopt the `runs/active/` + `runs/archive/` directory structure in this phase

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Copy 27 template-only files from the upstream template into the downstream repository and append 21 missing ignore patterns to `.gitignore`. `MANIFEST.yaml` is intentionally excluded from this phase and deferred to Phase 4. No existing files are modified except `.gitignore` (additive only).
DO: 1. Copy the following 27 new files from the template source into their corresponding paths in the downstream repo, creating intermediate directories as needed: `HARNESS_CHANGELOG.md`, `HARNESS_CHANGELOG.json`, `MIGRATIONS.md`, `.github/workflows/harness-housekeeping.yml`, `.cursor/agent-schedules.json`, `bin/bootstrap-cursor.sh`, `bin/bootstrap-claude.sh`, `bin/bootstrap-codex.sh`, `bin/install-cron-housekeeping.sh`, `bin/install-launchd-housekeeping.sh`, `bin/install-systemd-housekeeping.sh`, `bin/run-harness-housekeeping.sh`, `.harness/control/bin/bootstrap-helpers.sh`, `.harness/control/cursor/agent-schedules.json`, `.harness/knowledge/docs/HARNESS_CONTROL_FLOW.md`, `.harness/knowledge/docs/README.md`, `.harness/spec/agents/meta-context-ingest-classifier.md`, `.harness/spec/agents/meta-context-router.md`, `.harness/spec/agents/sme-harness-engineer.md`, `.harness/spec/agents/sme-subagent-spec-advisor.md`, `.harness/spec/agents/spec-delta-producer.md`, `.harness/spec/commands/run-context-ingest.md`, `.harness/spec/commands/run-ecosystem-housekeeping.md`, `.harness/spec/commands/run-meta-doc-sync-all.md`, `.harness/spec/commands/run-sme-harness-engineer.md`, `.harness/spec/commands/run-sme-harness-migrator.md`, `.harness/spec/commands/run-sme-subagent-spec-advisor.md`. 2. Append the 21 missing `.gitignore` patterns in a clearly marked section at the end of the file: `# === Harness template v7 patterns (auto-appended by migration) ===` followed by the patterns listed in MIGRATION_DIFF.md § ".gitignore Additive Merge". Preserve all existing downstream entries. 3. Ensure all new shell scripts (`bin/*.sh`, `.harness/control/bin/bootstrap-helpers.sh`) have the executable bit set. 4. Verify that all new `.yaml` and `.json` files parse correctly after copy.
ACCEPTANCE: 1. All 27 in-scope template-only files exist at their correct downstream paths and match the template source content byte-for-byte. 2. `.gitignore` contains all 21 appended patterns in a marked section at the end, and all pre-existing entries are preserved verbatim. 3. Shell scripts have executable permissions. 4. All new YAML and JSON files parse without error. 5. No existing file other than `.gitignore` was modified. 6. No protected surface was touched.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent` — this is Phase 1 and has no prerequisites
- Must complete before Phase 2 (wiring) can reference the new files

## Notes to Orchestrator
- This is the lowest-risk migration phase. All operations are purely additive.
- Use the maintenance pipeline, not the delivery pipeline — no product code is changed.
- The template source is at `/Users/alen/Dev/agentic-harness-template`. Copy files directly; do not apply the generated `MIGRATION_PATCH.diff` blindly since it may include customized-file patches that are out of scope here.
- If `.harness/knowledge/docs/README.md` conflicts with an existing downstream file at that path, keep the downstream version and note the conflict for Phase 2 wiring.
