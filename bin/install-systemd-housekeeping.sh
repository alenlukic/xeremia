#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/tesseract-housekeeping.service" <<SERVICE
[Unit]
Description=Tesseract harness housekeeping

[Service]
Type=oneshot
WorkingDirectory=$REPO_ROOT
ExecStart=/usr/bin/env bash $REPO_ROOT/bin/run-harness-housekeeping.sh --system
SERVICE
cat > "$UNIT_DIR/tesseract-housekeeping.timer" <<TIMER
[Unit]
Description=Run Tesseract housekeeping every 15 minutes

[Timer]
OnBootSec=2m
OnUnitActiveSec=15m
Persistent=true

[Install]
WantedBy=timers.target
TIMER
systemctl --user daemon-reload
systemctl --user enable --now tesseract-housekeeping.timer
echo "Installed systemd user timer."
