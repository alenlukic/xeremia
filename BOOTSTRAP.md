# Harness Bootstrap Guide

This repo uses the agentic delivery harness. The harness is already configured for dj-tools.

---

## What you get

```text
.harness/
├── agents/          # 24 agents: delivery, product feedback, maintenance, restructure, research, PR
├── commands/        # 15 pipeline command definitions
├── rules/           # Always-on platform + pipeline rules + live QA gates
├── docs/            # Core beliefs, knowledge base, quality rubric
├── contracts/       # Development contract storage
├── product-feedback/# Customer persona spec and stakeholder loop
├── ledgers/         # Durable run summaries and doc sync state
├── bin/
│   ├── pipeline.py  # Deterministic runner and artifact helper
│   ├── bootstrap.py # Repo-aware state scanner
│   └── setup.sh     # Cursor IDE symlink bootstrapper
└── pipeline.yaml    # Configured for Python (ruff, pytest)

AGENTS.md    # Agent guide — all roles, commands, and workflow documented
HUMANS.md    # Operator manual — how to start tasks, which pipeline to use
CLAUDE.md    # Claude Code project memory (auto-loaded)
```

---

## Setup

### Cursor

```bash
bash .harness/bin/setup.sh
```

Creates `.cursor/agents/`, `.cursor/commands/`, `.cursor/rules/` symlinks into `.harness/`.
All agents and commands are immediately available as slash commands in Cursor Agent chat.

### Claude Code

No setup required — `CLAUDE.md` and `.harness/` are already present.
Claude Code auto-loads `CLAUDE.md` as project memory.

---

## Start your first task

| IDE | How to start |
|---|---|
| Cursor | `/run-delivery-pipeline <describe your task>` |
| Claude Code | Load `.harness/commands/run-delivery-pipeline.md` |

Standard task brief (Claude Code):
```md
Read AGENTS.md and .harness/docs/core-beliefs.md.
Load .harness/commands/run-delivery-pipeline.md.
Initialize a run: python3 .harness/bin/pipeline.py start --mode delivery --task "<task>"

Task: <plain-English task>
Acceptance criteria:
- <criterion 1>
Non-goals:
- <non-goal 1>
```

---

## Maintaining the harness

- Keep `.harness/` in git — it is the system of record for all agent knowledge.
- Update agents, commands, and rules via the normal delivery pipeline.
- Update `.harness/pipeline.yaml` when the project's build/test/lint commands change.
- Keep `.harness/ledgers/`, `.harness/contracts/`, and `.harness/product-feedback/` committed so durable learnings travel with the repo.
