# Run Delivery Pipeline

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run the repo-local delivery pipeline for a bundle of development work, including contract normalization, contract-set planning, execution-DAG creation, adversarial verification, bad-state detection, evaluation, regression detection, and ledger publication.

## INPUT

Required:

- one or more task inputs via any combination of:
  - `tasks`: plain-English tasks / requirements / notes
  - `task_files`: paths to development contracts or other task artifacts

Optional:

- `parent_run`: source run id when this run is a follow-on
- `source_kind`: e.g. `breaker_follow_on`, `stakeholder_feedback`, `scheduled_work`
- `source_artifact`: source report or contract path

## SCOPE

Execute one scoped delivery run for the provided input bundle using the repo-local delivery pipeline.
Do not expand scope beyond the contracts derived from the stated inputs unless required to satisfy an explicit requirement or unblock correctness.

## DELEGATION

Each numbered step that names an agent must be delegated via `Task(subagent_type="<Agent Name>")`.
You are the orchestrator — do not perform agent work directly.
Pass the run directory path and relevant artifacts as context to each subagent.

## EXECUTION MODEL

**Default: parallel execution.** Where steps have no data dependency on each other, dispatch them concurrently using parallel `Task(...)` calls. This is not optional — it is the expected execution model.

**Fallback: sequential.** If the host does not support reliable parallel agent execution, run independent steps sequentially in DAG order while preserving all dependency semantics.

## STEP DEPENDENCY DAG

This section defines the data-dependency graph across all pipeline steps. Steps with no mutual dependency may run concurrently. Steps listed as dependencies must complete before the dependent step begins.

### Per-step dependencies

| Step | Depends on | Notes |
|---|---|---|
| 1  Initialize run | — | Always first |
| 2  Contract normalization | 1 | |
| 3  Orchestration planning | 2 | |
| 4  Implementation and review loop | 3 | |
| 5  Diff-aware second pass | 4 | Needs a real diff |
| 6  QA validation | 5 | |
| 7  Broad review | 6 | |
| 8  Verification stack | 4 | Needs a real diff; CLI commands run sequentially, then agents dispatch concurrently |
| 9  Design QA (conditional) | 4 | Independent of 5–8; runs only when contracts include design/UI criteria |
| 10 Breaker follow-on | 8 (`Coord Breaker Orchestrator`) | Specifically waits on the breaker orchestrator within step 8 |
| 11 Context and ledger capture | 6, 7, 8, 9, 10 | Waits for all review, verification, design QA, and breaker handling to finish |
| 12 Runtime transparency | — | Continuous; emit after each meaningful stage throughout the run |
| 13 Bounded remediation loop | failure in 6–8 | Re-enters at step 4; bounded by retry limits |
| 14 Finalize | 10, 11 | |

### Concurrency groups

After step 4 completes, three independent paths can run concurrently:

- **Path A (review chain):** 5 → 6 → 7
- **Path B (verification stack):** 8 (CLI commands, then agents)
- **Path C (design QA):** 9 — conditional; only if contracts include design/UI criteria

Steps 10, 11, and 14 are join points that wait for their respective upstream paths to finish.

### Step 8 internal concurrency

After the four CLI commands run sequentially, the following five agents dispatch concurrently:

- `Test Build Verifier`
- `Test Delivery Evaluator`
- `Test Regression Detector`
- `Meta Bad State Monitor`
- `Coord Breaker Orchestrator`

All five are independent of each other. `Coord Breaker Orchestrator` must complete before step 10.

## DO

1. Initialize run — depends on: none

- use `pipeline.py start` to create a properly tracked run directory — do not create run directories manually
- if there is exactly one existing contract and no prose tasks, you may start with:
  - `python3 .harness/control/bin/pipeline.py start --mode delivery --task-file <task_file> [--parent-run ... --source-kind ... --source-artifact ...]`
- otherwise start a synthetic bundle run using:
  - `python3 .harness/control/bin/pipeline.py start --mode delivery --task "mixed-delivery-input-bundle" [--parent-run ... --source-kind ... --source-artifact ...]`
- write `INPUT_BUNDLE.md` enumerating every prose task and task file

2. Contract normalization gate — depends on: 1

- do **not** begin implementation or planning against prose tasks directly
- for every prose task or non-contract artifact, delegate to `Spec Contract Producer`
- validate any provided contract files as part of the same intake pass
- produce a fully normalized contract set before delivery planning begins
- write `CONTRACT_SET.md` summarizing all resulting contracts, their drivers, and their dependencies

3. Orchestration planning — depends on: 2

