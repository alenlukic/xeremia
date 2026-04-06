# Harness

This directory contains the repo-local engine for agentic delivery.

## Purpose

Provide a thin, deterministic layer around model-driven work:
- command allowlist
- run artifact conventions
- retry/eval policy
- lightweight automation for evidence capture

The harness does not replace model reasoning.
It standardizes how work is staged, validated, and recorded.

## Key files

| File | Purpose |
|---|---|
| `pipeline.yaml` | Allowed commands, stages, policy limits, retry gates |
| `bin/pipeline.py` | Deterministic runner and artifact helper |
| `agents/` | Specialized role prompts |
| `commands/` | Repo-local command prompts / workflows |
| `runs/` | Ephemeral task artifacts |
| `ledgers/` | Persistent distilled decisions and learnings from completed runs |

## Typical use

```bash
python3 .harness/bin/pipeline.py start --mode delivery --task "..."
python3 .harness/bin/pipeline.py run --run-dir .harness/runs/<run_id> --intent test
python3 .harness/bin/pipeline.py validate --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py evaluate --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py publish-ledger --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py pending-ledgers
```

## Additional patterns

- **Adversarial breaker pass**: after build verification, a dedicated breaker agent tries to falsify the change using the real diff and nearby interfaces.
- **Run ledgers**: each completed run produces a compact `RUN_LEDGER.md`, then publishes it into `.harness/ledgers/` for durable knowledge capture.
- **Ledger-driven docs sync**: a documentation steward can read only the ledgers created since the last sync and update repo docs / structure accordingly.
