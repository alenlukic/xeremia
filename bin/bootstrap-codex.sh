#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -d ".harness/spec/agents" ]; then
  echo "Error: .harness/spec/agents/ not found."
  exit 1
fi

source .harness/control/bin/bootstrap-helpers.sh

cleanup_cursor_harness_files

# Stamp downstream harness manifest (idempotent — skips if already present)
if [ ! -f .harness/MANIFEST.yaml ]; then
  _tpl_name=$(python3 -c "import re,sys; m=re.search(r'^name:\s*(.+)',open('MANIFEST.yaml').read(),re.M); print(m.group(1).strip()) if m else sys.exit(1)")
  _tpl_version=$(python3 -c "import re,sys; m=re.search(r'^version:\s*(.+)',open('MANIFEST.yaml').read(),re.M); print(m.group(1).strip()) if m else sys.exit(1)")
  _now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  _today=$(date -u +"%Y-%m-%d")
  cat > .harness/MANIFEST.yaml <<EOF
harness:
  template_name: "${_tpl_name}"
  template_version: "${_tpl_version}"
  current_version: "${_tpl_version}"
  template_source: ""
  created_at: "${_now}"
  last_upgraded_at: "${_now}"
  upgrade_history:
    - version: "${_tpl_version}"
      date: "${_today}"
      method: initial_clone
EOF
  echo "Stamped .harness/MANIFEST.yaml (template version ${_tpl_version})"
fi

# [harness-managed] Skill files and config below are owned by the harness
# and will be overwritten on every bootstrap to stay in sync with source.
mkdir -p .agents/skills/delivery-pipeline .agents/skills/product-feedback .agents/skills/repo-research .codex/hooks
cat > .agents/skills/delivery-pipeline/SKILL.md <<'SK'
---
name: delivery-pipeline
description: Run the repository's scoped delivery workflow.
---

Load:
- AGENTS.md
- .harness/knowledge/docs/core-beliefs.md
- .harness/spec/commands/run-delivery-pipeline.md
SK
cat > .agents/skills/product-feedback/SKILL.md <<'SK'
---
name: product-feedback
description: Run the stakeholder feedback loop.
---

Load:
- AGENTS.md
- .harness/knowledge/docs/core-beliefs.md
- .harness/spec/commands/run-product-feedback-loop.md
SK
cat > .agents/skills/repo-research/SKILL.md <<'SK'
---
name: repo-research
description: Perform read-only repository research.
---

Load:
- AGENTS.md
- .harness/spec/commands/run-sme-research.md
SK
# [harness-managed] Default Codex config — overwritten on re-bootstrap.
cat > .codex/config.toml <<'CF'
approval_mode = "suggest"
CF

echo "Codex setup complete."
echo "The bootstrap process took a first heuristic pass at .harness/control/pipeline.yaml."
echo "Review and correct the inferred commands before real use."
