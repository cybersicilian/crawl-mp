"""Build one native starting-item change over the bound live release."""
import argparse
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
spec = importlib.util.spec_from_file_location('deployment_core', PAYLOAD / 'deployment_core.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
for name, digest in manifest['files'].items():
    assert core.sha(PAYLOAD / name) == digest, name
core.BASE = Path(manifest['baseline']['current'])
core.BASE_HASHES = manifest['baseline']['hashes']
RUNTIME = {'account-start.cc': 'account-start.cc',
           'test_starting_accounts.cc': 'catch2-tests/test_starting_accounts.cc',
           'starting_accounts_test.py': 'webserver/webtiles/starting_accounts_test.py'}


def prepare(operation):
    held = core.locks()
    core.baseline()
    assert not operation.exists()
    operation.mkdir(mode=0o700)
    old_source = core.BASE / core.PREFIX
    stage = Path(manifest['build_source'])
    assert core.sha(stage / 'crawl') == core.BASE_HASHES['crawl']
    for name, digest in manifest['baseline']['native_sources'].items():
        assert core.sha(old_source / name) == digest, name
        assert core.sha(stage / name) == digest, name
    assert '-DWIZARD' not in (stage / '.cflags').read_text()
    build = Path('/opt/dcss/staging') / (operation.name + '-build')
    assert not build.exists()
    subprocess.run(['cp', '-a', '--reflink=auto', str(stage), str(build)], check=True, timeout=120)
    core.replace_file(PAYLOAD / 'account-start.cc', build / 'account-start.cc', 0o644)
    core.run(['make', '-j1', 'WEBTILES=y', 'NOWIZARD=y', 'NO_OPTIMIZE=y',
              'STDFLAG=-std=c++17', 'PYTHON=python3', 'crawl'],
             build, operation / 'native-build.log', 900)
    assert '-DWIZARD' not in (build / '.cflags').read_text()
    assert core.sha(stage / 'crawl') == core.BASE_HASHES['crawl']
    release = Path('/opt/dcss/releases') / operation.name
    assert not release.exists()
    subprocess.run(['cp', '-al', str(core.BASE), str(release)], check=True, timeout=90)
    candidate = release / core.PREFIX
    core.replace_file(build / 'crawl', candidate / 'crawl', 0o755)
    for original, target in RUNTIME.items():
        core.replace_file(PAYLOAD / original, candidate / target, 0o644)
    for name in ['rcs', 'saves']:
        assert (candidate / name).resolve() == core.STATE / name
    account = pwd.getpwnam('dcss')
    qa = Path(tempfile.mkdtemp(prefix='dcss-tav-qa-', dir='/tmp'))
    qa.chmod(0o755)
    os.chown(qa, account.pw_uid, account.pw_gid)
    before = core.state_manifest()
    for source, label, flags in [(old_source, 'before', ['--before']), (candidate, 'candidate', [])]:
        core.run(['sudo', '-u', 'dcss', 'python3', str(PAYLOAD / 'native_start_probe.py'),
                  str(source), str(qa / (label + '.json'))] + flags,
                 qa, operation / (label + '-native.log'), 350)
        report = json.loads((qa / (label + '.json')).read_text())
        assert report['passed'] and report['native_processes_exited']
        shutil.copy2(qa / (label + '.json'), operation / (label + '-native.json'))
    core.run(['env', 'PYTHONDONTWRITEBYTECODE=1', 'PYTHONPATH=' + str(candidate / 'webserver'),
              'python3', '-m', 'unittest', 'webtiles.starting_accounts_test', '-v'],
             qa, operation / 'account-tests.log')
    after = core.state_manifest()
    allowed = {core.PREFIX + name for name in ['crawl'] + list(RUNTIME.values())}
    unchanged = 0
    for old in core.BASE.rglob('*'):
        name = str(old.relative_to(core.BASE))
        target = release / name
        if old.is_symlink():
            assert target.is_symlink() and os.readlink(old) == os.readlink(target), name
        elif old.is_file() and name not in allowed and not name.endswith('.pyc'):
            assert old.stat().st_ino == target.stat().st_ino, name
            unchanged += 1
    core.baseline()
    ready = {'ready': True, 'baseline': str(core.BASE), 'release': str(release),
             'runtime_files': {name: core.sha(candidate / name)
                               for name in ['crawl'] + list(RUNTIME.values())},
             'unchanged_existing_files': unchanged, 'native_test_passed': True,
             'backend_tests_passed': True, 'native_rebuilt': True,
             'existing_saves_used_by_start_tests': False, 'private_qa': str(qa),
             'live_save_changes_during_preparation': [name for name, digest in before.items()
                                                       if after.get(name) != digest],
             'production_activated': False}
    core.write(operation / 'prepared.json', ready)
    core.write(release / 'tav-start.json', ready)
    print(json.dumps(ready), flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', type=Path)
    args = parser.parse_args()
    prepare(args.operation.resolve())
