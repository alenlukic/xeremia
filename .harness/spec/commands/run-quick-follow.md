# Run Quick Follow

DEVDSL-1
MODE: STRICT
FLAGS: SCOPE_LOCK(explicit) TEST_GATE(narrow)

## COMMAND

Run a targeted quick-follow fix for a localized issue discovered during or after a full delivery pipeline run. Designed for UI polish, small logical bugs, and unintended side effects that are too narrow to justify a full delivery pipeline invocation.

## INPUT

Required:
- one task input via either:
  - `tasks`: prose description of the issue or fix needed
  - `task_files`: path to a development contract

Optional:
- `parent_run`: run id of the originating delivery run
- `source_artifact`: path to a run artifact for additional context (e.g. `PLAN.md`, `TASK.md`, `RUN_LEDGER.md`, `BREAKER_REPORT.md`, `PATCH.diff`)

## SCOPE

Execute one narrow, fast fix cycle. Do not expand scope. Do not invoke the full verification stack, breaker lanes, or broad review.

If the orchestrator determines the task is too large or risky for a quick follow, it must surface a scope warning and wait for explicit user override before proceeding.

## DELEGATION

Each numbered step that names an agent must be delegated via `Task(subagent_type="<Agent Name>")`.
You are the orchestrator — do not perform agent work directly.
Pass the run directory path and relevant artifacts as context to each subagent.

## DO

1. Initialize run
- `python3 .harness/control/bin/pipeline.py start --mode quick-follow --task "<brief task summary>" [--parent-run ... --source-artifact ...]`

2. Delegate to `Coord Quick Follow Supervisor`
- pass all input: prose task or contract, plus any optional parent-run artifacts
- the supervisor will:
  - assess scope and risk; surface a warning if the change is too large
  - stop and wait for user override if a scope warning is raised
  - if scope is acceptable (or override is given): coordinate `Dev Delivery Coder` → `Test Delivery Reviewer` → `Test Delivery QA`
  - produce `TASK.md`, `PLAN.md`, `REVIEW_NOTES.md`, `QA_REPORT.md`

3. Finalize
- end with a concise summary grounded in produced artifacts
- if the supervisor verdict is `ESCALATED`, report that the task should be handled by a full delivery pipeline run

## ACCEPTANCE

Complete only if:
- scope was assessed before any implementation began
- `TASK.md`, `PLAN.md`, `REVIEW_NOTES.md`, and `QA_REPORT.md` exist (unless verdict is `ESCALATED`)
- no scope warning was bypassed without explicit user override
- the run verdict is grounded in real artifacts rather than agent opinion alone
