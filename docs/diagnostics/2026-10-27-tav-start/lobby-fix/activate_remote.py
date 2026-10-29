"""Checkpoint service-owned games, verify copied saves, and activate the candidate."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import signal
import sqlite3
import subprocess
import time

payload = Path('/tmp/dcss-tav-lobby-fix-01a17f43-r3')
operation = Path('/opt/dcss/staging/tav-lobby-fix-01a17f43')
spec = importlib.util.spec_from_file_location('tav_overlay', payload / 'deploy_fix.py')
overlay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overlay)
core = overlay.core
held = core.locks()
core.baseline()
ready = json.loads((operation / 'prepared.json').read_text())
assert ready['ready'] and ready['native_test_passed'] and ready['backend_tests_passed']
assert not (operation / 'activation.json').exists()
candidate = Path(ready['release']) / core.PREFIX
for name, digest in ready['runtime_files'].items():
    assert core.sha(candidate / name) == digest, name
main = int(subprocess.check_output(['systemctl', 'show', 'dcss-coop', '-p', 'MainPID', '--value'], text=True))
active = core.native_processes()
games = []
for pid in active:
    proc = Path('/proc') / str(pid)
    stat = (proc / 'stat').read_text().split()
    assert int(stat[3]) == main, 'Preserve native processes outside this service'
    assert core.sha(proc / 'exe') == core.BASE_HASHES['crawl']
    # Bind the native process to its library record, independent of hero name.
    environment = dict(entry.split(b'=', 1) for entry in (proc / 'environ').read_bytes().split(b'\0') if b'=' in entry)
    identifier = environment[b'CRAWL_GAME_ID'].decode()
    save_dir = Path(environment[b'CRAWL_SAVE_DIR'].decode()).resolve()
    with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        record = db.execute("SELECT id,owner,status,save_dir FROM games WHERE id=?", (identifier,)).fetchone()
        assert record and record['status'] == 'active'
        record = dict(record)
    assert Path(record['save_dir']).resolve() == save_dir
    assert save_dir.is_relative_to(core.STATE)
    games.append({'pid': pid, 'start': stat[21], 'record': record,
                  'command_sha256': hashlib.sha256((proc / 'cmdline').read_bytes()).hexdigest()})
assert core.native_processes() == active
started = time.time()
for game in games:
    proc = Path('/proc') / str(game['pid'])
    assert (proc / 'stat').read_text().split()[21] == game['start']
    assert hashlib.sha256((proc / 'cmdline').read_bytes()).hexdigest() == game['command_sha256']
    os.kill(game['pid'], signal.SIGHUP)
for _ in range(120):
    if not core.native_processes():
        break
    time.sleep(.25)
assert not core.native_processes(), 'Checkpoint must finish without forced termination'
for game in games:
    record = game['record']
    with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
        assert db.execute('SELECT status FROM games WHERE id=?', (record['id'],)).fetchone() == ('saved',)
    packages = list(Path(record['save_dir']).glob('*.cs'))
    assert packages and all(p.stat().st_size > 0 for p in packages)
    assert any(p.stat().st_mtime >= started - 1 for p in packages)
    game['checkpoint'] = {str(p): core.sha(p) for p in packages}
core.write(operation / 'graceful-save.json', {'passed': True, 'forced_kill': False, 'games': games})

original_backup = core.backup
def backup_with_compatibility(target):
    saved = original_backup(target)
    qa = Path(ready['private_qa']) / 'save-compatibility'
    qa.mkdir(mode=0o755)
    runtime_user = pwd.getpwnam('dcss')
    os.chown(qa, runtime_user.pw_uid, runtime_user.pw_gid)
    checks = []
    for number, (name, digest) in enumerate(saved['save_files'].items()):
        if not name.endswith('.cs') or not isinstance(digest, str):
            continue
        copied = qa / (str(number) + '.cs')
        shutil.copy2(Path(saved['directory']) / 'files' / name, copied)
        os.chown(copied, runtime_user.pw_uid, runtime_user.pw_gid)
        copied.chmod(0o600)
        assert core.sha(copied) == digest
        metadata = []
        for source in [core.BASE / core.PREFIX, candidate]:
            result = subprocess.run(['sudo', '-u', 'dcss', str(source / 'crawl'),
                                     '-save-json', str(copied)], cwd=qa,
                                    capture_output=True, text=True, timeout=30)
            assert result.returncode == 0, (name, result.stderr)
            metadata.append(json.loads(result.stdout))
        assert metadata[0] == metadata[1], name
        assert core.sha(copied) == digest
        checks.append({'save': name, 'metadata_equal': True,
                       'loadable': any(row.get('loadable') for row in metadata[1].values())})
    core.write(operation / 'save-compatibility.json', {'passed': True, 'checks': checks,
               'copied_packages_only': True, 'original_save_files_unchanged': True})
    return saved

core.backup = backup_with_compatibility
# Keep both deployment locks continuously held through checkpoint and cutover.
core.locks = lambda: held
core.activate(operation)
assert json.loads((operation / 'activation.json').read_text())['deployed']
