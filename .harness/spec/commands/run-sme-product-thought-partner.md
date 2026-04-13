# Run SME Product Thought Partner

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Start an interactive product thinking session to explore, refine, and sharpen a product idea before implementation.

## INPUT

Required:
- `topic`: the product question, idea, or strategic problem to explore

Optional:
- `candidate_run_dir`: delivery run for additional context
- `mode`: `incremental` or `full` (default `incremental`)

## DELEGATION

Delegate to `SME Product Thought Partner`.

## DO

1. Gather context
- read repo docs, code, and relevant harness artifacts
- check the recommendation registry, persona spec, and prior product recommendations

2. Engage interactively
- understand the user's product question through focused clarifying dialogue
- explore strategic approaches with trade-offs on scope, complexity, and user impact
- sharpen the direction through iterative refinement

3. Crystallize recommendations
- when the user converges on a direction, produce `PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- ensure recommendations are specific enough to hand off to the `Spec Contract Producer`

## ACCEPTANCE

Complete only if:
- the `SME Product Thought Partner` agent was used
- the user's intent was understood through dialogue, not assumed
- recommendations are concrete, prioritized, and include acceptance criteria
- customer/market context is evidence-backed where possible
- output is consumable by the `Spec Contract Producer`
