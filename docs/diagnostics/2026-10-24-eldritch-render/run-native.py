"""One bounded full-client phase, with common gate and exact owned cleanup."""
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
OWNER = 'codex/01a16b6d-f723-7503-b137-767be6599e33'
OUT = HERE / ('native-' + os.environ.get('ELDRITCH_ATTEMPT', '1'))
UNIT = os.environ.get('ELDRITCH_UNIT', 'dcss-eldritch-render-01a16b6d-qa.service')
REMOTE = ['gcloud', 'compute', 'ssh', 'dcss-coop-server', '--project', 'chuk-437319',
          '--zone', 'us-central1-a', '--tunnel-through-iap', '--quiet']
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

def save(p, value):
    p.write_text(json.dumps(value, indent=2) + '\n')

def members(group):
    rows = subprocess.check_output(['ps', '-axo', 'pid=,pgid=,command='], text=True).splitlines()
    return [r for r in rows if len(r.split(None, 2)) > 1 and r.split(None, 2)[1] == str(group)]

def worker():
    request = json.loads((OUT / 'request.json').read_text())
    assert request['runnerSha256'] == sha(__file__)
    assert request['verifierSha256'] == sha(HERE / 'verify-native.cjs')
    tunnel = None
    closure = {'unit': UNIT}
    try:
        if request['resources'].get('nativeRuntime'):
            import shlex
            runtime = request['resources']['nativeRuntime']
            assert runtime.startswith('/opt/dcss/staging/eldritch-render-01a16b6d/')
            identity = json.loads(subprocess.check_output(REMOTE + ['--command',
                'sudo cat ' + shlex.quote(runtime + '/run-info.json')], text=True, timeout=60))
            assert identity['binary_sha256'] == request['resources']['nativeSha256']
            save(OUT / 'native-identity.json', identity)
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 18888))
        with (OUT / 'tunnel.log').open('w') as log:
            tunnel = subprocess.Popen(REMOTE + ['--', '-N', '-L',
                '127.0.0.1:18888:127.0.0.1:18988', '-o', 'ExitOnForwardFailure=yes',
                '-o', 'ServerAliveInterval=30'], start_new_session=True, stdout=log, stderr=log)
            closure['tunnelGroup'] = tunnel.pid
            for _ in range(120):
                assert tunnel.poll() is None, 'Tunnel exited'
                try:
                    urllib.request.urlopen('http://127.0.0.1:18888', timeout=1).close()
                    break
                except OSError:
                    time.sleep(.25)
            else:
                raise RuntimeError('Private QA tunnel unavailable')
            env = {**os.environ, 'ELDRITCH_QA_URL': 'http://127.0.0.1:18888',
                'ELDRITCH_PROOF': str(OUT),
                'NODE_PATH': '/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'}
            if os.environ.get('ELDRITCH_LOADING_TEST'):
                env.update(BROWSER_EXECUTABLE='/Users/iancaltabiano/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
                    LOADING_PROOF_DIR=str(OUT / 'loading-ui'))
                with (OUT / 'loading-ui.log').open('w') as log:
                    subprocess.run(['node', str(ROOT / 'crawl-ref/source/webserver/tests/loading-ui.cjs')],
                        env=env, stdout=log, stderr=subprocess.STDOUT, timeout=90, check=True)
            with (OUT / 'browser.log').open('w') as browser_log:
                call = subprocess.run(['node', str(HERE / 'verify-native.cjs')], cwd=ROOT,
                    env=env, stdout=browser_log, stderr=subprocess.STDOUT, timeout=360)
            if call.returncode == 0:
                evidence = json.loads((OUT / 'evidence.json').read_text())
                evidence['native_sha256'] = request['resources']['nativeSha256']
                evidence['request_sha256'] = sha(OUT / 'request.json')
                save(OUT / 'evidence.json', evidence)
            closure['browserExit'] = call.returncode
            return call.returncode
    finally:
        if tunnel:
            if members(tunnel.pid):
                os.killpg(tunnel.pid, signal.SIGTERM)
            try:
                tunnel.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(tunnel.pid, signal.SIGKILL)
                tunnel.wait(timeout=5)
            closure['tunnelRemaining'] = members(tunnel.pid)
        stop = subprocess.run(REMOTE + ['--command', 'sudo systemctl stop ' + UNIT
            + '; sudo systemctl show ' + UNIT + ' -p ActiveState -p SubState -p MainPID'],
            capture_output=True, text=True, timeout=60)
        closure['remoteStop'] = {'exit': stop.returncode, 'stdout': stop.stdout, 'stderr': stop.stderr}
        save(OUT / 'owned-closure.json', closure)
        assert not closure.get('tunnelRemaining') and stop.returncode == 0
        assert 'MainPID=0' in stop.stdout and 'ActiveState=active' not in stop.stdout

