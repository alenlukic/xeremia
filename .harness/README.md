# Harness

This directory contains the repo-local engine for agentic product development.

## Purpose

Provide a deterministic layer around model-driven work:
- command allowlist
- run artifact conventions
- retry/eval policy
- adversarial verification
- stakeholder feedback orchestration
- split product and technical SME critique
- durable ledgers and recommendation registry
- lightweight state-machine and schedule scaffolding
- token-aware context packaging

The harness does not replace model reasoning.
It standardizes how work is staged, validated, critiqued, and recorded.

## Key files

| File | Purpose |
|---|---|
| `pipeline.yaml` | Allowed commands, policy limits, retry gates, context budget |
| `bin/pipeline.py` | Deterministic runner and artifact helper |
| `agents/` | Specialized role prompts |
| `commands/` | Repo-local workflow entrypoints |
| `runs/` | Ephemeral task artifacts |
| `ledgers/` | Persistent distilled run learnings |
| `contracts/` | Durable guidance on development-contract usage |
| `product-feedback/` | Durable persona guidance and product-feedback state |
| `state_machine/` | Declarative run states and transitions |
| `schedules/` | Deterministic scheduled/triggered job scaffolding |
| `docs/quality/` | Grade rubric, module scorecards, and tech debt findings registry |

## Typical use

```bash
python3 .harness/bin/pipeline.py start --mode delivery --task "Implement X"
python3 .harness/bin/pipeline.py run --run-dir .harness/runs/<run_id> --intent test
python3 .harness/bin/pipeline.py validate --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py evaluate --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py context-manifest --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py publish-ledger --run-dir .harness/runs/<run_id>
python3 .harness/bin/pipeline.py rebuild-ledger-index
```

## Additional patterns

- **Adversarial breaker stack**: spec, tests, and security lanes attack the real diff.
- **Breaker follow-on policy**: actionable breaker findings normally create a new contract and brand-new delivery run.
- **Bad-state checks**: monitor loops, drift, misconfiguration, and context pressure.
- **Run ledgers**: each meaningful run produces a compact `RUN_LEDGER.md` and can publish it into `.harness/ledgers/`.
- **Ledger-driven docs sync**: a documentation steward can read only ledgers created since the last sync and update docs / structure / persona guidance.
- **Memory sync**: a steward can keep registry summaries, persona guidance, and indexes aligned.
- **Stakeholder feedback loop**: design critique, persona-based testing, product SME critique, and technical SME critique can produce development-ready contracts.
