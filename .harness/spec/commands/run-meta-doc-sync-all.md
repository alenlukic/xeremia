# Run Full Doc/Memory Sync

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Orchestrate the full post-product-feedback documentation and durable-memory sync pass by running the three existing meta sync commands in the correct sequential order. This command is intended for cases where a recommendation-producing run directory already exists, because registry sync always runs first and requires it. When no such run directory exists, run `run-meta-ledger-doc-sync.md` and `run-meta-memory-sync.md` individually instead.

## INPUT

Required:
- `run_dir`: active product-feedback run containing recommendation artifacts — required because this combined workflow always runs registry sync first, and that step needs an active product-feedback run to consume

Optional:
- `include_contract`: `true` or `false` (default `true`) — forwarded to registry sync
- `close_resolved_items`: `true` or `false` (default `false`) — forwarded to registry sync
- `since_run_id`: override the default ledger sync boundary — forwarded to ledger doc sync
- `scope_paths`: comma-separated surfaces to prioritize — forwarded to ledger doc sync and memory sync
- `allow_structure_updates`: `true` or `false` (default `true`) — forwarded to ledger doc sync
- `allow_persona_updates`: `true` or `false` (default `true`) — forwarded to ledger doc sync and memory sync
- `allow_registry_summary_updates`: `true` or `false` (default `true`) — forwarded to memory sync

## SCOPE

This command is an orchestrator. It sequences three existing meta commands and delegates each to its named agent. It does not perform specialist work itself and does not modify the behavior of the underlying commands.

## DELEGATION

Each step delegates to the agent named by the corresponding meta command:

| Step | Command | Agent |
|---|---|---|
| 1 | `run-meta-registry-sync.md` | `Meta Registry Steward` |
| 2 | `run-meta-ledger-doc-sync.md` | `Meta Ledger Doc Steward` |
| 3 | `run-meta-memory-sync.md` | `Meta Memory Sync Steward` |

Delegate each step via `Task(subagent_type="<Agent Name>")`. Do not absorb specialist work into the orchestrator.

## DO

1. **Registry sync** — delegate to `Meta Registry Steward`
   Run `run-meta-registry-sync.md` first.
   This consolidates stakeholder-feedback findings into the durable recommendation registry so downstream sync steps operate on the latest registry state.
   Pass through `run_dir`, `include_contract`, and `close_resolved_items`.

2. **Ledger doc sync** — delegate to `Meta Ledger Doc Steward`
   Run `run-meta-ledger-doc-sync.md` second.
   This updates repo docs and structural metadata from published ledgers. Running it after registry sync ensures documentation reflects the latest consolidated recommendations.
   Pass through `since_run_id`, `scope_paths`, `allow_structure_updates`, and `allow_persona_updates`.

3. **Memory sync** — delegate to `Meta Memory Sync Steward`
   Run `run-meta-memory-sync.md` last.
   This aligns summaries, cross-references, persona guidance, and memory indexes to the final post-sync state of both the registry and the docs. Running it last ensures all upstream surfaces are settled.
   Pass through `scope_paths`, `allow_persona_updates`, and `allow_registry_summary_updates`.

## ACCEPTANCE

Complete only if:
- all three phases ran in the fixed order: registry sync → ledger doc sync → memory sync
- each phase was delegated to its named agent
- registry sync produced updated registry files and `RECOMMENDATION_REGISTRY_SYNC.md`
- ledger doc sync produced `.harness/history/ledgers/DOC_SYNC_REPORT.md` and advanced `.harness/history/ledgers/DOC_SYNC_STATE.json`
- memory sync produced `.harness/knowledge/memory/MEMORY_SYNC_REPORT.md`
- no specialist work was performed directly by the orchestrator
