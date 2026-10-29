#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
import hashlib
from pathlib import Path
archive=Path('/tmp/dcss-direction-hotkeys-01a17ea4-r2.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='c4887622260f4ff0a3c70928b868dc367d6cab715a0333c537e69349ae4e347f'
PY
mkdir /tmp/dcss-direction-hotkeys-01a17ea4-r2
chmod 755 /tmp/dcss-direction-hotkeys-01a17ea4-r2
tar -xzf /tmp/dcss-direction-hotkeys-01a17ea4-r2.tar.gz -C /tmp/dcss-direction-hotkeys-01a17ea4-r2
python3 /tmp/dcss-direction-hotkeys-01a17ea4-r2/deploy_ui.py prepare /opt/dcss/staging/multiplayer-performance-01a17ea4-ui
