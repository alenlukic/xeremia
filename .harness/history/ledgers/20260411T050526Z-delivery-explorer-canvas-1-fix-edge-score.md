---
run_id: 20260411T050526Z-delivery-explorer-canvas-1-fix-edge-score
mode: delivery
published_at: 2026-04-11T05:34:58.943831+00:00
qa_verdict: PASS_WITH_NOTES
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 82
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Fix the remaining `SetExplorerCanvas` performance regressions so score fetching is topology-driven, memoized children avoid whole-tree re-renders, loading is per-edge, and zoom persists safely.
- Result: Scoped frontend verification passed, and the highest-signal root cause was confirmed: full-tree flicker came from the score-fetch effect re-running on parent callback identity churn rather than actual edge-topology changes.
- Scope: `SetExplorerCanvas.tsx`, focused explorer-canvas tests in `SetExplorerCanvas.test.tsx`, and one intentional shared-modal width update in `styles.css`.

## Key Decisions
- Decision: Remove `fetchEdgeScores` from the score effect dependency contract and call the latest callback through `fetchEdgeScoresRef`, with the effect depending only on `edgePairKey`.
  - Why: Including `fetchEdgeScores` in deps let a parent pass a new function reference and retrigger score work even when the edge graph was unchanged, causing visible flicker and wasted work.
  - Tradeoff: This relies on the ref pattern and code inspection because current tests do not directly count effect executions.
- Decision: Keep `ExplorerNodeItem` and `ExplorerEdgeItem` as `React.memo` components fed by decomposed primitive layout props plus stable model references from parent prop arrays.
  - Why: Passing wrapper objects such as `LayoutNode` defeats shallow memo comparison because layout recomputation creates fresh object identities on every parent render.
  - Tradeoff: The prop interfaces are more explicit and verbose, but memo behavior becomes predictable and robust.
- Decision: Replace a global loading boolean with `loadingEdgeKeys: Set<string>` and pass `isLoading` per edge.
  - Why: A single `scoresLoading` flag makes every edge component appear dirty whenever any one edge starts or finishes loading.
  - Tradeoff: State bookkeeping is slightly more involved, but updates stay localized to the affected edge.
- Decision: Keep the shared modal width change even though it sat outside the narrow performance core.
  - Why: The width increase was intentional, and the shared selector behavior was explicitly acknowledged rather than treated as accidental drift.
  - Tradeoff: Any future tweaks to `.explorer-delete-modal` should be assumed to affect delete, sibling-add, and child-add flows together unless the styling is split.

## Verification Learnings
- QA marked all four run requirements satisfied, and scoped frontend verification passed with `72/72` Vitest tests green plus `tsc --noEmit` passing.
- The breaker stack found no blockers, but it did expose four important false-confidence gaps: multi-edge independent loading, fetch rejection cleanup, render-count memo guarding, and refetch-dependency regression masked by cache short-circuiting.
- Current automated coverage proves the functional behavior of caching, zoom restore, and no-refetch-on-connect-drag, but it does not directly prove render isolation at the render-count level.
- Live interactive profiling was not part of this run, so confidence in render isolation is based on code inspection and targeted tests rather than measured runtime traces.

## Product / Stakeholder Learnings
- The `.explorer-delete-modal` width change is not delete-only in practice; the same class also styles sibling-add and child-add explorer dialogs.
- That shared-class widening was confirmed intentional for this run, so the durable lesson is to treat explorer modal sizing as a shared UX decision, not an isolated delete-flow tweak.

## Technical / Architecture Learnings
- Full-tree flicker root cause: `fetchEdgeScores` in the effect dependency list caused re-fetch logic to re-run whenever the parent supplied a new function reference. The durable fix is the `fetchEdgeScoresRef` pattern: keep the ref current during render, invoke it inside the effect, and depend only on the stable topology key.
- `React.memo` only protects decomposed SVG components when their props are primitives or stable references. Passing `{ ln: LayoutNode }` or other render-time wrapper objects reintroduces churn because wrapper identity changes on every parent render even when the underlying coordinates do not.
- Per-edge versus global loading is a real render-isolation boundary. Loading should be represented as membership in a keyed `Set`, so `ExplorerEdgeItem` receives a local boolean derived from its own key rather than inheriting a page-wide loading flag.
- This run reinforced a useful separation of concerns: use a stable primitive topology key to decide when the score effect should run, and use cache maps keyed by reusable identities to avoid recomputing already-known results.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: When an effect should respond only to topology/content changes, store unstable callbacks in refs and drive the effect from a stable primitive key instead of function identities or array references.
- Scope: repo-wide
  - Guidance: `React.memo` is only effective when memoized children receive primitives or stable references. Avoid passing fresh wrapper objects created during render or layout recomputation.
- Scope: subsystem-specific
  - Guidance: Prefer keyed `Set`/`Map` loading state over one global boolean when only one row, edge, or item should visibly update.
- Scope: one-off
  - Guidance: Explorer modal styling is currently shared across delete, sibling-add, and child-add dialogs; CSS changes on that selector should be treated as multi-modal by default.

## Deferred / Follow-up
- P1 follow-on: add targeted tests for multi-edge independent loading, fetch rejection clearing spinners, render-count memo guarding, and the refetch-dependency regression that cache logic can currently mask.
- Optional follow-on: extract a shared edge-key helper and normalize separator choice if literal alignment with the spec text becomes important.
