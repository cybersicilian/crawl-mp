#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR/crawl-ref/source"

# Framework Python on macOS may have no installed default OpenSSL CA bundle.
# Keep certificate and hostname verification enabled using the system roots.
if [[ "$OSTYPE" == darwin* && -f /etc/ssl/cert.pem \
      && -z "${SSL_CERT_FILE:-}" && -z "${SSL_CERT_DIR:-}" ]]; then
    export SSL_CERT_FILE=/etc/ssl/cert.pem
fi

mkdir -p ./rcs ./rcs/morgue ./saves/logfile ./saves/milestones ./webserver/run

echo "============================================================"
echo "  Pebble Broth — Co-opetitive Dungeon Server (WebTiles)"
echo "  Open in browser: http://localhost:8888"
echo "============================================================"

AI_CREDENTIALS_CONFIG="${DCSS_AI_CREDENTIALS_CONFIG-$ROOT_DIR/deploy/ai-credentials.json}"
if [[ -n "$AI_CREDENTIALS_CONFIG" ]]; then
    exec "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/deploy/run_with_secrets.py" \
        --config "$AI_CREDENTIALS_CONFIG" -- \
        "$ROOT_DIR/.venv/bin/python" webserver/server.py --live-debug -p 8888 "$@"
fi
exec "$ROOT_DIR/.venv/bin/python" webserver/server.py --live-debug -p 8888 "$@"
