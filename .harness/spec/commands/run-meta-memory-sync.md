# Run Memory Sync

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP PATCH_ONLY SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Synchronize durable memory surfaces so ledgers, persona guidance, recommendation registry summaries, and indexes do not drift.

## INPUT

Optional:
- `scope_paths`: comma-separated surfaces to prioritize
- `allow_persona_updates`: `true` or `false` (default `true`)
- `allow_registry_summary_updates`: `true` or `false` (default `true`)

## DELEGATION

Delegate to `Meta Memory Sync Steward`.

## DO

1. Read durable memory inputs
- published ledgers and index
- recommendation registry
- persona spec
- docs index and prior sync reports

2. Identify narrow sync updates
- align summaries, cross-references, and lightweight guidance
- do not invent new product requirements

3. Apply patches and record the sync
- update only the justified surfaces
- write `MEMORY_SYNC_REPORT.md`

## ACCEPTANCE

Complete only if:
- the `Meta Memory Sync Steward` agent was used
- updates are narrow and evidence-backed
- only durable memory surfaces changed
