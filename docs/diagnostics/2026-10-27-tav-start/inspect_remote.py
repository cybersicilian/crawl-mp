import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

root = Path('/opt/dcss/current').resolve()
source = root / 'crawl-ref/source'
def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()
names = ['crawl', 'account-start.cc', 'ng-setup.cc', 'party.cc', 'tileweb.cc',
         'webserver/webtiles/process_handler.py',
         'webserver/webtiles/player_stream.py', 'webserver/webtiles/player_update.py',
         'webserver/webtiles/state_transport.py']
native = {p.name: sha(p) for p in source.iterdir() if p.suffix in {'.cc', '.h'}}
candidates = []
for binary in list(Path('/opt/dcss/staging').glob('*/crawl')) + list(Path('/opt/dcss/staging').glob('*/crawl-ref/source/crawl')):
    if not binary.is_file():
        continue
    binary_sha = sha(binary)
    row = {'source': str(binary.parent), 'binary_sha256': binary_sha,
           'matches_binary': binary_sha == sha(source / 'crawl')}
    if row['matches_binary']:
        row['native_differences'] = [name for name, digest in native.items()
                                     if not (binary.parent / name).is_file()
                                     or sha(binary.parent / name) != digest]
        row['flags'] = (binary.parent / '.cflags').read_text() if (binary.parent / '.cflags').exists() else None
    candidates.append(row)
processes = []
for proc in Path('/proc').glob('[0-9]*'):
    try:
        if (proc / 'exe').resolve().name == 'crawl':
            processes.append({'pid': int(proc.name), 'parent': int((proc / 'stat').read_text().split()[3]),
                              'binary_sha256': sha(proc / 'exe')})
    except (FileNotFoundError, PermissionError):
        pass
locks = {}
for name in ['/opt/dcss/release-build.lock', '/run/lock/dcss-counts-activation.lock']:
    with open(name, 'r') as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            locks[name] = 'available'
        except BlockingIOError:
            locks[name] = 'occupied'
print(json.dumps({'current': str(root), 'previous': str(Path('/opt/dcss/previous').resolve()),
                  'hashes': {name: sha(source / name) for name in names},
                  'account_start_source': (source / 'account-start.cc').read_text(),
                  'native_sources': native, 'build_candidates': candidates,
                  'native_processes': processes, 'locks': locks,
                  'free_bytes': shutil.disk_usage('/opt/dcss').free,
                  'state_links': {name: str((source / name).resolve()) for name in ['rcs', 'saves']},
                  'service': subprocess.check_output(['systemctl', 'is-active', 'dcss-coop'], text=True).strip()}, indent=2))
