---
name: Spec PR Description
model: gpt-5.4-high
---

# Spec PR Description

Execution contract: .harness/docs/core-beliefs.md
Knowledge map: AGENTS.md

## COMMAND

Generate a high-signal, human-readable PR description for the current branch relative to `main`.

## INPUT

Optional:
- `base`: base branch to compare against; default `main`
- `output_path`: override output location
- `notes`: free-form context from the user to incorporate (e.g. motivation, audience, related issues, areas to highlight or downplay)

## SCOPE

Summarize only the changes on the current branch relative to `origin/<base>`.

Source of truth:
- branch change set = `origin/<base>...HEAD`

Do not summarize landed merge results.
Do not expand beyond the current branch diff.
Do not produce file-by-file or diff-level narration.

## OBJECTIVE

Produce a PR description optimized for human readers:
- quickly communicates what changed
- clearly explains why reviewers should care
- highlights importance, impact, and risk
- omits low-value implementation detail

The output should read like a strong PR description a thoughtful engineer would actually want to review.

The description must clearly separate:
- what changed
- why it matters
- where reviewers should focus

## DO

1. Validate repo state
- identify the current branch
- fetch `origin`
- confirm `origin/<base>` exists
- compute the diff of current branch vs `origin/<base>`

2. Initialize output
- default:
  `.harness/pr_descriptions/${CURRENT_BRANCH}_PR_DESCRIPTION.md`

3. Incorporate user notes
- if `notes` were provided, use them as additional context throughout analysis
- let notes influence emphasis, framing, and what to highlight or downplay
- do not treat notes as the sole source of truth; ground the description in the actual diff

4. Analyze changes (signal-first)
- identify:
  - primary user-facing or system-facing behavior changes
  - important internal changes only when they materially affect maintainability, architecture, interfaces, reliability, or future work
- classify the PR as:
  - feature
  - fix
  - refactor
  - infra
  - mixed

5. Extract meaning
- determine:
  - what changed (behavior, responsibilities, interfaces, system shape)
  - why it matters (impact on users, system, developers, or future work)
- explicitly translate implementation details into outcomes and implications

6. Extract impact
- identify, where applicable:
  - user-facing impact
  - developer experience impact
  - API / interface changes
  - architectural impact
  - performance / reliability implications
  - operational / config / migration implications

7. Detect architectural change
- classify:
  - none
  - moderate
  - fundamental
- include an ASCII diagram only when it materially improves clarity
- prefer compact before/after representations
- highlight added, removed, or re-routed components when relevant

8. Suppress noise
- do not include:
  - file lists
  - trivial refactors
  - formatting churn
  - obvious renames
  - low-impact internal edits
- collapse implementation detail into meaningful changes and implications

9. Collect tech debt signals
- check `.harness/docs/quality/findings/open-items.yaml` if it exists
- check run artifacts for `DEFERRED_ITEMS.json` files that have not yet been merged (agent-emitted during this branch's runs)
- identify items with status `resolved` whose `history` or `evidence` references commits on this branch
- identify any new deferred items introduced or confirmed during this branch's work
- if neither file exists or no relevant items found, omit the section from the output

10. Write PR description
- optimize for skimmability and signal
- use concise bullets and short paragraphs
- emphasize importance over exhaustiveness

## RULES

- Use the current branch diff against `origin/<base>` as the source of truth.
- Stay grounded in actual code changes.
- Do not narrate every change.
- Do not expand scope beyond the branch.
- mention files/modules only when they materially improve understanding

- explicitly distinguish between:
  - what changed
  - why reviewers should care
- do not assume importance is obvious from implementation detail
- translate low-level changes into reviewer-relevant significance

- if a change is structurally important but not user-visible, make that explicit
- if a change is mostly mechanical, say so plainly
- if risk exists, call it out directly

## OUTPUT FORMAT

Write `PR_DESCRIPTION.md` using exactly this structure:

## Summary
- 1–2 sentence condensed takeaway describing the most important changes
- readable without opening the diff
- focuses on what changed at a meaningful level

## Why This Matters
- 1 short paragraph explaining significance
- focuses on:
  - user impact
  - system impact
  - architectural importance
  - risk reduction
  - maintainability / future work implications

## Key Changes
- grouped by meaningful themes, not files
- focuses on:
  - behavior changes
  - responsibility shifts
  - interface changes
  - major refactors
- omit trivial implementation detail

## Architecture
- state one of:
  - `No meaningful architectural change`
  - `Moderate architectural reshaping`
  - `Fundamental architectural change`

- include ASCII diagram only when helpful

Example:

Before:
Client → API → Service A → DB

After:
Client → API → Orchestrator → Service A
                             → Service B

## Risks / Considerations
- meaningful risks only
- include:
  - rollout concerns
  - migrations
  - coupling
  - edge cases
  - test gaps
- if none, state: `No major concerns identified`

## Tech Debt
- Only include this section when at least one item is present
- **Resolved items**: list DEF-YYYY-NNNN IDs closed or confirmed-fixed by this branch, with a one-line description
- **New / deferred items**: list DEF-YYYY-NNNN IDs produced during this branch's work, with kind (e.g. `known_gap`, `architecture_debt`) and a one-line description
- if none, omit this section entirely

## VALIDATION

Before completion, verify:
- `origin` was fetched
- `origin/<base>` exists
- summary is based on current branch vs `origin/<base>`
- output is high-signal and human-readable
- no file-by-file breakdown exists
- what changed vs why it matters are clearly separated
- impact is explained, not implied
- ASCII diagram included only when it adds clarity
- output file was written successfully
- tech debt section omitted when no items are relevant; populated accurately when items exist

## OUTPUT

Produce:
- `.harness/pr_descriptions/${CURRENT_BRANCH}_PR_DESCRIPTION.md` unless overridden
- concise completion summary including:
  - current branch
  - base branch
  - report path
  - PR classification
  - architectural classification

## ACCEPTANCE

Complete only if:
- current branch was compared against `origin/<base>`
- description reflects actual changes
- output is signal-optimized for human readability
- importance and impact are clearly conveyed
- no diff-style or file-list output is present
- ASCII diagram is used only when beneficial
- `PR_DESCRIPTION.md` was successfully written
- tech debt section is accurate and omitted when no items apply
