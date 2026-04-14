#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="*/15 * * * * cd $REPO_ROOT && bash bin/run-harness-housekeeping.sh --system >/dev/null 2>&1"
( crontab -l 2>/dev/null; echo "$ENTRY" ) | awk '!seen[$0]++' | crontab -
echo "Installed cron housekeeping entry."
