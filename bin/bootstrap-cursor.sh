#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -d ".harness/spec/agents" ]; then
  echo "Error: .harness/spec/agents/ not found."
  exit 1
fi

bash .harness/control/bin/setup.sh

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

# [harness-managed] agent-schedules.json is owned by the harness and updated
# from .harness/control/cursor/agent-schedules.json on every bootstrap.
mkdir -p .cursor
cp .harness/control/cursor/agent-schedules.json .cursor/agent-schedules.json

echo ""
echo "Cursor setup complete."
echo ""
echo "Spec layer:  .harness/spec/"
echo "Control:     .harness/control/"
echo "Workspace:   .harness/workspace/"
echo "Knowledge:   .harness/knowledge/"
echo "History:     .harness/history/"
echo "Schedules:   .cursor/agent-schedules.json (Agent Schedules sidebar)"
echo ""
echo "Start with: /run-delivery-pipeline <task>"
echo "The bootstrap process took a first heuristic pass at .harness/control/pipeline.yaml."
echo "You should review and correct the inferred format/lint/test/build commands before real use."
