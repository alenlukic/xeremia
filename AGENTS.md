# dj-tools Agent Guide

This repository uses a deterministic **agentic product-development harness**.

The harness is not only for code generation. It supports:
- scoped delivery work
- adversarial verification with specialized breaker lanes
- stakeholder and customer-perspective feedback loops
- split product and technical SME critique
- interactive pre-implementation thought partnering across design, product, and technical domains
- durable recommendation registry for repeated feedback
- durable run ledgers and ledger index rebuilds
- ledger-driven documentation upkeep and memory sync
- lightweight state-machine and schedule scaffolding
- token-aware context packaging
- quality scoring via rubric, module scorecards, and durable findings registry

## Repository

dj-tools is a Python toolkit for DJ library management: ingestion, feature extraction,
harmonic mixing analysis, metadata hydration, and an interactive CLI assistant.
Backed by PostgreSQL via SQLAlchemy.

## Getting Oriented

| What | Where |
|---|---|
| Harness index | [.harness/INDEX.md](.harness/INDEX.md) |
| Operating principles | [.harness/knowledge/docs/core-beliefs.md](.harness/knowledge/docs/core-beliefs.md) |
| Harness knowledge base | [.harness/knowledge/docs/index.md](.harness/knowledge/docs/index.md) |
| Harness engine | [.harness/README.md](.harness/README.md) |
| Human operator guide | [HUMANS.md](HUMANS.md) |
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Workflows | [docs/WORKFLOWS.md](docs/WORKFLOWS.md) |
| Conventions | [docs/CONVENTIONS.md](docs/CONVENTIONS.md) |
| Golden principles | [docs/golden-principles.md](docs/golden-principles.md) |
| State machine | [.harness/control/state_machine/STATE_MACHINE.yaml](.harness/control/state_machine/STATE_MACHINE.yaml) |
| Schedules | [.harness/control/schedules/SCHEDULES.yaml](.harness/control/schedules/SCHEDULES.yaml) |
| Token efficiency guide | [.harness/knowledge/docs/token-efficiency.md](.harness/knowledge/docs/token-efficiency.md) |
| Quality rubric & findings | [.harness/knowledge/docs/quality/](.harness/knowledge/docs/quality/) |

## Agent Naming Convention

Agent files use a **role-prefix** naming scheme so that related agents sort together and their responsibility category is immediately visible.

| Prefix | Category | Responsibility |
|---|---|---|
| `coord-` | Coordination | Orchestration, scope control, breaker stack management |
| `spec-` | Specification | Contracts, ledgers, PR descriptions, diff planning |
| `dev-` | Development | Implementation and structural coding |
| `test-` | Testing & verification | Reviews, QA, build checks, breakers, evaluators, regression |
| `sme-` | SME & research | Product/technical red teams, design critique, research, interactive thought partnering |
| `maint-` | Maintenance | Refactors, comment scrubbing, post-maintenance review |
| `meta-` | Harness governance | Bad-state detection, doc/memory/registry stewardship |

## Contract Storage Convention

Durable development contracts live under `.harness/workspace/contracts/YYYY-MM-DD/`.
Outstanding contracts are tracked in `.harness/workspace/contracts/INDEX.md` and `.harness/workspace/contracts/INDEX.json`.

## Execution Contract

The execution contract (DEVDSL-1.1) is defined in [.harness/knowledge/docs/core-beliefs.md](.harness/knowledge/docs/core-beliefs.md).

Primary instruction surfaces:
- repo map and workflow triggers: `AGENTS.md`
- rules: `.harness/control/rules/` (symlinked to `.cursor/rules/` for Cursor via `.harness/control/bin/setup.sh`)
- Claude Code project memory: `CLAUDE.md`

Repo-local harness engine:
- allowed commands + policy: [.harness/control/pipeline.yaml](.harness/control/pipeline.yaml)
- pipeline runner: `python3 .harness/control/bin/pipeline.py`
- IDE bootstrap: `bash .harness/control/bin/setup.sh`

## Delegation Rule

When running any pipeline, you are the **orchestrator**.

