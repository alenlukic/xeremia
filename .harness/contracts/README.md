# Development Contracts

This directory holds durable guidance for **development contracts**.

A development contract is the cleaned, scoped, development-ready artifact produced by the `Spec Contract Producer`.

Purpose:
- normalize raw prose, reports, and recommendation bundles
- give the delivery pipeline a precise task contract
- keep feedback-to-implementation handoffs deterministic

Common sources:
- `BREAKER_REPORT.md`
- `PRODUCT_SME_RECOMMENDATIONS.md`
- `TECHNICAL_SME_RECOMMENDATIONS.md`
- `DESIGN_RECOMMENDATIONS.md`
- ad hoc prose notes
- prior contracts or ledgers

Preferred behavior:
- keep each contract narrowly scoped
- include explicit non-goals
- include measurable acceptance criteria
- prefer one coherent contract per delivery run


Contracts may also be produced from breaker findings, published ledgers, or promotion-ready registry items when those surfaces provide the clearest durable signal.

## Storage Convention

Durable development contracts are stored under dated directories:

`.harness/contracts/YYYY-MM-DD/`

Use one directory per production date.

Outstanding contracts are tracked in:
- `.harness/contracts/INDEX.md` (human-readable)
- `.harness/contracts/INDEX.json` (machine-readable)
