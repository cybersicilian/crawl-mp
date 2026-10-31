"""Freeze the privately tested installation; state links are prepared off-line."""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = Path('/opt/dcss/staging/content-01a16a0f-v1')
read = lambda name: json.loads((ROOT / name).read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
write = lambda name, value: (ROOT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')
lock = open('/opt/dcss/release-build.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
prepared, browser = read('prepared.json'), read('private-browser.json')
assert prepared['passed'] and browser['passed']
release = Path(prepared['release'])
source = release / 'crawl-ref/source'
assert Path('/opt/dcss/current').resolve() == Path(prepared['baseline'])
assert sha(source / 'crawl') == prepared['native_sha256'] == browser['native_sha256']
assert read('save-compatibility.json')['passed']
assert subprocess.run(['systemctl', 'is-active', '--quiet', 'dcss-content-01a16a0f-qa']).returncode != 0
assert not Path('/sys/fs/cgroup/system.slice/dcss-content-01a16a0f-qa.service').exists()
assert '-DWIZARD' not in (source / '.cflags').read_text()
overlay = json.loads((ROOT / 'release-input/overlay-manifest.json').read_text())
for name, expected in overlay.items():
    assert sha(source / name) == expected, name
baseline = json.loads(Path('/tmp/dcss-content-live-manifest.json').read_text())
assert baseline['release'] == prepared['baseline']
generated = {'species-type.h', 'species-data.h', 'species-groups.h', 'aptitudes.h',
    'config.h', 'build.h', 'compflag.h', 'art-enum.h', 'art-data.h', 'mi-enum.h',
    'cmd-name.h', 'mon-mst.h', 'mon-data.h', 'job-data.h', 'job-groups.h', 'job-type.h',
    'form-data.h', 'dat/dlua/tags.lua', 'webserver/static/scripts/character-catalog.js',
    'webserver/static/starting-weapons.json', 'webserver/webtiles/version.txt'}
drift = {}
for name, expected in baseline['files'].items():
    current = sha(source / name)
    if current == expected:
        continue
    assert name in overlay or name in generated or name.startswith(('rltiles/tiledef-',
        'rltiles/tileinfo-', 'webserver/game_data/static/tileinfo-')) or (
        name.startswith(('webserver/game_data/static/', 'webserver/static/',
                         'dat/tiles/', 'rltiles/')) and name.endswith('.png')), name
    drift[name] = current
for name in ('rcs', 'saves'):
    target = source / name
    assert target.is_dir() and not target.is_symlink()
    target.rename(ROOT / ('installed-validation-' + name))
    target.symlink_to(Path('/var/lib/dcss') / name, target_is_directory=True)
sys.path.insert(0, str(source / 'webserver'))
from webtiles.asset_revision import revision
receipt = {'passed': True, 'release': str(release), 'baseline': prepared['baseline'],
    'native_sha256': sha(source / 'crawl'), 'overlay_sha256': prepared['overlay_sha256'],
    'client_revision': revision(source / 'webserver/game_data'),
    'lobby_revision': revision(source / 'webserver/static'),
    'source_differences': drift, 'frozen_at': time.time(), 'qa_closed': True,
    'state_links': {name: str((source / name).resolve()) for name in ('rcs', 'saves')}}
(release / 'content-release.json').write_text(json.dumps(receipt, indent=2) + '\n')
installed = {}
for directory, folders, names in os.walk(release, followlinks=False):
    folders[:] = [name for name in folders if name != '__pycache__'
                  and not (Path(directory) / name).is_symlink()]
    for name in names:
        path = Path(directory) / name
        if not path.is_symlink() and path.suffix not in {'.o', '.d', '.pyc', '.gch', '.a'}:
            installed[str(path.relative_to(release))] = sha(path)
write('installed-manifest.json', installed)
receipt['installed_manifest_sha256'] = sha(ROOT / 'installed-manifest.json')
write('final-freeze.json', receipt)
print(json.dumps({key: value for key, value in receipt.items() if key != 'source_differences'}))
