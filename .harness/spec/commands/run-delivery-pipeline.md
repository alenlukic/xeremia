# Run Delivery Pipeline

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run the repo-local delivery pipeline for a coding task, including adversarial verification, bad-state detection, evaluation, regression detection, and ledger publication.

## INPUT

Required:
- either or both:
  - `task`: plain-English task / requirements
  - `task_files`: path to either a single development contract or other task artifact; when multiple provided, run them in sequence.

Optional:
- `parent_run`: source run id when this run is a follow-on
- `source_kind`: e.g. `breaker_follow_on`, `stakeholder_feedback`, `scheduled_work`
- `source_artifact`: source report or contract path

## SCOPE

Execute one scoped delivery run for the provided task using the repo-local delivery pipeline.
Do not expand scope beyond the stated task unless required to satisfy an explicit requirement or unblock correctness.

## DELEGATION

Each numbered step that names an agent must be delegated via `Task(subagent_type="<Agent Name>")`.
You are the orchestrator — do not perform agent work directly.
Pass the run directory path and relevant artifacts as context to each subagent.

## DO

1. Initialize run
- create a new run directory under `.harness/history/runs/`
- if `task_file` is provided, use:
  - `python3 .harness/control/bin/pipeline.py start --mode delivery --task-file <task_file> [--parent-run ... --source-kind ... --source-artifact ...]`
- otherwise use:
  - `python3 .harness/control/bin/pipeline.py start --mode delivery --task <task> [--parent-run ... --source-kind ... --source-artifact ...]`

2. Intake and planning
- use the `Coord Delivery Supervisor` agent
- write `TASK.md` and `PLAN.md`

3. Implementation and specific review loop
- delegate to `Dev Delivery Coder`
- delegate to `Test Delivery Reviewer`
- iterate until approved or retry policy says stop

4. Diff-aware second pass
- once a meaningful diff exists, delegate to `Spec Diff Planner`
- write `SECOND_PASS_PLAN.md` when remediation or scope tightening is needed

5. QA validation
- delegate to `Test Delivery QA`

6. Broad review
- after QA pass, delegate to `Test Delivery Broad Reviewer`

7. Verification stack
- `python3 .harness/control/bin/pipeline.py diff --run-dir <run_dir>`
- `python3 .harness/control/bin/pipeline.py run --run-dir <run_dir> --intent test`
- `python3 .harness/control/bin/pipeline.py run --run-dir <run_dir> --intent build`
- `python3 .harness/control/bin/pipeline.py validate --run-dir <run_dir>`
- delegate to `Test Build Verifier`
- delegate to `Meta Bad State Monitor`
- delegate to `Coord Breaker Orchestrator`
- `python3 .harness/control/bin/pipeline.py evaluate --run-dir <run_dir>`
- delegate to `Test Delivery Evaluator`
- delegate to `Test Regression Detector`

8. Design QA verification (conditional)
- if the task originated from a design contract or includes design/UI acceptance criteria:
  - delegate to `Test Design QA`
  - write `DESIGN_QA_REPORT.md`
  - if verdict is `FAIL`, treat as a QA failure and enter remediation
- skip this step if the task has no design/visual requirements

9. Breaker follow-on handling
- if actionable breaker findings remain, the default next step is:
  - delegate to `Spec Contract Producer` using `BREAKER_REPORT.md` as primary input
  - write `BREAKER_FOLLOW_ON_CONTRACT.md`
  - start a brand-new delivery run from that contract
  - record linkage with `python3 .harness/control/bin/pipeline.py record-follow-on ...`

10. Context and ledger capture
- `python3 .harness/control/bin/pipeline.py context-manifest --run-dir <run_dir>`
- delegate to `Spec Ledger Curator`
- write `RUN_LEDGER.md` with only the highest-signal decisions, tradeoffs, failures, and reusable learnings
- `python3 .harness/control/bin/pipeline.py publish-ledger --run-dir <run_dir>` when the run produced durable learnings

11. Bounded remediation loop
- use same-run remediation only for non-breaker failures such as:
  - QA verdict is `FAIL`
  - Design QA verdict is `FAIL`
  - build status is `FAIL`
  - policy validation fails
  - eval score is below threshold
  - regression severity is `HIGH` or `CRITICAL`
- then:
  - run `python3 .harness/control/bin/pipeline.py prepare-retry --run-dir <run_dir>`
  - update `SECOND_PASS_PLAN.md`
  - return only the cited failures to the `Dev Delivery Coder`
  - perform focused remediation
  - repeat verification within configured retry limits

12. Finalize
- end with a concise final summary grounded in produced artifacts
- if a breaker follow-on run was created, include its run id and contract path

## ACCEPTANCE

Complete only if:
- `TASK.md`, `PLAN.md`, `PATCH.diff`, `TEST_REPORT.json`, `POLICY_REPORT.json`, `EVAL_REPORT.json`, and `RUN_LEDGER.md` exist
- `BAD_STATE_REPORT.md` and `BREAKER_REPORT.md` exist for meaningful diffs
- any actionable breaker findings either produced a follow-on run or were explicitly waived
- the run verdict is grounded in real artifacts rather than agent opinion alone
