# dj-tools Agent Guide

This repository uses a deterministic **agentic product-development harness**.

The harness is not only for code generation. It supports:
- scoped delivery work
- adversarial verification
- stakeholder and customer-perspective feedback loops
- durable run ledgers
- ledger-driven documentation upkeep

## Repository

dj-tools is a Python toolkit for DJ library management: ingestion, feature extraction,
harmonic mixing analysis, metadata hydration, and an interactive CLI assistant.
Backed by PostgreSQL via SQLAlchemy.

## Getting Oriented

| What | Where |
|---|---|
| Operating principles | [.harness/docs/core-beliefs.md](.harness/docs/core-beliefs.md) |
| Harness knowledge base | [.harness/docs/index.md](.harness/docs/index.md) |
| Harness engine | [.harness/README.md](.harness/README.md) |
| Human operator guide | [HUMANS.md](HUMANS.md) |
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Workflows | [docs/WORKFLOWS.md](docs/WORKFLOWS.md) |
| Conventions | [docs/CONVENTIONS.md](docs/CONVENTIONS.md) |
| Golden principles | [docs/golden-principles.md](docs/golden-principles.md) |

## Execution Contract

The execution contract (DEVDSL-1.1) is defined in [.harness/docs/core-beliefs.md](.harness/docs/core-beliefs.md).

Primary instruction surfaces:
- repo map and workflow triggers: `AGENTS.md`
- rules: `.harness/rules/` (symlinked to `.cursor/rules/` for Cursor via `.harness/bin/setup.sh`)
- Claude Code project memory: `CLAUDE.md`

Repo-local harness engine:
- allowed commands + policy: [.harness/pipeline.yaml](.harness/pipeline.yaml)
- pipeline runner: `python3 .harness/bin/pipeline.py`
- IDE bootstrap: `bash .harness/bin/setup.sh`

## Delegation Rule

When running any pipeline, you are the **orchestrator**.

Each step that names an agent must be delegated via `Task(subagent_type="<Agent Name>")`.
Do not quietly absorb specialist work into the orchestrator role.

## Operating Model

The default system has **four loops**:

1. **Delivery loop**
   - supervisor → coder → review → QA → build verification → breaker → evaluation/regression

2. **Stakeholder feedback loop**
   - design red team → customer persona tester → SME red team → development contract producer

3. **Learning loop**
   - every meaningful run distills a compact `RUN_LEDGER.md`

4. **Documentation loop**
   - ledger-driven updates keep docs, manifests, indexes, and persona guidance current

## Agent Roles

### Delivery and verification agents

| Agent | File | Role |
|---|---|---|
| Delivery Supervisor | [.harness/agents/delivery-supervisor.md](.harness/agents/delivery-supervisor.md) | Orchestration, scope control, flow management |
| Delivery Coder | [.harness/agents/delivery-coder.md](.harness/agents/delivery-coder.md) | Implementation with narrow patches |
| Delivery Reviewer | [.harness/agents/delivery-reviewer.md](.harness/agents/delivery-reviewer.md) | Diff-focused correctness review |
| Delivery Broad Reviewer | [.harness/agents/delivery-broad-reviewer.md](.harness/agents/delivery-broad-reviewer.md) | Design and maintainability review |
| Delivery QA | [.harness/agents/delivery-qa.md](.harness/agents/delivery-qa.md) | Requirement-trace validation and manual/runtime checks |
| Delivery Build Verifier | [.harness/agents/delivery-build-verifier.md](.harness/agents/delivery-build-verifier.md) | Build health verification |
| Delivery Breaker | [.harness/agents/delivery-breaker.md](.harness/agents/delivery-breaker.md) | Adversarial post-change falsification pass |
| Delivery Diff Planner | [.harness/agents/delivery-diff-planner.md](.harness/agents/delivery-diff-planner.md) | Second-pass planning from real diff + failures |
| Delivery Evaluator | [.harness/agents/delivery-evaluator.md](.harness/agents/delivery-evaluator.md) | Quality scoring and completion gating |
| Delivery Regression Detector | [.harness/agents/delivery-regression-detector.md](.harness/agents/delivery-regression-detector.md) | Detect unintended drift and adjacent risk |

