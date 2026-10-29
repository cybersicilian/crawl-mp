"""One sequential WebKit and Chrome native input profile under the host gate."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
binding = json.loads((OUT / 'profile-binding.json').read_text())
for name, digest in binding['files'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, name
env = dict(os.environ, NODE_PATH='/Users/iancaltabiano/.cache/codex-runtimes/'
           'codex-primary-runtime/dependencies/node/node_modules')
for engine in ['webkit', 'chromium']:
    with (OUT / (engine + '-profile.log')).open('w') as stream:
        result = subprocess.run(['node', str(OUT / 'profile.cjs')], cwd=ROOT,
            env=dict(env, PROFILE_ENGINE=engine), stdout=stream, stderr=subprocess.STDOUT, timeout=240)
    print((OUT / (engine + '-profile.log')).read_text()[-3000:], flush=True)
    assert result.returncode == 0, engine + ' native profile did not finish'
