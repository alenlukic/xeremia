# Run Product Feedback Loop

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) TRAVERSE_PROOF(required) OUTPUT_SCHEMA(default)

## COMMAND

Run the stakeholder feedback loop across design, customer-perspective testing, domain/market critique, and contract production.

## INPUT

Optional:
- `focus`: workflow, feature area, or product surface to evaluate
- `candidate_run_dir`: delivery run whose candidate build should be exercised
- `mode`: `incremental` or `full` (default `incremental`)
- `auto_start_delivery`: `true` or `false` (default `false`)

## DO

1. Initialize a product-feedback run
- `python3 .harness/bin/pipeline.py start --mode product_feedback --task <focus or default summary>`

2. Design critique
- delegate to `Design Red Team`
- write `DESIGN_RECOMMENDATIONS.md`

3. Customer-perspective test
- if `candidate_run_dir` is provided and meets the readiness bar, delegate to `Customer Persona Tester`
- write `CUSTOMER_PERSONA_FEEDBACK.md`
- if the candidate is not ready, record the limitation instead of faking feedback

4. SME synthesis
- delegate to `SME Red Team`
- use repo docs, code, market/customer reasoning, design critique, and persona feedback
- update `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md` if it materially improves
- write `SME_RECOMMENDATIONS.md`

5. Contract production
- delegate to `Development Contract Producer`
- convert the highest-value coherent recommendation set into `DEVELOPMENT_CONTRACT.md`

6. Optional delivery kickoff
- if `auto_start_delivery=true`, start a new delivery run from `DEVELOPMENT_CONTRACT.md`
- record linkage with `python3 .harness/bin/pipeline.py record-follow-on ...` when appropriate

7. Ledger distillation
- delegate to `Run Ledger Curator`
- publish the ledger if the run produced durable learnings worth keeping

## ACCEPTANCE

Complete only if:
- the loop used the intended specialist agents
- design, persona, and SME outputs are clearly separated
- the produced contract is coherent and implementation-ready
- no customer-perspective feedback was fabricated when the candidate build was not ready to test
