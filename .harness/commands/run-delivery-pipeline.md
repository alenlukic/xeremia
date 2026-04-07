# Run Delivery Pipeline

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run the repo-local delivery pipeline for a coding task.
Supports both single-contract and multi-contract execution, with optional per-contract git branching.

## INPUT

Required:
- either:
  - `task`: plain-English task / requirements
  - or `task_file`: path to a development contract or other task artifact

Optional:
- `parent_run`: source run id when this run is a follow-on
- `source_kind`: e.g. `breaker_follow_on`, `stakeholder_feedback`
- `source_artifact`: source report or contract path
- `mode`: `SINGLE` (default) | `MULTI`
  - `SINGLE`: execute one scoped delivery run for the provided task
  - `MULTI`: decompose the task into independent contracts and execute each as a separate delivery run
- `branches`: boolean (default `false`)
  - only meaningful when `mode=MULTI`
  - when `true`, each contract is executed on a dedicated git branch
  - see **Branch management** below for dependency-aware branching rules

## SCOPE

When `mode=SINGLE`: execute one scoped delivery run for the provided task.

When `mode=MULTI`: decompose the task into contracts, then execute each contract as an independent delivery run.
Each child run has its own run directory, artifacts, and lifecycle.

Do not expand scope beyond the stated task unless required to satisfy an explicit requirement or unblock correctness.

## DELEGATION

Each numbered step that names an agent must be delegated via `Task(subagent_type="<Agent Name>")`.
You are the orchestrator — do not perform agent work directly.
Pass the run directory path and relevant artifacts as context to each subagent.

## DO

### Phase 0 — Mode selection and decomposition (MULTI only)

Skip this phase entirely when `mode=SINGLE`.

0a. Decompose the task
- delegate to the `Prompt Decomposer` agent with the full task/task_file
- receive either `decision: no_decompose` (fall back to SINGLE) or `decision: decompose` with child contracts and a `dependency_summary`

0b. Build the dependency graph
- parse the `dependency_summary` from the decomposer output
- construct a directed acyclic graph (DAG) of contract dependencies
- detect cycles — if any exist, ask the user to resolve before proceeding
- determine an execution order that respects dependencies (topological sort)

0c. Record the multi-run manifest
- create a coordinator run directory under `.harness/runs/` using:
  - `python3 .harness/bin/pipeline.py start --mode delivery --task <task>`
- write `MULTI_MANIFEST.json` into the coordinator run directory:
  ```
  {
    "mode": "MULTI",
    "branches": true | false,
    "base_branch": "<current git branch>",
    "contracts": [
      {
        "index": 0,
        "slug": "<short-slug>",
        "contract_file": "<path>",
        "depends_on": [],
        "branch": "<branch name or null>",
        "run_dir": null,
        "status": "pending"
      }
    ],
    "execution_order": [0, 1, ...],
    "created_at": "<ISO timestamp>"
  }
  ```
- write each child contract to `<coordinator_run_dir>/contracts/<index>-<slug>.md`

0d. Branch setup (only when `branches=true`)
- record the current branch as `base_branch`
- for each contract in execution order:
  - if the contract has **no dependencies**: the branch point is `base_branch`
  - if the contract **depends on one parent**: the branch point is that parent's branch
  - if the contract **depends on multiple parents**: the branch point is the most recently completed parent's branch (prefer the parent whose branch contains the most relevant changes); note this in the manifest
- branch names follow the pattern: `delivery/<coordinator_run_id>/<index>-<slug>`

### Phase 1 — Per-contract delivery (repeat for each contract)

For each contract in the execution order determined in Phase 0 (or once when `mode=SINGLE`):

**1a. Branch checkout (only when `branches=true`)**
- before starting work on a contract, check out its designated branch:
  - if the branch does not exist yet, create it from the determined branch point:
    `git checkout -b <branch_name> <branch_point>`
  - if the branch already exists (e.g. from a retry), check it out:
    `git checkout <branch_name>`
- update the manifest entry with the branch name

**1. Initialize run**
- create a new run directory under `.harness/runs/`
- if operating from a contract file (MULTI mode or `task_file`):
  - `python3 .harness/bin/pipeline.py start --mode delivery --task-file <contract_file> [--parent-run ... --source-kind ... --source-artifact ...]`
- otherwise:
  - `python3 .harness/bin/pipeline.py start --mode delivery --task <task> [--parent-run ... --source-kind ... --source-artifact ...]`
- in MULTI mode, set `--parent-run <coordinator_run_id>` and `--source-kind multi_contract`
- update the manifest entry with the new `run_dir`

**2. Intake and planning**
- use the `Delivery Supervisor` agent
- restate the task into explicit requirements and acceptance criteria
- identify likely relevant files
- write:
  - `TASK.md`
  - `PLAN.md`

**3. Implementation**
- delegate implementation to the `Delivery Coder` agent
- keep context focused on relevant files
- before substantial edits, prefer a brief plan

