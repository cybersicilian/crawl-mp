set -euo pipefail
python3 - <<'PY'
import hashlib
from pathlib import Path
archive = Path('/tmp/dcss-webkit-catchup-01a17ea4.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest() == 'c6e52cdb3fe82c0f00e3c58862856e7d5ff686531f7adcc90ef56e9801ca2f8b'
PY
mkdir /tmp/dcss-webkit-catchup-01a17ea4
chmod 755 /tmp/dcss-webkit-catchup-01a17ea4
tar -xzf /tmp/dcss-webkit-catchup-01a17ea4.tar.gz -C /tmp/dcss-webkit-catchup-01a17ea4
python3 /tmp/dcss-webkit-catchup-01a17ea4/deploy_overlay.py prepare /opt/dcss/staging/webkit-catchup-01a17ea4