- only after the contract set exists, delegate to `Coord Delivery Supervisor`
- the supervisor must analyze the contract set and write:
  - `TASK.md`
  - `PLAN.md`
  - `EXECUTION_DAG.md`
  - `EXECUTION_DAG.json`
- the execution DAG must identify parallel waves — groups of nodes with no mutual data dependencies
- the default is to execute each parallel wave concurrently; sequential execution within a wave is the fallback only when the host cannot dispatch parallel agents

4. Implementation and specific review loop — depends on: 3

- delegate to `Dev Delivery Coder` for each ready DAG node
- delegate to `Test Delivery Reviewer`
- iterate until approved or retry policy says stop

5. Diff-aware second pass — depends on: 4 (diff must exist)

- once a meaningful diff exists, delegate to `Spec Diff Planner`
- write `SECOND_PASS_PLAN.md` when remediation or scope tightening is needed

6. QA validation — depends on: 5

- delegate to `Test Delivery QA`

7. Broad review — depends on: 6

- after QA pass, delegate to `Test Delivery Broad Reviewer`

8. Verification stack — depends on: 4 (diff must exist); concurrent with 5–7 and 9

- `python3 .harness/control/bin/pipeline.py diff --run-dir <run_dir>`
- `python3 .harness/control/bin/pipeline.py run --run-dir <run_dir> --intent test`
- `python3 .harness/control/bin/pipeline.py run --run-dir <run_dir> --intent build`
- `python3 .harness/control/bin/pipeline.py validate --run-dir <run_dir>`
- dispatch the following agents concurrently — they have no data dependencies on each other:
  - `Test Build Verifier`
  - `Test Delivery Evaluator`
  - `Test Regression Detector`
  - `Meta Bad State Monitor`
- dispatch `Coord Breaker Orchestrator` concurrently with the above group; it is independent of those four but must complete before breaker follow-on handling (step 10)
- `python3 .harness/control/bin/pipeline.py evaluate --run-dir <run_dir>`
- when the host does not support parallel execution, run these agents sequentially in the order listed above

9. Design QA verification (conditional) — depends on: 4 (diff must exist); concurrent with 5–8

- if any contract includes design/UI acceptance criteria:
  - delegate to `Test Design QA`
  - write `DESIGN_QA_REPORT.md`
  - if verdict is `FAIL`, treat as a QA failure and enter remediation

10. Breaker follow-on handling — depends on: 8 (`Coord Breaker Orchestrator` must complete)

- if actionable breaker findings remain, the default next step is:
  - delegate to `Spec Contract Producer` using `BREAKER_REPORT.md` as primary input
  - write `BREAKER_FOLLOW_ON_CONTRACT.md`
  - start a brand-new delivery run from that contract
  - record linkage with `python3 .harness/control/bin/pipeline.py record-follow-on ...`

11. Context and ledger capture — depends on: 6, 7, 8, 9, 10

- `python3 .harness/control/bin/pipeline.py context-manifest --run-dir <run_dir>`
- delegate to `Spec Ledger Curator`
- write `RUN_LEDGER.md` with only the highest-signal decisions, tradeoffs, failures, and reusable learnings
- `python3 .harness/control/bin/pipeline.py publish-ledger --run-dir <run_dir>` when the run produced durable learnings

12. Runtime transparency — depends on: none (continuous; runs throughout the pipeline)

- after each meaningful stage, emit `stage-result` or `heartbeat` so `.harness/workspace/inbox/` stays current

13. Bounded remediation loop — depends on: failure in steps 6–8; re-enters at step 4

- use same-run remediation only for non-breaker failures such as QA / build / policy / eval / regression failures
- then:
  - run `python3 .harness/control/bin/pipeline.py prepare-retry --run-dir <run_dir>`
  - update `SECOND_PASS_PLAN.md`
  - return only the cited failures to the `Dev Delivery Coder`
  - perform focused remediation
  - repeat verification within configured retry limits

14. Finalize — depends on: 10, 11

- end with a concise final summary grounded in produced artifacts
- if a breaker follow-on run was created, include its run id and contract path

## ACCEPTANCE

Complete only if:

- all prose or mixed inputs were transformed into contracts before implementation started
- `INPUT_BUNDLE.md`, `CONTRACT_SET.md`, `TASK.md`, `PLAN.md`, `EXECUTION_DAG.md`, `PATCH.diff`, `TEST_REPORT.json`, `POLICY_REPORT.json`, `EVAL_REPORT.json`, and `RUN_LEDGER.md` exist
- `BAD_STATE_REPORT.md` and `BREAKER_REPORT.md` exist for meaningful diffs
- any actionable breaker findings either produced a follow-on run or were explicitly waived
- the run verdict is grounded in real artifacts rather than agent opinion alone
