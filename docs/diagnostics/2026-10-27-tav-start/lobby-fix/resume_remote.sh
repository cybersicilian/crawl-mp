set -euo pipefail
python3 - <<'PY'
import hashlib
from pathlib import Path
archive = Path('/tmp/dcss-tav-lobby-fix-01a17f43-r2.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest() == '9ee83dabf13f9147c4b43b7c0056c1b616435bcb02f9f2836138da031eb87754'
PY
mkdir /tmp/dcss-tav-lobby-fix-01a17f43-r2
chmod 755 /tmp/dcss-tav-lobby-fix-01a17f43-r2
tar -xzf /tmp/dcss-tav-lobby-fix-01a17f43-r2.tar.gz -C /tmp/dcss-tav-lobby-fix-01a17f43-r2
chmod -R a+rX /tmp/dcss-tav-lobby-fix-01a17f43-r2
python3 /tmp/dcss-tav-lobby-fix-01a17f43-r2/deploy_fix.py /opt/dcss/staging/tav-lobby-fix-01a17f43 --resume
