# Run SME Red Team

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) TRAVERSE_PROOF(required) OUTPUT_SCHEMA(default)

## COMMAND

Run a domain and customer-oriented red-team pass against the repo and product.

## INPUT

Optional:
- `focus`: workflow, feature area, or product surface to emphasize
- `mode`: `incremental` or `full` (default `incremental`)
- `candidate_run_dir`: delivery or product-feedback run to use as fresh evidence
- `include_customer_feedback`: `true` or `false` (default `true`)
- `include_design_feedback`: `true` or `false` (default `true`)

## DELEGATION

Delegate to `SME Red Team`.

## DO

1. Gather context
- read repo docs, harness artifacts, and relevant code
- read the current `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md`
- if `mode=incremental`, prioritize recent ledgers and the provided `candidate_run_dir`

2. Exercise understanding
- infer the repo’s actual purpose and workflows
- fill gaps conservatively and label inference clearly
- perform external market/customer/use-case research when tools allow; otherwise state limits explicitly

3. Synthesize recommendations
- produce specific add/change/delete recommendations with acceptance criteria
- update `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md` only when the persona guidance should materially change
- write run-local `SME_RECOMMENDATIONS.md`

## ACCEPTANCE

Complete only if:
- the `SME Red Team` agent was used
- the output is recommendation-oriented, not generic commentary
- each substantial recommendation includes acceptance criteria
- persona changes, if any, are narrow and justified
