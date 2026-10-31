"""Run the frozen public browser verifier through the shared-host gate."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
binding = json.loads((OUT / 'public-binding.json').read_text())
for name, digest in binding['files'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, name
env = dict(os.environ, NODE_PATH='/Users/iancaltabiano/.cache/codex-runtimes/'
           'codex-primary-runtime/dependencies/node/node_modules')
with (OUT / 'public.log').open('w') as stream:
    result = subprocess.run(['node', str(OUT / 'public-smoke.cjs')], cwd=ROOT, env=env,
                            stdout=stream, stderr=subprocess.STDOUT, timeout=240)
print((OUT / 'public.log').read_text()[-6000:])
assert result.returncode == 0, 'Public multiplayer verification failed'
