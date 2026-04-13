# Schedules

This directory holds deterministic scheduled / triggered job scaffolding.

Use schedules for:
- ledger index rebuilds
- registry rendering
- bad-state scans across active runs
- memory/doc sync jobs that should happen on a cadence

Keep scheduled jobs human-reviewable and narrow.
Do not hide major autonomous decision-making behind background execution.
