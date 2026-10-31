"""Export only allowlisted, already-hashed public release source for merging."""
import hashlib
import json
from pathlib import Path
import tarfile

request = json.loads(Path('/tmp/dcss-content-scope.json').read_text())
manifest = json.loads(Path('/tmp/dcss-content-live-manifest.json').read_text())
root = Path(manifest['release']) / 'crawl-ref/source'
assert Path('/opt/dcss/current').resolve() == Path(manifest['release'])
with tarfile.open('/tmp/dcss-content-live-source.tar.gz', 'w:gz') as archive:
    for name in request:
        if name not in manifest['files']:
            continue
        path = root / name
        assert not path.is_symlink() and '..' not in Path(name).parts
        assert hashlib.sha256(path.read_bytes()).hexdigest() == manifest['files'][name]
        archive.add(path, arcname=name, recursive=False)
print('Exported scoped public source from', manifest['release'])
