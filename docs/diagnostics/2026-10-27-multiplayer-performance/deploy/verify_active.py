"""Verify the active release, preserved engine, backup and service health."""
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

operation = Path('/opt/dcss/staging/multiplayer-performance-01a17ea4')
activation = json.loads((operation / 'activation.json').read_text())
prepared = json.loads((operation / 'prepared.json').read_text())
release = Path(activation['release'])
assert Path('/opt/dcss/current').resolve() == release
assert Path('/opt/dcss/previous').resolve() == Path(activation['previous'])
source = release / 'crawl-ref/source'
for name, digest in prepared['runtime_files'].items():
    assert hashlib.sha256((source / name).read_bytes()).hexdigest() == digest, name
assert hashlib.sha256((source / 'crawl').read_bytes()).hexdigest() == prepared['native_sha256']
backup = json.loads((operation / 'backup.json').read_text())
assert backup['backup_verified']
assert activation['all_save_directory_files_preserved'] and activation['save_files_never_replaced']
with urllib.request.urlopen('http://127.0.0.1:8080/status/version/', timeout=10) as response:
    healthy = response.status == 200 and json.load(response).get('python_supported') is True
service = subprocess.check_output(['systemctl', 'is-active', 'dcss-coop'], text=True).strip()
assert healthy and service == 'active'
print(json.dumps(dict(passed=True, release=str(release), previous=activation['previous'],
    runtime_files=prepared['runtime_files'], native_sha256=prepared['native_sha256'],
    native_unchanged=True, backup_verified=True, backup=backup['directory'],
    original_save_files_preserved_at_cutover=True, service=service, healthy=healthy,
    activated_at=activation['activated_at']), indent=2))
