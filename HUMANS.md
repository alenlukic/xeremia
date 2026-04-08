# Human Operator Guide

## Bottom line

This harness makes agentic development **safer and more productive** by wrapping model-driven work in deterministic gates, adversarial verification, structured feedback loops, and durable memory. You supervise the system; the system handles orchestration, artifact management, and policy enforcement.

The core value proposition: instead of trusting that "tests pass" means a change is correct, the harness layers multiple independent verification strategies -- including agents that actively try to *break* the change -- before anything reaches a merge-ready state. Research on agentic code generation shows that test-only evaluation systematically overestimates patch quality; adversarial test strengthening can reject roughly 20% of patches that pass conventional suites (SWE-ABS, 2026). This harness operationalizes that insight.

You do not need to understand every agent or artifact to use the harness effectively. Start with the quick-start workflow below. Read deeper sections only when you want to understand *why* something works the way it does.

---

## Quick start

### The everyday workflow

```
1. Turn a request into a contract     →  /run-spec-contract-producer
2. Run the delivery pipeline          →  /run-delivery-pipeline
3. Handle breaker findings            →  /run-breaker-followup
4. Get stakeholder feedback           →  /run-product-feedback-loop
5. Capture what you learned           →  (automatic via run ledger)
6. Keep the repo's memory current     →  /run-meta-ledger-doc-sync  or  /run-meta-memory-sync
```

That is the full default loop. Most day-to-day work is steps 1-3.

### Starting a run

```bash
python3 .harness/bin/pipeline.py start --mode delivery --task "Implement X"
```

This creates a timestamped run directory under `.harness/runs/` with all artifact stubs. The delivery pipeline command (`/run-delivery-pipeline`) will do this for you automatically.

### Available modes

| Mode | Use when |
|---|---|
| `delivery` | The repo should change (features, fixes, refactors) |
| `product_feedback` | You want structured critique without code changes |
| `maintenance` | Scoped hygiene: comment cleanup, small refactors |
| `restructure` | Larger structural improvements |

---

## Choosing the right command

| I want to... | Command |
|---|---|
| Ship a code change end-to-end | `/run-delivery-pipeline` |
| Re-verify an existing run (build/test/breaker/eval) | `/run-verification-stack` |
| Turn breaker findings into a new delivery run | `/run-breaker-followup` |
| Get design, customer, and SME critique on a workflow or build | `/run-product-feedback-loop` |
| Run product-market critique only | `/run-sme-product-red-team` |
| Run architecture/implementation critique only | `/run-sme-technical-red-team` |
| Run design/UX critique only | `/run-sme-design-red-team` |
| Simulate the target customer using the product | `/run-test-customer-persona` |
| Consolidate stakeholder findings into the registry | `/run-meta-registry-sync` |
| Turn rough notes or reports into a development contract | `/run-spec-contract-producer` |
| Update docs from recent ledgers | `/run-meta-ledger-doc-sync` |
| Sync memory surfaces (persona, registry, indexes) | `/run-meta-memory-sync` |
| Clean up code hygiene | `/run-maintenance-pipeline` |
| Restructure code organization | `/run-restructure-pipeline` |
| Research the codebase without changing anything | `/run-sme-research` |
| Generate a PR description | `/run-spec-pr-description` |

---

## What to inspect after a run

After a delivery run, look at these artifacts in order:

| Priority | Artifact | What it tells you |
|---|---|---|
| 1 | `TASK.md` + `PLAN.md` | Was the scope right? |
| 2 | `PATCH.diff` | What actually changed? |
| 3 | `BAD_STATE_REPORT.md` | Did the run get stuck or drift? |
| 4 | `BREAKER_REPORT.md` | What could the adversarial agents break? |
| 5 | `EVAL_REPORT.json` | Did it clear the quality gate? |
| 6 | `RUN_LEDGER.md` | What durable learnings were captured? |

After a product-feedback run, look at:

| Priority | Artifact | What it tells you |
|---|---|---|
| 1 | `DESIGN_RECOMMENDATIONS.md` | UX/UI critique |
| 2 | `CUSTOMER_PERSONA_FEEDBACK.md` | Would the target customer succeed? |
| 3 | `PRODUCT_SME_RECOMMENDATIONS.md` | Product-market fit assessment |
| 4 | `TECHNICAL_SME_RECOMMENDATIONS.md` | Architecture and implementation strategy |
| 5 | `RECOMMENDATION_REGISTRY_SYNC.md` | What was added/updated in the durable registry? |
| 6 | `DEVELOPMENT_CONTRACT.md` | Ready-to-execute contract for follow-up |

---

## When to intervene

