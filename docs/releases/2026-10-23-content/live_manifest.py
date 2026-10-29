"""Read immutable deployed source metadata; never inspect runtime account/save data."""
import hashlib
import json
from pathlib import Path
import sys

release = Path('/opt/dcss/current').resolve(strict=True)
root = release / 'crawl-ref/source'
skip = {'contrib', '.git', '.deps', '__pycache__', 'saves', 'rcs', 'morgue', 'node_modules', 'run'}
suffixes = {'.cc', '.h', '.py', '.js', '.css', '.html', '.yaml', '.txt', '.des', '.lua', '.png', '.json'}
files = {}
for path in root.rglob('*'):
    name = path.relative_to(root)
    if set(name.parts) & skip or path.is_symlink() or not path.is_file():
        continue
    if path.name.startswith('.env') or path.name in ('init.txt', 'config.yml', 'debug-config.yml'):
        continue
    if path.suffix in suffixes or path.name.startswith('Makefile'):
        files[str(name)] = hashlib.sha256(path.read_bytes()).hexdigest()
result = {'release': str(release), 'files': files,
          'native_sha256': hashlib.sha256((root / 'crawl').read_bytes()).hexdigest()}
assert Path('/opt/dcss/current').resolve(strict=True) == release
Path(sys.argv[1]).write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
print(json.dumps({'release': str(release), 'files': len(files), 'native_sha256': result['native_sha256']}))
