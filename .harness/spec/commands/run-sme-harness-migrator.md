# Run Harness Migrator

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run a safe harness version migration from an upstream template to the current repository, producing analysis, diffs, and patches with full operator visibility and confirmation gating.

## INPUT

Required:
- `template_source`: path to the upstream template repository, or a GitHub URL. Local relative and absolute paths are mandatory. GitHub URLs are resolved via shallow clone (no GitHub API).
- `target_version`: version number to migrate to, or `latest` to resolve from the template's `MANIFEST.yaml`.

Optional:
- `dry_run`: `true` (default) or `false`. When `true`, stops after producing analysis and diff artifacts. When `false`, continues past the confirmation boundary after artifacts exist. Does not skip artifact generation.
- `skip_confirmation`: `true` or `false` (default). Operator override for the confirmation wait step only. Does not bypass dry-run artifact generation.
- `preserve_overrides`: `true` (default) or `false`. When `true`, customized files are never replaced. When `false`, the patch may propose replacements for customized files, but they are flagged for explicit review — never silently auto-merged.

## SCOPE

Execute one harness version migration. The migrator consumes the template's root `CHANGELOG.md` and the downstream `.harness/MANIFEST.yaml` — artifacts defined by the versioning contract set (Contracts 1 and 2) — but does not own or produce them.

The migrator operates on `.harness/` infrastructure and root harness files only.
Product code must not be modified.
Protected surfaces (`.harness/knowledge/memory/`, `.harness/history/`, `.harness/control/runtime/`, `.harness/workspace/`) are never automatically modified.

This is a standalone operator-invoked command. It is not wired into the standard delivery pipeline.

## DELEGATION

Delegate the task to `SME Harness Migrator`.
You are the orchestrator — do not perform agent work directly.

## DO

1. Initialize
- create a tracked run directory — do not create run directories manually:
  - `python3 .harness/control/bin/pipeline.py start --mode maintenance --task "harness-migration-<target_version>"`
- use the run directory path returned by this command as the base for all artifact writes
- parse inputs: `template_source`, `target_version`, and optional flags
- delegate to `SME Harness Migrator` with full input context and the run directory path

2. Execute
- the agent resolves the template source (local path or shallow clone for GitHub URLs)
- reads the downstream `.harness/MANIFEST.yaml` (treats absence as pre-versioning / version 0)
- computes the version gap; rejects downgrades as unsupported
- collects changelog entries spanning the version gap
- classifies all files as `template-owned`, `customized`, `repo-only`, or `deprecated`
- identifies protected surfaces
- produces dry-run artifacts: `MIGRATION_ANALYSIS.md`, `MIGRATION_DIFF.md`, `MIGRATION_PATCH.diff`
- if `dry_run=true`, stops and presents artifacts
- if `dry_run=false`, awaits operator confirmation (unless `skip_confirmation=true`)
- applies the patch, respecting `preserve_overrides` and `flag-and-ask` conflict handling
- runs post-migration validation (YAML/JSON parse, cross-reference consistency, pipeline.yaml self-consistency, protected surface audit)
- produces `MIGRATION_REPORT.md`

3. Finalize
- collect all output artifacts
- summarize migration outcome

## VALIDATION

Before completion, verify:
- template source was resolved successfully
- downstream manifest was read or handled as version 0
- dry-run artifacts were produced before any destructive operation
- protected surfaces were not modified
- post-migration validation passed (when apply was executed)
- all applicable output artifacts are present (`MIGRATION_REPORT.md` is required only when apply was executed)

## OUTPUT

Produce in the run directory created during initialization:
- `MIGRATION_ANALYSIS.md` — version gap, file classification, conflict inventory
- `MIGRATION_DIFF.md` — per-file diffs and deprecation notices
- `MIGRATION_PATCH.diff` — applicable patch
- `MIGRATION_REPORT.md` — full migration summary (only when apply is executed)
- concise completion summary including the run directory path

## ACCEPTANCE

Complete only if:
- the SME Harness Migrator agent was used
- no product code was modified
- protected surfaces were not automatically modified
- dry-run artifacts were produced before any apply step
- confirmation was obtained before apply (unless explicitly overridden)
- all applicable output artifacts are present and internally consistent (`MIGRATION_REPORT.md` is required only when apply was executed)
- conflict handling used `flag-and-ask`, not silent auto-merge
