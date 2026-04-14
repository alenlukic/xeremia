#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.tesseract.housekeeping.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.tesseract.housekeeping</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/env</string><string>bash</string><string>$REPO_ROOT/bin/run-harness-housekeeping.sh</string><string>--system</string></array>
  <key>WorkingDirectory</key><string>$REPO_ROOT</string>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
PLIST
launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load "$PLIST"
echo "Installed launchd agent."
