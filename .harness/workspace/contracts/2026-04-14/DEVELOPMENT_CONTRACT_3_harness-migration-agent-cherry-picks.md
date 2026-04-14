# Development Contract

## Source Inputs
- Migration dry-run artifacts from `.harness/history/runs/20260414T000852Z-maintenance-sme-harness-migrator-template_so/`:
  - `MIGRATION_ANALYSIS.md` — § "Customized" agent files with "Review diff" recommendations
  - `MIGRATION_DIFF.md` — per-agent diffs for `coord-breaker-orchestrator.md`, `coord-delivery-supervisor.md`, and other diverged agent specs
- Upstream template: `/Users/alen/Dev/agentic-harness-template` at version 7
- Downstream-specific rules: `.harness/control/rules/30-live-qa-gates.mdc` (must be preserved in QA/build-verifier agents)

## Selected Intent
- maintenance

## Contract Driver
- infrastructure-driven

## Selected Recommendation IDs
- Migration Diff § `coord-breaker-orchestrator.md`: "Cherry-pick the lane activation policy section"
- Migration Diff § `coord-delivery-supervisor.md`: "Adopt NON-GOALS and contract-intake guardrails"
- Migration Diff § `.harness/GLOSSARY.md`: "Adopt template version (minor text improvements)"
- Migration Analysis § "Manual review required" recommendation 4: "Review customized agent specs for new template features to adopt"

## Deferred Inputs / Non-goals
- Do not change model references in any agent spec — keep all downstream model preferences (e.g., `claude-4.6-opus-high-thinking` stays)
- Do not replace `test-delivery-qa.md` or `test-build-verifier.md` — these have dj-tools live-stack verification customizations enforced by `30-live-qa-gates.mdc`
- Do not replace `test-design-qa.md` — preserve downstream DOM/Chrome DevTools verification sections
- Do not modify `AGENTS.md`, index files, `pipeline.yaml`, or `MANIFEST.yaml`
- Do not alter protected surfaces
- Do not change the 29 template-owned (already identical) agent specs — they require no action
- Do not upstream thought-partner agents to the template; that is a separate concern

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Selectively cherry-pick valuable improvements from the template's customized agent and harness specs into the downstream versions, preserving all dj-tools specific customizations, model preferences, and live-stack QA requirements.
DO: 1. In `.harness/spec/agents/coord-breaker-orchestrator.md`, add the template's LANE ACTIVATION POLICY section (the classification table: CSS-only → skip Security, docs-only → skip all, config-only → skip Tests, all other → all 3 lanes). Do NOT change the model from `claude-4.6-opus-high-thinking` to `gpt-5.4-medium`. 2. In `.harness/spec/agents/coord-delivery-supervisor.md`, add the template's NON-GOALS section ("do not translate raw prose yourself", "do not begin while inputs unnormalized") and contract-set intake language improvements. Preserve all existing downstream content. 3. In `.harness/spec/agents/spec-contract-producer.md`, review the template diff and adopt any new guardrails or output-format improvements that strengthen contract quality without removing dj-tools specific contract conventions. 4. In `.harness/spec/agents/meta-ledger-doc-steward.md`, review the template diff and adopt structural improvements to the doc-sync procedure. 5. In `.harness/spec/agents/meta-memory-sync-steward.md`, review the template diff and adopt improvements to memory-sync scope or surface coverage. 6. In `.harness/spec/agents/spec-pr-description.md` and `.harness/spec/agents/test-delivery-reviewer.md`, review template diffs and adopt any format or process improvements. 7. Replace `.harness/GLOSSARY.md` with the template version (minor whitespace normalization and expanded "work index" definition). 8. In `.harness/control/rules/20-meta-pipeline.mdc`, add the new template agents (`meta-context-ingest-classifier`, `meta-context-router`, `sme-harness-engineer`, `sme-subagent-spec-advisor`, `spec-delta-producer`) to the agent roles list. Preserve all existing downstream agents and execution policy.
ACCEPTANCE: 1. `coord-breaker-orchestrator.md` contains the lane activation policy table and retains `claude-4.6-opus-high-thinking` as its model. 2. `coord-delivery-supervisor.md` contains the NON-GOALS section and contract-set intake improvements while retaining all existing downstream content. 3. All cherry-picked agent specs retain their dj-tools specific sections intact. 4. `test-delivery-qa.md`, `test-build-verifier.md`, and `test-design-qa.md` are unmodified. 5. No model references were changed in any file. 6. `.harness/GLOSSARY.md` matches the template version. 7. `20-meta-pipeline.mdc` lists all agents (existing downstream + 5 new template agents). 8. All `.md` files modified in this phase are well-formed markdown with no broken links or section references.
OUTPUT: schema=default
```

## Ordering Constraints
- `depends_on: DEVELOPMENT_CONTRACT_2_harness-migration-wiring-indexes` — new agents must be indexed before their names are referenced in rule files
- Independent of Phase 4 (schema migration)

## Notes to Orchestrator
- Use the maintenance pipeline.
- For each customized agent spec, perform a side-by-side diff between downstream and template before making changes. Only adopt improvements that add value; do not blindly replace sections.
- The critical preservation rule: any agent that references live-stack verification, Chrome DevTools MCP, DOM inspection, or `30-live-qa-gates.mdc` must keep its downstream content unchanged. These are `test-delivery-qa.md`, `test-build-verifier.md`, and `test-design-qa.md`.
- If a cherry-pick would create a conflict with existing downstream content (e.g., contradictory instructions), flag it for operator review rather than forcing the merge.
- Steps 3–6 are "review and adopt" — if the template diff for a given file contains no meaningful improvements, skip that file and note it in the review.
