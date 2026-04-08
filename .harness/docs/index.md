# Harness Knowledge Base

This directory contains the harness-specific knowledge base: execution contract, design rationale, operating principles, and durable workflow guidance.

Start with [AGENTS.md](../../AGENTS.md) for the top-level map.

## Contents

| Section | Path | Description |
|---|---|---|
| Core beliefs | [core-beliefs.md](core-beliefs.md) | Execution contract (DEVDSL-1.1) and operating principles |
| Token efficiency | [token-efficiency.md](token-efficiency.md) | Context packaging and token-usage defaults |
| Ledgers | [../ledgers/README.md](../ledgers/README.md) | Durable run summaries and doc sync state |
| Contracts | [../contracts/README.md](../contracts/README.md) | Development contract production and usage guidance |
| Product feedback | [../product-feedback/README.md](../product-feedback/README.md) | Persona guidance and stakeholder feedback loop |
| State machine | [../state_machine/README.md](../state_machine/README.md) | Run states, transitions, and terminal states |
| Schedules | [../schedules/README.md](../schedules/README.md) | Deterministic recurring jobs and trigger patterns |
| Quality | [quality/rubric.md](quality/rubric.md) | Rubric, grade bands, scorecards, findings registry schema |

## Conventions

### Agent prefix convention

All agent files use a role prefix: `coord-`, `spec-`, `dev-`, `test-`, `maint-`, `sme-`, `meta-`. See the [agent naming convention](../../AGENTS.md#agent-naming-convention) in AGENTS.md for prefix definitions.

### Command prefix convention

Single-agent slash commands are prefixed to match their primary agent (e.g., `/run-sme-product-red-team`). Multi-agent workflow commands (`/run-delivery-pipeline`, `/run-product-feedback-loop`, etc.) retain stable names.

### Contract storage convention

Durable development contracts live in `.harness/contracts/YYYY-MM-DD/` with outstanding contracts tracked in `.harness/contracts/INDEX.md` and `.harness/contracts/INDEX.json`. The pipeline runner supports `contract-add`, `contract-update`, and `rebuild-contract-index` subcommands.
