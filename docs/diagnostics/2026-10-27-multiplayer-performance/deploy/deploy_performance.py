"""A three-file transport overlay over the exact current production release."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile

PAYLOAD = Path(__file__).resolve().parent
manifest = json.loads((PAYLOAD / 'manifest.json').read_text())
for name, digest in manifest['files'].items():
    assert hashlib.sha256((PAYLOAD / name).read_bytes()).hexdigest() == digest, name
spec = importlib.util.spec_from_file_location('deployment_core', PAYLOAD / 'deployment_core.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
core.BASE = Path(manifest['baseline']['current'])
core.BASE_HASHES = manifest['baseline']['hashes']
RUNTIME = ['webserver/webtiles/player_stream.py', 'webserver/webtiles/player_update.py',
           'webserver/webtiles/state_transport.py']


def prepare(operation):
    held = core.locks()
    core.baseline()
    assert not operation.exists()
    operation.mkdir(mode=0o700)
    release = Path('/opt/dcss/releases') / operation.name
    assert not release.exists()
    subprocess.run(['cp', '-al', str(core.BASE), str(release)], check=True, timeout=90)
    candidate = release / core.PREFIX
    for name in RUNTIME:
        core.replace_file(PAYLOAD / core.PREFIX / name, candidate / name, 0o644)
    core.baseline()
    for name in ('rcs', 'saves'):
        assert (candidate / name).resolve() == core.STATE / name
    assert core.sha(candidate / 'crawl') == manifest['baseline']['hashes']['crawl']
    qa = Path(tempfile.mkdtemp(prefix='perf-qa-', dir='/tmp'))
    account = pwd.getpwnam('dcss')
    qa.chmod(0o755)
    os.chown(qa, account.pw_uid, account.pw_gid)
    tests = qa / 'tests'
    tests.mkdir(mode=0o755)
    for path in (PAYLOAD / 'tests').glob('*.py'):
        shutil.copy2(path, tests / ('test_' + path.name))
    core.run(['env', 'PYTHONPATH=' + str(candidate / 'webserver'), 'python3', '-m', 'unittest',
              'discover', '-s', str(tests), '-v'], qa, operation / 'backend.log')
    core.run(['sudo', '-u', 'dcss', 'env', 'PYTHONPATH=' + str(candidate / 'webserver'), 'python3',
              str(PAYLOAD / 'native_transport_probe.py'), str(candidate), str(qa)],
             qa, operation / 'native-transport.log', 150)
    native = json.loads((qa / 'native-result.json').read_text())
    assert native['passed'] and native['native_process_exited']
    shutil.copy2(qa / 'native-result.json', operation / 'native-result.json')
    shutil.copy2(qa / 'native-player-trace.json', operation / 'native-player-trace.json')
    unchanged = 0
    for old in core.BASE.rglob('*'):
        relative = str(old.relative_to(core.BASE))
        target = release / relative
        if old.is_symlink():
            assert target.is_symlink() and os.readlink(old) == os.readlink(target), relative
        elif old.is_file() and relative not in {core.PREFIX + name for name in RUNTIME} and not relative.endswith('.pyc'):
            assert old.stat().st_ino == target.stat().st_ino, relative
            unchanged += 1
    core.baseline()
    ready = dict(ready=True, baseline=str(core.BASE), release=str(release),
        runtime_files={name: core.sha(candidate / name) for name in RUNTIME},
        unchanged_existing_files=unchanged, backend_tests_passed=True, native_test_passed=True,
        native_rebuilt=False, native_sha256=core.sha(candidate / 'crawl'),
        existing_saves_used_by_tests=False, private_qa=str(qa), production_activated=False)
    core.write(operation / 'prepared.json', ready)
    core.write(release / 'multiplayer-performance.json', ready)
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
