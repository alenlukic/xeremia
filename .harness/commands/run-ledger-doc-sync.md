# Run Ledger Doc Sync

DEVDSL-1
MODE: STRICT
FLAGS: SCOPE_LOCK(explicit)

## COMMAND

Update repo documentation based on published run ledgers since the last sync.

## INPUT

No explicit input required. The pipeline tracks sync state automatically.

## DO

1. Check for pending ledgers
- `python3 .harness/bin/pipeline.py pending-ledgers`
- if no pending ledgers exist, report "nothing to sync" and stop

2. Read pending ledgers
- read each ledger file listed in the pending set
- identify durable guidance, patterns, or structural updates

3. Delegate documentation updates
- delegate to `Ledger Documentation Steward`
- provide the pending ledger list and their contents

4. Advance sync state
- `python3 .harness/bin/pipeline.py mark-doc-sync --up-to-run <latest_run_id>`

## ACCEPTANCE

Complete only if:
- pending-ledgers was checked
- all pending ledgers were read
- documentation updates (if any) are grounded in ledger content
- sync state was advanced to the latest processed ledger

## OUTPUT

- Updated documentation files (if warranted by ledger content)
- Advanced doc sync state
- Brief summary of changes made
