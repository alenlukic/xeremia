# Harness

This directory contains the repo-local engine for agentic product development.

## Purpose

Provide a thin, deterministic layer around model-driven work:
- command allowlist
- run artifact conventions
- retry/eval policy
- adversarial verification
- stakeholder feedback orchestration
- compact knowledge capture through ledgers

The harness does not replace model reasoning.
It standardizes how work is staged, validated, critiqued, and recorded.

## Key files

| File | Purpose |
|---|---|
| `pipeline.yaml` | Allowed commands, stages, policy limits, retry gates |
| `bin/pipeline.py` | Deterministic runner and artifact helper |
| `agents/` | Specialized role prompts |
| `commands/` | Repo-local workflow entrypoints |
| `runs/` | Ephemeral task artifacts |
| `ledgers/` | Persistent distilled run learnings |
| `contracts/` | Durable guidance on development-contract usage |
| `product-feedback/` | Durable persona guidance and product-feedback state |

## Typical use

```bash
python3 .harness/bin/pipeline.py start --mode delivery --task "Implement X"
python3 .harness/bin/pipeline.py run --run-dir .harness/runs/<run_id> --intent test
python3 .harness/bin/pipeline.py validate --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py evaluate --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py publish-ledger --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py pending-ledgers
```

## Additional patterns

- **Adversarial breaker pass**: after build verification, a dedicated breaker agent tries to falsify the change using the real diff and nearby interfaces.
- **Breaker follow-on policy**: if breaker findings are actionable, the default next step is a new development contract and a brand-new delivery run.
- **Run ledgers**: each meaningful run produces a compact `RUN_LEDGER.md` and can publish it into `.harness/ledgers/`.
- **Ledger-driven docs sync**: a documentation steward can read only the ledgers created since the last sync and update docs / structure / persona guidance.
- **Stakeholder feedback loop**: design critique, persona-based testing, and SME synthesis can produce development-ready contracts without forcing the delivery supervisor to reverse-engineer rough feedback.