Each step that names an agent must be delegated via `Task(subagent_type="<Agent Display Name>")`.
Do not quietly absorb specialist work into the orchestrator role.

Examples:
- `Task(subagent_type="Coord Delivery Supervisor")`
- `Task(subagent_type="Dev Delivery Coder")`
- `Task(subagent_type="Test Delivery QA")`

## Operating Model

The default system has **six loops**:

1. **Thought partner loop** (pre-implementation)
   - interactive design / product / technical thought partnering → recommendations → contract producer
2. **Delivery loop**
   - contract normalization → supervisor (planning + execution DAG) → coder → review → QA → broad review → verification
3. **Adversarial verification loop**
   - build verifier → bad state monitor → breaker orchestrator → specialist breakers → evaluator/regression
4. **Stakeholder feedback loop** (post-implementation)
   - design red team → customer persona tester → product SME → technical SME → registry sync → contract producer
5. **Learning loop**
   - every meaningful run distills a compact `RUN_LEDGER.md` and can publish it into `.harness/history/ledgers/`
6. **Memory/documentation loop**
   - ledger-driven doc sync and memory sync keep docs, manifests, indexes, persona guidance, and registry summaries current

## Agent Roles

### Coordination agents (`coord-`)

| Agent | File | Role |
|---|---|---|
| Coord Delivery Supervisor | [.harness/spec/agents/coord-delivery-supervisor.md](.harness/spec/agents/coord-delivery-supervisor.md) | Orchestration, scope control, flow management |
| Coord Quick Follow Supervisor | [.harness/spec/agents/coord-quick-follow-supervisor.md](.harness/spec/agents/coord-quick-follow-supervisor.md) | Fast, narrow fix coordination for targeted post-delivery issues |
| Coord Breaker Orchestrator | [.harness/spec/agents/coord-breaker-orchestrator.md](.harness/spec/agents/coord-breaker-orchestrator.md) | Runs and consolidates the breaker stack |

### Specification agents (`spec-`)

| Agent | File | Role |
|---|---|---|
| Spec Contract Producer | [.harness/spec/agents/spec-contract-producer.md](.harness/spec/agents/spec-contract-producer.md) | Normalize prose/reports/contracts into DEVDSL-ready development contracts |
| Spec Ledger Curator | [.harness/spec/agents/spec-ledger-curator.md](.harness/spec/agents/spec-ledger-curator.md) | Distill key decisions, failures, and reusable learnings |
| Spec PR Description | [.harness/spec/agents/spec-pr-description.md](.harness/spec/agents/spec-pr-description.md) | Branch PR descriptions |
| Spec Change Summarizer | [.harness/spec/agents/spec-change-summarizer.md](.harness/spec/agents/spec-change-summarizer.md) | Merge-commit summaries |
| Spec Diff Planner | [.harness/spec/agents/spec-diff-planner.md](.harness/spec/agents/spec-diff-planner.md) | Second-pass planning from real diff + failures |

### Development agents (`dev-`)

| Agent | File | Role |
|---|---|---|
| Dev Delivery Coder | [.harness/spec/agents/dev-delivery-coder.md](.harness/spec/agents/dev-delivery-coder.md) | Implementation with narrow patches |
| Dev Restructure Coder | [.harness/spec/agents/dev-restructure-coder.md](.harness/spec/agents/dev-restructure-coder.md) | Scoped structural improvement |

### Testing and verification agents (`test-`)

