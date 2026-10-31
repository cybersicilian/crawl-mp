"""Add the finished Vellum tiles to the owned, already tested Linux candidate."""
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
INPUT = Path('/tmp/dcss-content-art-01a16a0f')
OUT = ROOT / 'vellum-art'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
save = lambda p, v: p.write_text(json.dumps(v, indent=2, sort_keys=True) + '\n')
lock = open('/opt/dcss/release-build.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
progress = json.loads((ROOT / 'validation/progress.json').read_text())
assert progress['status'] == 'validated_not_published'
assert Path('/opt/dcss/current').resolve() == Path(progress['baseline'])
assert not Path('/opt/dcss/releases/20261023T220119Z-content').exists()
assert not OUT.exists()
before = json.loads((INPUT / 'overlay-manifest.json.before-vellum-art').read_text())
for name, expected in before.items():
    assert sha(SOURCE / name) == expected, name

# The recovery build and tests completed before a metadata copy hit /tmp protection.
recovery = ROOT / 'rite-recovery'
for name in ('reproduction-build', 'build', 'new-species', 'adjacent', 'catalog'):
    assert json.loads((recovery / (name + '.json')).read_text())['exit_code'] == 0
assert json.loads((recovery / 'before-fix.json').read_text())['exit_code'] != 0
assert 'All tests passed (408 assertions in 17 test cases)' in (recovery / 'new-species.log').read_text()
save(recovery / 'result.json', {'passed': True, 'regression_reproduced_before_fix': True,
    'native_sha256': sha(SOURCE / 'crawl'), 'overlay_sha256':
    json.loads((INPUT / 'stage-plan.json.before-vellum-art').read_text())['overlay_archive_sha256'],
    'metadata_finalized_without_rerun': True, 'production_mutated': False})

control = json.loads((INPUT / 'stage-plan.json').read_text())
assert control['production_mutation_authorized']
assert sha(INPUT / 'overlay.tar.gz') == control['overlay_archive_sha256']
assert sha(INPUT / 'overlay-manifest.json') == control['overlay_manifest_sha256']
overlay = json.loads((INPUT / 'overlay-manifest.json').read_text())
art = json.loads((INPUT / 'vellum-art-manifest.json').read_text())
assert set(overlay) - set(before) == set(art) - {'tilepick.cc'}
assert {n for n in before if before[n] != overlay[n]} == {'tilepick.cc'}
OUT.mkdir()
save(OUT / 'original-progress.json', progress)
identity = pwd.getpwnam('nobody')
with tarfile.open(INPUT / 'overlay.tar.gz') as archive:
    assert set(archive.getnames()) == set(overlay)
    for entry in archive:
        assert entry.isfile() and not Path(entry.name).is_absolute() and '..' not in Path(entry.name).parts
        content = archive.extractfile(entry).read()
        assert hashlib.sha256(content).hexdigest() == overlay[entry.name]
        if entry.name not in art:
            continue
        target = SOURCE / entry.name
        if target.exists():
            backup = OUT / 'before' / entry.name
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        os.chown(target, identity.pw_uid, identity.pw_gid)
env = {**os.environ, 'HOME': str(ROOT / 'validation/home'), 'TERM': 'xterm-256color',
       'TMPDIR': str(ROOT / 'validation/tmp'), 'PYTHONPATH': str(SOURCE / 'webserver')}
make = ['make', '-k', '-j2', 'WEBTILES=y', 'NOWIZARD=y', 'STDFLAG=-std=c++17', 'NO_OPTIMIZE=y']
commands = [
    ('build', make + ['crawl', 'catch2-tests-executable', 'webserver']),
    ('new-species', ['./catch2-tests-executable', '[new-species]', '--reporter', 'console']),
    ('adjacent', ['./catch2-tests-executable', '[vellum],[pakellas],[vorr],[bloodcraft],[shell],[party-session],[party-trade],[save-compatibility]', '--reporter', 'console']),
    ('catalog', ['python3', 'webserver/util/generate_character_catalog.py', '--binary', str(SOURCE / 'crawl')]),
    ('preview', ['python3', 'webserver/tests/native-character-preview.py', '--binary', str(SOURCE / 'crawl')]),
]
progress.update(status='validating_vellum_art', plan=control)
save(ROOT / 'validation/progress.json', progress)
os.nice(10)
for name, command in commands:
    started = time.monotonic()
    with (OUT / (name + '.log')).open('w') as output:
        call = subprocess.run(command, cwd=SOURCE, env=env, stdout=output, stderr=subprocess.STDOUT,
            user=identity.pw_uid, group=identity.pw_gid, extra_groups=[], timeout=3600)
    receipt = {'step': name, 'exit_code': call.returncode, 'seconds': round(time.monotonic()-started, 2)}
    save(OUT / (name + '.json'), receipt)
    print(json.dumps(receipt), flush=True)
    assert call.returncode == 0, name
for name, expected in overlay.items():
    assert sha(SOURCE / name) == expected, name
assert '-DWIZARD' not in (SOURCE / '.cflags').read_text()
for name, token in [('feat', 'TILE_DNGN_ALTAR_VELLUM'), ('gui', 'TILEG_ABILITY_VELLUM_WEAVE')]:
    assert token in (SOURCE / ('rltiles/tiledef-' + name + '.h')).read_text()
    assert sha(SOURCE / ('rltiles/' + name + '.png')) == sha(SOURCE / ('dat/tiles/' + name + '.png'))
    assert sha(SOURCE / ('dat/tiles/' + name + '.png')) == sha(SOURCE / ('webserver/game_data/static/' + name + '.png'))
permanent = ROOT / 'release-input'
permanent.mkdir()
for name in ('overlay.tar.gz', 'overlay-manifest.json', 'stage-plan.json', 'vellum-art-manifest.json'):
    shutil.copy2(INPUT / name, permanent / name)
receipt = {'passed': True, 'native_sha256': sha(SOURCE / 'crawl'),
    'overlay_sha256': control['overlay_archive_sha256'], 'art': art,
    'atlases': {name: sha(SOURCE / ('webserver/game_data/static/' + name + '.png')) for name in ('feat', 'gui')},
    'production_mutated': False, 'completed_at': time.time()}
save(OUT / 'result.json', receipt)
progress.update(status='validated_not_published', native_sha256=receipt['native_sha256'], vellum_art=receipt)
save(ROOT / 'validation/progress.json', progress)
print(json.dumps(receipt), flush=True)
