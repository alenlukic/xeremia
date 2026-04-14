# Run Ecosystem Housekeeping

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Query all scheduled jobs and run every deterministic job from that schedule surface.

## DO

1. `python3 .harness/control/bin/pipeline.py schedule-due`
   Returns all registered scheduled jobs (no time-based filtering).
2. For each job whose type is `deterministic`:
   `python3 .harness/control/bin/pipeline.py schedule-run --job <id>`

The entrypoint script `bin/run-harness-housekeeping.sh` automates these steps with locking, retry, and error reporting.

## ACCEPTANCE

Complete only if:
- all deterministic jobs from the schedule ran successfully
- no unsupported pipeline.py commands were invoked
