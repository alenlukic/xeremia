# Harness Bootstrap Guide

This repo uses the agentic delivery harness. The harness is already configured for dj-tools.

---

## What you get

```text
.harness/
├── control/         # Runtime control plane, scheduler, state machine, rules, pipeline config
│   ├── bin/         # pipeline.py, bootstrap.py, setup.sh
│   ├── runtime/     # State, queues, events, watchdog
│   ├── schedules/   # Job specs and schedule state
│   ├── state_machine/ # Workflow states and transitions
│   ├── rules/       # IDE-integrated rule files
│   └── pipeline.yaml # Configured for Python (ruff, pytest)
├── spec/            # Static agent and command definitions
│   ├── agents/      # Agent contracts
│   └── commands/    # Operator-facing workflow entrypoints
├── intake/          # Context ingest and routing
├── workspace/       # Inbox, contracts, product-feedback, work tracking
├── knowledge/       # Curated docs and derived memory
└── history/         # Runs, ledgers, PR descriptions

AGENTS.md    # Agent guide — all roles, commands, and workflow documented
HUMANS.md    # Operator manual — how to start tasks, which pipeline to use
CLAUDE.md    # Claude Code project memory (auto-loaded)
```

---

## Setup

### Cursor

```bash
bash .harness/control/bin/setup.sh
```

Creates `.cursor/agents/`, `.cursor/commands/`, `.cursor/rules/` symlinks into `.harness/spec/` and `.harness/control/`.
All agents and commands are immediately available as slash commands in Cursor Agent chat.

### Claude Code

No setup required — `CLAUDE.md` and `.harness/` are already present.
Claude Code auto-loads `CLAUDE.md` as project memory.

---

## Start your first task

| IDE | How to start |
|---|---|
| Cursor | `/run-delivery-pipeline <describe your task>` |
| Claude Code | Load `.harness/spec/commands/run-delivery-pipeline.md` |

Standard task brief (Claude Code):
```md
Read AGENTS.md and .harness/knowledge/docs/core-beliefs.md.
Load .harness/spec/commands/run-delivery-pipeline.md.
Initialize a run: python3 .harness/control/bin/pipeline.py start --mode delivery --task "<task>"

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
- Update `.harness/control/pipeline.yaml` when the project's build/test/lint commands change.
- Keep `.harness/history/ledgers/`, `.harness/workspace/contracts/`, and `.harness/workspace/product-feedback/` committed so durable learnings travel with the repo.
