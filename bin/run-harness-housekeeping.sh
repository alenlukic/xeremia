#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

MODE="manual"
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --system) MODE="system" ;;
    --force) FORCE=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

RUNTIME_DIR=".harness/control/runtime"
LOCK_DIR="$RUNTIME_DIR/housekeeping.lock"
PID_FILE="$LOCK_DIR/pid"
PIPE="python3 .harness/control/bin/pipeline.py"
mkdir -p "$RUNTIME_DIR"

alive_pid() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

if mkdir "$LOCK_DIR" 2>/dev/null; then
  echo $$ > "$PID_FILE"
else
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if alive_pid "$EXISTING_PID"; then
    if [ "$FORCE" -eq 1 ]; then
      kill "$EXISTING_PID" 2>/dev/null || true
      sleep 1
      rm -rf "$LOCK_DIR"
      mkdir -p "$LOCK_DIR"
      echo $$ > "$PID_FILE"
    elif [ "$MODE" = "manual" ]; then
      echo "Housekeeping is already running (pid=$EXISTING_PID)."
      echo "Kill that process or rerun with --force to take over."
      exit 0
    else
      exit 0
    fi
  else
    rm -rf "$LOCK_DIR"
    mkdir -p "$LOCK_DIR"
    echo $$ > "$PID_FILE"
  fi
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

retry() {
  local attempt=1
  until "$@"; do
    if [ "$attempt" -ge 3 ]; then
      return 1
    fi
    attempt=$((attempt+1))
    sleep 2
  done
}

# Query schedule-due for all scheduled jobs, then run each deterministic one.
# Fail fast if schedule-due itself fails rather than silently proceeding with no jobs.
DUE_JSON="$($PIPE schedule-due)" || {
  echo "Error: schedule-due failed" >&2
  exit 1
}
JOB_IDS="$(echo "$DUE_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for j in data.get('jobs', []):
    if j.get('type') == 'deterministic':
        print(j['id'])
")"

ERRORS=0
for job_id in $JOB_IDS; do
  if ! retry $PIPE schedule-run --job "$job_id" >/dev/null; then
    echo "Warning: schedule-run --job $job_id failed" >&2
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$MODE" = "manual" ]; then
  if [ "$ERRORS" -gt 0 ]; then
    echo "Harness housekeeping completed with $ERRORS job failure(s)."
  else
    echo "Harness housekeeping complete."
  fi
fi
