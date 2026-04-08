# Run Breaker Follow-up

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Turn a completed run’s breaker findings into a fresh development contract and new delivery run.

## INPUT

Required:
- `run_dir`: completed delivery run containing `BREAKER_REPORT.md`

Optional:
- `severity_threshold`: `BLOCKER` or `IMPORTANT` (default `IMPORTANT`)
- `auto_start_delivery`: `true` or `false` (default `true`)

## DO

1. Inspect breaker findings
- verify that `BREAKER_REPORT.md` contains actionable findings at or above the threshold

2. Produce follow-on contract
- delegate to `Spec Contract Producer`
- use `BREAKER_REPORT.md` as the primary source
- write `BREAKER_FOLLOW_ON_CONTRACT.md`

3. Start follow-on run
- if `auto_start_delivery=true`, run:
  - `python3 .harness/bin/pipeline.py start --mode delivery --task-file <run_dir>/BREAKER_FOLLOW_ON_CONTRACT.md --parent-run <run_id> --source-kind breaker_follow_on --source-artifact <run_dir>/BREAKER_REPORT.md`
- record linkage with:
  - `python3 .harness/bin/pipeline.py record-follow-on --run-dir <run_dir> --new-run-dir <new_run_dir> --reason breaker_follow_on --source-artifact <run_dir>/BREAKER_REPORT.md`

## ACCEPTANCE

Complete only if:
- the `Spec Contract Producer` agent was used
- the follow-on contract is scoped and actionable
- a new delivery run was started unless `auto_start_delivery=false`
