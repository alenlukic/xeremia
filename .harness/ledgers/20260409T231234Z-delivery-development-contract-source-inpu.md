---
run_id: 20260409T231234Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-09T23:43:54.691809+00:00
qa_verdict: FAIL
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: FAIL
eval_score: 58
regression_severity: HIGH
---
# Run Ledger

## Outcome
- Task: Contract A only for Explorer canvas fixes and `cleanTitle()` hardening.
- Result: Scoped frontend delivery succeeded, review was approved after a narrow second pass, frontend tests/build passed, and a breaker-driven follow-on contract/run was spawned for remaining IMPORTANT gaps.
- Scope: `client/src/components/SetExplorerCanvas.tsx`, `client/src/utils/trackTitle.ts`, and focused related tests only.

## Key Decisions
- Decision: Keep the run locked to Contract A and use the second pass only for reviewer-cited issues.
  - Why: The first review findings were narrow: clipped root-node actions, missing hover opacity, and missing focused Explorer interaction coverage.
  - Tradeoff: The run stayed small and reviewable, but broader cleanup was intentionally deferred.
- Decision: Treat breaker concerns as a fresh scoped follow-on instead of folding them back into this run.
  - Why: Repo policy favors auditability and smallest-coherent-task delivery when breaker findings remain actionable after verification.
  - Tradeoff: This run closed Contract A implementation work, but did not claim full completion of nearby Explorer/title-cleanup hardening.

## Verification Learnings
- Frontend verification was strong for the scoped code: `npm test -- --run` passed with `10` files / `198` tests, and `npm run build` exited `0`.
- Reviewer remediation was effective: the second pass cleared the initial clipped-action, hover-opacity, and focused-test issues, and the final review verdict was `APPROVED`.
- QA remained `FAIL`, but for the repo-level live-stack service-lifecycle gate: `src/scripts/start_web.sh` shutdown left listeners on `:8000` and `:5173`. That failure is infrastructure/runtime lifecycle debt, not evidence that Contract A behavior was wrong.

## Product / Stakeholder Learnings
- Compact Explorer nodes plus a single visible action row were the accepted direction for scanability and clickability; the chosen changes kept the canvas readable without broad workspace redesign.
- Small interaction affordances matter in this surface: root-node clipping, missing hover visibility, and incomplete focused interaction tests were material enough to block approval until fixed.

## Technical / Architecture Learnings
- `cleanTitle()` needs boundary-safe normalization rules: strict enough to preserve legitimate titles like `10A Remix`, but robust enough to collapse metadata-only titles to the `Track #<id>` fallback.
- Explorer UI consistency depends on shared title cleanup across surfaces; leaving modals on raw `track.title` while nodes show cleaned titles creates visible drift.
- Focused interaction tests must complete callback paths, not just open UI states; swap, delete-confirm, and nonzero child-level arithmetic were all false-confidence gaps until the breaker called them out.
- Regression signals from dirty worktrees need careful framing: the run's regression report was confounded by a broad pre-existing `client/src/styles.css` diff, so it should not be treated as precise evidence of a Contract A regression without isolating the patch.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: When QA fails on the mandatory live-stack lifecycle gate, record it as a repo-level blocker separately from scoped feature behavior so delivery ledgers do not over-attribute product regressions.
- Scope: subsystem-specific
  - Guidance: For Explorer/title-cleanup work, keep modal labels, node labels, and focused interaction tests aligned around the same cleaned-title and callback-completion behavior.
- Scope: subsystem-specific
  - Guidance: In dirty worktrees, treat regression reports on shared files like `client/src/styles.css` as provisional until the run's own diff is isolated from pre-existing changes.

## Deferred / Follow-up
- Breaker follow-on contract created for: metadata-only unbracketed regex handling, modal titles bypassing `cleanTitle()`, and missing tests for swap completion, delete confirmation, and nonzero child-level arithmetic.
- New delivery run started at `/Users/alen/Dev/dj-tools/.harness/runs/20260409T234239Z-delivery-development-contract-source-inpu`.
