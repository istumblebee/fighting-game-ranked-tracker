#!/bin/bash
# Double-click this file to start the CFN watcher (macOS / Linux). No command line needed.
# On macOS the first launch may need: right-click -> Open (to clear the Gatekeeper prompt).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js isn't installed yet."
  echo "Get the 'LTS' installer from https://nodejs.org , run it, then double-click this file again."
  echo
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First-time setup - installing, this takes a couple of minutes..."
  npm install || { echo "Setup failed."; read -n 1 -s -r; exit 1; }
  npx playwright install chromium || { echo "Browser download failed."; read -n 1 -s -r; exit 1; }
fi

echo
echo "Starting the watcher. A browser window will open - sign into Buckler's Boot Camp there the first time."
echo "Leave this window open while you play, then hit \"Sync from CFN now\" in the tracker."
echo "Close this window (or press Ctrl+C) to stop."
echo
node watch.js --serve
