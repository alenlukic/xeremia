# Run SME Design Thought Partner

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Start an interactive design thinking session to explore, refine, and sharpen a design idea before implementation.

## INPUT

Required:
- `topic`: the design question, idea, or problem to explore

Optional:
- `scope_paths`: frontend/UI paths for context grounding
- `candidate_run_dir`: delivery run for additional context

## DELEGATION

Delegate to `SME Design Thought Partner`.

## DO

1. Gather context
- read repo docs, frontend code, and relevant harness artifacts
- check the recommendation registry and persona spec for existing framing

2. Engage interactively
- understand the user's design question through focused clarifying dialogue
- explore directional approaches with trade-offs
- sharpen the direction through iterative refinement

3. Crystallize recommendations
- when the user converges on a direction, produce `DESIGN_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- ensure recommendations are specific enough to hand off to the `Spec Contract Producer`

## ACCEPTANCE

Complete only if:
- the `SME Design Thought Partner` agent was used
- the user's intent was understood through dialogue, not assumed
- recommendations are concrete, prioritized, and include acceptance criteria
- output is consumable by the `Spec Contract Producer`
