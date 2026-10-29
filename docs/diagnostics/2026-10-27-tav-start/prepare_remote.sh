set -euo pipefail
python3 - <<'PY'
import hashlib
from pathlib import Path
archive = Path('/tmp/dcss-tav-start-01a17f43.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest() == '33012a08d9b39892fa0e3c3ea475b3cd0680fe707a8fd9ffb956788f4bc535aa'
PY
mkdir /tmp/dcss-tav-start-01a17f43
chmod 755 /tmp/dcss-tav-start-01a17f43
tar -xzf /tmp/dcss-tav-start-01a17f43.tar.gz -C /tmp/dcss-tav-start-01a17f43
chmod -R a+rX /tmp/dcss-tav-start-01a17f43
python3 /tmp/dcss-tav-start-01a17f43/deploy_tav.py /opt/dcss/staging/tav-start-01a17f43