**4. Specific review loop**
- delegate review to the `Delivery Reviewer` agent
- iterate coder/specific-reviewer until one of the following is true:
  - review verdict is `APPROVE`
  - max review rounds configured by the pipeline is reached

**5. Diff-aware second pass**
- once a meaningful diff exists, delegate to the `Delivery Diff Planner`
- ground the second plan in:
  - `PATCH.diff`
  - review findings
  - current test/build state
- write `SECOND_PASS_PLAN.md` if remediation or scope tightening is needed

**6. QA validation**
- delegate validation to the `Delivery QA` agent

**7. Broad review**
- only after QA verdict is `PASS`, delegate review to the `Delivery Broad Reviewer`
- assess higher-level concerns such as:
  - software design quality
  - maintainability/extensibility
  - repo pattern alignment
  - longer-term implications
  - potential impact on adjacent areas

**8. Verification stack**
- use `python3 .harness/bin/pipeline.py` to:
  - capture diff
  - run configured test/build intents as needed
  - write `POLICY_REPORT.json`
- delegate to:
  - `Delivery Build Verifier`
  - `Delivery Breaker`
  - `Delivery Evaluator`
  - `Delivery Regression Detector`
- require the breaker to ground findings in the real diff and to prefer concrete falsification attempts over generic critique
- re-run `python3 .harness/bin/pipeline.py evaluate --run-dir <run_dir>` after breaker/regression outputs exist

**9. Breaker follow-on handling**
- if the breaker raises actionable `BLOCKER` or `IMPORTANT` findings:
  - do **not** default to same-run patch churn
  - delegate to `Development Contract Producer` using `BREAKER_REPORT.md` as primary input
  - write `BREAKER_FOLLOW_ON_CONTRACT.md`
  - start a **brand-new** delivery run from that contract:
    - `python3 .harness/bin/pipeline.py start --mode delivery --task-file <run_dir>/BREAKER_FOLLOW_ON_CONTRACT.md --parent-run <current_run_id> --source-kind breaker_follow_on --source-artifact <run_dir>/BREAKER_REPORT.md`
  - record the linkage:
    - `python3 .harness/bin/pipeline.py record-follow-on --run-dir <current_run_dir> --new-run-dir <new_run_dir> --reason breaker_follow_on --source-artifact <run_dir>/BREAKER_REPORT.md`
- only stay in the same run if a human explicitly overrides this policy

**10. Run ledger distillation**
- delegate to the `Run Ledger Curator`
- write `RUN_LEDGER.md` with only the highest-signal decisions, tradeoffs, failures, and reusable learnings
- publish the ledger using:
  - `python3 .harness/bin/pipeline.py publish-ledger --run-dir <run_dir>`

**11. Bounded remediation loop**
- use same-run remediation only for non-breaker failures such as:
  - QA verdict is `FAIL`
  - build status is `FAIL`
  - policy validation fails
  - eval score is below threshold
  - regression severity is `HIGH` or `CRITICAL`
- then:
  - run `python3 .harness/bin/pipeline.py prepare-retry --run-dir <run_dir>`
  - update `SECOND_PASS_PLAN.md`
  - return only the cited failures to the `Delivery Coder`
  - perform focused remediation
  - repeat verification within configured retry limits

**11b. Commit contract work (only when `branches=true`)**
- after the contract's delivery loop completes (pass or fail):
  - stage and commit all changes on the contract's branch
  - commit message: `delivery(<slug>): <one-line summary>`
  - update the manifest entry `status` to `completed` or `failed`
- do **not** merge into `base_branch` yet — merging happens in Phase 2

### Phase 2 — Branch reconciliation (MULTI + branches=true only)

Skip this phase when `mode=SINGLE` or `branches=false`.

**12a. Dependency discovery and branch restructuring**

During execution, the orchestrator may discover that a contract depends on another contract
that was not captured in the original dependency graph. When this happens:

- update the dependency graph in `MULTI_MANIFEST.json`
- if the dependent contract's branch was already created from the wrong branch point:
  1. check out the dependent contract's branch
  2. rebase it onto the correct parent branch:
     `git rebase --onto <correct_parent_branch> <old_branch_point> <dependent_branch>`
  3. if the rebase produces conflicts, pause and report to the user with:
     - the conflicting files
     - the contract pair involved
     - a recommended resolution strategy
  4. record the restructuring in the manifest: `"restructured": true, "restructured_reason": "..."`
- if the dependent contract has not started yet, simply update its branch point in the manifest

**12b. Integration verification**

After all contracts have completed:

- for each contract branch, in dependency order:
  - merge the branch into its parent (or `base_branch` for root contracts):
    `git merge --no-ff <contract_branch> -m "merge: delivery(<slug>)"`
  - if merge conflicts occur, report to the user with conflicting files and contract context
  - run the build/test intents against the merged state to verify integration:
    `python3 .harness/bin/pipeline.py run --run-dir <coordinator_run_dir> --intent build`
  - if integration tests fail, record the failure and report which contracts conflict

