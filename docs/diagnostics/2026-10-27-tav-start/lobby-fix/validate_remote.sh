set -euo pipefail
python3 - <<'PY'
import hashlib
from pathlib import Path
archive = Path('/tmp/dcss-tav-lobby-fix-01a17f43-r3.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest() == '5d5606c708b65ef1f7687be520adc0ce6ae0f6b1763ebc73553506398bdc456e'
PY
mkdir /tmp/dcss-tav-lobby-fix-01a17f43-r3
chmod 755 /tmp/dcss-tav-lobby-fix-01a17f43-r3
tar -xzf /tmp/dcss-tav-lobby-fix-01a17f43-r3.tar.gz -C /tmp/dcss-tav-lobby-fix-01a17f43-r3
chmod -R a+rX /tmp/dcss-tav-lobby-fix-01a17f43-r3
python3 /tmp/dcss-tav-lobby-fix-01a17f43-r3/resume_verify.py
