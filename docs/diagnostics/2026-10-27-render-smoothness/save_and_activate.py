"""Gracefully checkpoint the exact observed live games, then guarded cutover."""
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import time

PAYLOAD = Path('/tmp/dcss-render-smoothness-01a1801a')
OPERATION = Path('/opt/dcss/staging/render-smoothness-01a1801a')
spec = importlib.util.spec_from_file_location('overlay', PAYLOAD / 'deploy_overlay.py')
overlay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overlay)
core = overlay.core
plan = json.loads((OPERATION / 'quiesce-plan.json').read_text())
staged = json.loads((OPERATION / 'staged-browser.json').read_text())
assert staged['passed'] and staged['source_manifest_sha256'] == core.sha(PAYLOAD / 'manifest.json')


def record(identifier):
    with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        row = db.execute('SELECT id,owner,status,save_dir FROM games WHERE id=?', (identifier,)).fetchone()
        assert row is not None
        return dict(row)


held = core.locks()
core.baseline()
ready = json.loads((OPERATION / 'prepared.json').read_text())
assert ready['ready'] and not (OPERATION / 'activation.json').exists()
for name, digest in dict(ready['runtime_files'], **ready['preserved_runtime']).items():
    assert core.sha(Path(ready['release']) / core.PREFIX / name) == digest, name
active = core.native_processes()
assert set(active).issubset({entry['pid'] for entry in plan['processes']}), 'Live game set changed; inspect again'
proof = dict(started_at=datetime.now(timezone.utc).isoformat(), forced_kill=False,
             observed_native_processes=active, saved_games=[])
if active:
    snapshot = OPERATION.with_name(OPERATION.name + '-before-service-stop')
    assert not snapshot.exists()
    snapshot.mkdir(mode=0o700)
    proof['prior_checkpoint_backup'] = core.backup(snapshot)['directory']
before_records = []
for entry in plan['processes']:
    pid = entry['pid']
    if pid not in core.native_processes():
        continue
    process = Path('/proc') / str(pid)
    assert (process / 'stat').read_text().split()[21] == entry['start_ticks'], 'Native process identity changed'
    assert core.sha(process / 'exe') == ready['preserved_runtime']['crawl']
    command = (process / 'cmdline').read_bytes().split(b'\0')
    assert command[command.index(b'-name') + 1].decode() == entry['name']
    before = record(entry['record_id'])
    assert before['owner'] == entry['owner'] and before['status'] == 'active'
    before_records.append(before)
started = time.time()
try:
    # Normal server shutdown first stops accepting connections and marks all
    # sockets as shutting down, then requests native SIGHUP checkpoints. Keep
    # the service stopped through activation so automatic reconnect cannot
    # resume a game in the gap between checkpointing and release switching.
    subprocess.run(['systemctl', 'stop', 'dcss-coop'], check=True, timeout=60)
    assert not core.native_processes(), 'Native shutdown did not finish'
    for before in before_records:
        after = record(before['id'])
        assert after['status'] == 'saved' and after['save_dir'] == before['save_dir']
        packages = list(Path(after['save_dir']).glob('*.cs'))
        assert packages and all(path.stat().st_size > 0 for path in packages)
        assert any(path.stat().st_mtime >= started - 1 for path in packages), 'Fresh checkpoint missing'
        proof['saved_games'].append(dict(id=after['id'], native_save_verified=True,
            packages={str(path): core.sha(path) for path in packages}))
    core.write(OPERATION / 'graceful-service-save.json', proof)
    for handle in held:
        handle.close()
    core.activate(OPERATION)
    assert json.loads((OPERATION / 'activation.json').read_text())['deployed']
except BaseException:
    if Path('/opt/dcss/current').resolve() == core.BASE:
        subprocess.run(['systemctl', 'start', 'dcss-coop'], check=True, timeout=60)
    raise
