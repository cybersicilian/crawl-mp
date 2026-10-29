"""Prove and repair the forced-rescue rite regression in the owned Linux cache."""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import pwd
import shutil
import subprocess
import tarfile
import time

ROOT = Path('/opt/dcss/staging/content-01a16a0f-v1')
SOURCE = ROOT / 'crawl-ref/source'
INPUT = Path('/tmp/dcss-content-recovery-01a16a0f')
OUT = ROOT / 'rite-recovery'
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
save = lambda name, value: (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')
lock = open('/opt/dcss/release-build.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
progress = json.loads((ROOT / 'validation/progress.json').read_text())
plan = json.loads((INPUT / 'rite-recovery-plan.json').read_text())
control = json.loads((INPUT / 'stage-plan.json').read_text())
assert progress['status'] == 'validated_not_published'
assert progress['plan']['overlay_archive_sha256'] == plan['before_archive_sha256']
assert Path('/opt/dcss/current').resolve() == Path(progress['baseline'])
assert sha(INPUT / 'overlay.tar.gz') == control['overlay_archive_sha256']
assert sha(INPUT / 'overlay-manifest.json') == control['overlay_manifest_sha256']
assert not OUT.exists()
OUT.mkdir()
save('original-progress.json', progress)
for name, expected in plan['before'].items():
    assert sha(SOURCE / name) == expected, name
    backup = OUT / 'before' / name
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE / name, backup)
updated = {}
with tarfile.open(INPUT / 'rite-recovery.tar.gz') as archive:
    assert set(archive.getnames()) == set(plan['after'])
    for member in archive:
        assert member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
        data = archive.extractfile(member).read()
        assert hashlib.sha256(data).hexdigest() == plan['after'][member.name]
        updated[member.name] = data
identity = pwd.getpwnam('nobody')
env = {**os.environ, 'HOME': str(ROOT / 'validation/home'), 'TERM': 'xterm-256color',
       'TMPDIR': str(ROOT / 'validation/tmp'), 'PYTHONPATH': str(SOURCE / 'webserver')}
make = ['make', '-k', '-j2', 'WEBTILES=y', 'NOWIZARD=y', 'STDFLAG=-std=c++17', 'NO_OPTIMIZE=y']


def run(name, command):
    started = time.monotonic()
    with (OUT / (name + '.log')).open('w') as output:
        call = subprocess.run(command, cwd=SOURCE, env=env, stdout=output, stderr=subprocess.STDOUT,
            user=identity.pw_uid, group=identity.pw_gid, extra_groups=[], timeout=1800)
    record = {'command': command, 'exit_code': call.returncode,
              'seconds': round(time.monotonic() - started, 2)}
    save(name + '.json', record)
    print(json.dumps({'step': name, **record}), flush=True)
    return call.returncode


# The new tests must demonstrate the old implementation's actual failure.
test = 'catch2-tests/test_new_species.cc'
(SOURCE / test).write_bytes(updated[test])
assert run('reproduction-build', make + ['catch2-tests-executable']) == 0
assert run('before-fix', ['./catch2-tests-executable', '[elder-rites]', '--reporter', 'console']) != 0
failure = (OUT / 'before-fix.log').read_text()
assert 'Forced rescue abandons the old floor' in failure
assert "Old-floor trial cleanup preserves a newer floor's owner marker" in failure
assert 'FAILED:' in failure
for name, content in updated.items():
    target = SOURCE / name
    if target.read_bytes() != content:
        target.write_bytes(content)
    os.chown(target, identity.pw_uid, identity.pw_gid)
    assert sha(target) == plan['after'][name]
steps = [('build', make + ['crawl', 'catch2-tests-executable']),
    ('new-species', ['./catch2-tests-executable', '[new-species]', '--reporter', 'console']),
    ('adjacent', ['./catch2-tests-executable', '[vellum],[pakellas],[vorr],[bloodcraft],[shell],[party-session],[party-trade],[save-compatibility]', '--reporter', 'console']),
    ('catalog', ['python3', 'webserver/util/generate_character_catalog.py', '--binary', str(SOURCE / 'crawl')])]
for name, command in steps:
    assert run(name, command) == 0, name
overlay = json.loads((INPUT / 'overlay-manifest.json').read_text())
for name, expected in overlay.items():
    assert sha(SOURCE / name) == expected, name
for local, remote in [('overlay.tar.gz', 'dcss-content-overlay.tar.gz'),
    ('overlay-manifest.json', 'dcss-content-overlay-manifest.json'), ('stage-plan.json', 'dcss-content-stage-plan.json')]:
    shutil.copy2(INPUT / local, Path('/tmp') / remote)
receipt = {'passed': True, 'regression_reproduced_before_fix': True,
    'only_native_source_changes': sorted(updated), 'before': plan['before'], 'after': plan['after'],
    'native_sha256': sha(SOURCE / 'crawl'), 'overlay_sha256': control['overlay_archive_sha256'],
    'completed_at': time.time(), 'production_mutated': False}
save('result.json', receipt)
progress.update(status='validated_not_published', plan=control,
    native_sha256=receipt['native_sha256'], recovery_fix=receipt)
(ROOT / 'validation/progress.json').write_text(json.dumps(progress, indent=2) + '\n')
print(json.dumps(receipt))
