# Product Feedback

This directory stores durable product-feedback guidance that should persist across runs.

Purpose:
- preserve the current target-customer framing
- support repeatable persona-based testing
- give the product and design red-team loops a stable base to refine over time
- provide context that the technical SME can consume when translating product priorities into architecture recommendations

Tracked artifacts:
- `CUSTOMER_PERSONA_SPEC.md` — current best-effort target-customer perspective used by the `Test Customer Persona` agent and maintained primarily by the `SME Product Red Team`

Ephemeral recommendation artifacts usually stay in run directories:
- `DESIGN_RECOMMENDATIONS.md`
- `CUSTOMER_PERSONA_FEEDBACK.md`
- `PRODUCT_SME_RECOMMENDATIONS.md`
- `TECHNICAL_SME_RECOMMENDATIONS.md`
- `DEVELOPMENT_CONTRACT.md`

Only promote stable, rereadable guidance into this directory.


## Loop order

Default order:
1. SME design red team
2. test customer persona
3. SME product red team
4. SME technical red team
5. meta registry steward
6. spec contract producer
