"""Generate canonical species headers without invalidating unchanged build inputs."""
from pathlib import Path
import subprocess
import tempfile

source = Path.cwd()
names = ('species-data.h', 'aptitudes.h', 'species-groups.h', 'species-type.h')
with tempfile.TemporaryDirectory(prefix='dcss-content-species-') as directory:
    outputs = [Path(directory) / name for name in names]
    subprocess.run(['/usr/local/bin/python3', 'util/species-gen.py', 'dat/species/',
        'util/species-gen/', *map(str, outputs)], check=True)
    changed = []
    for name, generated in zip(names, outputs):
        target = source / name
        content = generated.read_bytes()
        if not target.exists() or target.read_bytes() != content:
            target.write_bytes(content)
            changed.append(name)
    print('Canonical species headers verified; changed:', changed)
