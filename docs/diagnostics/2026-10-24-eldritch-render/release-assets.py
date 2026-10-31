"""Guarded four-file browser release; native code and persistent state are preserved."""
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request
from urllib.parse import urlparse

STAGE = Path('/opt/dcss/staging/eldritch-render-01a16b6d')
BASELINE = Path('/opt/dcss/releases/20261024T163456Z-chain-devil')
NATIVE = '16ab04953766d3c53f34c1139d4b22f62f5eda89b91b603f3139d50939d35ca4'
PREFIX = 'crawl-ref/source/webserver/static/scripts/'
ARCHIVE = Path('/tmp/dcss-eldritch-final2.tar')
PROOF = Path('/tmp/dcss-eldritch-native-proof.json')
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

def save(name, value):
    (STAGE / name).write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')

def manifest(root):
    result = {}
    for p in sorted(root.rglob('*')):
        if '__pycache__' in p.parts or p.suffix == '.pyc':
            continue
        if p.is_symlink():
            result[str(p.relative_to(root))] = 'link:' + os.readlink(p)
        elif p.is_file():
            result[str(p.relative_to(root))] = sha(p)
    return result

def current():
    return Path('/opt/dcss/current').resolve()

def no_games():
    return subprocess.run(['pgrep', '-x', 'crawl'], capture_output=True).returncode == 1

def qa_closed():
    return not Path('/sys/fs/cgroup/system.slice/dcss-eldritch-render-01a16b6d-qa12.service').exists()

def prepare():
    assert current() == BASELINE and qa_closed()
    assert sha(BASELINE / 'crawl-ref/source/crawl') == NATIVE
    proof = json.loads(PROOF.read_text())
    assert proof['passed'] and not proof['pageErrors'] and not proof['unexpectedErrors']
    assert proof['native_sha256'] == NATIVE
    assert [s['label'] for s in proof['scenes']] == [str(i) + '-' + species + '-' + step
        for i, species in enumerate(['Eldritch', 'Human', 'Eldritch'])
        for step in ['start', 'south', 'east', 'resumed']]
    with tarfile.open(ARCHIVE) as tar:
        changes = json.load(tar.extractfile('manifest.json'))
        loaded = {Path(urlparse(row['url']).path).name: row['sha256'] for row in proof['loadedCode']}
        assert all(loaded[name] == row['after'] for name, row in changes.items())
        assert set(changes) == {'asset-readiness.js', 'client-transport.js', 'game-loading.js', 'loading-ui.js'}
        for name, row in changes.items():
            p = BASELINE / (PREFIX + name)
            assert (sha(p) if p.exists() else None) == row['before'], name
        release = Path('/opt/dcss/releases') / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-render-assets')
        shutil.copytree(BASELINE, release, symlinks=True)
        for name, row in changes.items():
            data = tar.extractfile(name).read()
            assert hashlib.sha256(data).hexdigest() == row['after']
            (release / (PREFIX + name)).write_bytes(data)
    before, after = manifest(BASELINE), manifest(release)
    changed = {p for p in set(before) | set(after) if before.get(p) != after.get(p)}
    assert changed == {PREFIX + name for name in changes}, changed
    assert sha(release / 'crawl-ref/source/crawl') == NATIVE
    for name in ['rcs', 'saves']:
        assert (release / 'crawl-ref/source' / name).resolve() == Path('/var/lib/dcss') / name
    save('release-manifest.json', after)
    receipt = {'prepared': True, 'release': str(release), 'baseline': str(BASELINE),
        'native_sha256': NATIVE, 'proof_sha256': sha(PROOF), 'archive_sha256': sha(ARCHIVE),
        'manifest_sha256': sha(STAGE / 'release-manifest.json'), 'changes': sorted(changed)}
    save('release-candidate.json', receipt)
    print(json.dumps(receipt), flush=True)

def point(name, target):
    pending = Path('/opt/dcss') / (name + '.eldritch-01a16b6d-next')
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
        time.sleep(.5)
    return False

def activate():
    receipt = json.loads((STAGE / 'release-candidate.json').read_text())
    release = Path(receipt['release'])
    assert current() == BASELINE and qa_closed() and no_games(), 'Wait for a safe cutover with no native games'
    assert receipt['prepared'] and sha(STAGE / 'release-manifest.json') == receipt['manifest_sha256']
    assert manifest(release) == json.loads((STAGE / 'release-manifest.json').read_text())
    assert sha(release / 'crawl-ref/source/crawl') == sha(BASELINE / 'crawl-ref/source/crawl') == NATIVE
    previous = Path('/opt/dcss/previous').resolve()
    old_text = Path('/var/lib/dcss/release.txt').read_text()
    switched = False
    try:
        subprocess.run(['systemctl', 'stop', 'dcss-coop'], check=True, timeout=90)
        assert no_games()
        packages = {str(p): sha(p) for p in Path('/var/lib/dcss').rglob('*.cs') if p.is_file()}
        save('preserved-save-hashes.json', packages)
        point('previous', BASELINE); point('current', release); switched = True
        subprocess.run(['systemctl', 'start', 'dcss-coop'], check=True, timeout=60)
        assert health(), 'Browser release startup failed'
        assert all(sha(p) == digest for p, digest in packages.items())
        Path('/var/lib/dcss/release.txt').write_text(str(release) + '\n')
        receipt.update(activated=True, health=True, saved_packages_preserved=len(packages), at=time.time())
        save('activation.json', receipt)
        print(json.dumps(receipt), flush=True)
    except BaseException as error:
        if switched:
            point('current', BASELINE)
        if Path('/opt/dcss/previous').resolve() != previous:
            point('previous', previous)
        Path('/var/lib/dcss/release.txt').write_text(old_text)
        subprocess.run(['systemctl', 'restart', 'dcss-coop'], check=True, timeout=90)
        save('activation-failure.json', {'error': str(error), 'healthy_rollback': health()})
        raise

if __name__ == '__main__':
    locks = [open(p, 'a') for p in ['/opt/dcss/release-build.lock', '/run/lock/dcss-counts-activation.lock']]
    for lock in locks:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    {'prepare': prepare, 'activate': activate}[sys.argv[1]]()
