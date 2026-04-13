# Run Product Feedback Loop

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) TRAVERSE_PROOF(required) OUTPUT_SCHEMA(default)

## COMMAND

Run the stakeholder feedback loop across design, customer-perspective testing, product/market critique, technical critique, recommendation-registry consolidation, and contract production.

## INPUT

Optional:
- `focus`: workflow, feature area, or product surface to evaluate
- `candidate_run_dir`: delivery run whose candidate build should be exercised
- `mode`: `incremental` or `full` (default `incremental`)
- `auto_start_delivery`: `true` or `false` (default `false`)
- `skip-product`: `true` or `false` (default `false`); skips steps 1 and 5 below if `true`
- `skip-customer`: `true` or `false` (default `false`); skips step 4 below if `true`
- `skip-design`: `true` or `false` (default `false`); skips steps 2 and 3 below if `true`
- `skip-technical`: `true` or `false` (default `false`); skips step 6 below if `true`

## DO

1. Initialize a product-feedback run
- `python3 .harness/bin/pipeline.py start --mode product_feedback --task <focus or default summary>`

2. Design critique
- delegate to `SME Design Red Team`
- write `DESIGN_RECOMMENDATIONS.md`

3. Design craft review
- delegate to `SME Design Perfectionist`
- write `DESIGN_PERFECTIONIST_REVIEW.md`
- use Mobbin references to ground recommendations in real-world best practice

4. Customer-perspective test
- if `candidate_run_dir` is provided and meets the readiness bar, delegate to `Test Customer Persona`
- write `CUSTOMER_PERSONA_FEEDBACK.md`
- if the candidate is not ready, record the limitation instead of faking feedback

5. Product SME synthesis
- delegate to `SME Product Red Team`
- use repo docs, code, market/customer reasoning, design critique, perfectionist review, and persona feedback
- update `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md` if it materially improves
- write `PRODUCT_SME_RECOMMENDATIONS.md`

6. Technical SME synthesis
- delegate to `SME Technical Red Team`
- use repo docs, code, architecture reasoning, product recommendations, design critique, and persona feedback where relevant
- write `TECHNICAL_SME_RECOMMENDATIONS.md`

7. Recommendation registry sync
- delegate to `Meta Registry Steward`
- update `.harness/product-feedback/RECOMMENDATION_REGISTRY.json` and `.harness/product-feedback/RECOMMENDATION_REGISTRY.md`
- write `RECOMMENDATION_REGISTRY_SYNC.md`

8. Contract production
- delegate to `Spec Contract Producer`
- use registry promotion candidates when helpful
- convert the highest-value coherent recommendation set into `DEVELOPMENT_CONTRACT.md`

9. Optional delivery kickoff
- if `auto_start_delivery=true`, start a new delivery run from `DEVELOPMENT_CONTRACT.md`
- record linkage with `python3 .harness/bin/pipeline.py record-follow-on ...` when appropriate

10. Ledger distillation
- delegate to `Spec Ledger Curator`
- publish the ledger if the run produced durable learnings worth keeping

## ACCEPTANCE

Complete only if:
- the loop used the intended specialist agents
- design, persona, product SME, and technical SME outputs are clearly separated
- repeated findings were consolidated into the recommendation registry
- the produced contract is coherent and implementation-ready
- no customer-perspective feedback was fabricated when the candidate build was not ready to test
