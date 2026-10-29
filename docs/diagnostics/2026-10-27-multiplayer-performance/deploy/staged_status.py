"""Read the prepared candidate and confirm the rejected cutover did not run."""
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

operation = Path('/opt/dcss/staging/multiplayer-performance-01a17ea4')
prepared = json.loads((operation / 'prepared.json').read_text())
native = json.loads((operation / 'native-result.json').read_text())
candidate = Path(prepared['release']) / 'crawl-ref/source'
assert prepared['ready'] and native['passed'] and native['native_process_exited']
assert not (operation / 'activation.json').exists()
assert Path('/opt/dcss/current').resolve() == Path(prepared['baseline'])
for name, digest in prepared['runtime_files'].items():
    assert hashlib.sha256((candidate / name).read_bytes()).hexdigest() == digest
held = []
for name in ('/opt/dcss/release-build.lock', '/run/lock/dcss-counts-activation.lock'):
    handle = open(name, 'r')
    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    held.append(handle)
with urllib.request.urlopen('http://127.0.0.1:8080/status/version/', timeout=10) as response:
    healthy = response.status == 200 and json.load(response).get('python_supported') is True
for handle in held:
    fcntl.flock(handle, fcntl.LOCK_UN)
print(json.dumps(dict(staged=True, deployed=False, activation_attempt_ran=False,
    current=str(Path('/opt/dcss/current').resolve()), prepared=prepared, native=native,
    backend_log=(operation / 'backend.log').read_text()[-250:], deployment_locks_released=True,
    service=subprocess.check_output(['systemctl', 'is-active', 'dcss-coop'], text=True).strip(),
    healthy=healthy), indent=2))
