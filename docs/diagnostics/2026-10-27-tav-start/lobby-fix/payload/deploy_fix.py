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
RUNTIME = manifest['overlays']


def prepare(operation, resume=False):
    held = core.locks()
    core.baseline()
    if resume:
        assert operation.is_dir() and not (operation / 'prepared.json').exists()
        assert not (operation / 'activation.json').exists()
        assert not (Path('/opt/dcss/releases') / operation.name).exists()
        shutil.copy2(operation / 'native-build.log', operation / 'attempt-1-native-build.log')
    else:
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
    if resume:
        assert build.is_dir()
    else:
        assert not build.exists()
        subprocess.run(['cp', '-a', '--reflink=auto', str(stage), str(build)], check=True, timeout=120)
    for name in ['account-start.cc', 'party.cc', 'party.h']:
        core.replace_file(PAYLOAD / name, build / name, 0o644)
    # party.h only adds a free-function declaration; class layouts and existing
    # signatures are unchanged. Rebuild both callers without invalidating the
    # otherwise identical object set solely for that additive declaration.
    core.run(['make', '-j1', '-o', 'party.h', 'WEBTILES=y', 'NOWIZARD=y', 'NO_OPTIMIZE=y',
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
        core.run(['sudo', '-u', 'dcss', 'python3', str(PAYLOAD / 'native-starting-grants.py'),
                  str(source), str(qa / (label + '.json'))] + flags,
                 qa, operation / (label + '-native.log'), 350)
        report = json.loads((qa / (label + '.json')).read_text())
        assert report['passed']
        shutil.copy2(qa / (label + '.json'), operation / (label + '-native.json'))
    core.run(['sudo', '-u', 'dcss', 'python3', str(PAYLOAD / 'native_start_probe.py'),
              str(candidate), str(qa / 'preview.json')], qa, operation / 'preview.log', 350)
    assert json.loads((qa / 'preview.json').read_text())['passed']
    shutil.copy2(qa / 'preview.json', operation / 'preview.json')
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
    core.write(release / 'tav-lobby-fix.json', ready)
    print(json.dumps(ready), flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', type=Path)
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    prepare(args.operation.resolve(), args.resume)
