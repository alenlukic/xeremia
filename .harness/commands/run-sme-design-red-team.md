# Run SME Design Red Team

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run a UI/UX-focused red-team pass against the product’s interface and core workflows.

## INPUT

Optional:
- `focus`: workflow or UI surface to emphasize
- `candidate_run_dir`: delivery run whose current build should be inspected if available
- `scope_paths`: frontend/UI paths to prioritize

## DELEGATION

Delegate to `SME Design Red Team`.

## DO

1. Inspect the UI side of the product
- focus on core workflows first
- inspect hierarchy, clarity, workflow friction, terminology, empty/error/loading states, and trust cues

2. Produce actionable recommendations
- write run-local `DESIGN_RECOMMENDATIONS.md`
- note whether each finding appears new, repeated, revised, or ready to close against the registry when evidence permits
- keep findings specific enough to hand off to the `Spec Contract Producer`

## ACCEPTANCE

Complete only if:
- the `SME Design Red Team` agent was used
- recommendations are concrete and prioritized
- output is consumable by the `Spec Contract Producer`
