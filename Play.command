#!/bin/bash
# macOS: double-click this file to open the game. Keep the window open while playing.
cd "$(dirname "$0")"
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
if ! command -v node >/dev/null 2>&1; then
  echo
  echo ">> Node.js is not installed. Install the LTS version from https://nodejs.org then double-click Play.command again."
  open "https://nodejs.org"
  read -r -p "Press Enter to close this window."
  exit 1
fi
node scripts/play.mjs
