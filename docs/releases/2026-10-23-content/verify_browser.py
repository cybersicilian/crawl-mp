"""Own and close a disposable localhost server around the native browser probe."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import time
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = Path('/private/tmp/dcss-release-merged-01a16a0f')
RUNTIME = Path(os.environ['CONTENT_RUNTIME'])
OUT = Path(os.environ['CONTENT_PROOF'])
OUT.mkdir(parents=True, exist_ok=True)
PORT = 18987
with socket.socket() as probe:
    probe.bind(('127.0.0.1', PORT))
env = {**os.environ, 'CONTENT_SOURCE': str(SOURCE), 'CONTENT_PROOF': str(OUT),
       'WEBTILES_URL': f'http://127.0.0.1:{PORT}',
       'NODE_PATH': '/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'}


def own_native():
    rows = subprocess.check_output(['ps', '-axo', 'pid=,command='], text=True).splitlines()
    return [int(row.split(None, 1)[0]) for row in rows
            if len(row.split(None, 1)) == 2
            and row.split(None, 1)[1].startswith(str(SOURCE / 'crawl') + ' ')
            and str(RUNTIME) in row]


server_log = (OUT / 'server.log').open('w')
server = subprocess.Popen([str(ROOT / '.venv/bin/python'), str(SOURCE / 'webserver/util/qa_server.py'),
    '--source', str(SOURCE), '--build', str(SOURCE), '--runtime', str(RUNTIME), '--port', str(PORT)],
    env=env, stdout=server_log, stderr=subprocess.STDOUT)
try:
    for _ in range(120):
        if server.poll() is not None:
            raise RuntimeError('Private QA server exited; inspect server.log')
        try:
            urllib.request.urlopen(env['WEBTILES_URL'], timeout=1).close()
            break
        except OSError:
            time.sleep(0.25)
    else:
        raise RuntimeError('Private QA server did not become ready')
    result = subprocess.run(['node', str(HERE / 'verify-browser.cjs')], env=env, timeout=480)
    if result.returncode:
        raise RuntimeError('Browser probe failed: ' + str(result.returncode))
finally:
    before = own_native()
    for pid in before:
        try:
            os.kill(pid, signal.SIGHUP)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + 15
    while own_native() and time.monotonic() < deadline:
        time.sleep(0.2)
    remaining = own_native()
    if remaining:
        for pid in remaining:
            os.kill(pid, signal.SIGTERM)
        time.sleep(1)
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait(timeout=5)
    server_log.close()
    closure = {'native_pids_before_shutdown': before, 'native_pids_remaining': own_native(),
               'server_pid': server.pid, 'server_exit': server.returncode,
               'runtime': str(RUNTIME), 'production_touched': False}
    (OUT / 'server-closure.json').write_text(json.dumps(closure, indent=2) + '\n')
    assert not closure['native_pids_remaining'], closure
