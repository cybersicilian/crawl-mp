"""Read Rogue's Tav launch identities and save metadata without playing a game."""
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import time

state = Path('/var/lib/dcss')
root = Path('/opt/dcss/current').resolve()
rows = []
with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
    db.row_factory = sqlite3.Row
    for row in db.execute("SELECT * FROM games WHERE lower(owner)='rogue' ORDER BY created_at DESC LIMIT 10"):
        value = dict(row)
        for name in ['party_json', 'snapshot_json']:
            if name in value:
                value[name] = json.loads(value[name])
        files = []
        for save in Path(value['save_dir']).glob('*.cs'):
            files.append({'name': save.name, 'size': save.stat().st_size,
                          'modified': save.stat().st_mtime})
        value['native_packages'] = files
        events = state / 'rcs/library/events' / (value['id'] + '.json')
        if events.exists():
            value['native_record'] = json.loads(events.read_text())
        rows.append(value)
processes = []
for proc in Path('/proc').glob('[0-9]*'):
    try:
        if (proc / 'exe').resolve().name != 'crawl':
            continue
        environment = dict(entry.split(b'=', 1) for entry in (proc / 'environ').read_bytes().split(b'\0') if b'=' in entry)
        selected = {k.decode(): v.decode() for k,v in environment.items()
                    if k.startswith(b'CRAWL_ACCOUNT_') or k in [b'CRAWL_GAME_ID', b'CRAWL_SAVE_DIR']}
        if not any(v.lower() == 'rogue' for k,v in selected.items() if k.startswith('CRAWL_ACCOUNT_')):
            if selected.get('CRAWL_GAME_ID') not in {r['id'] for r in rows}:
                continue
        processes.append({'pid': int(proc.name), 'exe': str((proc / 'exe').resolve()),
                          'binary_sha256': hashlib.sha256((proc / 'exe').read_bytes()).hexdigest(),
                          'arguments': (proc / 'cmdline').read_bytes().decode().split('\0'),
                          'launch_identity': selected})
    except (FileNotFoundError, PermissionError):
        pass
print(json.dumps({'checked_at': time.time(), 'current': str(root),
                  'games': rows, 'active_native_processes': processes}, indent=2))
