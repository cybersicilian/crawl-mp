"""Bind one private-Linux or public browser phase to the common local gate."""
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
STATE = Path('/Users/iancaltabiano/Documents/Codex/work/host-heavy')
OWNER = 'codex/01a16a0f-b9dc-7e80-ad55-34720b26d695'
PHASE = os.environ['CONTENT_PHASE']
assert PHASE in ('linux-private', 'public')
ATTEMPT = os.environ.get('CONTENT_REMOTE_ATTEMPT', '1')
OUT = HERE / (PHASE + '-browser-' + ATTEMPT)
HELPER = HERE / 'browser-support/webserver/tests/multiplayer-native-client.cjs'
READY = HERE / ('linux-prepared.json' if PHASE == 'linux-private' else 'activation.json')
PORT = 18887


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def group_members(group):
    rows = subprocess.check_output(['ps', '-axo', 'pid=,pgid=,command='], text=True).splitlines()
    return [row for row in rows if len(row.split(None, 2)) >= 2 and row.split(None, 2)[1] == str(group)]


def prepare():
    OUT.mkdir(exist_ok=False)
    ready = json.loads(READY.read_text())
    assert ready['passed']
    policy = json.loads((STATE / 'policy.json').read_text())
    assert sha(Path(policy['gateScript'])) == policy['gateSha256']
    save(OUT / 'request.json', {'owner': OWNER, 'phase': PHASE, 'stateDirectory': str(STATE),
        'runnerSha256': sha(Path(__file__)), 'browserScriptSha256': sha(HERE / 'release-browser.cjs'),
        'artVerifierSha256': sha(HERE / 'verify-content-art.cjs'),
        'artPixelsSha256': sha(HERE / 'content-art-pixels.json'),
        'helperSha256': sha(HELPER), 'readyPath': str(READY), 'readySha256': sha(READY),
        'overlayManifestSha256': sha(HERE / 'overlay-manifest.json'),
        'native_sha256': ready['native_sha256'], 'release': ready['release'],
        'url': 'http://127.0.0.1:' + str(PORT) if PHASE == 'linux-private' else 'https://dcss.iancaltabiano.com',
        'gateSha256': policy['gateSha256'], 'resourceBinding': {'browsers': 1, 'contexts': 2, 'localNativeBuild': False},
        'createdAt': time.time()})
    print(sha(OUT / 'request.json'))


def run():
    request = json.loads((OUT / 'request.json').read_text())
    state = json.loads((STATE / 'state.json').read_text())
    assert state['owner'] == OWNER and state['requestId'] == sha(OUT / 'request.json')
    assert state['status'] == 'running' and state['reservation'] and state['processGroup'] == os.getpgrp()
    assert not json.loads((STATE / 'policy.json').read_text()).get('resourceHold', {}).get('active')
    assert request['runnerSha256'] == sha(Path(__file__))
    assert request['browserScriptSha256'] == sha(HERE / 'release-browser.cjs')
    assert request['artVerifierSha256'] == sha(HERE / 'verify-content-art.cjs')
    assert request['artPixelsSha256'] == sha(HERE / 'content-art-pixels.json')
    assert request['helperSha256'] == sha(HELPER) and request['readySha256'] == sha(READY)
    assert request['overlayManifestSha256'] == sha(HERE / 'overlay-manifest.json')
    tunnel = None
    tunnel_log = None
    closure = {'phase': PHASE, 'tunnel_members_remaining': []}
    try:
        if PHASE == 'linux-private':
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', PORT))
            tunnel_log = (OUT / 'tunnel.log').open('w')
            tunnel = subprocess.Popen(['gcloud', 'compute', 'ssh', 'dcss-coop-server', '--project',
                'chuk-437319', '--zone', 'us-central1-a', '--tunnel-through-iap', '--quiet', '--',
                '-N', '-L', f'127.0.0.1:{PORT}:127.0.0.1:18987', '-o', 'ExitOnForwardFailure=yes',
                '-o', 'ServerAliveInterval=30'], start_new_session=True,
                stdout=tunnel_log, stderr=subprocess.STDOUT)
            closure['owned_tunnel_group'] = tunnel.pid
            for _ in range(120):
                assert tunnel.poll() is None, 'Owned tunnel exited'
                try:
                    urllib.request.urlopen(request['url'], timeout=1).close()
                    break
                except OSError:
                    time.sleep(0.25)
            else:
                raise RuntimeError('Private QA tunnel did not become ready')
        env = {**os.environ, 'CONTENT_SOURCE': str(HELPER.parents[2]), 'CONTENT_PROOF': str(OUT),
            'CONTENT_PHASE': PHASE, 'WEBTILES_URL': request['url'],
            'NODE_PATH': '/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'}
        with (OUT / 'browser.log').open('w') as log:
            call = subprocess.run(['node', str(HERE / 'release-browser.cjs')], cwd=ROOT,
                env=env, stdout=log, stderr=subprocess.STDOUT, timeout=480)
        assert call.returncode == 0, 'Browser probe failed; inspect browser.log'
        evidence = json.loads((OUT / 'evidence.json').read_text())
        assert evidence['passed'] and not evidence['errors'] and not evidence['assetErrors']
        evidence.update(native_sha256=request['native_sha256'], release=request['release'],
                        requestId=sha(OUT / 'request.json'))
        save(OUT / 'evidence.json', evidence)
        print(json.dumps({'passed': True, 'phase': PHASE, 'checks': evidence['checks']}), flush=True)
    finally:
        if tunnel:
            if group_members(tunnel.pid):
                os.killpg(tunnel.pid, signal.SIGTERM)
            try:
                tunnel.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(tunnel.pid, signal.SIGKILL)
                tunnel.wait(timeout=5)
            deadline = time.monotonic() + 5
            while group_members(tunnel.pid) and time.monotonic() < deadline:
                time.sleep(0.1)
            closure['tunnel_members_remaining'] = group_members(tunnel.pid)
        if tunnel_log:
            tunnel_log.close()
        save(OUT / 'owned-closure.json', closure)
        assert not closure['tunnel_members_remaining'], closure


def dispatch():
    request = json.loads((OUT / 'request.json').read_text())
    policy = json.loads((STATE / 'policy.json').read_text())
    assert sha(Path(policy['gateScript'])) == policy['gateSha256'] == request['gateSha256']
    assert not policy.get('resourceHold', {}).get('active')
    assert not any(row.get('currentlyBookable') or row.get('currentlyExecutable') for row in policy['queue'])
    base = ['python3', policy['gateScript'], '--state-dir', str(STATE)]
    call = subprocess.run(base + ['reserve', '--owner', OWNER, '--label', 'DCSS ' + PHASE + ' content browser',
        '--request-id', sha(OUT / 'request.json')], text=True, capture_output=True)
    print(call.stdout, flush=True)
    if call.returncode:
        print(call.stderr)
        return call.returncode
    run_id = json.loads(call.stdout)['runId']
    return subprocess.call(base + ['run', '--owner', OWNER, '--label', 'DCSS ' + PHASE + ' content browser',
        '--reservation-id', run_id, '--request-id', sha(OUT / 'request.json'), '--cwd', str(ROOT),
        '--', 'python3', str(Path(__file__)), 'run'])


if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        prepare()
    else:
        raise SystemExit(dispatch() if sys.argv[1] == 'dispatch' else run())
