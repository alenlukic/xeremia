# HUMANS.md

## For humans only

This file is the **operator manual**.

It is not the primary runtime instruction surface for agents.
Use it to decide:
- which loop to run
- which command to use
- how to phrase inputs
- when to escalate from critique into a new delivery contract

Responsibility is split cleanly:
- `HUMANS.md` → human/operator documentation
- `AGENTS.md` → shared agent-facing repository contract
- `.harness/rules/` → scoped rules
- `.harness/agents/` → agent definitions
- `.harness/commands/` → workflow entrypoints
- `CLAUDE.md` → Claude Code project memory

---

## Purpose

This repo uses an **agentic product-development harness**.

The harness is designed to support four connected loops:
1. **Delivery** — build and verify changes
2. **Stakeholder feedback** — critique the product from domain, design, and customer perspectives
3. **Learning** — distill durable signal into run ledgers
4. **Documentation upkeep** — keep docs and persona guidance aligned with what the team learns

The goal is not just "ship code."
The goal is to create a repeatable system that can:
- deliver narrowly
- surface blind spots early
- preserve important learning
- keep customer and product understanding current

---

## First-time setup

If you are a new team member cloning an already-bootstrapped repo, or need to re-run setup:

| IDE | Setup |
|---|---|
| Cursor | `bash .harness/bin/setup.sh` |
| Claude Code | No setup required |

---

## Default entrypoints

### Use `/run-delivery-pipeline` when
- implementing features
- fixing bugs
- making behavior-changing code changes
- addressing a contract produced by the contract producer

### Use `/run-product-feedback-loop` when
- you want broader product critique, not just code review
- a core workflow changed meaningfully
- you want fresh customer/domain/design feedback
- you want to turn stakeholder feedback into a new delivery contract

### Use `/run-development-contract-producer` when
- you have prose notes, breaker findings, SME/design feedback, or rough ideas
- you need a clean DEVDSL-ready contract before handing work to the delivery pipeline

### Use `/run-breaker-followup` when
- a completed run's breaker report found actionable issues
- you want those issues turned into a fresh delivery run instead of patching them quietly in-place

### Use `/run-ledger-doc-sync` when
- ledgers have accumulated
- docs are drifting
- persona guidance or harness instructions need to reflect repeated learnings

---

## Recommended default workflow

### A. Build something
1. Run `/run-delivery-pipeline`
2. Let the delivery loop reach QA, build verification, breaker, evaluation, and ledger publication
3. If breaker finds issues, prefer a **new follow-on run** over same-run patch churn

### B. Evaluate the product as a product
1. Run `/run-product-feedback-loop`
2. This can invoke:
   - Design Red Team
   - Customer Persona Tester
   - SME Red Team
   - Development Contract Producer
3. Use the resulting contract to start the next delivery run

### C. Keep knowledge current
1. Make sure meaningful runs publish `RUN_LEDGER.md`
2. Batch-run `/run-ledger-doc-sync`
3. Review doc-sync diffs before merge

---

## Breaker policy

The breaker is intentionally adversarial.
Its job is to test whether confidence is fake.

If the breaker raises `BLOCKER` or `IMPORTANT` findings late in a run, the preferred response is:
1. preserve the current run as evidence
2. generate a new contract from `BREAKER_REPORT.md`
3. start a brand-new delivery run from that contract

This is better than endlessly mutating the original run because it:
- preserves the audit trail
- makes the adversarial finding explicit
- treats the new problem as first-class work

Human override is allowed, but should be rare.

---

## What belongs in a run ledger

Keep run ledgers short and rereadable.
Good ledger content:
- the decision that mattered
- the tradeoff that mattered
- the failure mode worth remembering
- the verification blind spot that caused pain
- the product/customer insight likely to matter again
- the repo guidance that should change future behavior

Bad ledger content:
- every tool call
- full reasoning traces
- generic commentary
- low-value narration of the run

---

## Product feedback loop details

### SME Red Team
Use for:
- domain and customer critique
- market/use-case sanity checks
- prioritizable product recommendations
- maintaining or refining the customer persona spec incrementally

Expected outputs:
- `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md` when the persona definition changes materially
- run-local `SME_RECOMMENDATIONS.md`

### Design Red Team
Use for:
- end-to-end UI/UX critique
- workflow friction
- hierarchy, clarity, information density, state handling, and navigation problems

Expected output:
- run-local `DESIGN_RECOMMENDATIONS.md`

### Customer Persona Tester
Use for:
- "Would the target customer understand and trust this?"
- friction and confusion reports from the user's perspective
- validating that the current persona spec is realistic enough to exercise workflows meaningfully

Expected output:
- run-local `CUSTOMER_PERSONA_FEEDBACK.md`

### Development Contract Producer
Use for:
- turning raw critiques into implementation-ready contracts
- normalizing mixed inputs into one clean scoped task
- feeding delivery work without making the delivery supervisor reverse-engineer ambiguous prose

Expected output:
- run-local `DEVELOPMENT_CONTRACT.md`

---

## Human review checkpoints

A human should explicitly review:
1. breaker follow-on contracts before large new runs
2. doc-sync changes before merge
3. changes to the customer persona spec
4. any recommendation set that could change roadmap or product positioning
5. repeated failures suggesting the harness itself needs tuning

---

## Suggested team rhythm

### Per task
- use `/run-delivery-pipeline` for real code work
- publish a run ledger when the run is meaningful

### Weekly or after a meaningful slice of change
- use `/run-product-feedback-loop` on core workflows
- decide whether any recommendations deserve contracts now

### Weekly or biweekly
- use `/run-ledger-doc-sync`

### Monthly
- review the quality of:
  - breaker findings
  - contract quality
  - persona realism
  - recommendation-to-delivery conversion rate

---

## Quick examples

### Turn breaker findings into a new run
```text
/run-breaker-followup run_dir=.harness/runs/20260405T120000Z severity_threshold=IMPORTANT
```

### Generate a contract from mixed notes
```text
/run-development-contract-producer
sources=.harness/runs/20260405T120000Z/BREAKER_REPORT.md,notes/rough-ideas.md
intent=delivery
```

### Run the stakeholder loop after a strong candidate build exists
```text
/run-product-feedback-loop
focus=core questionnaire workflow
candidate_run_dir=.harness/runs/20260405T120000Z
auto_start_delivery=false
```