| Agent | File | Role |
|---|---|---|
| Test Delivery Reviewer | [.harness/spec/agents/test-delivery-reviewer.md](.harness/spec/agents/test-delivery-reviewer.md) | Diff-focused correctness review |
| Test Delivery Broad Reviewer | [.harness/spec/agents/test-delivery-broad-reviewer.md](.harness/spec/agents/test-delivery-broad-reviewer.md) | Design and maintainability review |
| Test Delivery QA | [.harness/spec/agents/test-delivery-qa.md](.harness/spec/agents/test-delivery-qa.md) | Requirement-trace validation and manual/runtime checks |
| Test Build Verifier | [.harness/spec/agents/test-build-verifier.md](.harness/spec/agents/test-build-verifier.md) | Build/runtime health verification |
| Test Breaker Spec | [.harness/spec/agents/test-breaker-spec.md](.harness/spec/agents/test-breaker-spec.md) | Finds spec/contract mismatches |
| Test Breaker Tests | [.harness/spec/agents/test-breaker-tests.md](.harness/spec/agents/test-breaker-tests.md) | Finds false-green test confidence |
| Test Breaker Security | [.harness/spec/agents/test-breaker-security.md](.harness/spec/agents/test-breaker-security.md) | Finds nearby security/trust-boundary regressions |
| Test Delivery Evaluator | [.harness/spec/agents/test-delivery-evaluator.md](.harness/spec/agents/test-delivery-evaluator.md) | Quality scoring and completion gating |
| Test Regression Detector | [.harness/spec/agents/test-regression-detector.md](.harness/spec/agents/test-regression-detector.md) | Detect unintended drift and adjacent risk |
| Test Design QA | [.harness/spec/agents/test-design-qa.md](.harness/spec/agents/test-design-qa.md) | Verifies design/visual contract items were implemented to standard |
| Test Customer Persona | [.harness/spec/agents/test-customer-persona.md](.harness/spec/agents/test-customer-persona.md) | Exercises core workflows from target customer perspective |

### SME and research agents (`sme-`)

| Agent | File | Role |
|---|---|---|
| SME Product Red Team | [.harness/spec/agents/sme-product-red-team.md](.harness/spec/agents/sme-product-red-team.md) | Repo-aware customer, market, and workflow critic |
| SME Technical Red Team | [.harness/spec/agents/sme-technical-red-team.md](.harness/spec/agents/sme-technical-red-team.md) | Architecture and implementation strategist |
| SME Research Analyst | [.harness/spec/agents/sme-research-analyst.md](.harness/spec/agents/sme-research-analyst.md) | Read-only codebase research |
| SME Design Red Team | [.harness/spec/agents/sme-design-red-team.md](.harness/spec/agents/sme-design-red-team.md) | UI/UX and workflow critique with acceptance-ready recommendations |
| SME Design Perfectionist | [.harness/spec/agents/sme-design-perfectionist.md](.harness/spec/agents/sme-design-perfectionist.md) | Craft-focused design critic with real-world references |
| SME Design Thought Partner | [.harness/spec/agents/sme-design-thought-partner.md](.harness/spec/agents/sme-design-thought-partner.md) | Interactive pre-implementation design ideation and refinement |
| SME Product Thought Partner | [.harness/spec/agents/sme-product-thought-partner.md](.harness/spec/agents/sme-product-thought-partner.md) | Interactive pre-implementation product strategy and scoping |
| SME Technical Thought Partner | [.harness/spec/agents/sme-technical-thought-partner.md](.harness/spec/agents/sme-technical-thought-partner.md) | Interactive pre-implementation architecture and approach exploration |

### Maintenance agents (`maint-`)

| Agent | File | Role |
|---|---|---|
| Maint Coder | [.harness/spec/agents/maint-coder.md](.harness/spec/agents/maint-coder.md) | Scoped refactors and hygiene |
| Maint Comment Scrubber | [.harness/spec/agents/maint-comment-scrubber.md](.harness/spec/agents/maint-comment-scrubber.md) | Remove non-useful comments |
| Maint Reviewer | [.harness/spec/agents/maint-reviewer.md](.harness/spec/agents/maint-reviewer.md) | Post-maintenance review |

### Harness governance agents (`meta-`)