The harness is designed to run autonomously within its policy envelope. You should intervene at these checkpoints:

- **Large-scope contracts** -- review before execution to confirm scope is appropriate
- **Breaker blockers** -- the breaker found something it considers critical; review before waiving
- **Doc-sync and memory-sync diffs** -- these change the repo's long-term guidance; always review
- **Recurring bad-state findings** -- the run is hitting the same problems repeatedly
- **Out-of-scope changes** -- the agent wants to change something outside the stated contract
- **Scheduled agent jobs** -- deterministic maintenance runs automatically, but agent-driven memory sync should go through PR review

---

## How the harness works

The sections below explain the architecture. Read them when you want to understand *why* the system does what it does, or when you need to customize it.

### Five loops

The harness organizes work into five loops, each with a distinct purpose:

**1. Delivery loop** -- turns a task into a verified patch.

Supervisor → Coder → Reviewer → QA → Broad Reviewer → (hand off to verification)

**2. Adversarial verification loop** -- tries to *falsify* confidence in the patch.

Build Verifier → Meta Bad State Monitor → Coord Breaker Orchestrator → {Spec, Tests, Security} → Evaluator → Regression Detector

This is the key architectural difference from conventional CI. Instead of asking "does the test suite pass?", the verification loop asks "can we *construct a scenario* where this patch fails?" The breaker stack is split into three specialist lanes because different failure modes require different expertise: spec breakers look for contract/requirement violations, test breakers look for false-green confidence, and security breakers look for trust-boundary regressions.

**3. Stakeholder feedback loop** -- structured product critique.

SME Design Red Team → Test Customer Persona → SME Product Red Team → SME Technical Red Team → Registry Sync → Contract Producer

This loop produces artifacts that the Spec Contract Producer can consume directly, avoiding the common failure mode where stakeholder feedback is too vague to act on.

**4. Learning loop** -- captures durable signal.

Each meaningful run produces a compact `RUN_LEDGER.md` that can be published into `.harness/ledgers/`. Ledgers capture key decisions, verification learnings, and repo guidance -- not transcripts.

**5. Memory/documentation loop** -- keeps long-term surfaces current.

Meta Ledger Doc Steward and Meta Memory Sync Steward read recently published ledgers and update docs, persona guidance, registry summaries, and indexes. This prevents knowledge from accumulating only in run directories that nobody reads.

### Adversarial verification: why "tests pass" is not enough

The harness treats adversarial verification as a first-class concern because research consistently shows that test-only evaluation overestimates agent patch quality.

**The false-green problem.** A patch can pass every existing test and still violate the intended semantics of the codebase. SWE-ABS (2026) demonstrated this by building a two-stage test strengthening pipeline -- coverage-driven augmentation plus mutation-driven adversarial testing -- that rejected approximately 20% of patches previously considered "passing" on SWE-bench Verified, meaningfully reshuffling agent leaderboard rankings.

**Adversarial interposition.** SwingArena (2026) operationalizes adversarial evaluation as a structured game: a submitter produces patches, a reviewer generates tests to break them, and explicit quality gates prevent the reviewer from cheating (tests must pass on the golden human patch, must not modify production code, must avoid nondeterminism). Kitchen Loop (2025) describes the broader pattern of interposing adversarial verification *between generation and merge*, rather than treating verification as a passive final step.

**How this harness implements it.** The breaker stack runs three specialist lanes against the real diff:
- **Spec breaker** -- does the change match the stated task and acceptance criteria?
- **Test breaker** -- are there plausible scenarios where the change would fail but existing tests would not catch it?
- **Security breaker** -- does the change introduce or expose trust-boundary problems?

A Coord Breaker Orchestrator consolidates findings, deduplicates, and decides whether findings should produce a follow-on development contract (the default for BLOCKER or IMPORTANT findings) or pass through as watch items.

**Follow-on policy.** When the breaker finds actionable issues, the default is to create a *new* delivery run via the Spec Contract Producer, not to patch-churn within the same run. This keeps adversarial findings first-class and auditable.

### Bad-state detection

Agent runs can degrade in predictable ways: retry loops without progress, scope drift far beyond the stated task, missing or contradictory artifacts, or context-window pressure from carrying too much unrelated material. Research on agentic coding assistants (2025-2026) highlights that these "bad states" waste cost at best and introduce risk at worst -- for example, prompt injection research shows that agents reading from file systems and shell outputs face expanded attack surfaces, motivating defense-in-depth rather than single-monitor trust.

