# Run Development Contract Producer

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Turn rough prose, reports, recommendation artifacts, or existing contracts into a DEVDSL-compliant development contract ready for subagent use.

## INPUT

Required:
- `sources`: one or more inputs, such as:
  - prose notes
  - `BREAKER_REPORT.md`
  - `SME_RECOMMENDATIONS.md`
  - `DESIGN_RECOMMENDATIONS.md`
  - prior contracts

Optional:
- `intent`: `delivery` | `maintenance` | `restructure` (default `delivery`)
- `output_path`: default `DEVELOPMENT_CONTRACT.md` in the active run dir
- `title`: concise task title to anchor the contract

## DELEGATION

Delegate to `Development Contract Producer`.

## DO

1. Normalize inputs
- identify the real change request
- discard ambiguity, duplicates, and non-actionable commentary

2. Define one coherent contract
- choose the smallest coherent scope
- state non-goals explicitly
- define acceptance criteria that are actually testable
- preserve important constraints and failure modes

3. Emit a DEVDSL-ready artifact
- write a contract that can be handed directly to `/run-delivery-pipeline` or another development pipeline
- make the output self-contained enough that the delivery supervisor does not need to reconstruct intent from scratch

## ACCEPTANCE

Complete only if:
- the `Development Contract Producer` agent was used
- the resulting contract is DEVDSL-compliant
- the scope is narrow and coherent
- acceptance criteria are explicit and measurable
- non-goals are present when they matter
