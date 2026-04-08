# Run Verification Stack

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run the repo-local verification stack for an existing delivery run.

## INPUT

Required:
- `run_dir`: existing delivery run directory under `.harness/runs/`

Optional:
- `spawn_breaker_follow_on`: `true` or `false` (default `true`)

## DO

1. Refresh deterministic artifacts
- `python3 .harness/bin/pipeline.py diff --run-dir <run_dir>`
- `python3 .harness/bin/pipeline.py run --run-dir <run_dir> --intent test`
- `python3 .harness/bin/pipeline.py run --run-dir <run_dir> --intent build`
- `python3 .harness/bin/pipeline.py validate --run-dir <run_dir>`
- `python3 .harness/bin/pipeline.py context-manifest --run-dir <run_dir>`

2. Delegate build and health checks
- `Test Build Verifier`
- `Meta Bad State Monitor`

3. Run adversarial verification
- delegate to `Coord Breaker Orchestrator`
- require specialist breaker lanes when relevant to the diff

4. Evaluate the run
- `python3 .harness/bin/pipeline.py evaluate --run-dir <run_dir>`
- delegate to `Test Delivery Evaluator`
- delegate to `Test Regression Detector`

5. Handle breaker follow-on
- if `spawn_breaker_follow_on=true` and actionable breaker findings remain:
  - delegate to `Spec Contract Producer`
  - write `BREAKER_FOLLOW_ON_CONTRACT.md`
  - start a new delivery run from that contract
  - record `FOLLOW_ON_RUN.json`

## ACCEPTANCE

Complete only if:
- `PATCH.diff`, `TEST_REPORT.json`, `POLICY_REPORT.json`, `BAD_STATE_REPORT.md`, `BREAKER_REPORT.md`, `EVAL_REPORT.json`, and `REGRESSION_REPORT.json` exist
- specialist breaker reports exist when those lanes were relevant
- any actionable breaker findings either produced a follow-on run or were explicitly waived