The harness includes a `Meta Bad State Monitor` agent and a deterministic `bad-state-check` runner command. The monitor classifies run health and recommends one of:
- **CONTINUE** -- health is acceptable
- **RETRY_NARROWER** -- the task is viable but the run drifted; retry with a tighter contract
- **SPAWN_FOLLOW_ON** -- the issue should become a fresh contract/run
- **ESCALATE_HUMAN** -- the run is blocked, contradictory, or unsafe to continue

The deterministic check writes `BAD_STATE_REPORT.json` with machine-readable signals (retry cap reached, scope blowup, no test evidence, context pressure), and the evaluation step penalizes runs with high bad-state severity.

### Stakeholder feedback and the recommendation registry

Stakeholder feedback is split into distinct perspectives because role collapse -- one agent trying to be designer, customer advocate, product strategist, and architect simultaneously -- produces vague, unfocused recommendations. The harness separates:

- **SME Design Red Team** -- visual/interaction/workflow critique
- **Test Customer Persona** -- simulates a real user exercising the product
- **SME Product Red Team** -- product-market fit, customer needs, competitive positioning
- **SME Technical Red Team** -- architecture, implementation strategy, technical debt

Each produces a structured artifact with concrete recommendations and acceptance criteria. The Meta Registry Steward then deduplicates findings across runs, tracks how many times each issue has surfaced, and maintains a durable registry (`RECOMMENDATION_REGISTRY.json`) so that repeated findings accumulate evidence rather than being rediscovered from scratch each time.

The Spec Contract Producer converts selected recommendations into DEVDSL-ready contracts that the delivery pipeline can execute directly.

### Run ledgers and long-term memory

The harness adopts a "runs + artifacts + searchable metadata" model that mirrors established patterns from experiment tracking (MLflow Tracking) and observability (OpenTelemetry log correlation). Each run produces ephemeral artifacts in its run directory. The most important learnings are distilled into a compact `RUN_LEDGER.md` using a schema with YAML frontmatter (for machine indexing) and markdown sections (for human readability).

Published ledgers live in `.harness/ledgers/` and are indexed via `INDEX.json` / `INDEX.md`. This makes them searchable and provides low-token context for future runs -- agents can read relevant ledger summaries instead of replaying full run histories, following the memory-tiering approach described in MemGPT research (compact durable summaries rather than full context replay).

Long-term memory surfaces in the harness:

| Surface | Location | Updated by |
|---|---|---|
| Ledger index | `.harness/ledgers/INDEX.json` | `rebuild-ledger-index` runner command |
| Recommendation registry | `.harness/product-feedback/RECOMMENDATION_REGISTRY.json` | Meta Registry Steward agent |
| Customer persona spec | `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md` | SME Product Red Team / persona tester |
| State machine definition | `.harness/state_machine/STATE_MACHINE.yaml` | Manual or restructure pipeline |
| Schedule definitions | `.harness/schedules/SCHEDULES.yaml` | Manual |

### Token efficiency

At scale, token usage is a meaningful cost and latency driver. The harness follows three research-backed strategies:

1. **Diff-first context packing.** Agents receive the diff and task before anything else. Additional context is added only as needed. This avoids the common anti-pattern of dumping the entire repo into context.

2. **Ledger-first memory.** Instead of replaying full run histories, agents receive compact ledger summaries. This follows memory-tiering research (MemGPT) that shows compact durable summaries maintain decision quality while reducing context size substantially.

