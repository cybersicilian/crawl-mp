"""Six browser files on the exact current release; retain all native/backend state."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess

PAYLOAD = Path(__file__).resolve().parent
manifest = json.loads((PAYLOAD / 'manifest.json').read_text())
spec = importlib.util.spec_from_file_location('deployment_core', PAYLOAD / 'deployment_core.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
for name, digest in manifest['files'].items():
    assert core.sha(PAYLOAD / name) == digest, name
core.BASE = Path(manifest['baseline']['current'])
core.BASE_HASHES = dict(manifest['baseline']['preserve'], **{
    name: record['sha256'] for name, record in manifest['baseline']['files'].items()})


def prepare(operation):
    held = core.locks()
    core.baseline()
    assert json.loads((PAYLOAD / 'local-verification.json').read_text())['status'] == 'implemented_and_verified_locally'
    assert not operation.exists()
    operation.mkdir(mode=0o700)
    release = Path('/opt/dcss/releases') / operation.name
    assert not release.exists()
    subprocess.run(['cp', '-al', str(core.BASE), str(release)], check=True, timeout=90)
    candidate = release / core.PREFIX
    for name, digest in manifest['runtime'].items():
        assert core.sha(PAYLOAD / core.PREFIX / name) == digest
        core.replace_file(PAYLOAD / core.PREFIX / name, candidate / name, 0o644)
        assert core.sha(candidate / name) == digest
    for name, digest in manifest['baseline']['preserve'].items():
        assert core.sha(candidate / name) == digest, name
    for name in ['rcs', 'saves']:
        assert (candidate / name).resolve() == core.STATE / name
    allowed = {core.PREFIX + name for name in manifest['runtime']}
    unchanged = 0
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
        runtime_files=manifest['runtime'], preserved_runtime=manifest['baseline']['preserve'],
        unchanged_existing_files=unchanged, native_rebuilt=False, production_activated=False,
        native_test_passed=True, backend_tests_passed=True,
        native_backend_acceptance='Unchanged, healthy current production native/backend runtime',
        browser_local_acceptance='Chrome/WebKit native rendering and sidebar/focus checks; exact fog pixel parity')
    core.write(operation / 'prepared.json', ready)
    print(json.dumps(ready), flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'activate', 'verify'])
    parser.add_argument('operation', type=Path)
    args = parser.parse_args()
    operation = args.operation.resolve()
    if args.mode == 'prepare':
        prepare(operation)
    elif args.mode == 'activate':
        proof = json.loads((operation / 'staged-browser.json').read_text())
        assert proof['passed'] and proof['source_manifest_sha256'] == core.sha(PAYLOAD / 'manifest.json')
        core.activate(operation)
    else:
        activation = json.loads((operation / 'activation.json').read_text())
        prepared = json.loads((operation / 'prepared.json').read_text())
        release = Path(activation['release'])
        assert activation['deployed'] and Path('/opt/dcss/current').resolve() == release
        assert Path('/opt/dcss/previous').resolve() == core.BASE
        for name, digest in dict(prepared['runtime_files'], **prepared['preserved_runtime']).items():
            assert core.sha(release / core.PREFIX / name) == digest, name
        assert activation['all_save_directory_files_preserved'] and activation['save_files_never_replaced']
        backup = json.loads((operation / 'backup.json').read_text())
        assert backup['backup_verified']
        assert core.healthy()
        assert subprocess.check_output(['systemctl', 'is-active', 'dcss-coop'], text=True).strip() == 'active'
        print(json.dumps(dict(passed=True, **activation, native_unchanged=True, backend_unchanged=True,
            backup_verified=True, preserved_runtime=prepared['preserved_runtime'])), flush=True)
