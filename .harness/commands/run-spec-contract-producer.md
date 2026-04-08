# Run Spec Contract Producer

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
  - `PRODUCT_SME_RECOMMENDATIONS.md`
  - `TECHNICAL_SME_RECOMMENDATIONS.md`
  - `DESIGN_RECOMMENDATIONS.md`
  - `.harness/product-feedback/RECOMMENDATION_REGISTRY.json`
  - prior contracts

Optional:
- `intent`: `delivery` | `maintenance` | `restructure` (default `delivery`)
- `output_path`: default `DEVELOPMENT_CONTRACT.md` (or `DEVELOPMENT_CONTRACT_N.md` for multi-contract) in the active run dir
- `title`: concise task title to anchor the contract(s)
- `auto_start`: `true` | `false` (default `false`) — if true, invoke `/run-delivery-pipeline` on each produced contract after all contracts are written

## DELEGATION

Delegate to `Spec Contract Producer`.

## DO

1. Normalize inputs
- identify the real change request(s)
- discard ambiguity, duplicates, and non-actionable commentary

2. Produce contracts
- delegate to the `Spec Contract Producer`, which decides how many contracts to emit
- splitting criteria: (a) chunk work into logical segments; (b) maximize independence/decoupling between contracts
- if the work is inherently tightly coupled, a single contract is correct
- prefer repeated or promotion-ready registry items over one-off noise when they are comparable in value
- state non-goals explicitly
- define acceptance criteria that are actually testable
- preserve important constraints, failure modes, and sequencing implications

3. Emit DEVDSL-ready artifacts
- write contract(s) that can each be handed directly to `/run-delivery-pipeline`
- make each contract self-contained enough that the delivery supervisor does not need to reconstruct intent from scratch

4. Auto-start delivery (when `auto_start=true`)
- after all contracts are written, invoke `/run-delivery-pipeline` for each contract
- independent contracts may be started concurrently
- contracts with ordering constraints must be started sequentially in dependency order
- if `auto_start=false` (default), skip this step

## ACCEPTANCE

Complete only if:
- the `Spec Contract Producer` agent was used
- every resulting contract is DEVDSL-compliant
- scope per contract is narrow and coherent
- acceptance criteria are explicit and measurable
- non-goals are present when they matter
- if multiple contracts: each satisfies the splitting criteria (logical segmentation + independence)
- if `auto_start=true`: a delivery pipeline run was invoked for each contract
