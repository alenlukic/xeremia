# Run Harness Engineer

DEVDSL-1
MODE: FLEX
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run a scoped harness infrastructure task using the SME Harness Engineer agent.

## INPUT

Required:
- `task`: plain-English description of the harness change, fix, or improvement needed

Optional:
- `scope`: `narrow` (default) or `broad`
- `focus`: `control`, `spec`, `workspace`, `knowledge`, `history`, `intake`, or `all`
- `research_first`: if true, research external best practices before implementing
- `dry_run`: if true, produce a plan without making changes

## SCOPE

Execute one scoped harness infrastructure task.

Changes must remain within `.harness/`.
Product code must not be modified.

## DELEGATION

Delegate the task to `SME Harness Engineer`.
You are the orchestrator — do not perform agent work directly.

## DO

1. Initialize
- create a tracked run directory: `python3 .harness/control/bin/pipeline.py start --task "<task summary>" --mode delivery`
- use the run directory path returned by this command as the base for all artifact writes
- parse the task and optional parameters
- delegate to `SME Harness Engineer` with full context, including the run directory path

2. Execute
- the agent diagnoses, plans, implements, and verifies the change
- if `dry_run=true`, the agent stops after planning

3. Finalize
- collect the `HARNESS_ENGINEER_REPORT.md` artifact
- summarize what changed

## VALIDATION

Before completion, verify:
- only `.harness/` files were modified
- the report was produced
- cross-references are consistent

## OUTPUT

Produce:
- `HARNESS_ENGINEER_REPORT.md` in the run directory
- concise completion summary

## ACCEPTANCE

Complete only if:
- the SME Harness Engineer agent was used
- no product code was modified
- the report documents changes and verification
- cross-references remain consistent
