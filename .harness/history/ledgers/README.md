# Run Ledgers

This directory stores **durable, compact run summaries**.

Purpose:
- preserve the most important decisions and learnings from completed runs
- give future agents high-signal historical context without replaying full run artifacts
- drive periodic documentation, structure, and persona-guidance maintenance

Principles:
- keep ledgers short
- record decisions, tradeoffs, verification gaps, breaker findings, customer/product learnings, and reusable guidance
- do not copy raw reasoning traces or every operational step

Files:
- `INDEX.json` — published ledger metadata
- `DOC_SYNC_STATE.json` — boundary for ledger-driven doc sync
- `DOC_SYNC_REPORT.md` — latest doc sync summary
- `<run_id>.md` — published ledger entry
