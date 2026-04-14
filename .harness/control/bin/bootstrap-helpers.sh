#!/usr/bin/env bash
# [harness-managed] Shared helpers for bootstrap scripts. Do not hand-edit.
set -euo pipefail

remove_harness_managed_file() {
  local path="$1"
  if [ -L "$path" ]; then
    rm -f "$path"
    echo "  removed: $path"
  elif [ -d "$path" ]; then
    rm -rf "$path"
    echo "  removed: $path"
  elif [ -e "$path" ]; then
    rm -f "$path"
    echo "  removed: $path"
  fi
}

remove_harness_managed_dir_if_empty() {
  local path="$1"
  if [ -d "$path" ] && [ -z "$(ls -A "$path" 2>/dev/null)" ]; then
    rmdir "$path"
    echo "  removed empty dir: $path"
  fi
}

# Remove Cursor harness-managed files without touching user-added content.
cleanup_cursor_harness_files() {
  echo "Cleaning up Cursor harness-managed files..."
  remove_harness_managed_file .cursor/agents
  remove_harness_managed_file .cursor/commands
  remove_harness_managed_file .cursor/rules
  remove_harness_managed_file .cursor/agent-schedules.json
  remove_harness_managed_dir_if_empty .cursor
}

# Remove Codex harness-managed files without touching user-added content.
cleanup_codex_harness_files() {
  echo "Cleaning up Codex harness-managed files..."
  remove_harness_managed_file .agents/skills/delivery-pipeline/SKILL.md
  remove_harness_managed_dir_if_empty .agents/skills/delivery-pipeline
  remove_harness_managed_file .agents/skills/product-feedback/SKILL.md
  remove_harness_managed_dir_if_empty .agents/skills/product-feedback
  remove_harness_managed_file .agents/skills/repo-research/SKILL.md
  remove_harness_managed_dir_if_empty .agents/skills/repo-research
  remove_harness_managed_dir_if_empty .agents/skills
  remove_harness_managed_dir_if_empty .agents
  remove_harness_managed_file .codex/config.toml
  remove_harness_managed_dir_if_empty .codex/hooks
  remove_harness_managed_dir_if_empty .codex
}
