#!/usr/bin/env python3
"""Bind one foreground validation phase and close only this task's lease."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / 'crawl-ref/source'
POLICY = Path.home() / 'Documents/Codex/work/host-heavy/policy.json'
OWNER = 'codex/01a1595d-0932-78b2-8247-2ea2e862c9f0'


def read(path):
    return json.loads(path.read_text())


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def gate(policy, *args):
    script = Path(policy['gateScript'])
    assert sha(script) == policy['gateSha256']
    return subprocess.run([sys.executable, str(script), '--state-dir',
                           policy['stateDirectory'], *args], capture_output=True, text=True)


def close(policy, state, name):
    assert state['owner'] == OWNER
    assert state['status'] in ('completed_held', 'failed_held')
    assert state['supervisedProcessGroupGone'] is True
    try:
        os.killpg(state['processGroup'], 0)
        raise RuntimeError('Validation process group is still alive')
    except ProcessLookupError:
        pass
    evidence = HERE / (name + '-closure.json')
    result = read(HERE / 'validation-result.json') if (HERE / 'validation-result.json').exists() else {}
    save(evidence, {'reservationId': state['runId'], 'owner': OWNER,
                    'allOwnedProcessesGone': True,
                    'phaseClosureEvidence': {'gateState': state, 'validation': result}})
    response = gate(policy, 'release', '--owner', OWNER, '--reservation-id',
                    state['runId'], '--evidence', str(evidence))
    print(response.stdout or response.stderr, flush=True)
    if response.returncode:
        raise RuntimeError('Owned phase did not release')


def main():
    name = sys.argv[1]
    policy = read(POLICY)
    assert not policy['resourceHold']['active']
    state_path = Path(policy['stateDirectory']) / 'state.json'
    state = read(state_path)
    if state.get('owner') == OWNER and state.get('status') in ('completed_held', 'failed_held'):
        close(policy, state, name + '-predecessor')
    archive = HERE / name
    archive.mkdir(exist_ok=False)
    for filename in ('phase-request.json', 'reservation.json', 'validation-result.json',
                     'step-1.log', 'step-2.log', 'step-3.log'):
        path = HERE / filename
        if path.exists():
            path.rename(archive / filename)
    isolated = Path('/private/tmp/dcss-dithmenos-01a1595d-validation')
    scoped = (HERE / 'changed-files.txt').read_text().splitlines()
    # This auxiliary one-line build fix is separately recorded. The renderer
    # continues to change in another chat, so keep its frozen version here.
    scoped = [name for name in scoped if name not in ('tileweb-party.cc', 'Makefile.obj')]
    for filename in scoped:
        if sha(SOURCE / filename) != sha(isolated / filename):
            shutil.copy2(SOURCE / filename, isolated / filename)
    suffixes = {'.cc', '.h', '.hpp', '.c', '.y', '.l', '.lua', '.yaml', '.py', '.txt'}
    hashes = {str(p.relative_to(isolated)): sha(p) for p in isolated.rglob('*')
              if p.is_file() and p.suffix in suffixes and 'contrib/' not in str(p.relative_to(isolated))}
    for filename in ('Makefile', 'Makefile.obj'):
        hashes[filename] = sha(isolated / filename)
    request = {'owner': OWNER, 'label': 'DCSS classic Dithmenos frozen build and focused tests',
               'sourceHashes': hashes, 'workingSourceHashes': {n: sha(SOURCE / n) for n in scoped},
               'maxParallelCompilers': 2, 'frozenSnapshot': True,
               'scope': 'Frozen engine baseline plus classic Dithmenos; exclude subsequent unrelated renderer and test-manifest edits.',
               'runnerSha256': sha(HERE / 'run_validation.py'), 'noProductionMutation': True,
               'auxiliaryBuildFix': read(HERE / 'auxiliary-build-fix.json')}
    request['releaseVersion'] = subprocess.check_output(
        ['git', 'describe'], cwd=SOURCE.parents[1], text=True).strip()
    save(HERE / 'phase-request.json', request)
    request_id = sha(HERE / 'phase-request.json')
    response = gate(policy, 'reserve', '--owner', OWNER, '--label', request['label'],
                    '--request-id', request_id)
    print(response.stdout or response.stderr, flush=True)
    if response.returncode:
        return response.returncode
    (HERE / 'reservation.json').write_text(response.stdout)
    reservation = json.loads(response.stdout)
    script = Path(policy['gateScript'])
    command = [sys.executable, str(script), '--state-dir', policy['stateDirectory'],
               'run', '--owner', OWNER, '--label', request['label'], '--reservation-id',
               reservation['runId'], '--request-id', request_id, '--',
               sys.executable, str(HERE / 'run_validation.py')]
    result = subprocess.run(command)
    state = read(state_path)
    assert state['runId'] == reservation['runId']
    close(policy, state, name)
    return result.returncode


if __name__ == '__main__':
    sys.exit(main())
