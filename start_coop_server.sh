#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR/crawl-ref/source"

mkdir -p ./rcs ./rcs/morgue ./saves/logfile ./saves/milestones ./webserver/run

echo "============================================================"
echo "  Pebble Broth — Co-opetitive Dungeon Server (WebTiles)"
echo "  Open in browser: http://localhost:8888"
echo "============================================================"

exec "$ROOT_DIR/.venv/bin/python" webserver/server.py --live-debug -p 8888 "$@"
