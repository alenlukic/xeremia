# Harness Changelog

All notable changes to the Tesseract harness template are documented in this file.

Format: each version section uses the categories **Added**, **Changed**, **Deprecated**, **Removed**, and **Migration Notes**. Machine-readable companion: `HARNESS_CHANGELOG.json`.

---

## [7] - 2026-04-13

Baseline entry. This is the first recorded version in the changelog. Prior template history predating version 7 is not captured here. `min_supported_version` is set to `5` as a conservative assumption — exact backward coverage to versions earlier than 7 has not been verified from repo history.

### Added

- Runtime bootstrap bundles (`bin/bootstrap-cursor.sh`, `bin/bootstrap-claude.sh`, `bin/bootstrap-codex.sh`)
- Host model-compatibility routing (`.harness/control/runtime/MODEL_ROUTING.json`)
- Contract-first delivery DAG orchestration via `pipeline.py`
- Scheduler installer scripts (`bin/install-cron-housekeeping.sh`, `bin/install-systemd-housekeeping.sh`, `bin/install-launchd-housekeeping.sh`)
- 38 agent specs under `.harness/spec/agents/`
- 26 command specs under `.harness/spec/commands/`
- Intake pipeline with context ingest classifier and router
- Product feedback loop with customer persona, design red team, and recommendation registry
- Durable run history with ledger curation and archival
- Knowledge memory layer with topic-based memory sync
- Control plane: pipeline config, state machine, schedules, runtime state files
- Harness changelog infrastructure (`HARNESS_CHANGELOG.md`, `HARNESS_CHANGELOG.json`)

### Changed

- _(baseline — no prior version recorded)_

### Deprecated

- _(none)_

### Removed

- _(none)_

### Migration Notes

- This is the initial changelog baseline. No migration from a prior version is required.
- `min_supported_version: 5` is a conservative assumption; the migrator (when built) should verify actual backward compatibility bounds.