### Product and stakeholder feedback agents

| Agent | File | Role |
|---|---|---|
| Development Contract Producer | [.harness/agents/development-contract-producer.md](.harness/agents/development-contract-producer.md) | Normalize prose/reports/contracts into a DEVDSL-ready development contract |
| SME Red Team | [.harness/agents/sme-red-team.md](.harness/agents/sme-red-team.md) | Repo-aware domain, customer, and market critic; maintains persona guidance and actionable recommendations |
| Design Red Team | [.harness/agents/design-red-team.md](.harness/agents/design-red-team.md) | UI/UX and workflow critique with acceptance-ready recommendations |
| Customer Persona Tester | [.harness/agents/customer-persona-tester.md](.harness/agents/customer-persona-tester.md) | Exercises core workflows from the target customer's perspective |

### Learning and maintenance agents

| Agent | File | Role |
|---|---|---|
| Run Ledger Curator | [.harness/agents/run-ledger-curator.md](.harness/agents/run-ledger-curator.md) | Distill key decisions, failures, and reusable learnings |
| Ledger Documentation Steward | [.harness/agents/ledger-doc-steward.md](.harness/agents/ledger-doc-steward.md) | Update docs / structure / persona guidance from published ledgers |
| Maintenance Coder | [.harness/agents/maintenance-coder.md](.harness/agents/maintenance-coder.md) | Scoped refactors and hygiene |
| Maintenance Comment Scrubber | [.harness/agents/maintenance-comment-scrubber.md](.harness/agents/maintenance-comment-scrubber.md) | Remove non-useful comments |
| Maintenance Reviewer | [.harness/agents/maintenance-reviewer.md](.harness/agents/maintenance-reviewer.md) | Post-maintenance review |

### Restructure, research, and PR agents

| Agent | File | Role |
|---|---|---|
| Restructure Coder | [.harness/agents/restructure-coder.md](.harness/agents/restructure-coder.md) | Scoped structural improvement |
| Research Analyst | [.harness/agents/research-analyst.md](.harness/agents/research-analyst.md) | Read-only codebase research |
| PR Change Summarizer | [.harness/agents/pr-change-summarizer.md](.harness/agents/pr-change-summarizer.md) | Merge-commit summaries |
| PR Description Generator | [.harness/agents/pr-description-generator.md](.harness/agents/pr-description-generator.md) | Branch PR descriptions |

### Prompt utility agents

| Agent | File | Role |
|---|---|---|
| Prompt Decomposer | [.harness/agents/prompt-decomposer.md](.harness/agents/prompt-decomposer.md) | Decompose complex DEVDSL prompts into minimal child prompts |

## Commands

Commands live in `.harness/commands/`.
In Cursor they are available as slash commands via the `.cursor/commands/` symlink.
In Claude Code and Codex, load the command file directly as a prompt.

