# State Machine

This directory holds lightweight declarative state-machine scaffolding for harness runs.

Use it to encode:
- states per run mode
- legal transition order
- terminal states
- transition checks that can be validated deterministically

The intent is not to build a giant workflow engine.
It is to make delegation paths, transition triggers, and terminal states explicit and inspectable.
