# Run Ledgers

This directory contains durable, distilled learnings from completed pipeline runs.

## Contents

| File | Purpose |
|---|---|
| `INDEX.json` | Ordered list of all published ledger entries |
| `DOC_SYNC_STATE.json` | Tracks which ledgers have been synced into repo docs |
| `<run_id>.md` | Individual ledger entry with frontmatter metadata |

## How it works

1. Each completed delivery run produces a `RUN_LEDGER.md` in its run directory.
2. The `Run Ledger Curator` agent distills only high-signal decisions, failures, and reusable learnings.
3. The pipeline publishes the ledger: `python3 .harness/bin/pipeline.py publish-ledger --run-dir <run_dir>`
4. Published ledgers accumulate here with frontmatter containing run metadata.
5. The `Ledger Documentation Steward` periodically reads pending ledgers and updates repo docs.
6. After a doc sync, the boundary advances: `python3 .harness/bin/pipeline.py mark-doc-sync --up-to-run <run_id>`

## Principles

- Ledgers capture **durable knowledge**, not transient reasoning.
- Each entry should be compact (2–5 bullets per section).
- This directory is committed to the repo so learnings travel with the codebase.
