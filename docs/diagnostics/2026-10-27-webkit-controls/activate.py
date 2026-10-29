"""Save only this service's native games before its guarded release switch."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import time

PAYLOAD = Path('/tmp/dcss-webkit-catchup-01a17ea4')
OPERATION = Path('/opt/dcss/staging/webkit-catchup-01a17ea4')
spec = importlib.util.spec_from_file_location('overlay', PAYLOAD / 'deploy_overlay.py')
overlay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overlay)
core = overlay.core
held = core.locks()
core.baseline()
ready = json.loads((OPERATION / 'prepared.json').read_text())
assert ready['ready'] and ready['browser_tests_passed']
assert json.loads((OPERATION / 'backend-result.json').read_text())['passed']
assert not (OPERATION / 'activation.json').exists()
for name, digest in dict(ready['runtime_files'], **ready['preserved_runtime']).items():
    assert core.sha(Path(ready['release']) / core.PREFIX / name) == digest, name
main = int(subprocess.check_output(['systemctl', 'show', 'dcss-coop', '-p', 'MainPID', '--value'], text=True))
active = core.native_processes()
games = []
for pid in active:
    proc = Path('/proc') / str(pid)
    stat = (proc / 'stat').read_text().split()
    assert int(stat[3]) == main, 'Preserve native processes outside this service'
    assert core.sha(proc / 'exe') == ready['preserved_runtime']['crawl']
    command = (proc / 'cmdline').read_bytes()
    args = command.split(b'\0')
    owner = args[args.index(b'-name') + 1].decode()
    with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        records = [dict(row) for row in db.execute(
            "SELECT id,owner,status,save_dir FROM games WHERE owner=? AND status='active'", (owner,))]
    assert len(records) == 1, 'Require an unambiguous active saved-game identity'
    record = records[0]
    assert Path(record['save_dir']).resolve().is_relative_to(core.STATE)
    games.append(dict(pid=pid, start=stat[21], command_sha256=hashlib.sha256(command).hexdigest(), record=record))
assert core.native_processes() == active, 'Native game set changed before checkpoint'
started = time.time()
for game in games:
    proc = Path('/proc') / str(game['pid'])
    assert (proc / 'stat').read_text().split()[21] == game['start']
    assert hashlib.sha256((proc / 'cmdline').read_bytes()).hexdigest() == game['command_sha256']
    os.kill(game['pid'], signal.SIGHUP)  # Normal native save-and-exit request.
for _ in range(80):
    if not core.native_processes():
        break
    time.sleep(.25)
assert not core.native_processes(), 'No forced termination is permitted if a checkpoint stalls'
for game in games:
    record = game['record']
    with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
        status = db.execute('SELECT status FROM games WHERE id=?', (record['id'],)).fetchone()
    assert status == ('saved',), 'Require saved-library acknowledgement before restart'
    packages = list(Path(record['save_dir']).glob('*.cs'))
    assert packages and all(p.stat().st_size > 0 for p in packages)
    assert any(p.stat().st_mtime >= started - 1 for p in packages), 'Require a fresh native checkpoint'
    game['checkpoint'] = {str(p): core.sha(p) for p in packages}
core.write(OPERATION / 'graceful-save.json', dict(passed=True, forced_kill=False, games=games))
for handle in held:
    handle.close()
core.activate(OPERATION)
assert json.loads((OPERATION / 'activation.json').read_text())['deployed']
