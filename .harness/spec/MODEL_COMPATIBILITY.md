# Model Compatibility

This harness is designed for use with large language models that support tool calling and multi-turn conversations.

## Tested models

- Claude (Anthropic) — primary development target
- GPT-4 / GPT-4.1 (OpenAI) — supported via Cursor and Codex

## Notes

- Agent specs use DEVDSL-1.1 prompt contracts
- Long-context models are preferred for delivery runs with large diffs
- Smaller/faster models can handle focused tasks like comment scrubbing or registry rendering
