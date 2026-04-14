---
run_id: 20260414T004307Z-delivery-mixed-delivery-input-bundle
mode: delivery
published_at: 2026-04-14T03:03:11.324722+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 88
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Complete the four-phase harness migration in `20260414T004307Z-delivery-mixed-delivery-input-bundle` and close out its recorded quick-follow remediation.
- Result: Final state is complete and shippable. The migration plus quick-follow ended with review `APPROVE`, broad review `APPROVE`, QA `PASS`, build verification `PASS`, evaluation `PASS` at `88 / B+`, regression `LOW` / non-blocking, breaker concerns follow-on only, and the four `2026-04-14` migration contracts now marked `implemented`.
- Scope: Harness-template additive files, wiring/index reconciliation, selective agent-spec cherry-picks, `MANIFEST.yaml` / pipeline reconciliation, and the narrow quick-follow that hardened housekeeping and bad-state scanning without rewriting protected history.

## Key Decisions
- Decision: Execute the migration as four ordered phases and keep the optional active/archive `.harness/history/` layout deferred.
  - Why: Additive copy, wiring, selective cherry-picks, and runtime reconciliation had different risk levels; deferring the unsupported history-layout migration kept the highest-risk phase narrow and recoverable.
  - Tradeoff: The repo now carries an intentional documented deferral in `MIGRATIONS.md` instead of full template parity.
- Decision: Cherry-pick template improvements selectively while preserving downstream dj-tools customizations.
  - Why: The migration needed new agents, commands, and guardrails, but protected QA/live-stack behavior and downstream model choices were already repo-specific operating policy.
  - Tradeoff: The result is intentionally not a verbatim template mirror, so future migrations still require side-by-side judgment instead of blind sync.
- Decision: Record the housekeeping/bad-state fixes as a separate quick-follow run rather than silently rewriting the parent run narrative.
  - Why: The main migration was functionally complete, but final verification surfaced operational regressions that deserved auditable remediation with explicit linkage in `RUN_META.json`.
  - Tradeoff: Closeout required reading the parent and child runs together to understand the true final state.

## Verification Learnings
- Final-state verification for harness migrations has to include live operational entrypoints, not just file-presence and parse checks. The decisive evidence here was `schedule-due`, `schedule-run --job bad-state-scan`, `bad-state-scan --active`, and `bin/run-harness-housekeeping.sh` succeeding after the quick-follow.
- Historical artifact corruption should degrade to per-run `ERROR` reporting instead of aborting repo-wide scans. The quick-follow cleared the blocker by containing malformed JSON in legacy run history rather than mutating protected artifacts.
- Contract bookkeeping is part of completion evidence. Leaving implemented contracts marked `outstanding` produced false work-queue signals even after the migration itself was otherwise verified.

## Product / Stakeholder Learnings
- Harness operators rely on indexes and ledgers as active workflow surfaces, not passive docs. Accurate contract status and follow-on linkage matter because stale bookkeeping changes the next actions an agent or human will take.
- For harness infrastructure work, a narrow quick-follow is preferable to broad same-run cleanup when closeout finds a real but well-bounded operational issue.

## Technical / Architecture Learnings
- A phased additive-first migration is the safer default for harness-template updates: make new files exist first, wire discoverability second, cherry-pick customized specs third, and reconcile runtime/schema behavior last.
- New pipeline write paths need durable targeted tests, not only smoke validation. Breaker findings remained non-blocking, but `record_stage_result` and `record-follow-on` alias handling still lack lasting regression coverage.
- Resilient control-plane tooling should treat malformed legacy artifacts as hostile input at the boundary and continue scanning/reporting wherever safe.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: For future harness migrations, keep runtime-affecting reconciliation last and explicitly defer template features whose storage/layout assumptions are not yet implemented locally.
- Scope: repo-wide
  - Guidance: When post-verification issues are real but narrow, record them as an auditable quick-follow run and update the parent ledger to the true final accepted state instead of leaving the parent run frozen at its pre-remediation verdict.
- Scope: subsystem-specific
  - Guidance: `bad-state-scan` and housekeeping must tolerate malformed historical artifacts without rewriting protected history; failure should be localized to the offending run and surfaced as an `ERROR` signal.
- Scope: repo-wide
  - Guidance: Treat contract index status changes as part of run closeout, not optional bookkeeping, so downstream agents do not pick up already-implemented work.

## Deferred / Follow-up
- Add targeted tests for `record_stage_result` and `record-follow-on` alias behavior so future pipeline changes cannot regress with green smoke tests.
- Reconcile the remaining non-blocking pipeline concerns: unused `--source-artifact`, `.jsonl` naming versus JSON-array format, and path-containment hardening for `resolve_run_dir`.
