# Run Test Design QA

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Verify that design-related requirements from contracts, design reviews, and perfectionist reviews have been faithfully implemented.

## INPUT

Required:
- `scope`: screens, flows, components, or routes to verify
- At least one source artifact containing design requirements:
  - `DESIGN_PERFECTIONIST_REVIEW.md`
  - `DESIGN_RECOMMENDATIONS.md`
  - `DEVELOPMENT_CONTRACT.md` (design-related items)
  - `TASK.md` (design/UI acceptance criteria)

Optional:
- `candidate_run_dir`: delivery run whose implementation should be verified
- `baseline_screenshots`: prior state for regression comparison

## DELEGATION

Delegate to `Test Design QA`.

## DO

1. Extract design requirements
- read all input artifacts
- build a verification checklist from design-related acceptance criteria

2. Verify implementation
- inspect live UI, screenshots, or code to verify each item
- exercise interactions for state and motion requirements
- check systemic consistency across surfaces

3. Produce verification report
- write run-local `DESIGN_QA_REPORT.md`
- include per-item verdicts with evidence
- produce overall verdict
- include actionable kickback guidance when failing

## ACCEPTANCE

Complete only if:
- the `Test Design QA` agent was used
- every design-related requirement from input artifacts has a verdict
- failed items include actionable remediation guidance
- the overall verdict follows the documented rules
