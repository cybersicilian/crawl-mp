"""Checkpoint the observed native game, then use the unchanged activation guard."""
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import signal
import sqlite3
import time

PAYLOAD = Path('/tmp/dcss-direction-hotkeys-01a17ea4-r2')
OPERATION = Path('/opt/dcss/staging/multiplayer-performance-01a17ea4-ui')
PID = 368202
GAME = '1d5cd1cb-59ba-43e8-917d-9c1cdce5bff6'
spec = importlib.util.spec_from_file_location('ui_deploy', PAYLOAD / 'deploy_ui.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
core = module.core


def record():
    with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        row = db.execute('SELECT id,owner,status,save_dir FROM games WHERE id=?', (GAME,)).fetchone()
        assert row is not None
        return dict(row)


held = core.locks()
core.baseline()
prepared = json.loads((OPERATION / 'prepared.json').read_text())
assert prepared['ready'] and prepared['browser_tests_passed']
assert not (OPERATION / 'activation.json').exists()
for name, digest in dict(prepared['runtime_files'], **prepared['preserved_runtime']).items():
    assert core.sha(Path(prepared['release']) / core.PREFIX / name) == digest, name
active = core.native_processes()
assert not active or active == [PID], 'Active game set changed; preserve it and inspect again'
proof = dict(started_at=datetime.now(timezone.utc).isoformat(), forced_kill=False,
             prior_native_processes=active, game_id=GAME)
if active:
    process = Path('/proc') / str(PID)
    identity = (process / 'stat').read_text().split()[21]
    assert core.sha(process / 'exe') == prepared['preserved_runtime']['crawl']
    command = (process / 'cmdline').read_bytes().split(b'\0')
    assert command[command.index(b'-name') + 1] == b'JediJosh'
    before = record()
    assert before['owner'] == 'JediJosh' and before['status'] == 'active'
    snapshot = OPERATION.with_name(OPERATION.name + '-pre-quiesce')
    assert not snapshot.exists()
    snapshot.mkdir(mode=0o700)
    proof['prior_checkpoint_backup'] = core.backup(snapshot)['directory']
    assert core.native_processes() == [PID]
    assert (process / 'stat').read_text().split()[21] == identity
    started = time.time()
    os.kill(PID, signal.SIGHUP)  # The same save request used by client disconnect.
    for _ in range(80):
        if not core.native_processes() and record()['status'] == 'saved':
            break
        time.sleep(0.25)
    assert not core.native_processes(), 'Save did not complete; no forced termination permitted'
    after = record()
    assert after['status'] == 'saved' and after['save_dir'] == before['save_dir']
    packages = list(Path(after['save_dir']).glob('*.cs'))
    assert packages and all(p.stat().st_size > 0 for p in packages)
    assert any(p.stat().st_mtime >= started - 1 for p in packages), 'Fresh checkpoint missing'
    proof['native_save_verified'] = True
    proof['saved_record'] = after
    proof['native_packages'] = {str(p): core.sha(p) for p in packages}
    core.write(OPERATION / 'graceful-save.json', proof)
else:
    proof['native_game_already_exited'] = True
    core.write(OPERATION / 'graceful-save.json', proof)
for handle in held:
    handle.close()
core.activate(OPERATION)
assert json.loads((OPERATION / 'activation.json').read_text())['deployed']