| Command | File | Cursor slash command |
|---|---|---|
| Delivery pipeline | [.harness/commands/run-delivery-pipeline.md](.harness/commands/run-delivery-pipeline.md) | `/run-delivery-pipeline` |
| Verification stack | [.harness/commands/run-verification-stack.md](.harness/commands/run-verification-stack.md) | `/run-verification-stack` |
| Breaker follow-on | [.harness/commands/run-breaker-followup.md](.harness/commands/run-breaker-followup.md) | `/run-breaker-followup` |
| Development contract producer | [.harness/commands/run-development-contract-producer.md](.harness/commands/run-development-contract-producer.md) | `/run-development-contract-producer` |
| Product feedback loop | [.harness/commands/run-product-feedback-loop.md](.harness/commands/run-product-feedback-loop.md) | `/run-product-feedback-loop` |
| SME red team | [.harness/commands/run-sme-red-team.md](.harness/commands/run-sme-red-team.md) | `/run-sme-red-team` |
| Design red team | [.harness/commands/run-design-red-team.md](.harness/commands/run-design-red-team.md) | `/run-design-red-team` |
| Customer persona test | [.harness/commands/run-customer-persona-test.md](.harness/commands/run-customer-persona-test.md) | `/run-customer-persona-test` |
| Ledger docs sync | [.harness/commands/run-ledger-doc-sync.md](.harness/commands/run-ledger-doc-sync.md) | `/run-ledger-doc-sync` |
| Maintenance pipeline | [.harness/commands/run-maintenance-pipeline.md](.harness/commands/run-maintenance-pipeline.md) | `/run-maintenance-pipeline` |
| PR description | [.harness/commands/run-pr-description.md](.harness/commands/run-pr-description.md) | `/run-pr-description` |
| Change summarizer | [.harness/commands/run-change-summarizer.md](.harness/commands/run-change-summarizer.md) | `/run-change-summarizer` |
| Repo research | [.harness/commands/run-repo-research.md](.harness/commands/run-repo-research.md) | `/run-repo-research` |
| Restructure pipeline | [.harness/commands/run-restructure-pipeline.md](.harness/commands/run-restructure-pipeline.md) | `/run-restructure-pipeline` |
| Prompt decomposer | [.harness/commands/run-prompt-decomposer.md](.harness/commands/run-prompt-decomposer.md) | `/run-prompt-decomposer` |

## Run Artifacts

Ephemeral run artifacts live under `.harness/runs/<run_id>/`.

Core delivery artifacts:
- `TASK.md`
- `PLAN.md`
- `RUN_META.json`
- `PATCH.diff`
- `TEST_REPORT.json`
- `REVIEW_NOTES.md`
- `QA_REPORT.md`
- `BUILD_VERIFICATION.md`
- `BREAKER_REPORT.md`
- `POLICY_REPORT.json`
- `EVAL_REPORT.json`
- `REGRESSION_REPORT.json`
- `RUN_LEDGER.md`

Product-feedback artifacts:
- `DESIGN_RECOMMENDATIONS.md`
- `CUSTOMER_PERSONA_FEEDBACK.md`
- `SME_RECOMMENDATIONS.md`
- `DEVELOPMENT_CONTRACT.md`
- `BREAKER_FOLLOW_ON_CONTRACT.md`
- `FOLLOW_ON_RUN.json`

Retry / remediation artifacts:
- `SECOND_PASS_PLAN.md`
- `RETRY_TASK.md`
- `RETRY_LOG.jsonl`

Persistent tracked knowledge:
- `.harness/ledgers/`
- `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md`
- `.harness/contracts/`

## Default Policies

### Breaker follow-on policy

The breaker is not just a reviewer.
If it raises actionable issues after the verification phase, the default policy is:

`BREAKER_REPORT.md` → `Development Contract Producer` → brand-new delivery run

Do not silently fold breaker findings into the original run unless a human explicitly overrides that policy.
This preserves auditability and keeps adversarial findings first-class.

### Customer persona testing policy

Run the `Customer Persona Tester` only after the candidate build is credible enough to evaluate from a customer perspective.
Default minimum bar:
- QA verdict `PASS`
- build verification `PASS`
- breaker has no unresolved `BLOCKER`

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
- `.harness/product-feedback/` persona guidance

## Repo State and Bootstrap

The harness includes a repo-aware bootstrap and docs-sync system under `.harness/state/` and `.harness/bin/bootstrap.py`.

| What | Where |
|---|---|
| Repo profile | `.harness/state/repo-profile.yaml` |
| Raw inventory | `.harness/state/repo-inventory.json` |
| Module map | `.harness/state/module-map.yaml` |
| Command registry | `.harness/state/command-registry.json` |
| Docs sync state | `.harness/state/docs-sync-state.json` |
| Pending doc updates | `.harness/state/pending-doc-updates.yaml` |
| Open findings | `.harness/docs/quality/findings/open-items.yaml` |
| Bootstrap tool | `python3 .harness/bin/bootstrap.py scan` |

If `.harness/state/` is missing or stale, run:
`python3 .harness/bin/bootstrap.py scan`

Keep `.harness/ledgers/`, `.harness/contracts/`, and `.harness/product-feedback/` committed so durable learnings travel with the repo.

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
