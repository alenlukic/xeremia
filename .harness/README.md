# dj-tools Harness

dj-tools uses a repo-local agentic coordination, development, and memory ecosystem.

The `.harness/` tree is organized around a few durable conceptual buckets rather than a flat collection of artifact types:

- `.harness/control/` — runtime control plane, scheduler, state machine, rules, and pipeline configuration
- `.harness/spec/` — static agent and command definitions
- `.harness/intake/` — ongoing context ingest and routing
- `.harness/workspace/` — active operator-facing surfaces such as inbox, contracts, product-feedback state, and work tracking
- `.harness/knowledge/` — distilled docs and derived memory
- `.harness/history/` — durable historical exhaust such as runs, ledgers, and PR descriptions

Start with:

- `.harness/INDEX.md`
- `.harness/GLOSSARY.md`
- `HUMANS.md`
- `AGENTS.md`
