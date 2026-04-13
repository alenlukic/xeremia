# Run SME Technical Red Team

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) TRAVERSE_PROOF(required) OUTPUT_SCHEMA(default)

## COMMAND

Run a technical-domain red-team pass against the repo and its product category.

## INPUT

Optional:
- `focus`: workflow, feature area, subsystem, or architecture concern to emphasize
- `mode`: `incremental` or `full` (default `incremental`)
- `candidate_run_dir`: delivery or product-feedback run to use as fresh evidence
- `product_recommendations_path`: default run-local `PRODUCT_SME_RECOMMENDATIONS.md` when present
- `registry_path`: default `.harness/workspace/product-feedback/RECOMMENDATION_REGISTRY.json`
- `include_design_feedback`: `true` or `false` (default `true`)
- `include_customer_feedback`: `true` or `false` (default `true`)

## DELEGATION

Delegate to `SME Technical Red Team`.

## DO

1. Gather context
- read repo docs, harness artifacts, relevant code, and recent ledgers
- read `PRODUCT_SME_RECOMMENDATIONS.md` when present
- if `mode=incremental`, prioritize recent evidence and the provided `candidate_run_dir`

2. Exercise understanding
- infer the repo’s actual architecture, constraints, and likely technical pressure points
- fill gaps conservatively and label inference clearly
- perform external architecture / pattern / tooling research when tools allow; otherwise state limits explicitly

3. Synthesize recommendations
- translate product priorities into technical implications, sequencing, and architecture recommendations
- produce specific add/change/delete/defer/sequence recommendations with acceptance criteria
- mark whether each recommendation appears new, repeated, revised, or ready to close against the registry
- write run-local `TECHNICAL_SME_RECOMMENDATIONS.md`

## ACCEPTANCE

Complete only if:
- the `SME Technical Red Team` agent was used
- product priorities were considered when present
- the output is recommendation-oriented, not generic commentary
- each substantial recommendation includes acceptance criteria and sequencing notes when relevant
