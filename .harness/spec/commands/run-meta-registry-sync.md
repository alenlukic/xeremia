# Run Recommendation Registry Sync

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Consolidate stakeholder-feedback findings into the durable recommendation registry.

## INPUT

Required:
- `run_dir`: active product-feedback run containing recommendation artifacts

Optional:
- `include_contract`: `true` or `false` (default `true`)
- `close_resolved_items`: `true` or `false` (default `false`)

## DELEGATION

Delegate to `Meta Registry Steward`.

## DO

1. Read the current durable registry
- `.harness/workspace/product-feedback/RECOMMENDATION_REGISTRY.json`

2. Ingest current-run feedback artifacts
- `DESIGN_RECOMMENDATIONS.md`
- `CUSTOMER_PERSONA_FEEDBACK.md`
- `PRODUCT_SME_RECOMMENDATIONS.md`
- `TECHNICAL_SME_RECOMMENDATIONS.md`
- include `DEVELOPMENT_CONTRACT.md` when requested and present

3. Consolidate and update
- dedupe repeated findings
- update priorities, evidence counts, and statuses
- identify the best candidates for contract promotion

4. Emit outputs
- update the durable registry files
- write run-local `RECOMMENDATION_REGISTRY_SYNC.md`

## ACCEPTANCE

Complete only if:
- the `Meta Registry Steward` agent was used
- repeated findings were consolidated
- promotion candidates are explicit
- registry updates are narrowly scoped and auditable
