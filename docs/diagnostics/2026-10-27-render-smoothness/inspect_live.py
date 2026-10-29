"""Read-only production identity and the six proposed browser overlay sources."""
import fcntl
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess

root = Path('/opt/dcss/current').resolve()
source = root / 'crawl-ref/source'
names = ['webserver/game_data/static/' + name for name in [
    'party-sidebar.js', 'party.js', 'dungeon_renderer.js', 'party-navigation.js', 'party-card-readings.js']]
names += ['webserver/static/scripts/visibility-feather.js']
preserve = ['crawl', 'webserver/webtiles/process_handler.py', 'webserver/webtiles/player_stream.py',
            'webserver/webtiles/player_update.py', 'webserver/webtiles/state_transport.py']
def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()
processes = []
for process in Path('/proc').glob('[0-9]*'):
    try:
        if (process / 'exe').resolve().name == 'crawl':
            processes.append({'pid':int(process.name), 'binary_sha256':sha(process / 'exe'),
                              'start_ticks':(process / 'stat').read_text().split()[21]})
    except (FileNotFoundError, PermissionError):
        pass
lock_state = {}
for path in ['/opt/dcss/release-build.lock', '/run/lock/dcss-counts-activation.lock']:
    with open(path, 'a') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            lock_state[path] = 'available'
            fcntl.flock(handle, fcntl.LOCK_UN)
        except BlockingIOError:
            lock_state[path] = 'held'
records = []
with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
    db.row_factory = sqlite3.Row
    records = [dict(row) for row in db.execute('SELECT id,status,save_dir FROM games WHERE status = ?', ('active',))]
print(json.dumps({'current':str(root),'previous':str(Path('/opt/dcss/previous').resolve()),
    'files':{name:{'sha256':sha(source/name),'text':(source/name).read_text()} for name in names},
    'preserve':{name:sha(source/name) for name in preserve},
    'processes':processes,'active_records':records,'locks':lock_state,
    'state_links':{name:str((source/name).resolve()) for name in ['rcs','saves']},
    'service':subprocess.check_output(['systemctl','is-active','dcss-coop'],text=True).strip()}))
