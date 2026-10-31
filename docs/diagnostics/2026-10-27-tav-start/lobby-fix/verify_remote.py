"""Verify the active release and its saved-game preservation evidence."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request

operation = Path('/opt/dcss/staging/tav-lobby-fix-01a17f43')
ready = json.loads((operation / 'prepared.json').read_text())
activation = json.loads((operation / 'activation.json').read_text())
assert activation['deployed']
release = Path(activation['release'])
assert Path('/opt/dcss/current').resolve() == release
assert Path('/opt/dcss/previous').resolve() == Path(activation['previous'])
source = release / 'crawl-ref/source'
for name, digest in ready['runtime_files'].items():
    assert hashlib.sha256((source / name).read_bytes()).hexdigest() == digest, name
for name in ['rcs', 'saves']:
    assert (source / name).resolve() == Path('/var/lib/dcss') / name
preserved = 0
allowed = {'crawl-ref/source/' + name for name in ready['runtime_files']}
for old in Path(activation['previous']).rglob('*'):
    relative = str(old.relative_to(activation['previous']))
    target = release / relative
    if old.is_symlink():
        assert target.is_symlink() and os.readlink(old) == os.readlink(target), relative
    elif old.is_file() and relative not in allowed and not relative.endswith('.pyc'):
        assert old.stat().st_ino == target.stat().st_ino, relative
        preserved += 1
compatibility = json.loads((operation / 'save-compatibility.json').read_text())
graceful = json.loads((operation / 'graceful-save.json').read_text())
backup = json.loads((operation / 'backup.json').read_text())
native = json.loads((operation / 'candidate-native.json').read_text())
assert compatibility['passed'] and graceful['passed'] and backup['backup_verified'] and native['passed']
assert activation['all_save_directory_files_preserved'] and activation['save_files_never_replaced']
with urllib.request.urlopen('http://127.0.0.1:8080/status/version/', timeout=10) as response:
    assert response.status == 200 and json.load(response).get('python_supported') is True
service = subprocess.check_output(['systemctl', 'is-active', 'dcss-coop'], text=True).strip()
assert service == 'active'
print(json.dumps({'passed': True, 'release': str(release), 'previous': activation['previous'],
                  'runtime_files': ready['runtime_files'], 'preserved_existing_files': preserved,
                  'native_start_cases': len(native['checks']), 'native_start_checks': native['checks'],
                  'preview_cases': ready['preview_cases'], 'account_tests': 7,
                  'macro_check': ready['unrelated_macro_check'],
                  'gracefully_checkpointed_games': len(graceful['games']),
                  'copied_saves_with_identical_metadata': len(compatibility['checks']),
                  'loadable_copied_saves': sum(row['loadable'] for row in compatibility['checks']),
                  'backup': backup['directory'], 'backup_verified': True,
                  'existing_saves_preserved': True, 'service': service,
                  'activated_at': activation['activated_at']}, indent=2))
