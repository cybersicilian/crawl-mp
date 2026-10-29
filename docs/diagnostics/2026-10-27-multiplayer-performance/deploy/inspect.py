"""Read the current production binding without touching accounts or saves."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path('/opt/dcss/current').resolve()
source = root / 'crawl-ref/source'
names = ['crawl', 'webserver/webtiles/player_stream.py', 'webserver/webtiles/state_transport.py',
         'webserver/webtiles/map_snapshot.py', 'webserver/webtiles/party_control.py',
         'webserver/webtiles/activity_pump.py', 'webserver/webtiles/process_handler.py',
         'webserver/webtiles/ws_handler.py', 'webserver/game_data/static/player.js',
         'webserver/static/scripts/state-stream.js']
active = []
for path in Path('/proc').glob('[0-9]*'):
    try:
        if (path / 'exe').resolve().name == 'crawl':
            active.append(int(path.name))
    except (FileNotFoundError, PermissionError):
        pass
print(json.dumps(dict(current=str(root), previous=str(Path('/opt/dcss/previous').resolve()),
    hashes={name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in names},
    state_links={name: str((source / name).resolve()) for name in ['rcs', 'saves']},
    service=subprocess.check_output(['systemctl', 'is-active', 'dcss-coop'], text=True).strip(),
    native_processes=active), indent=2))
