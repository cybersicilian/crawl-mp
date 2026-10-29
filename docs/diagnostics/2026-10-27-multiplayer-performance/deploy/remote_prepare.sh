#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
import hashlib
from pathlib import Path
archive=Path('/tmp/dcss-multiplayer-performance-01a17ea4.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='46f17a69a683c6b39b8ed07f03f995c70eff32b36afdc6bdbbb5b5fa0c6380c6'
PY
mkdir /tmp/dcss-multiplayer-performance-01a17ea4
chmod 755 /tmp/dcss-multiplayer-performance-01a17ea4
tar -xzf /tmp/dcss-multiplayer-performance-01a17ea4.tar.gz -C /tmp/dcss-multiplayer-performance-01a17ea4
python3 /tmp/dcss-multiplayer-performance-01a17ea4/deploy_performance.py prepare /opt/dcss/staging/multiplayer-performance-01a17ea4
