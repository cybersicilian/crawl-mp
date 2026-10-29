"""One gate-owned sequential profile; never touches existing accounts or saves."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
label = sys.argv[1]
binding_path = OUT / (label + '-binding.json')

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def manifest():
    paths = []
    for directory in ['crawl-ref/source/webserver']:
        paths.extend(path for path in (ROOT / directory).rglob('*') if path.is_file()
                     and path.suffix in ['.py', '.js', '.css', '.cjs', '.html', '.png', '.yaml', '.json']
                     and '__pycache__' not in path.parts and 'tests' not in path.parts
                     and not path.name.endswith('_test.py'))
    paths.extend(ROOT / 'crawl-ref/source/webserver/tests' / name for name in [
        'helpers/test-account.cjs', 'multiplayer-native-client.cjs', 'party-sidebar.cjs',
        'helpers/ui-sprite-fixture.cjs', 'display-frames.cjs', 'visibility-feather.test.cjs'])
    paths.extend(OUT / name for name in ['run.py', 'server.py', 'profile.cjs'])
    result = {str(path.relative_to(ROOT)): digest(path) for path in sorted(set(paths))}
    result['native_binary:/private/tmp/dcss-prompt-ownership-01a17b3b/source/crawl'] = digest(Path('/private/tmp/dcss-prompt-ownership-01a17b3b/source/crawl'))
    return result

if len(sys.argv) > 2 and sys.argv[2] == '--prepare':
    binding_path.write_text(json.dumps({'files': manifest(), 'resources': {
        'simultaneous_browsers': 1, 'browser_engines': ['chromium', 'webkit'],
        'native_processes': 1, 'native_heroes': 4, 'native_actions_per_engine': 24,
        'native_rebuild': False, 'existing_saves_used': False,
        'maximum_seconds_per_engine': 180, 'localhost_port': 19028
    }}, indent=2) + '\n')
    print(digest(binding_path))
    sys.exit()

assert manifest() == json.loads(binding_path.read_text())['files'], 'Source binding changed'
env = dict(os.environ, NODE_PATH='/Users/iancaltabiano/.cache/codex-runtimes/'
           'codex-primary-runtime/dependencies/node/node_modules', QA_LABEL=label)
report = {'passed': False, 'existing_saves_used': False, 'production_mutation': False}
server = None
with tempfile.TemporaryDirectory(prefix='dcss-smooth-', dir='/tmp') as temporary:
    env['QA_WORK'] = temporary
    try:
        with (OUT / (label + '-server.log')).open('w') as log:
            server = subprocess.Popen([str(ROOT / '.venv/bin/python'), str(OUT / 'server.py')],
                                      env=env, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
            for attempt in range(100):
                if server.poll() is not None:
                    raise RuntimeError('QA server exited: ' + (OUT / (label + '-server.log')).read_text()[-5000:])
                try:
                    urllib.request.urlopen('http://127.0.0.1:19028/', timeout=1)
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('QA server did not become ready')
            for engine in ['chromium', 'webkit']:
                result = subprocess.run(['/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node', str(OUT / 'profile.cjs')], env=dict(env, QA_ENGINE=engine),
                                        cwd=ROOT, capture_output=True, text=True, timeout=180)
                (OUT / (label + '-' + engine + '.log')).write_text(result.stdout + result.stderr)
                print(result.stdout[-5000:] + result.stderr[-2000:], flush=True)
                assert result.returncode == 0, engine + ' failed'
            if label in ['candidate1', 'candidate2']:
                command = ['/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node',
                           str(ROOT / 'crawl-ref/source/webserver/tests/party-sidebar.cjs')]
                result = subprocess.run(command, env=dict(env, SIDEBAR_PROOF_DIR=str(OUT / (label + '-sidebar'))),
                                        cwd=ROOT, capture_output=True, text=True, timeout=120)
                (OUT / (label + '-sidebar.log')).write_text(result.stdout + result.stderr)
                print(result.stdout[-3000:] + result.stderr[-3000:], flush=True)
                assert result.returncode == 0, 'Sidebar workflow regression failed'
            assert manifest() == json.loads(binding_path.read_text())['files'], 'Source changed during profile'
            report['passed'] = True
    finally:
        if server and server.poll() is None:
            server.send_signal(signal.SIGTERM)
            try:
                server.wait(timeout=20)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
        report['server_exited'] = server is None or server.poll() is not None
        if not report['passed']:
            for path in Path(temporary).rglob('*.ttyrec'):
                (OUT / (label + '-native-terminal.txt')).write_text(path.read_bytes().decode('utf-8', errors='replace'))
        (OUT / (label + '-result.json')).write_text(json.dumps(report, indent=2) + '\n')
