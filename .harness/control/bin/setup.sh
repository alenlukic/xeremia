#!/usr/bin/env bash
set -euo pipefail

# Create .cursor/ symlinks for Cursor IDE compatibility.
# Run once after clone from the repo root:
#   bash .harness/control/bin/setup.sh

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

mkdir -p .cursor

ln -sfn ../.harness/spec/agents .cursor/agents
ln -sfn ../.harness/spec/commands .cursor/commands
ln -sfn ../.harness/control/rules .cursor/rules

echo "Cursor symlinks created:"
echo "  .cursor/agents   -> .harness/spec/agents/"
echo "  .cursor/commands -> .harness/spec/commands/"
echo "  .cursor/rules    -> .harness/control/rules/"
