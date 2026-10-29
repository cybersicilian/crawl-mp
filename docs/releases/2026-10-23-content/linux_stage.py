"""Build and validate the pinned content overlay in a private Linux candidate.

Never changes current/previous, system configuration, accounts or live saves.
The compile/test children run as nobody in a new task-owned staging directory.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tarfile
import time

BASE = Path('/opt/dcss/releases/20261023T190229Z-stats-website')
STAGE = Path('/opt/dcss/staging/content-01a16a0f-v1')
SOURCE = STAGE / 'crawl-ref/source'
INPUT = Path('/tmp/dcss-content-overlay.tar.gz')
MANIFEST = Path('/tmp/dcss-content-overlay-manifest.json')
CONTROL = Path('/tmp/dcss-content-stage-plan.json')
OWNER = 'codex/01a16a0f-b9dc-7e80-ad55-34720b26d695'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(data):
    (STAGE / 'validation/progress.json').write_text(json.dumps(data, indent=2, sort_keys=True) + '\n')


assert os.geteuid() == 0
plan = json.loads(CONTROL.read_text())
assert plan['owner'] == OWNER and plan['expected_current'] == str(BASE)
assert Path('/opt/dcss/current').resolve() == BASE
assert sha(BASE / 'crawl-ref/source/crawl') == plan['expected_native_sha256']
assert sha(INPUT) == plan['overlay_archive_sha256'] and sha(MANIFEST) == plan['overlay_manifest_sha256']
assert not STAGE.exists(), 'Never overwrite a previously owned or foreign candidate'
STAGE.mkdir()
(STAGE / 'validation').mkdir()
progress = {'owner': OWNER, 'pid': os.getpid(), 'process_group': os.getpgrp(),
            'baseline': str(BASE), 'stage': str(STAGE), 'plan': plan,
            'started_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'status': 'copying', 'results': [], 'production_mutated': False}
save(progress)
source = BASE / 'crawl-ref/source'
SOURCE.mkdir(parents=True)
subprocess.run(['rsync', '-a', '--exclude=*.o', '--exclude=/*.d',
    '--exclude=/catch2-tests/*.d', '--exclude=/rltiles/tool/*.d', '--exclude=/util/*.d', '--exclude=*.gch',
    '--exclude=__pycache__', '--exclude=.git', '--exclude=node_modules',
    '--exclude=/crawl', '--exclude=/catch2-tests-executable', '--exclude=/saves',
    '--exclude=/rcs', '--exclude=/morgue', '--exclude=/webserver/run',
    '--exclude=/webserver/config.yml', '--exclude=/webserver/debug-config.yml',
    '--exclude=/init.txt', str(source) + '/', str(SOURCE) + '/'], check=True)
overlay = json.loads(MANIFEST.read_text())
with tarfile.open(INPUT) as archive:
    assert set(archive.getnames()) == set(overlay)
    for entry in archive:
        assert entry.isfile() and not Path(entry.name).is_absolute() and '..' not in Path(entry.name).parts
        content = archive.extractfile(entry).read()
        assert hashlib.sha256(content).hexdigest() == overlay[entry.name]
        target = SOURCE / entry.name
        assert target.resolve().is_relative_to(STAGE)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.content-new')
        temporary.write_bytes(content)
        temporary.replace(target)
for name, expected in overlay.items():
    assert sha(SOURCE / name) == expected
nobody = pwd.getpwnam('nobody')
for directory in ('validation/home', 'validation/tmp'):
    (STAGE / directory).mkdir()
subprocess.run(['chown', '-R', str(nobody.pw_uid) + ':' + str(nobody.pw_gid), str(STAGE)], check=True)
env = {**os.environ, 'HOME': str(STAGE / 'validation/home'), 'TERM': 'xterm-256color',
       'TMPDIR': str(STAGE / 'validation/tmp'), 'PYTHONPATH': str(SOURCE / 'webserver'),
       'PYTHONPYCACHEPREFIX': str(STAGE / 'validation/pycache')}
os.nice(10)
commands = [
    ['python3', 'util/species-gen.py', 'dat/species/', 'util/species-gen/',
     'species-data.h', 'aptitudes.h', 'species-groups.h', 'species-type.h'],
    ['make', '-k', '-j2', 'WEBTILES=y', 'NOWIZARD=y', 'STDFLAG=-std=c++17', 'NO_OPTIMIZE=y',
     'crawl', 'catch2-tests-executable'],
    ['./crawl', '--builddb', '--reset-cache'],
    ['./catch2-tests-executable', '[new-species]', '--reporter', 'console'],
    ['./catch2-tests-executable', '[vellum],[pakellas],[vorr],[bloodcraft],[shell],[party-session],[party-trade],[save-compatibility]',
     '--reporter', 'console'],
    ['make', '-j2', 'WEBTILES=y', 'NOWIZARD=y', 'STDFLAG=-std=c++17', 'NO_OPTIMIZE=y', 'webserver'],
    ['python3', 'webserver/util/generate_character_catalog.py', '--binary', str(SOURCE / 'crawl')],
    ['python3', 'webserver/tests/native-character-preview.py', '--binary', str(SOURCE / 'crawl')],
    ['python3', '-m', 'unittest', 'webtiles.character_preview_test', 'webtiles.gameplay_protocol_test',
     'webtiles.party_control_test', 'webtiles.skill_training_test', 'webtiles.save_lifecycle_test'],
]
try:
    progress['status'] = 'validating'
    for index, command in enumerate(commands, 1):
        progress['current_command'] = command
        progress['step'] = index
        save(progress)
        log = STAGE / 'validation' / ('step-' + str(index) + '.log')
        start = time.monotonic()
        with log.open('w') as output:
            result = subprocess.run(command, cwd=SOURCE, env=env, stdout=output, stderr=subprocess.STDOUT,
                                    user=nobody.pw_uid, group=nobody.pw_gid, extra_groups=[], timeout=3600)
        entry = {'command': command, 'exit_code': result.returncode, 'log': str(log),
                 'seconds': round(time.monotonic() - start, 2)}
        progress['results'].append(entry)
        print(json.dumps(entry), flush=True)
        save(progress)
        if result.returncode:
            raise RuntimeError('Validation command failed: ' + str(command))
    assert Path('/opt/dcss/current').resolve() == BASE, 'Production changed; reconcile before activation'
    assert sha(BASE / 'crawl-ref/source/crawl') == plan['expected_native_sha256']
    progress.update(status='validated_not_published', native_sha256=sha(SOURCE / 'crawl'),
                    finished_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
except Exception as error:
    progress.update(status='failed_not_published', error=str(error))
    raise
finally:
    save(progress)
