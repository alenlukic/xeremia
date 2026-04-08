# Run SME Design Perfectionist

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run a craft-focused design review against the product's UI, producing prioritized refinement recommendations grounded in real-world best practice.

## INPUT

Required:
- `scope`: screen, flow, route, feature area, or artifact set to inspect

Optional:
- `candidate_run_dir`: delivery run whose current build should be inspected if available
- `scope_paths`: frontend/UI paths to prioritize
- `prior_reviews`: earlier design review artifacts to build on

## DELEGATION

Delegate to `SME Design Perfectionist`.

## DO

1. Initialize a run
- `python3 .harness/bin/pipeline.py start --mode product_feedback --task <scope summary>`

2. Inspect the targeted UI surfaces
- focus on craft, polish, consistency, and interaction quality
- use Mobbin references to benchmark against best-in-class implementations
- apply the five-pass review method (orientation → structural → craft → workflow → synthesis)

3. Produce actionable recommendations
- write run-local `DESIGN_PERFECTIONIST_REVIEW.md`
- ensure each recommendation has concrete acceptance criteria
- include Mobbin references where they add material value
- keep findings specific enough to hand off to the `Spec Contract Producer`

## ACCEPTANCE

Complete only if:
- the `SME Design Perfectionist` agent was used
- recommendations are concrete, prioritized, and include acceptance criteria
- Mobbin references are used where they strengthen recommendations
- output is consumable by the `Spec Contract Producer` and verifiable by the `Test Design QA`
