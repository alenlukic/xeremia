# Run Ledger Doc Sync

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) TRAVERSE_PROOF(required) OUTPUT_SCHEMA(default)

## COMMAND

Update durable repo documentation and lightweight structure based on published run ledgers created since the last documentation sync.

## INPUT

Optional:
- `since_run_id`: override the default sync boundary
- `scope_paths`: comma-separated doc or config paths to prioritize
- `allow_structure_updates`: `true` or `false` (default `true`)
- `allow_persona_updates`: `true` or `false` (default `true`)

## SCOPE

Read only published ledgers in `.harness/ledgers/` that are pending since the last sync state.

Allowed edits:
- repo docs
- harness docs
- lightweight structural metadata (indexes, catalogs, manifests, navigation docs)
- stable persona guidance under `.harness/product-feedback/`

Do not:
- modify product code
- rewrite large docs wholesale when a narrow patch will do
- infer changes that are not supported by repeated ledger evidence

## DELEGATION

Delegate to `Ledger Documentation Steward`.

## DO

1. Determine ledger set
- inspect `.harness/ledgers/DOC_SYNC_STATE.json`
- use `python3 .harness/bin/pipeline.py pending-ledgers` unless `since_run_id` overrides the boundary

2. Analyze durable learnings
- identify repeated decisions, clarified conventions, known pitfalls, customer/product learnings, and documentation drift
- separate:
  - new durable guidance
  - stale docs to update
  - structural/index changes
  - persona guidance changes

3. Apply narrow updates
- update only the docs and metadata justified by the ledger set
- prefer edits to indexes, runbooks, conventions, persona guidance, and workflow docs
- if `allow_structure_updates=false`, skip any non-doc structural changes
- if `allow_persona_updates=false`, do not edit `.harness/product-feedback/*`

4. Write sync report
- write `.harness/ledgers/DOC_SYNC_REPORT.md` with:
  - ledgers consumed
  - files updated
  - durable changes captured
  - deferred follow-ups

5. Advance sync state
- call `python3 .harness/bin/pipeline.py mark-doc-sync --up-to-run <latest_consumed_run_id>`

## VALIDATION

Before completion, verify:
- only published ledgers since the last sync were used
- edits are narrow and evidence-backed
- no product code changed
- sync state was advanced only after the report was written

## OUTPUT

Produce:
- updated docs / lightweight structure artifacts
- `.harness/ledgers/DOC_SYNC_REPORT.md`
- updated `.harness/ledgers/DOC_SYNC_STATE.json`

## ACCEPTANCE

Complete only if:
- the Ledger Documentation Steward agent was used
- every durable change maps to ledger evidence
- updates remain narrow and high-signal
- sync state matches the latest consumed ledger