| Agent | File | Role |
|---|---|---|
| Meta Bad State Monitor | [.harness/spec/agents/meta-bad-state-monitor.md](.harness/spec/agents/meta-bad-state-monitor.md) | Detect loops, scope blowups, artifact mismatch, token/context pressure |
| Meta Ledger Doc Steward | [.harness/spec/agents/meta-ledger-doc-steward.md](.harness/spec/agents/meta-ledger-doc-steward.md) | Update docs/structure/persona guidance from published ledgers |
| Meta Memory Sync Steward | [.harness/spec/agents/meta-memory-sync-steward.md](.harness/spec/agents/meta-memory-sync-steward.md) | Align ledgers, persona guidance, registry summaries, and memory indexes |
| Meta Registry Steward | [.harness/spec/agents/meta-registry-steward.md](.harness/spec/agents/meta-registry-steward.md) | Consolidates repeated stakeholder findings into durable registry |

### Prompt utility agents

| Agent | File | Role |
|---|---|---|
| Prompt Decomposer | [.harness/spec/agents/prompt-decomposer.md](.harness/spec/agents/prompt-decomposer.md) | Decompose complex DEVDSL prompts into minimal child prompts |

## Commands

Commands live in `.harness/spec/commands/`.
In Cursor they are available as slash commands via the `.cursor/commands/` symlink (created by `.harness/control/bin/setup.sh`).
In Claude Code and Codex, load the command file directly as a prompt.

| Command | File | Slash command |
|---|---|---|
| Delivery pipeline | [run-delivery-pipeline.md](.harness/spec/commands/run-delivery-pipeline.md) | `/run-delivery-pipeline` |
| Quick follow | [run-quick-follow.md](.harness/spec/commands/run-quick-follow.md) | `/run-quick-follow` |
| Verification stack | [run-verification-stack.md](.harness/spec/commands/run-verification-stack.md) | `/run-verification-stack` |
| Breaker follow-on | [run-breaker-followup.md](.harness/spec/commands/run-breaker-followup.md) | `/run-breaker-followup` |
| Product feedback loop | [run-product-feedback-loop.md](.harness/spec/commands/run-product-feedback-loop.md) | `/run-product-feedback-loop` |
| Maintenance pipeline | [run-maintenance-pipeline.md](.harness/spec/commands/run-maintenance-pipeline.md) | `/run-maintenance-pipeline` |
| Restructure pipeline | [run-restructure-pipeline.md](.harness/spec/commands/run-restructure-pipeline.md) | `/run-restructure-pipeline` |
| Contract producer | [run-spec-contract-producer.md](.harness/spec/commands/run-spec-contract-producer.md) | `/run-spec-contract-producer` |
| PR description | [run-spec-pr-description.md](.harness/spec/commands/run-spec-pr-description.md) | `/run-spec-pr-description` |
| Change summarizer | [run-spec-change-summarizer.md](.harness/spec/commands/run-spec-change-summarizer.md) | `/run-spec-change-summarizer` |
| Prompt decomposer | [run-prompt-decomposer.md](.harness/spec/commands/run-prompt-decomposer.md) | `/run-prompt-decomposer` |
| Design QA | [run-test-design-qa.md](.harness/spec/commands/run-test-design-qa.md) | `/run-test-design-qa` |
| Customer persona | [run-test-customer-persona.md](.harness/spec/commands/run-test-customer-persona.md) | `/run-test-customer-persona` |
| Product SME red team | [run-sme-product-red-team.md](.harness/spec/commands/run-sme-product-red-team.md) | `/run-sme-product-red-team` |
| Technical SME red team | [run-sme-technical-red-team.md](.harness/spec/commands/run-sme-technical-red-team.md) | `/run-sme-technical-red-team` |
| Design red team | [run-sme-design-red-team.md](.harness/spec/commands/run-sme-design-red-team.md) | `/run-sme-design-red-team` |
| Design perfectionist | [run-sme-design-perfectionist.md](.harness/spec/commands/run-sme-design-perfectionist.md) | `/run-sme-design-perfectionist` |
| Research | [run-sme-research.md](.harness/spec/commands/run-sme-research.md) | `/run-sme-research` |
| Design thought partner | [run-sme-design-thought-partner.md](.harness/spec/commands/run-sme-design-thought-partner.md) | `/run-sme-design-thought-partner` |
| Product thought partner | [run-sme-product-thought-partner.md](.harness/spec/commands/run-sme-product-thought-partner.md) | `/run-sme-product-thought-partner` |
| Technical thought partner | [run-sme-technical-thought-partner.md](.harness/spec/commands/run-sme-technical-thought-partner.md) | `/run-sme-technical-thought-partner` |
| Registry sync | [run-meta-registry-sync.md](.harness/spec/commands/run-meta-registry-sync.md) | `/run-meta-registry-sync` |
| Ledger doc sync | [run-meta-ledger-doc-sync.md](.harness/spec/commands/run-meta-ledger-doc-sync.md) | `/run-meta-ledger-doc-sync` |
| Memory sync | [run-meta-memory-sync.md](.harness/spec/commands/run-meta-memory-sync.md) | `/run-meta-memory-sync` |
| Harness bootstrap | [run-harness-bootstrap.md](.harness/spec/commands/run-harness-bootstrap.md) | `/run-harness-bootstrap` |

