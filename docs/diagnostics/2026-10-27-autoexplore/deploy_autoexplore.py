"""Prepare an optimized native engine and completion-driven server scheduler."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess

PAYLOAD = Path('/tmp/dcss-autoexplore-01a1801a')
BUILD = Path('/opt/dcss/staging/autoexplore-01a1801a')
BASE = Path('/opt/dcss/releases/render-smoothness-01a1801a')
OPERATION = Path('/opt/dcss/staging/autoexplore-release-01a1801a')
spec = importlib.util.spec_from_file_location('deployment_core', PAYLOAD / 'deployment_core.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
core.BASE = BASE
manifest = json.loads((PAYLOAD / 'release-manifest.json').read_text())
for group in ('helpers', 'evidence'):
    for name, expected in manifest[group].items():
        assert core.sha(PAYLOAD / name) == expected, name
core.BASE_HASHES = manifest['baseline']


def prepare():
    held = core.locks()
    core.baseline()
    built = json.loads((BUILD / 'build-result.json').read_text())
    scheduler = json.loads((PAYLOAD / 'scheduler-verification.json').read_text())
    compatible = json.loads((PAYLOAD / 'save-compatibility/result.json').read_text())
    benchmark = json.loads((PAYLOAD / 'optimized/result.json').read_text())
    integrated = json.loads((PAYLOAD / 'scheduler-optimized/result.json').read_text())
    baseline_timing = json.loads((PAYLOAD / 'baseline/result.json').read_text())
    fast = json.loads((PAYLOAD / 'fast-default/result.json').read_text())
    explicit = json.loads((PAYLOAD / 'explicit-delay/result.json').read_text())
    assert built['passed'] and built['source_content_unchanged']
    assert scheduler['passed'] and compatible['passed'] and benchmark['passed'] and integrated['passed']
    native_hash = built['native_sha256']
    assert benchmark['native_sha256'] == native_hash
    assert integrated['native_sha256'] == native_hash
    assert fast['passed'] and explicit['passed']
    assert fast['native_sha256'] == explicit['native_sha256'] == native_hash
    assert fast['native_delay_messages'] == []
    assert {packet['t'] for packet in explicit['native_delay_messages']} == {60}
    assert 'explore_delay=0' in integrated['launch_defaults']
    assert benchmark['party_activity_step']['median_ms'] < baseline_timing['party_activity_step']['median_ms']
    assert compatible['stages'][1]['native_sha256'] == native_hash
    assert core.sha(BUILD / 'source/crawl') == native_hash
    assert not OPERATION.exists()
    OPERATION.mkdir(mode=0o700)
    release = Path('/opt/dcss/releases') / OPERATION.name
    assert not release.exists()
    subprocess.run(['cp', '-al', str(BASE), str(release)], check=True, timeout=90)
    runtime = {
        'crawl': BUILD / 'source/crawl', '.cflags': BUILD / 'source/.cflags',
        'compflag.h': BUILD / 'source/compflag.h',
        'webserver/webtiles/activity_pump.py': PAYLOAD / 'activity_pump.py',
        'webserver/webtiles/process_handler.py': PAYLOAD / 'process_handler.py'}
    hashes = {}
    for name, source in runtime.items():
        digest = core.sha(source)
        assert digest == manifest['candidate'][name], name
        core.replace_file(source, release / core.PREFIX / name, 0o755 if name == 'crawl' else 0o644)
        hashes[name] = digest
    preserved = {name: digest for name, digest in manifest['baseline'].items() if name not in runtime}
    for name, digest in preserved.items():
        assert core.sha(release / core.PREFIX / name) == digest, name
    for name in ('rcs', 'saves'):
        assert (release / core.PREFIX / name).resolve() == core.STATE / name
    allowed = {core.PREFIX + name for name in runtime}
    unchanged = 0
    for old in BASE.rglob('*'):
        name = str(old.relative_to(BASE))
        new = release / name
        if old.is_symlink():
            assert new.is_symlink() and os.readlink(old) == os.readlink(new), name
        elif old.is_file() and name not in allowed and not name.endswith('.pyc'):
            assert old.stat().st_ino == new.stat().st_ino, name
            unchanged += 1
    core.baseline()
    ready = dict(ready=True, baseline=str(BASE), release=str(release), runtime_files=hashes,
        preserved_runtime=preserved, unchanged_existing_files=unchanged,
        native_test_passed=True, backend_tests_passed=True, native_rebuilt=True,
        source_manifest_sha256=core.sha(PAYLOAD / 'release-manifest.json'))
    core.write(OPERATION / 'prepared.json', ready)
    print(json.dumps(ready), flush=True)


def verify():
    receipt = json.loads((OPERATION / 'activation.json').read_text())
    ready = json.loads((OPERATION / 'prepared.json').read_text())
    assert receipt['deployed'] and Path('/opt/dcss/current').resolve() == Path(ready['release'])
    assert Path('/opt/dcss/previous').resolve() == BASE
    for name, digest in dict(ready['runtime_files'], **ready['preserved_runtime']).items():
        assert core.sha(Path(ready['release']) / core.PREFIX / name) == digest, name
    assert receipt['all_save_directory_files_preserved'] and receipt['save_files_never_replaced']
    assert core.healthy()
    print(json.dumps(dict(passed=True, **receipt)), flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'verify'])
    args = parser.parse_args()
    prepare() if args.mode == 'prepare' else verify()
