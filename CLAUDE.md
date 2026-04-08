# Claude Code Project Memory

Use the repository agent harness.

Read:
- @AGENTS.md
- @.harness/docs/core-beliefs.md
- @.harness/docs/token-efficiency.md

Use the appropriate command under `.harness/commands/`.
Initialize a run before substantive work:
`python3 .harness/bin/pipeline.py start --mode <mode> --task "<task>"`

Preserve role separation:
- SME Product Red Team owns customer, market, and product reasoning
- SME Technical Red Team owns architecture, tooling, sequencing, and feasibility reasoning
- Meta Registry Steward consolidates repeated findings and tracks promotion state
- Spec Contract Producer turns mixed findings into one scoped contract
- Breaker findings normally become a fresh contract and new delivery run

Do not compress rich agent specs into one-paragraph role stubs.
The harness expects specialist files to be operational contracts, not labels.

If `.harness/state/` is missing or stale, run:
`python3 .harness/bin/bootstrap.py scan`
