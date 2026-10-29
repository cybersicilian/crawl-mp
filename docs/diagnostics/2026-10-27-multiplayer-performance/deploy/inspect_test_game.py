"""Read only the disposable acceptance account's native process and save state."""
import json
from pathlib import Path
import sqlite3

owner = 'Perf0mvr3l91d'
native = []
for proc in Path('/proc').glob('[0-9]*'):
    try:
        command = (proc / 'cmdline').read_bytes().replace(b'\0', b' ').decode()
        if (proc / 'exe').resolve().name == 'crawl' and owner in command:
            native.append(dict(pid=int(proc.name), command=command))
    except (FileNotFoundError, PermissionError, ProcessLookupError):
        pass
with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
    db.row_factory = sqlite3.Row
    games = [dict(row) for row in db.execute('SELECT id,owner,status,save_dir FROM games WHERE owner=?', (owner,))]
for game in games:
    game['native_packages'] = [str(p) for p in Path(game['save_dir']).glob('*.cs')]
print(json.dumps(dict(owner=owner, native_processes=native, games=games), indent=2))
