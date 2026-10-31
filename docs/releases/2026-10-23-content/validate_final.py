"""Finish the exact merged candidate using only this task's bound local cache."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import time

import validate_merged as merged

HERE, ROOT, STATE, OWNER, SOURCE = merged.HERE, merged.ROOT, merged.STATE, merged.OWNER, merged.TARGET
ATTEMPT = os.environ.get('CONTENT_ATTEMPT', '2')
OUT = HERE / ('merged-validation-' + ATTEMPT)
INPUTS = ['validate_final.py', 'validate_merged.py', 'verify_creation.py', 'verify_browser.py',
          'verify-browser.cjs', 'verify_vellum_actions.cjs', 'refresh_species.py', 'overlay.tar.gz', 'overlay-manifest.json', 'live-browser-tests.tar.gz', 'live-browser-aux.tar.gz']
COMMANDS = [['python3', str(HERE / 'refresh_species.py')],
            *merged.COMMANDS,
            ['node', 'webserver/tests/character-options.cjs'],
            ['node', str(HERE / 'verify_vellum_actions.cjs')],
            [merged.PYTHON, str(HERE / 'verify_browser.py')]]
if os.environ.get('CONTENT_BROWSER_ONLY') == '1':
    COMMANDS = [[merged.PYTHON, str(HERE / 'verify_browser.py')]]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def prepare():
    OUT.mkdir(exist_ok=False)
    cache = {str(p.relative_to(SOURCE)): sha(p) for p in sorted(SOURCE.rglob('*')) if p.is_file()}
    save(OUT / 'cache.json', cache)
    policy = json.loads((STATE / 'policy.json').read_text())
    assert sha(Path(policy['gateScript'])) == policy['gateSha256']
    save(OUT / 'request.json', {'owner': OWNER, 'stateDirectory': str(STATE),
        'reusedNativeEvidence': {'path': str(HERE / 'merged-validation-5/result.json'),
            'sha256': sha(HERE / 'merged-validation-5/result.json')},
        'inputs': {name: sha(HERE / name) for name in INPUTS}, 'cacheSha256': sha(OUT / 'cache.json'),
        'gateSha256': policy['gateSha256'], 'commands': COMMANDS,
        'resourceBinding': {'makeJobs': 2, 'phases': 'sequential', 'browserInstances': 1},
        'runtime': '/private/tmp/dcss-content-qa-01a16a0f-' + ATTEMPT,
        'scope': 'Private exact merged native build, contracts, catalog and real two-owner browser save/resume',
        'notClaimed': ['Linux runtime', 'production deployment'], 'createdAt': time.time()})
    print(sha(OUT / 'request.json'))


def run():
    request = json.loads((OUT / 'request.json').read_text())
    state = json.loads((STATE / 'state.json').read_text())
    assert state['owner'] == OWNER and state['requestId'] == sha(OUT / 'request.json')
    assert state['status'] == 'running' and state['reservation'] and state['processGroup'] == os.getpgrp()
    assert not json.loads((STATE / 'policy.json').read_text()).get('resourceHold', {}).get('active')
    for name, digest in request['inputs'].items():
        assert sha(HERE / name) == digest, name
    assert sha(OUT / 'cache.json') == request['cacheSha256']
    for name, digest in json.loads((OUT / 'cache.json').read_text()).items():
        assert sha(SOURCE / name) == digest, name
    overlay = json.loads((HERE / 'overlay-manifest.json').read_text())
    for filename in ('live-browser-tests.tar.gz', 'live-browser-aux.tar.gz', 'overlay.tar.gz'):
        with tarfile.open(HERE / filename) as archive:
            for member in archive:
                assert not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
                assert member.isfile() or member.isdir(), member.name
                if member.isdir():
                    continue
                content = archive.extractfile(member).read()
                if filename == 'overlay.tar.gz':
                    assert hashlib.sha256(content).hexdigest() == overlay[member.name]
                target = SOURCE / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.exists() or target.read_bytes() != content:
                    target.write_bytes(content)
                    target.chmod(member.mode)
    for name, digest in overlay.items():
        assert sha(SOURCE / name) == digest
    env = {**os.environ, 'TERM': 'xterm-256color', 'PYTHONPATH': str(SOURCE / 'webserver'),
           'PYTHONPYCACHEPREFIX': str(OUT / 'pycache'), 'CONTENT_RUNTIME': request['runtime'],
           'CONTENT_PROOF': str(OUT / 'browser'), 'CONTENT_SOURCE': str(SOURCE)}
    results = []
    for index, command in enumerate(COMMANDS, 1):
        log = OUT / ('step-' + str(index) + '.log')
        started = time.monotonic()
        with log.open('w') as output:
            call = subprocess.run(command, cwd=SOURCE, stdout=output, stderr=subprocess.STDOUT, env=env)
        row = {'command': command, 'exitCode': call.returncode, 'log': str(log),
               'seconds': round(time.monotonic() - started, 2)}
        results.append(row)
        save(OUT / 'result.json', {'requestId': sha(OUT / 'request.json'), 'source': str(SOURCE),
            'results': results, 'complete': len(results) == len(COMMANDS),
            'passed': len(results) == len(COMMANDS) and all(row['exitCode'] == 0 for row in results)})
        print(json.dumps(row), flush=True)
        if call.returncode:
            return call.returncode
    return 0


def dispatch():
    request = json.loads((OUT / 'request.json').read_text())
    policy = json.loads((STATE / 'policy.json').read_text())
    assert sha(Path(policy['gateScript'])) == policy['gateSha256'] == request['gateSha256']
    assert not policy.get('resourceHold', {}).get('active')
    assert not any(row.get('currentlyBookable') or row.get('currentlyExecutable') for row in policy['queue'])
    base = ['python3', policy['gateScript'], '--state-dir', str(STATE)]
    call = subprocess.run(base + ['reserve', '--owner', OWNER, '--label', 'DCSS merged candidate final validation',
        '--request-id', sha(OUT / 'request.json')], text=True, capture_output=True)
    print(call.stdout, flush=True)
    if call.returncode:
        print(call.stderr)
        return call.returncode
    run_id = json.loads(call.stdout)['runId']
    return subprocess.call(base + ['run', '--owner', OWNER, '--label', 'DCSS merged candidate final validation',
        '--reservation-id', run_id, '--request-id', sha(OUT / 'request.json'), '--cwd', str(ROOT),
        '--', 'python3', str(Path(__file__)), 'run'])


if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        prepare()
    else:
        raise SystemExit(dispatch() if sys.argv[1] == 'dispatch' else run())
