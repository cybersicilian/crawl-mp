"""Activate only the frozen content release with fresh backup and rollback."""
from datetime import datetime
from pathlib import Path
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.request

ROOT = Path('/opt/dcss/staging/content-01a16a0f-v1')
read = lambda name: json.loads((ROOT / name).read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
write = lambda name, value: (ROOT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')
locks = []
for name in ('/opt/dcss/release-build.lock', '/run/lock/dcss-counts-activation.lock'):
    handle = open(name, 'a')
    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    locks.append(handle)
freeze, snapshot = read('final-freeze.json'), read('snapshot.json')
release, baseline = Path(freeze['release']), Path(freeze['baseline'])
assert freeze['passed'] and freeze['qa_closed'] and snapshot['status'] == 'READY'
assert snapshot['sourceDisk'].endswith('/disks/dcss-coop-server-data')
assert datetime.fromisoformat(snapshot['creationTimestamp']).timestamp() >= freeze['frozen_at']
assert Path('/opt/dcss/current').resolve() == baseline
assert sha(baseline / 'crawl-ref/source/crawl') == read('validation/progress.json')['plan']['expected_native_sha256']
assert sha(ROOT / 'installed-manifest.json') == freeze['installed_manifest_sha256']
for name, expected in read('installed-manifest.json').items():
    assert sha(release / name) == expected, name
assert sha(release / 'crawl-ref/source/crawl') == freeze['native_sha256']
assert all((release / 'crawl-ref/source' / name).resolve() == Path('/var/lib/dcss') / name
           for name in ('rcs', 'saves'))
active = subprocess.run(['pgrep', '-x', 'crawl'], text=True, capture_output=True)
assert active.returncode == 1, 'Native games are active; wait for a safe cutover'
old_previous = Path('/opt/dcss/previous').resolve()
old_text = Path('/var/lib/dcss/release.txt').read_text()


def point(name, target):
    pending = Path('/opt/dcss') / (name + '.content-01a16a0f-next')
    assert not pending.exists() and not pending.is_symlink()
    pending.symlink_to(target)
    pending.replace(Path('/opt/dcss') / name)


def health():
    for _ in range(45):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8080/status/version/', timeout=2) as response:
                if response.status == 200 and json.load(response).get('python_supported'):
                    return True
        except (OSError, ValueError):
            pass
        time.sleep(0.5)
    return False


switched = False
try:
    subprocess.run(['systemctl', 'stop', 'dcss-coop'], check=True, timeout=90)
    assert subprocess.run(['pgrep', '-x', 'crawl'], capture_output=True).returncode == 1
    preserved = ROOT / 'preserved-current-saves'
    preserved.mkdir(mode=0o700)
    packages = {}
    for directory, _, names in os.walk('/var/lib/dcss', followlinks=False):
        for name in names:
            original = Path(directory) / name
            if original.suffix != '.cs' or original.is_symlink():
                continue
            relative = original.relative_to('/var/lib/dcss')
            copy = preserved / relative
            copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, copy)
            assert sha(copy) == sha(original)
            packages[str(relative)] = sha(copy)
    write('preserved-current-saves.json', packages)
    subprocess.run(['systemctl', 'start', 'dcss-recovery.service'], check=True, timeout=120)
    point('previous', baseline)
    point('current', release)
    switched = True
    subprocess.run(['systemctl', 'start', 'dcss-coop'], check=True, timeout=60)
    assert health(), 'Candidate startup health failed'
    subprocess.run(['systemctl', 'start', 'dcss-health.service', 'dcss-recovery.service'],
                   check=True, timeout=120)
    assert json.loads(Path('/var/lib/dcss-health/status.json').read_text())['ok']
    for relative, expected in packages.items():
        assert sha(Path('/var/lib/dcss') / relative) == expected, relative
    Path('/var/lib/dcss/release.txt').write_text(str(release) + '\n')
    write('activation.json', {'passed': True, 'activated': True, 'release': str(release),
        'previous': str(baseline), 'snapshot': snapshot['name'], 'snapshot_id': snapshot['id'],
        'native_sha256': freeze['native_sha256'], 'preserved_save_packages': len(packages),
        'content_atlases': read('prepared.json')['content_atlases'],
        'restored_old_state': False, 'health': True, 'activated_at': time.time()})
    print(json.dumps(read('activation.json')))
except BaseException as error:
    if switched:
        point('current', baseline)
    if Path('/opt/dcss/previous').resolve() != old_previous:
        point('previous', old_previous)
    Path('/var/lib/dcss/release.txt').write_text(old_text)
    subprocess.run(['systemctl', 'restart', 'dcss-coop'], check=True, timeout=90)
    write('activation-failure.json', {'passed': False, 'error': str(error),
        'baseline_restored': Path('/opt/dcss/current').resolve() == baseline,
        'rollback_healthy': health(), 'at': time.time()})
    raise
