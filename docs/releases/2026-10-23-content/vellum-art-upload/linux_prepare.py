"""Install the tested Linux content candidate privately and audit copied saves."""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import pwd
import shutil
import subprocess
import sys
import time

ROOT = Path('/opt/dcss/staging/content-01a16a0f-v1')
BASE = Path('/opt/dcss/releases/20261023T190229Z-stats-website')
RELEASE = Path('/opt/dcss/releases/20261023T220119Z-content')
SOURCE = RELEASE / 'crawl-ref/source'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
write = lambda name, value: (ROOT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')

lock = open('/opt/dcss/release-build.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
progress = json.loads((ROOT / 'validation/progress.json').read_text())
assert progress['status'] == 'validated_not_published' and all(row['exit_code'] == 0 for row in progress['results'])
assert Path('/opt/dcss/current').resolve() == BASE
assert sha(BASE / 'crawl-ref/source/crawl') == progress['plan']['expected_native_sha256']
assert not RELEASE.exists()
RELEASE.mkdir()
subprocess.run(['rsync', '-a', '--exclude=/crawl-ref/source', '--exclude=.git',
    str(BASE) + '/', str(RELEASE) + '/'], check=True)
SOURCE.mkdir(parents=True)
subprocess.run(['rsync', '-a', '--exclude=*.o', '--exclude=*.d', '--exclude=*.gch',
    '--exclude=__pycache__', '--exclude=/saves', '--exclude=/rcs', '--exclude=/init.txt',
    '--exclude=/webserver/run', '--exclude=/catch2-tests-executable',
    str(ROOT / 'crawl-ref/source') + '/', str(SOURCE) + '/'], check=True)
assert sha(SOURCE / 'crawl') == progress['native_sha256']
assert '-DWIZARD' not in (SOURCE / '.cflags').read_text()
overlay = json.loads((ROOT / 'release-input/overlay-manifest.json').read_text())
for name, expected in overlay.items():
    assert sha(SOURCE / name) == expected, name
web = [p for p in (SOURCE / 'webserver').rglob('*') if p.is_file()
       and p.suffix in {'.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.css', '.html'}]
oversize = [(str(p.relative_to(SOURCE)), len(p.read_text().splitlines())) for p in web
            if len(p.read_text().splitlines()) > 600]
assert not oversize, oversize
for name in ('rcs', 'saves'):
    (SOURCE / name).mkdir()
(SOURCE / 'webserver/config.yml').symlink_to('/etc/dcss/webtiles.yml')
subprocess.run(['chown', '-R', 'root:root', str(RELEASE)], check=True)
subprocess.run(['chmod', '-R', 'a+rX', str(RELEASE)], check=True)
commands = [
    ['python3', '/tmp/dcss-content-verify-creation.py', str(SOURCE / 'crawl')],
    ['python3', str(RELEASE / 'deploy/verify_preview_runtime.py'), str(SOURCE)],
]
identity = pwd.getpwnam('dcss')
for i, command in enumerate(commands, 1):
    with (ROOT / ('installed-preview-' + str(i) + '.log')).open('w') as log:
        subprocess.run(command, cwd='/tmp', stdout=log, stderr=subprocess.STDOUT,
            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, user=identity.pw_uid,
            group=identity.pw_gid, extra_groups=[], timeout=300, check=True)
copies = ROOT / 'saved-checkpoints'
copies.mkdir(mode=0o700)
scratch = ROOT / 'save-audit-scratch'
scratch.mkdir()
results = []
for index, original in enumerate(sorted(Path('/var/lib/dcss/rcs/library/saves').rglob('*.cs'))):
    before = sha(original)
    copy = copies / (str(index).zfill(4) + '.cs')
    shutil.copy2(original, copy)
    assert sha(copy) == before == sha(original)
    row = {'source': str(original.relative_to('/var/lib/dcss')), 'sha256': before}
    for key, build in (('baseline', BASE / 'crawl-ref/source'), ('candidate', SOURCE)):
        call = subprocess.run([str(build / 'crawl'), '-save-json', str(copy)], cwd=scratch,
            env={**os.environ, 'CRAWL_DIR': str(build), 'CRAWL_SAVE_DIR': str(scratch), 'CRAWL_RC': '/dev/null'},
            text=True, capture_output=True, timeout=30)
        row[key] = {'exit_code': call.returncode}
        if call.returncode == 0:
            row[key]['metadata'] = json.loads(call.stdout)
        else:
            row[key]['stderr'] = call.stderr[-1000:]
    if row['baseline']['exit_code'] == 0:
        assert row['candidate']['exit_code'] == 0, row
        assert row['candidate']['metadata'] == row['baseline']['metadata'], row
    assert sha(copy) == before
    results.append(row)
write('save-compatibility.json', {'passed': True, 'packages': results,
    'baseline_readable': sum(row['baseline']['exit_code'] == 0 for row in results)})
qa = ROOT / 'qa'
qa.mkdir(mode=0o700)
os.chown(qa, identity.pw_uid, identity.pw_gid)
write('prepared.json', {'passed': True, 'baseline': str(BASE), 'release': str(RELEASE),
    'native_sha256': sha(SOURCE / 'crawl'), 'overlay_sha256': progress['plan']['overlay_archive_sha256'],
    'wizard_disabled': True, 'web_files_within_600': len(web), 'checkpoint_packages': len(results),
    'prepared_at': time.time(), 'production_mutated': False})
print(json.dumps({'passed': True, 'release': str(RELEASE), 'checkpoint_packages': len(results),
    'web_files_within_600': len(web)}))
