import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

proof = Path(__file__).resolve().parent
request = json.loads((proof / ('request-' + sys.argv[1] + '.json')).read_text())
assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest() == request['runnerSha256']
source = Path(request['sourceRoot'])
for name, expected in request['files'].items():
    assert hashlib.sha256((source / name).read_bytes()).hexdigest() == expected, name
policy = json.loads(Path('/Users/iancaltabiano/Documents/Codex/work/host-heavy/policy.json').read_text())
assert not policy['resourceHold']['active']
assert policy['gateSha256'] == request['gateSha256']
runtime = Path('/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node')
env = dict(os.environ, NODE_PATH=str(runtime / 'node_modules'), SIDEBAR_WEB_ROOT=str(source))
code = 0
with (proof / ('browser-' + sys.argv[1] + '.log')).open('w') as log:
    for touch, output in [('0', '/tmp/dcss-party-sidebar-proof'), ('1', '/tmp/dcss-party-sidebar-touch-proof')]:
        run_env = dict(env, SIDEBAR_TOUCH=touch, SIDEBAR_DPR='2' if touch == '1' else '1', SIDEBAR_PROOF_DIR=output)
        code = subprocess.call([str(runtime / 'bin/node'), str(source / 'tests/party-sidebar.cjs')], env=run_env, stdout=log, stderr=subprocess.STDOUT)
        if code:
            break
print((proof / ('browser-' + sys.argv[1] + '.log')).read_text())
sys.exit(code)
