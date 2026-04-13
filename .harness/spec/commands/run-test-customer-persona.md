# Run Customer Persona Test

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Exercise the product from the perspective of the current target customer persona.

## INPUT

Required:
- `candidate_run_dir`: delivery run whose candidate build/workflows should be exercised

Optional:
- `focus`: workflow or use case to emphasize
- `persona_path`: default `.harness/workspace/product-feedback/CUSTOMER_PERSONA_SPEC.md`

## DELEGATION

Delegate to `Test Customer Persona`.

## DO

1. Confirm the candidate is worth evaluating
- require QA `PASS`
- require build verification `PASS`
- require no unresolved breaker `BLOCKER`
- if this bar is not met, stop and record why

2. Load persona context
- use `.harness/workspace/product-feedback/CUSTOMER_PERSONA_SPEC.md` unless overridden

3. Exercise core workflows
- behave like the target customer, not a developer or reviewer
- focus on comprehension, trust, workflow coherence, and friction

4. Write feedback
- produce `CUSTOMER_PERSONA_FEEDBACK.md`
- feedback should be specific and useful to the `SME Product Red Team`
- prefer customer-experience observations over solutioning

## ACCEPTANCE

Complete only if:
- the `Test Customer Persona` agent was used
- the candidate run met the required quality bar or was explicitly rejected as not ready
- feedback items are concrete and customer-perspective grounded
