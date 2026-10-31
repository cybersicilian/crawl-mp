"""Validate only the live public source plus the reviewed content overlay locally."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
STATE = Path('/Users/iancaltabiano/Documents/Codex/work/host-heavy')
OWNER = 'codex/01a16a0f-b9dc-7e80-ad55-34720b26d695'
OUT = HERE / 'merged-validation-1'
TARGET = Path('/private/tmp/dcss-release-merged-01a16a0f')
DEPENDENCIES = Path('/private/tmp/dcss-content-afd682036c668a2c/crawl-ref/source/contrib')
PYTHON = str(ROOT / '.venv/bin/python')
MAKE = ['make', '-k', '-j2', 'WEBTILES=y', 'STDFLAG=-std=c++17',
        'NO_OPTIMIZE=y', 'PYTHON=/usr/local/bin/python3']
COMMANDS = [MAKE + ['crawl', 'catch2-tests-executable'],
    ['./crawl', '--builddb', '--reset-cache'],
    ['./catch2-tests-executable', '[new-species]', '--reporter', 'console'],
    ['./catch2-tests-executable', '[vellum],[pakellas],[vorr],[bloodcraft],[shell],[party-session],[party-trade],[save-compatibility]', '--reporter', 'console'],
    MAKE + ['webserver'],
    [PYTHON, 'webserver/util/generate_character_catalog.py', '--binary', str(TARGET / 'crawl')],
    [PYTHON, 'webserver/tests/native-character-preview.py', '--binary', str(TARGET / 'crawl')],
    [PYTHON, str(HERE / 'verify_creation.py'), str(TARGET / 'crawl')],
    [PYTHON, '-m', 'unittest', 'webtiles.character_preview_test', 'webtiles.gameplay_protocol_test',
     'webtiles.party_control_test', 'webtiles.skill_training_test', 'webtiles.save_lifecycle_test'],
    ['node', str(ROOT / 'crawl-ref/source/webserver/tests/party-status.cjs')]]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def prepare():
    OUT.mkdir(exist_ok=False)
    archives = {name: sha(HERE / name) for name in ('full-live-source.tar.gz',
        'live-build-aux.tar.gz', 'overlay.tar.gz', 'live-manifest.json', 'overlay-manifest.json', 'verify_creation.py')}
    cache = {str(p.relative_to(DEPENDENCIES)): sha(p) for p in sorted(DEPENDENCIES.rglob('*'))
             if p.is_file() and '.git' not in p.parts}
    save(OUT / 'dependency-cache.json', cache)
    policy = json.loads((STATE / 'policy.json').read_text())
    assert sha(Path(policy['gateScript'])) == policy['gateSha256']
    save(OUT / 'request.json', {'owner': OWNER, 'archives': archives,
        'runnerSha256': sha(Path(__file__)), 'dependencyCacheSha256': sha(OUT / 'dependency-cache.json'),
        'dependencyCache': str(DEPENDENCIES), 'commands': COMMANDS, 'target': str(TARGET),
        'gateScript': policy['gateScript'], 'gateSha256': policy['gateSha256'],
        'stateDirectory': str(STATE), 'resourceBinding': {'makeJobs': 2, 'phases': 'sequential'},
        'scope': 'Exact deployed public source plus scoped overlay; private local build and contracts only',
        'notClaimed': ['Linux build', 'browser gameplay', 'production deployment'], 'createdAt': time.time()})
    print(sha(OUT / 'request.json'))


def run():
    request = json.loads((OUT / 'request.json').read_text())
    state = json.loads((STATE / 'state.json').read_text())
    assert state['owner'] == OWNER and state['requestId'] == sha(OUT / 'request.json')
    assert state['status'] == 'running' and state['reservation'] and state['processGroup'] == os.getpgrp()
    assert not json.loads((STATE / 'policy.json').read_text()).get('resourceHold', {}).get('active')
    assert request['runnerSha256'] == sha(Path(__file__))
    assert request['dependencyCacheSha256'] == sha(OUT / 'dependency-cache.json')
    for name, expected in request['archives'].items():
        assert sha(HERE / name) == expected, name
    TARGET.mkdir(exist_ok=False)
    expected = json.loads((HERE / 'live-manifest.json').read_text())['files']
    for archive_name in ('full-live-source.tar.gz', 'live-build-aux.tar.gz', 'overlay.tar.gz'):
        with tarfile.open(HERE / archive_name) as archive:
            for member in archive:
                assert not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
                assert member.isfile() or member.isdir(), member.name
                if member.isdir():
                    continue
                target = TARGET / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                content = archive.extractfile(member).read()
                if archive_name == 'full-live-source.tar.gz':
                    assert hashlib.sha256(content).hexdigest() == expected[member.name]
                target.write_bytes(content)
                target.chmod(member.mode)
    overlay = json.loads((HERE / 'overlay-manifest.json').read_text())
    for name, digest in {**expected, **overlay}.items():
        assert sha(TARGET / name) == digest, name
    for name, digest in json.loads((OUT / 'dependency-cache.json').read_text()).items():
        original = DEPENDENCIES / name
        assert sha(original) == digest
        destination = TARGET / 'contrib' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, destination)
    (TARGET / 'util/release_ver').write_text('0.33-a0\n')
    save(OUT / 'exact-inputs.json', {str(p.relative_to(TARGET)): sha(p)
        for p in sorted(TARGET.rglob('*')) if p.is_file()})
    results = []
    for index, command in enumerate(COMMANDS, 1):
        log = OUT / ('step-' + str(index) + '.log')
        started = time.monotonic()
        with log.open('w') as output:
            result = subprocess.run(command, cwd=TARGET, stdout=output, stderr=subprocess.STDOUT,
                env={**os.environ, 'TERM': 'xterm-256color', 'PYTHONPATH': str(TARGET / 'webserver'),
                     'PYTHONPYCACHEPREFIX': str(OUT / 'pycache')})
        entry = {'command': command, 'exitCode': result.returncode, 'log': str(log),
                 'seconds': round(time.monotonic() - started, 2)}
        results.append(entry)
        save(OUT / 'result.json', {'requestId': sha(OUT / 'request.json'), 'target': str(TARGET),
            'results': results, 'complete': len(results) == len(COMMANDS),
            'passed': len(results) == len(COMMANDS) and all(row['exitCode'] == 0 for row in results)})
        print(json.dumps(entry), flush=True)
        if result.returncode:
            return result.returncode
    return 0


def dispatch():
    request = json.loads((OUT / 'request.json').read_text())
    policy = json.loads((STATE / 'policy.json').read_text())
    assert sha(Path(policy['gateScript'])) == policy['gateSha256'] == request['gateSha256']
    assert not policy.get('resourceHold', {}).get('active')
    assert not any(row.get('currentlyBookable') or row.get('currentlyExecutable') for row in policy['queue'])
    base = ['python3', policy['gateScript'], '--state-dir', str(STATE)]
    call = subprocess.run(base + ['reserve', '--owner', OWNER, '--label', 'DCSS exact merged release validation',
        '--request-id', sha(OUT / 'request.json')], text=True, capture_output=True)
    print(call.stdout, flush=True)
    if call.returncode:
        print(call.stderr)
        return call.returncode
    run_id = json.loads(call.stdout)['runId']
    return subprocess.call(base + ['run', '--owner', OWNER, '--label', 'DCSS exact merged release validation',
        '--reservation-id', run_id, '--request-id', sha(OUT / 'request.json'), '--cwd', str(ROOT),
        '--', 'python3', str(Path(__file__)), 'run'])


if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        prepare()
    elif sys.argv[1] == 'dispatch':
        raise SystemExit(dispatch())
    else:
        raise SystemExit(run())
