---
run_id: 20260413T080212Z-delivery-devdsl-1-mode-strict-flags-no_ea
mode: delivery
published_at: 2026-04-13T08:51:45.824901+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 85
regression_severity: LOW
---
---
ledger_schema_version: 2
run_id: 20260413T080212Z-delivery-devdsl-1-mode-strict-flags-no_ea
status: PASS
---

# Run Ledger

## Outcome
- Task: Migrate `.harness/` from the flat layout to `control/spec/intake/workspace/knowledge/history`.
- Result: Completed with QA PASS, eval 85/B PASS, no regressions, and migrated entrypoints working from their new locations.
- Scope: Harness-only structural migration, path/reference updates, new navigation surfaces, and remediation of breaker-found omissions.

## Key Decisions
- Decision: Place test infrastructure in `.harness/control/tests/` and derived bootstrap inventory in `.harness/knowledge/state/`.
  - Why: Tests belong with the control plane they validate, while scanned repo state is knowledge rather than executable control.
  - Tradeoff: This changed several path assumptions and required updating both runtime code and harness tests together.
- Decision: Use a clean-cut migration with no compatibility shims.
  - Why: A single authoritative hierarchy is easier to reason about than dual-path support during steady-state operation.
  - Tradeoff: Every active consumer had to be updated immediately, including symlinks, docs, rules, and pipeline path constants.

## Verification Learnings
- Breaker lanes added real value: they surfaced missed operator docs, stale workspace references, `.gitignore` drift, and a broken moved harness test that green app tests did not cover.
- Structural migrations can justifiably exceed the normal 50-file policy limit when churn is dominated by coherent path moves and reference rewrites rather than scope creep.
- Acceptance evidence was strong after remediation: 657 app tests passed, 5 harness bootstrap tests passed, `ruff check` was clean, and migrated pipeline/bootstrap/setup entrypoints all resolved successfully.

## Product / Stakeholder Learnings
- Human-facing operator docs are part of the migration surface, not optional cleanup; stale paths in `HUMANS.md` and `BOOTSTRAP.md` materially degrade usability even when the harness still runs.

## Technical / Architecture Learnings
- Moving `pipeline.py` under `.harness/control/bin/` required the repo-root calculation to shift from `parents[2]` to `parents[3]`; deep path moves should be treated as code changes, not just file relocations.
- The hierarchical split clarified ownership: `control/` for execution and policy, `spec/` for agent/command contracts, `knowledge/` for derived state/docs, `workspace/` for active artifacts, and `history/` for durable run records.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: For future structural migrations, explicitly review operator docs, workspace self-references, ignore rules, and harness-specific tests in addition to primary code/config files.
- Scope: repo-wide
  - Guidance: Preserve frozen historical provenance in old run artifacts and contract records; do not rewrite archived path references unless a document is meant to describe the current live layout.
- Scope: subsystem-specific
  - Guidance: When changing harness file depth, re-verify all root-relative constants and run-location settings such as `pipeline.yaml` versioning and `history/runs` roots.

## Deferred / Follow-up
- `RECOMMENDATION_REGISTRY_SYNC.md` still contains stale historical path references, but they are accepted as non-functional frozen-record debt rather than active migration defects.