## Run Artifacts

Run artifacts live under `.harness/history/runs/<run_id>/`.

Core delivery artifacts:
- `INPUT_BUNDLE.md`
- `CONTRACT_SET.md`
- `TASK.md`
- `PLAN.md`
- `EXECUTION_DAG.md`
- `EXECUTION_DAG.json`
- `RUN_META.json`
- `PATCH.diff`
- `TEST_REPORT.json`
- `REVIEW_NOTES.md`
- `QA_REPORT.md`
- `BUILD_VERIFICATION.md`
- `BAD_STATE_REPORT.md`
- `BREAKER_SPEC_REPORT.md`
- `BREAKER_TEST_REPORT.md`
- `BREAKER_SECURITY_REPORT.md`
- `BREAKER_REPORT.md`
- `POLICY_REPORT.json`
- `EVAL_REPORT.json`
- `REGRESSION_REPORT.json`
- `CONTEXT_MANIFEST.json`
- `RUN_LEDGER.md`

Thought-partner artifacts:
- `DESIGN_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- `PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- `TECHNICAL_THOUGHT_PARTNER_RECOMMENDATIONS.md`

Product-feedback artifacts:
- `DESIGN_PERFECTIONIST_REVIEW.md`
- `DESIGN_QA_REPORT.md`
- `DESIGN_RECOMMENDATIONS.md`
- `CUSTOMER_PERSONA_FEEDBACK.md`
- `PRODUCT_SME_RECOMMENDATIONS.md`
- `TECHNICAL_SME_RECOMMENDATIONS.md`
- `RECOMMENDATION_REGISTRY_SYNC.md`
- `.harness/workspace/product-feedback/RECOMMENDATION_REGISTRY.json`
- `.harness/workspace/product-feedback/RECOMMENDATION_REGISTRY.md`
- `DEVELOPMENT_CONTRACT.md`
- `BREAKER_FOLLOW_ON_CONTRACT.md`
- `FOLLOW_ON_RUN.json`

Retry / remediation artifacts:
- `SECOND_PASS_PLAN.md`
- `RETRY_TASK.md`
- `RETRY_LOG.jsonl`

## Long-term Memory Surfaces

Persistent knowledge surfaces:
- `.harness/history/ledgers/INDEX.json`
- `.harness/history/ledgers/INDEX.md`
- published ledgers in `.harness/history/ledgers/`
- `.harness/workspace/product-feedback/RECOMMENDATION_REGISTRY.json`
- `.harness/workspace/product-feedback/RECOMMENDATION_REGISTRY.md`
- `.harness/workspace/product-feedback/CUSTOMER_PERSONA_SPEC.md`
- `.harness/workspace/contracts/INDEX.json`
- `.harness/workspace/contracts/INDEX.md`
- `.harness/control/state_machine/STATE_MACHINE.yaml`
- `.harness/control/schedules/SCHEDULES.yaml`

## Default policy

- Prefer the smallest coherent task.
- Prefer follow-on runs over same-run scope explosion.
- Prefer concrete falsification over rhetorical criticism.
- Prefer ledgers that capture durable signal rather than transcripts.
- Prefer narrow doc/memory updates backed by repeated evidence.
- Prefer diff-first and ledger-first context packaging over dumping large file sets into context.

