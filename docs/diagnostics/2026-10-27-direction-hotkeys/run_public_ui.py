"""Bound public UI acceptance under the shared-host gate."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
manifest = json.loads((OUT / 'public-binding.json').read_text())
for name, digest in manifest['files'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, name
env = dict(os.environ, NODE_PATH='/Users/iancaltabiano/.cache/codex-runtimes/'
           'codex-primary-runtime/dependencies/node/node_modules')
with (OUT / 'public-ui.log').open('w') as log:
    result = subprocess.run(['node', str(OUT / 'public-ui.cjs')], cwd=ROOT, env=env,
                            stdout=log, stderr=subprocess.STDOUT, timeout=240)
print((OUT / 'public-ui.log').read_text()[-6000:])
assert result.returncode == 0, 'Public UI acceptance failed'
