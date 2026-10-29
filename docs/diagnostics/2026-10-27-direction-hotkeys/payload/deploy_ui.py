"""Guarded UI-only successor; retain the tested native engine and transport."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess

PAYLOAD = Path(__file__).resolve().parent
manifest = json.loads((PAYLOAD / 'manifest.json').read_text())
for name, digest in manifest['files'].items():
    assert hashlib.sha256((PAYLOAD / name).read_bytes()).hexdigest() == digest, name
spec = importlib.util.spec_from_file_location('deployment_core', PAYLOAD / 'deployment_core.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
core.BASE = Path(manifest['baseline']['current'])
core.BASE_HASHES = dict(manifest['baseline']['preserve'],
    **{name: record['sha256'] for name, record in manifest['baseline']['files'].items()})


def prepare(operation):
    held = core.locks()
    core.baseline()
    tests = json.loads((PAYLOAD / 'browser-result.json').read_text())
    assert tests['passed']
    inherited = json.loads(Path('/opt/dcss/staging/multiplayer-performance-01a17ea4/activation.json').read_text())
    assert inherited['deployed'] and inherited['health']
    assert Path(inherited['release']) == core.BASE
    assert not operation.exists()
    operation.mkdir(mode=0o700)
    release = Path('/opt/dcss/releases') / operation.name
    assert not release.exists()
    subprocess.run(['cp', '-al', str(core.BASE), str(release)], check=True, timeout=90)
    candidate = release / core.PREFIX
    for name, digest in manifest['runtime'].items():
        if name not in manifest['baseline']['files']:
            assert not (core.BASE / core.PREFIX / name).exists(), name
        assert core.sha(PAYLOAD / core.PREFIX / name) == digest
        core.replace_file(PAYLOAD / core.PREFIX / name, candidate / name, 0o644)
    for name, digest in manifest['baseline']['preserve'].items():
        assert core.sha(candidate / name) == digest, name
    for name in ('rcs', 'saves'):
        assert (candidate / name).resolve() == core.STATE / name
    unchanged = 0
    allowed = {core.PREFIX + name for name in manifest['runtime']}
    for old in core.BASE.rglob('*'):
        relative = str(old.relative_to(core.BASE))
        target = release / relative
        if old.is_symlink():
            assert target.is_symlink() and os.readlink(old) == os.readlink(target), relative
        elif old.is_file() and relative not in allowed and not relative.endswith('.pyc'):
            assert old.stat().st_ino == target.stat().st_ino, relative
            unchanged += 1
    core.baseline()
    ready = dict(ready=True, baseline=str(core.BASE), release=str(release),
        runtime_files=manifest['runtime'], browser_tests_passed=True, browser_checks=tests['checks'],
        native_test_passed=True, backend_tests_passed=True,
        native_backend_acceptance='Inherited from the unchanged, publicly verified performance release',
        new_native_or_backend_test_run=False, native_rebuilt=False,
        preserved_runtime=manifest['baseline']['preserve'], unchanged_existing_files=unchanged,
        production_activated=False)
    core.write(operation / 'prepared.json', ready)
    print(json.dumps(ready), flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('prepare', 'activate'))
    parser.add_argument('operation', type=Path)
    args = parser.parse_args()
    if args.mode == 'prepare':
        prepare(args.operation.resolve())
    else:
        core.activate(args.operation.resolve())
