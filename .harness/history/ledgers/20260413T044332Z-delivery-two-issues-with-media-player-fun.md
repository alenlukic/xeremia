---
run_id: 20260413T044332Z-delivery-two-issues-with-media-player-fun
mode: delivery
published_at: 2026-04-13T05:13:56.878755+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 82
regression_severity: MEDIUM
---
# Run Ledger

## Outcome
- Task: Fix the stop-button empty-src media error, restore AIFF/AIF playback, and add regression coverage for the new `date_added` field across backend and client surfaces.
- Result: PASS. Runtime behavior was fixed, AIFF/AIF now stream as `audio/aiff`, `date_added` now flows through model/serializer/schema/client table, and verification ended with QA PASS, build PASS, 353 frontend tests passing, 39 backend tests passing, eval `82 / B-`, and no breaker blockers.
- Scope: Narrow delivery change across the audio player lifecycle, audio route MIME allowlist, and the already-introduced `date_added` data flow plus targeted tests.

## Key Decisions
- Decision: Clear stopped/reset media by removing the `src` attribute and ignore error events when no `src` is present.
  - Why: Browsers can emit `MEDIA_ELEMENT_ERROR: Empty src attribute` after `src` is set to an empty string; `removeAttribute('src')` avoids creating the invalid state.
  - Tradeoff: The no-`src` error guard is intentionally broad and can suppress stale teardown errors, but that is preferable to surfacing a false playback error after stop.
- Decision: Restore `.aiff` and `.aif` by extending the existing extension allowlist and media-type map instead of adding special-case route logic.
  - Why: The endpoint already used an allowlist-driven pattern, so the safest fix was additive and data-driven.
  - Tradeoff: The route remains dependent on DB-sourced filenames and existing path-safety assumptions in ingestion rather than adding new containment logic in this run.
- Decision: Lift browse-table sorting state into `App.tsx` and mark `TrackTable` as `manualSorting` when the parent controls sort order.
  - Why: The new `date_added` column needed global browse sorting behavior at the paged list level, not only inside the table component.
  - Tradeoff: Sorting logic now exists in both `App.tsx` and `TrackTable.tsx`, which keeps the patch small but creates drift risk.

## Verification Learnings
- Live verification mattered here: QA confirmed on the running stack that stop no longer surfaces the empty-src error, AIF/AIFF real tracks return `200`/`206` with `audio/aiff`, and the live browse table renders and sorts the `Date Added` column.
- The run passed the core gates, but breaker/eval evidence showed test-confidence gaps: the empty-src regression test can go false-green if the mocked error handler is not found, and automated coverage does not exercise the real App-level browse sort path.
- Regression review flagged a separate watch item for date formatting: `formatDate()` uses local `Date` parsing/formatting, so timezone-bearing timestamps could display a shifted calendar day if the backend starts returning them.

## Product / Stakeholder Learnings
- `date_added` is a browse-level behavior, not just a table-column concern. Acceptance and future tests should target the real browse flow in `App.tsx`, because that is the path users actually experience.
- Restoring AIFF/AIF playback is a high-priority compatibility requirement for DJ-library workflows; allowlist regressions on common DJ file types should be treated as release-blocking.

## Technical / Architecture Learnings
- The `track.date_added` database column is currently a `String(64)`, not a timestamp type. That pushes parsing, null handling, invalid-value handling, and timezone semantics into application code.
- When resetting browser media elements, `el.src = ''` is not equivalent to removing the attribute. For stop/teardown flows, `removeAttribute('src')` is the safer pattern.
- When TanStack table sorting is lifted to a parent, `manualSorting` is required to prevent the table's internal sorting path from diverging or double-applying sort behavior.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: For HTML media element teardown, prefer removing `src` over assigning an empty string, and guard against no-`src` error events if stop/reset can race with browser media errors.
- Scope: subsystem-specific
  - Guidance: If browse-table sorting is controlled above `TrackTable`, test the parent-managed sort path directly and keep null/date semantics aligned with any table-local comparator.
- Scope: subsystem-specific
  - Guidance: Treat date-like strings as tech debt. If a field remains string-backed in the DB, centralize parsing/ordering rules so display and sort behavior do not drift across files.

## Deferred / Follow-up
- Harden the empty-src regression test so it fails if the mocked error handler is not actually wired or invoked.
- Add automated coverage for the App-level `browseSorting` / `sortedTracks` path and align null-order semantics between `App.tsx` and `TrackTable.tsx`.
- Reduce drift risk by extracting the `date_added` comparator/normalization logic into a shared utility.
- Decide whether `date_added` should remain a string field or be migrated to a real timestamp type, and clarify timezone expectations before more date-based UI features accumulate.
