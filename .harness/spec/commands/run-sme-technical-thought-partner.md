# Run SME Technical Thought Partner

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Start an interactive technical thinking session to explore, refine, and sharpen an architectural or implementation approach before coding.

## INPUT

Required:
- `topic`: the technical question, architectural idea, or implementation problem to explore

Optional:
- `scope_paths`: code paths for context grounding
- `candidate_run_dir`: delivery run for additional context

## DELEGATION

Delegate to `SME Technical Thought Partner`.

## DO

1. Gather context
- read repo docs, code, architecture, and relevant harness artifacts
- check the recommendation registry and prior technical recommendations

2. Engage interactively
- understand the user's technical question through focused clarifying dialogue
- explore approaches with concrete trade-off analysis grounded in the codebase
- sharpen the approach through iterative refinement

3. Crystallize recommendations
- when the user converges on an approach, produce `TECHNICAL_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- ensure recommendations are specific enough to hand off to the `Spec Contract Producer`

## ACCEPTANCE

Complete only if:
- the `SME Technical Thought Partner` agent was used
- the user's intent was understood through dialogue, not assumed
- recommendations are grounded in codebase evidence
- recommendations are concrete, prioritized, and include acceptance criteria
- output is consumable by the `Spec Contract Producer`