def dispatch():
    OUT.mkdir(exist_ok=False)
    policy = json.loads((STATE / 'policy.json').read_text())
    gate = Path(policy['gateScript'])
    assert sha(gate) == policy['gateSha256'] and not policy.get('resourceHold', {}).get('active')
    assert not any(row.get('currentlyBookable') or row.get('currentlyExecutable') for row in policy['queue'])
    request = OUT / 'request.json'
    save(request, {'owner': OWNER, 'runnerSha256': sha(__file__),
        'verifierSha256': sha(HERE / 'verify-native.cjs'),
        'helperSha256': sha(ROOT / 'crawl-ref/source/webserver/tests/helpers/test-account.cjs'),
        'patchManifestSha256': sha(HERE / 'patch-manifest.json'),
        'loadingUITest': bool(os.environ.get('ELDRITCH_LOADING_TEST')),
        'resources': {'browsers': 1, 'engine': os.environ.get('ELDRITCH_BROWSER', 'webkit'),
            'unit': UNIT, 'nativeRuntime': os.environ.get('ELDRITCH_RUNTIME'),
            'nativeSha256': os.environ.get('ELDRITCH_NATIVE_SHA', '5699adf0b40eb16892f311b1b403b098558743424bdbb011d472a7319809461d'),
            'localBuild': False, 'accounts': 'isolated QA only'},
        'atlasFault': bool(os.environ.get('ELDRITCH_ATLAS_FAULT')),
        'species': os.environ.get('ELDRITCH_SPECIES', 'Eldritch,Human,Eldritch')})
    base = ['python3', str(gate)]
    label = 'DCSS Eldritch real native rendering'
    reserve = subprocess.run(base + ['reserve', '--owner', OWNER, '--label', label,
        '--request-id', sha(request)], text=True, capture_output=True)
    print(reserve.stdout, reserve.stderr, flush=True)
    if reserve.returncode:
        return reserve.returncode
    run_id = json.loads(reserve.stdout)['runId']
    call = subprocess.run(base + ['run', '--owner', OWNER, '--label', label,
        '--reservation-id', run_id, '--request-id', sha(request), '--cwd', str(ROOT),
        '--', 'python3', str(Path(__file__).resolve()), 'worker'])
    state = json.loads((STATE / 'state.json').read_text())
    assert state['runId'] == run_id and state['owner'] == OWNER and state['supervisedProcessGroupGone']
    assert not members(state['processGroup'])
    closed = json.loads((OUT / 'owned-closure.json').read_text())
    browser = json.loads((OUT / 'browser-closure.json').read_text())
    assert not members(browser['pid']) and not closed.get('tunnelRemaining')
    save(OUT / 'phase-closure.json', {'state': state, 'browser': browser, 'owned': closed})
    save(OUT / 'release.json', {'reservationId': run_id, 'owner': OWNER,
        'allOwnedProcessesGone': True, 'phaseClosureEvidence': str(OUT / 'phase-closure.json')})
    subprocess.run(base + ['release', '--owner', OWNER, '--reservation-id', run_id,
        '--evidence', str(OUT / 'release.json')], check=True)
    return call.returncode

if __name__ == '__main__':
    raise SystemExit(worker() if len(sys.argv) > 1 and sys.argv[1] == 'worker' else dispatch())
