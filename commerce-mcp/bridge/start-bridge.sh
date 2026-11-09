#!/bin/bash
# Starts the Chrome bridge and restarts it if it ever exits (macOS / Linux).
cd "$(dirname "$0")"
while true; do
  node src/agent.mjs
  echo "Bridge stopped - restarting in 5 seconds..."
  sleep 5
done
