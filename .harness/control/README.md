# Control Plane

This directory contains the operative runtime surfaces that keep the harness alive:

- `bin/` — runner and setup scripts
- `runtime/` — state, queues, events, and watchdog state
- `schedules/` — declarative job specs and schedule state
- `state_machine/` — workflow states and transitions
- `rules/` — IDE-integrated rule files
- `pipeline.yaml` — repo-specific command and gate configuration

This is the authoritative orchestration layer. Agents should treat artifacts here as system truth rather than inference.