**12c. Final merge to base branch**

- once all contract branches are successfully integrated:
  - ensure `base_branch` is checked out
  - perform the final merge(s) in dependency order
  - run a final build/test pass on `base_branch`
- if any merge or test fails, stop and report — do not force-merge

### Phase 3 — Finalize

**13. Finalize**
- end with a concise final summary grounded in produced artifacts
- if a breaker follow-on run was created, include its run id and contract path
- in MULTI mode, include:
  - the coordinator run id
  - per-contract status, run id, and branch name (if applicable)
  - integration verification result
  - final merge status (if `branches=true`)

## Branch management

When `branches=true` and `mode=MULTI`, the following invariants apply:

1. **One branch per contract.** Branch names: `delivery/<coordinator_run_id>/<index>-<slug>`
2. **Branch point follows dependencies.** Independent contracts branch from `base_branch`. Dependent contracts branch from their parent contract's branch.
3. **Late-discovered dependencies trigger restructuring.** If during execution a contract is found to depend on another that was not in the original graph, the orchestrator must rebase the dependent branch onto the correct parent. This is the only acceptable use of rebase in this workflow.
4. **No force-push.** All branch operations are local. If branches have been pushed, restructuring requires user confirmation.
5. **Merge order follows the DAG.** Leaf contracts merge first (into their parent branch), root contracts merge last (into `base_branch`).
6. **Conflict resolution is manual.** The orchestrator reports conflicts to the user and pauses. It does not auto-resolve merge conflicts.
7. **Failed contracts block their dependents.** If a contract fails its delivery loop, dependent contracts are not started. The orchestrator reports the blocked contracts and asks the user how to proceed.

## VALIDATION

Before completion, verify:
- a run directory was created (per contract in MULTI mode)
- `TASK.md` and `PLAN.md` exist (per contract)
- coding, specific review, QA, broad review, build verification, breaker, evaluation, regression detection, and ledger curation were all invoked (per contract)
- retry loops never exceeded configured limits
- verification/artifact collection used the pipeline runner
- eval score and threshold are explicit
- breaker findings either produced a follow-on run or were explicitly waived by a human
- final summary reflects actual outcomes
- in MULTI mode:
  - `MULTI_MANIFEST.json` exists in the coordinator run directory and reflects final state
  - all contracts reached a terminal status (`completed` or `failed`)
  - if `branches=true`: branch structure matches the dependency graph, integration verification passed, and final merge status is recorded

## OUTPUT

Produce:
- active run directory under `.harness/runs/` (per contract; plus coordinator dir in MULTI mode)
- delivery artifacts generated by the pipeline (per contract)
- `BUILD_VERIFICATION.md`
- `BREAKER_REPORT.md`
- `RUN_LEDGER.md`
- `POLICY_REPORT.json`
- `EVAL_REPORT.json`
- `REGRESSION_REPORT.json`
- published ledger entry under `.harness/ledgers/`
- `SECOND_PASS_PLAN.md` when retries or scope tightening occurred
- `BREAKER_FOLLOW_ON_CONTRACT.md` and `FOLLOW_ON_RUN.json` when breaker findings spawn a new run
- in MULTI mode:
  - `MULTI_MANIFEST.json` in the coordinator run directory
  - per-contract child run directories and artifacts
- concise final summary including:
  - verdict (per contract; aggregate in MULTI mode)
  - changed files
  - tests run
  - specific review status
  - QA status
  - broad review status
  - build status
  - breaker status
  - eval status
  - regression status
  - ledger publish status
  - follow-on run status, if any
  - unresolved caveats, if any
  - in MULTI mode: per-contract verdicts, branch names (if applicable), integration result, merge status

## ACCEPTANCE

Complete only if:
- the Delivery Supervisor coordinated the workflow (per contract)
- context remained narrow and task-scoped
- coder/specific-reviewer loop ran until approval or configured cap (per contract)
- QA validation was performed (per contract)
- broad review was performed only after QA passed (per contract)
- verification used `python3 .harness/bin/pipeline.py`
- build verification was performed (per contract)
- adversarial breaker pass was performed (per contract)
- breaker-raised issues were converted into a fresh delivery run by default
- evaluation was performed and met threshold or was explicitly blocked (per contract)
- no blocking regression remained (per contract)
- a run ledger was curated and published (per contract)
- any failures were either resolved or explicitly documented
- final summary is evidence-backed
- in MULTI mode:
  - task was decomposed via the Prompt Decomposer
  - each contract was executed as an independent delivery run
  - `MULTI_MANIFEST.json` reflects the final state of all contracts
  - if `branches=true`: branch structure is consistent with the dependency graph, integration was verified, and merge status is explicit
