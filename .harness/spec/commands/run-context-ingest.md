# Run Context Ingest

DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)

## COMMAND

Process new files dropped into `.harness/intake/sources/dropbox/`, classify likely routes, produce normalized source packages, and surface the results in the inbox and work index.

## DO

1. Initialize and reconcile runtime.
2. Run `python3 .harness/control/bin/pipeline.py ingest-scan`.
3. Review `.harness/workspace/inbox/INGEST_SUMMARY.md`.
4. If the ingest surfaced meaningful persona/product/technical changes, route follow-on work using the existing SME, registry, memory, or contract commands.

## ACCEPTANCE

Complete only if:
- new sources were normalized under `.harness/intake/sources/processed/SRC-.../`
- the source index and ingest summary were updated
- any required follow-on work was reflected in `.harness/workspace/work/WORK_INDEX.*`
