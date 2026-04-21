---
run_id: 20260417T214756Z-delivery-make-weight-gauge-control-style-
mode: delivery
published_at: 2026-04-17T22:36:59.661819+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 100
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Make the weight gauge controls match the app's flat control language without changing behavior.
- Result: PASS. The final candidate patch stayed CSS-only and met all scoped UI acceptance criteria.
- Scope: One-file change in `client/src/styles.css`; no `WeightControls.tsx`, backend, math, or lifecycle code changes.

## Key Decisions
- Decision: Keep the fix entirely in shared CSS tokens and control styling, not component logic.
  - Why: The contract called for a visual consistency pass only, and the required outcomes were achievable by replacing frosted-glass treatments, ad hoc borders, and hardcoded values in CSS.
  - Tradeoff: This preserved behavior and scope discipline, but left adjacent cleanup like dead custom properties out of run scope.
- Decision: Treat the earlier QA failure as a verification-gap issue, not a code-remediation issue.
  - Why: Review, design QA, and the corrected patch all showed the UI change itself was sound; the missing evidence was `start_web.sh` lifecycle validation required by repo QA gates.
  - Tradeoff: Added a verification-only rerun, but avoided unnecessary code churn and kept the candidate diff narrow.

## Verification Learnings
- For UI-only changes in this repo, a correct CSS patch is not enough for a PASS; live DOM evidence and service-lifecycle verification are both gating requirements.
- When the working tree is dirty, `PATCH.diff` and `DIFF_STATS.json` are the durable source of truth for candidate-patch scope; policy artifacts may still reflect unrelated local edits.
- Backend pytest/build success provides little confidence for CSS-only work; live browser inspection and design QA carried the real verification signal here.

## Product / Stakeholder Learnings
- The app's control language favors flat `var(--surface)` + `var(--border)` treatments over frosted-glass styling for consistency across interactive panels.
- Tokenization matters even when the rendered color barely changes; replacing hardcoded visual values with shared tokens improves consistency and keeps future palette work centralized.

## Technical / Architecture Learnings
- The weight-gauge consistency pass was fully achievable in `client/src/styles.css`; `WeightControls.tsx` did not need styling-hook changes.
- Removing visual effects can leave inert custom-property definitions behind. Those are safe to defer when the contract is narrowly scoped, but should be tracked as follow-on cleanup rather than folded into the delivery patch.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: Do not treat missing live-stack or lifecycle evidence as a reason to broaden a narrow UI patch; close the verification gap first, and only change code if runtime checks expose an actual defect.
- Scope: repo-wide
  - Guidance: In delivery runs with unrelated dirty-tree files, document candidate scope from `PATCH.diff` and `DIFF_STATS.json` to avoid false scope-drift conclusions.
- Scope: subsystem-specific
  - Guidance: For weight-control UI work, prefer tokenized surfaces, borders, radii, and status colors in CSS before considering TSX changes.

## Deferred / Follow-up
- Remove the now-dead `--gauge-glow` custom-property definitions in `client/src/styles.css` as a separate low-priority cleanup task.
