# Run SME Beatport Crawler

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Run a standalone, stateful Beatport crawling session using the browser-driven `SME Beatport Crawler` agent.

This command is for long-lived Beatport discovery work, not the standard delivery or verification loop.

## INPUT

Required:
- `prompt`: natural-language description of how to crawl, what to look for, research strategy, and any other instructions

Optional:
- `min_runtime`: lower-bound wall-clock runtime such as `1 hour`
- `max_runtime`: upper-bound wall-clock runtime such as `90 minutes`
- `bpm_range`: BPM band such as `95-122`, `95-`, or `-122`
- `key_filters`: comma-separated list of musical keys to prioritize
- `label_filters`: comma-separated list of Beatport labels to prioritize or use as seeds
- `genre_filters`: comma-separated list of genres to prioritize

Fixed repo-local surfaces:
- repo-root `.env` for Beatport credentials
- `.harness/workspace/work/beatport-exploration/2026-04-13/label_graph.json`
- `.harness/workspace/work/beatport-exploration/2026-04-13/SESSION.md`

## SCOPE

Run one Beatport exploration session.

The session must:
- use the live Beatport website
- interact with Beatport exclusively through `cursor-ide-browser` MCP browser tools
- resume from the existing exploration state
- maintain the two persistent exploration files throughout the run

Do not:
- enter the standard delivery / review / QA loop
- produce delivery artifacts such as `PATCH.diff`, `QA_REPORT.md`, or `BUILD_VERIFICATION.md`
- modify product code

## DELEGATION

Delegate to `SME Beatport Crawler`.

You are the orchestrator. Do not perform the Beatport crawling work directly.

## DO

1. Initialize
- parse the `prompt` and optional parameters
- validate that `min_runtime` and `max_runtime` are coherent if both are present
- pass the normalized session contract to `SME Beatport Crawler`
- ensure the agent is told to resume from:
  - `.harness/workspace/work/beatport-exploration/2026-04-13/label_graph.json`
  - `.harness/workspace/work/beatport-exploration/2026-04-13/SESSION.md`

2. Execute
- require the agent to read Beatport credentials from repo-root `.env`
- require the agent to use `cursor-ide-browser` only for Beatport interaction
- require graph-traversal exploration rather than linear browsing
- require application-level filtering for BPM, keys, labels, genres, and prompt fit
- require ongoing checkpointing of both persistent files during the session
- require explicit handling of:
  - navigation failures
  - stale browser state
  - repeated-loop exploration
  - rate limits
  - login walls or captchas

3. Finalize
- ensure the agent stops cleanly when `max_runtime` is reached
- ensure the agent continues active crawling until `min_runtime` is satisfied, if provided
- collect a concise summary of discoveries, exclusions, dead ends, blockers, and the best next frontier

## EXAMPLES

Minimal:

```text
/run-sme-beatport-crawler
prompt: Find dark, sleek, late-night progressive and electronica cuts that feel expensive, shadowy, and restrained. Start from productive prior branches and widen only when a branch goes cold.
```

Runtime-bounded low-BPM session:

```text
/run-sme-beatport-crawler
prompt: Crawl Beatport for hypnotic low-BPM tracks that feel mysterious and sensual. Use graph expansion from shared artists before relying on generic recommendations.
min_runtime: 1 hour
max_runtime: 90 minutes
bpm_range: 95-108
key_filters: C Minor, D Minor, E Minor, G Minor
label_filters: JOOF Aura, Microcosmos Records, Mystic Sound Records
genre_filters: Progressive House, Electronica, Indie Dance
```

Higher-BPM label-led session:

```text
/run-sme-beatport-crawler
prompt: Focus on darker 108-122 BPM progressive material with strong cross-label artist overlap. Prefer labels that already proved productive, then branch through artist pages and People Also Bought.
min_runtime: 45 minutes
bpm_range: 108-122
label_filters: Bedrock Records, Stripped Recordings, Particles, Visceral
genre_filters: Progressive House, Melodic House & Techno
```

Direct task invocation:

```text
Task(
  subagent_type="SME Beatport Crawler",
  prompt="Use Beatport graph traversal to find sleek dark club tracks with disciplined BPM filtering and update the persistent crawl state files throughout the run."
)
```

## VALIDATION

Before completion, verify:
- the `SME Beatport Crawler` agent was used
- Beatport interaction stayed browser-only through `cursor-ide-browser`
- the agent read the two persistent crawl files before crawling
- both persistent files were updated during the run, not only at shutdown
- the crawl honored `prompt`, `bpm_range`, `key_filters`, `label_filters`, and `genre_filters` when provided
- `min_runtime` was treated as a true floor when provided
- `max_runtime` was treated as a hard ceiling when provided
- blockers and degraded states were surfaced explicitly instead of being silently skipped

## OUTPUT

Produce:
- updated `.harness/workspace/work/beatport-exploration/2026-04-13/label_graph.json`
- updated `.harness/workspace/work/beatport-exploration/2026-04-13/SESSION.md`
- concise completion summary including:
  - prompt and parameters used
  - runtime spent
  - productive labels / artists / branches
  - accepted candidates
  - notable exclusions
  - dead ends or exhausted branches
  - blockers and recommended next frontier

## ACCEPTANCE

Complete only if:
- the `SME Beatport Crawler` agent was used
- the session remained outside the standard delivery / verification loop
- the two persistent files are the authoritative durable outputs
- the crawl is resumable from the updated state
- the result is useful for another Beatport crawl session without re-deriving prior context
