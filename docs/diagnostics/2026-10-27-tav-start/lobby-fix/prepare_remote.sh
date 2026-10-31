set -euo pipefail
python3 - <<'PY'
import hashlib
from pathlib import Path
archive = Path('/tmp/dcss-tav-lobby-fix-01a17f43.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest() == 'ee5c256a2a3167c2d176243dbb25c4d6d4c7a6ceca1961dcb78b01f9ce412582'
PY
mkdir /tmp/dcss-tav-lobby-fix-01a17f43
chmod 755 /tmp/dcss-tav-lobby-fix-01a17f43
tar -xzf /tmp/dcss-tav-lobby-fix-01a17f43.tar.gz -C /tmp/dcss-tav-lobby-fix-01a17f43
chmod -R a+rX /tmp/dcss-tav-lobby-fix-01a17f43
python3 /tmp/dcss-tav-lobby-fix-01a17f43/deploy_fix.py /opt/dcss/staging/tav-lobby-fix-01a17f43