3. **Stable prompt prefixes.** The harness structures agent prompts so that static content (role definition, execution contract, rules) comes first, followed by variable content (task, diff, artifacts). This maximizes cache hit rates on runtimes that support automatic prompt caching (which can substantially reduce input token costs and latency per OpenAI's caching documentation).

The `context-manifest` runner command writes `CONTEXT_MANIFEST.json` with per-artifact size and heuristic token estimates, making context-budget decisions explicit. The pipeline configuration includes a `soft_context_token_cap` that the bad-state monitor uses to flag context-pressure situations.

### State machine

The harness defines run states and transitions declaratively in `.harness/state_machine/STATE_MACHINE.yaml`. This makes run progress inspectable and prevents out-of-order execution without requiring a heavy workflow-engine dependency.

The design borrows the *model* from two converging orchestration approaches: graph-based LLM workflow engines (LangGraph-style explicit state and transitions) and durable workflow engines (Temporal-style deterministic execution with event histories). The harness gets the inspectability benefits without the operational overhead -- the state machine is a YAML file checked into the repo, and the runner can render it as a Mermaid diagram or infer the current state from existing artifacts.

### Scheduling

The harness supports scheduled/triggered execution via `.harness/schedules/SCHEDULES.yaml`. Jobs are explicitly typed:

| Type | Runs automatically | Human review required | Example |
|---|---|---|---|
| `deterministic` | Yes | No (unless it produces changes) | Ledger index rebuild, registry render, bad-state scan |
| `agent_gated` | Only under supervision | Yes, always | Memory sync |

This split -- deterministic jobs automatically, agent jobs gated behind human review -- reflects the safety constraints from agentic vulnerability research. A sample GitHub Actions workflow can run the deterministic jobs nightly and fail if they produce uncommitted changes, forcing a PR-based review flow.

---

## Configuration reference

### pipeline.yaml

The pipeline configuration lives at `.harness/pipeline.yaml` and controls:

| Section | Purpose |
|---|---|
| `commands` | Repo-specific format/lint/test/build commands |
| `stages` | Ordered agent stages for each mode (delivery, product_feedback, memory) |
| `gates` | Quality thresholds, retry caps, breaker policy, token cap |
| `artifacts` | Required and optional run artifacts |
| `policies` | Forbidden paths, max files changed, max diff lines |
| `retry` | Retry triggers, strategy, and second-pass plan requirement |

### Runner commands

The pipeline runner (`python3 .harness/bin/pipeline.py`) supports:

| Command | Purpose |
|---|---|
| `start --mode <mode> --task "<task>"` | Create a new run directory with artifact stubs |
| `run --run-dir <dir> --intent <intent>` | Execute a command intent (test, build, lint, format) |
| `diff --run-dir <dir>` | Capture current git diff into run artifacts |
| `validate --run-dir <dir>` | Check policy compliance |
| `evaluate --run-dir <dir>` | Compute quality score from all evidence |
| `bad-state-check --run-dir <dir>` | Write bad-state report from run evidence |
| `bad-state-scan --active` | Scan all active runs for bad state |
| `context-manifest --run-dir <dir>` | Write context manifest with token estimates |
| `publish-ledger --run-dir <dir>` | Publish run ledger to `.harness/ledgers/` |
| `rebuild-ledger-index` | Rebuild the ledger index from published ledgers |
| `registry-render` | Re-render recommendation registry markdown |
| `recommendation-summary` | Show current registry summary as JSON |
| `mark-recommendation --id <id> --status <status>` | Update a recommendation's status |
| `state-machine-render` | Render the state machine as a Mermaid diagram |
| `state-machine-check --run-dir <dir>` | Infer current run state from artifacts |
| `schedule-due` | List scheduled jobs that are due |
| `schedule-run --job <id>` | Execute a specific scheduled job |
| `prepare-retry --run-dir <dir> --reason "<reason>"` | Prepare a retry round |
| `record-follow-on --from-run <dir> --to-run <dir>` | Record a follow-on relationship |
| `contract-add --name <name> --path <path> --description "<desc>"` | Add a contract to the index |
| `contract-update --name <name> --status <status>` | Update a contract status |
| `rebuild-contract-index` | Rebuild contract index markdown |

### Key file locations

| File | Purpose |
|---|---|
| `AGENTS.md` | Agent roles, commands, artifacts, and policies (agent-facing) |
| `HUMANS.md` | This file (human-facing) |
| `.harness/pipeline.yaml` | Pipeline configuration |
| `.harness/bin/pipeline.py` | Deterministic runner |
| `.harness/docs/core-beliefs.md` | Execution contract (DEVDSL-1.1) |
| `.harness/docs/token-efficiency.md` | Token efficiency principles |
| `.harness/state_machine/STATE_MACHINE.yaml` | Run state definitions |
| `.harness/schedules/SCHEDULES.yaml` | Scheduled job definitions |
| `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md` | Target customer persona |
| `.harness/product-feedback/RECOMMENDATION_REGISTRY.json` | Durable recommendation registry |

---

## First-time setup

If you are a new team member cloning an already-bootstrapped repo, or need to re-run setup:

| IDE | Setup |
|---|---|
| Cursor | `bash .harness/bin/setup.sh` |
| Claude Code | No setup required |

---

## Human review checkpoints

A human should explicitly review:
1. breaker follow-on contracts before large new runs
2. doc-sync changes before merge
3. changes to the customer persona spec
4. any recommendation set that could change roadmap or product positioning
5. repeated failures suggesting the harness itself needs tuning

---

## Suggested team rhythm

### Per task
- use `/run-delivery-pipeline` for real code work
- publish a run ledger when the run is meaningful

### Weekly or after a meaningful slice of change
- use `/run-product-feedback-loop` on core workflows
- decide whether any recommendations deserve contracts now

### Weekly or biweekly
- use `/run-meta-ledger-doc-sync`

### Monthly
- review the quality of:
  - breaker findings
  - contract quality
  - persona realism
  - recommendation-to-delivery conversion rate
