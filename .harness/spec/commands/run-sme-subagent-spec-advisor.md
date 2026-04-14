# Run Subagent Spec Advisor

DEVDSL-1
MODE: FLEX
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run an interactive subagent specification design session using the SME Subagent Spec Advisor agent.

## INPUT

Required:
- `task`: plain-English description of the subagent to design, including its intended role, responsibilities, and integration points

Optional:
- `mode`: `general`, `repo_specific`, or `auto` (default `auto`)
- `target_surface`: existing command, workflow, or loop the new subagent should support
- `neighbor_agents`: agents it should coordinate with, consume from, or hand off to
- `strictness`: `high`, `medium`, or `light` (default `medium`) — how much clarification to require before drafting

## SCOPE

Design one subagent specification. The advisor may ask clarifying questions before drafting.

Changes must remain within `.harness/spec/agents/` for the resulting spec file.
Product code must not be modified.

## DELEGATION

Delegate the task to `SME Subagent Spec Advisor`.
You are the orchestrator — do not perform agent work directly.

## DO

1. Initialize
- parse the task and optional parameters
- delegate to `SME Subagent Spec Advisor` with full context

2. Execute
- the agent determines whether the request is sufficiently specified
- if under-specified, the agent asks targeted clarification questions
- once specified, the agent drafts a complete subagent spec

3. Finalize
- collect the drafted spec
- summarize the design decisions and recommended next steps
- if the spec is repo-specific, note that `SME Harness Engineer` should wire it into the harness

## VALIDATION

Before completion, verify:
- the spec has a clear role boundary
- inputs, outputs, and handoffs are explicit
- non-goals are explicit
- for repo-specific agents, integration points are concrete

## OUTPUT

Produce:
- drafted subagent spec (Format A, B, or C per the agent's output strategy)
- concise completion summary

## ACCEPTANCE

Complete only if:
- the SME Subagent Spec Advisor agent was used
- no product code was modified
- the spec is structurally sound and ready for use or near-ready for use
- for repo-specific agents, integration with the existing harness is concrete
