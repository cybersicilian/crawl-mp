"""Read the exact UI baseline for a narrow overlay on the performance release."""
import hashlib
import json
from pathlib import Path

root = Path('/opt/dcss/current').resolve()
source = root / 'crawl-ref/source'
names = ['webserver/game_data/static/' + name for name in ['adventure-ui.js', 'direction-pad.js',
         'route-plan.js', 'inspection-dialog.js', 'styles/direction-pad.css']]
files = {name: dict(sha256=hashlib.sha256((source / name).read_bytes()).hexdigest(),
                   text=(source / name).read_text()) for name in names}
preserve = ['crawl', 'webserver/webtiles/player_stream.py', 'webserver/webtiles/player_update.py',
            'webserver/webtiles/state_transport.py']
print(json.dumps(dict(current=str(root), files=files,
    preserve={name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in preserve})))