### Breaker follow-on policy

The breaker is not just a reviewer.
If it raises actionable issues after the verification phase, the default policy is:

`BREAKER_REPORT.md` → `Spec Contract Producer` → brand-new delivery run

Do not silently fold breaker findings into the original run unless a human explicitly overrides that policy.
This preserves auditability and keeps adversarial findings first-class.

### Customer persona testing policy

Run the `Test Customer Persona` agent only after the candidate build is credible enough to evaluate from a customer perspective.
Default minimum bar:
- QA verdict `PASS`
- build verification `PASS`
- breaker has no unresolved `BLOCKER`

### Design QA verification policy

Run the `Test Design QA` agent after implementation whenever the task originated from a design contract, a `DESIGN_PERFECTIONIST_REVIEW.md`, or a `DESIGN_RECOMMENDATIONS.md` with visual/UI acceptance criteria.

The Test Design QA verdict gates completion the same way Test Delivery QA does:
- `FAIL` triggers remediation or a follow-on contract
- `PASS_WITH_NOTES` is acceptable when all P0/P1 items pass

If the verifier fails, feed the failed items back through the `Spec Contract Producer` for a remediation contract rather than silently patching.

### Ledger policy

Every meaningful run should produce a compact `RUN_LEDGER.md`.
A good ledger captures:
- key decisions
- important tradeoffs
- verification blind spots
- customer/product learnings that will matter later
- durable repo guidance

It should not capture every step or reasoning trace.

### Doc-sync policy

Run ledger doc sync on a batch cadence.
Typical triggers:
- weekly
- after ~5 meaningful ledgers
- when the same confusion/pitfall shows up repeatedly

Allowed surfaces include:
- repo docs
- harness docs
- manifests/indexes/catalogs
- `.harness/workspace/product-feedback/` persona guidance

## Repo State and Bootstrap

The harness includes a repo-aware bootstrap and docs-sync system under `.harness/knowledge/state/` and `.harness/control/bin/bootstrap.py`.

| What | Where |
|---|---|
| Repo profile | `.harness/knowledge/state/repo-profile.yaml` |
| Raw inventory | `.harness/knowledge/state/repo-inventory.json` |
| Module map | `.harness/knowledge/state/module-map.yaml` |
| Command registry | `.harness/knowledge/state/command-registry.json` |
| Docs sync state | `.harness/knowledge/state/docs-sync-state.json` |
| Pending doc updates | `.harness/knowledge/state/pending-doc-updates.yaml` |
| Open findings | `.harness/knowledge/docs/quality/findings/open-items.yaml` |
| Bootstrap tool | `python3 .harness/control/bin/bootstrap.py scan` |

If `.harness/knowledge/state/` is missing or stale, run:
`python3 .harness/control/bin/bootstrap.py scan`

Keep `.harness/history/ledgers/`, `.harness/workspace/contracts/`, and `.harness/workspace/product-feedback/` committed so durable learnings travel with the repo.

## dj-tools Knowledge Base

| Document | Purpose |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Domain map, layering, dependency rules |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md) | Ingestion, metadata, mixing, and UI workflows |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | Coding conventions and patterns |
| [docs/golden-principles.md](docs/golden-principles.md) | Opinionated rules for agent consistency |
| [docs/conventions/devdsl-macros.md](docs/conventions/devdsl-macros.md) | DEVDSL macro reference |
| [docs/conventions/agent-contract-template.md](docs/conventions/agent-contract-template.md) | Agent prompt contract pattern |
| [docs/quality/QUALITY_SCORE.md](docs/quality/QUALITY_SCORE.md) | Per-module quality grades |
| [docs/quality/tech-debt-tracker.md](docs/quality/tech-debt-tracker.md) | Known technical debt |
| [docs/references/index.md](docs/references/index.md) | External dependency guides |

## Anti-Drift

- Keep working context narrow
- Prefer diff-first review
- Prefer requirement-trace QA
- Prefer artifact handoff over re-deriving context
- Do not broaden scope without declaring it under SCOPE_LOCK
