#!/bin/bash
# Opens your regular Google Chrome so the bridge can drive it (attach mode). See open-chrome.cmd.
PROFILE="$(cd "$(dirname "$0")" && pwd)/chrome-profile"
if [ "$(uname)" = "Darwin" ]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
else
  CHROME="$(command -v google-chrome || command -v google-chrome-stable)"
fi
"$CHROME" --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir="$PROFILE" \
  --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --no-first-run >/dev/null 2>&1 &
