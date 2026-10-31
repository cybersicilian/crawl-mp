"""Validate the three-owner deadlock fix against the current deployed baseline."""
import argparse
import hashlib
import importlib.util
import json
import os
import pwd
from pathlib import Path
import shutil
import subprocess
import tempfile

HELPER = Path(__file__).with_name('deployment_core.py')
assert hashlib.sha256(HELPER.read_bytes()).hexdigest() == '64511a249cb6f1c6d995b9a8f01e04b86ecc82e2ca4b91731c067e13de646f1e'
spec = importlib.util.spec_from_file_location('deployment_core', HELPER)
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
core.BASE = Path('/opt/dcss/releases/input-completion-01a17b3b-r2')
core.STAGE = Path('/opt/dcss/staging/input-completion-01a17b3b-r2-build')
core.BASE_HASHES = {
    'crawl': '9ef564707993b7f23aa55d34bd46d306a1d8f99196e485ad8508d882ec973ad8',
    'tileweb.cc': '432d0411717e7275a21ad2596ff3ac8a4d72daf31802f4414afedabcdc79f581',
    'webserver/webtiles/activity_pump.py': '3a9d5aaede43d17930dc234201af4eba5c802c73ea797b697ba28862336b1961',
    'webserver/webtiles/process_handler.py': 'e464c961d0cf644c75e39522af8203551d296221fb95fac2153e0d3edbf545e6',
}


def prepare(payload, operation):
    held = core.locks()
    core.baseline()
    manifest = json.loads((payload / 'manifest.json').read_text())
    for name, digest in manifest.items():
        assert core.sha(payload / name) == digest, name
    assert not operation.exists()
    operation.mkdir(mode=0o700)
    qa = Path(tempfile.mkdtemp(prefix='prompt-qa-', dir='/tmp'))
    qa.chmod(0o755)
    account = pwd.getpwnam('dcss')
    os.chown(qa, account.pw_uid, account.pw_gid)
    tests = qa / 'tests'
    tests.mkdir(mode=0o755)
    qa_tests = qa / 'scripts'
    qa_tests.mkdir(mode=0o755)
    qa_tests.chmod(0o755)
    for name in ('native-command-completion.py', 'three-player-input-native.py'):
        shutil.copy2(payload / name, qa_tests / name)
        (qa_tests / name).chmod(0o644)
    # NativeProbe owns every writable path. The baseline run reads the live
    # executable and data but never uses its account or save directories.
    source = core.BASE / core.PREFIX
    before = core.state_manifest()
    command = ['sudo', '-u', 'dcss', 'env', 'PYTHONPATH=' + str(source / 'webserver'), 'python3',
               str(qa_tests / 'three-player-input-native.py'), str(source),
               str(qa / 'original-three-owner'), '--expect-failure']
    core.run(command, qa_tests, operation / 'original-three-owner.log', 200)
    shutil.copytree(qa / 'original-three-owner', operation / 'original-three-owner')
    original = json.loads((operation / 'original-three-owner/report.json').read_text())
    assert original['original_all_players_deadlock_reproduced']
    build = Path('/opt/dcss/staging') / (operation.name + '-build')
    assert not build.exists()
    assert core.sha(core.STAGE / 'crawl') == core.BASE_HASHES['crawl']
    native_sources = {}
    for path in (core.BASE / core.PREFIX).iterdir():
        if path.suffix in {'.cc', '.h'}:
            assert core.sha(path) == core.sha(core.STAGE / path.name), path.name
            native_sources[path.name] = core.sha(path)
    core.write(operation / 'native-baseline.json', native_sources)
    subprocess.run(['cp', '-a', '--reflink=auto', str(core.STAGE), str(build)], check=True, timeout=90)
    core.replace_file(payload / core.PREFIX / 'tileweb.cc', build / 'tileweb.cc', 0o644)
    core.run(['make', '-j1', 'WEBTILES=y', 'NOWIZARD=y', 'NO_OPTIMIZE=y',
              'STDFLAG=-std=c++17', 'PYTHON=python3', 'crawl'], build, operation / 'build.log', 900)
    release = Path('/opt/dcss/releases') / operation.name
    assert not release.exists()
    subprocess.run(['cp', '-al', str(core.BASE), str(release)], check=True, timeout=90)
    candidate = release / core.PREFIX
    core.replace_file(build / 'crawl', candidate / 'crawl', 0o755)
    for name in core.BASE_HASHES:
        if name != 'crawl':
            core.replace_file(payload / core.PREFIX / name, candidate / name, 0o644)
    core.baseline()
    for name in ('activity_pump_test.py', 'multiplayer_test.py', 'gameplay_protocol_test.py',
                 'input_lifecycle_test.py', 'input_recovery_test.py'):
        shutil.copy2(payload / name, tests / ('test_' + name))
    core.run(['env', 'PYTHONPATH=' + str(candidate / 'webserver'), 'python3', '-m', 'unittest',
              'discover', '-s', str(tests), '-q'], qa_tests, operation / 'backend-tests.log')
    for script, directory in (('native-command-completion.py', 'native-completion'),
                              ('three-player-input-native.py', 'three-owner')):
        core.run(['sudo', '-u', 'dcss', 'env', 'PYTHONPATH=' + str(candidate / 'webserver'), 'python3',
                  str(qa_tests / script), str(candidate), str(qa / directory)],
                 qa_tests, operation / (directory + '.log'), 200)
        shutil.copytree(qa / directory, operation / directory)
        report = json.loads((operation / directory / 'report.json').read_text())
        assert report['passed'] and report['owned_process_exited']
    allowed = {core.PREFIX + name for name in core.BASE_HASHES}
    unchanged = 0
    for old in core.BASE.rglob('*'):
        name = str(old.relative_to(core.BASE))
        target = release / name
        if old.is_symlink():
            assert target.is_symlink() and os.readlink(old) == os.readlink(target), name
        elif old.is_file() and name not in allowed and not name.endswith('.pyc'):
            assert core.sha(old) == core.sha(target), name
            unchanged += 1
    after = core.state_manifest()
    ready = {'ready': True, 'baseline': str(core.BASE), 'release': str(release),
             'runtime_files': {name: core.sha(candidate / name) for name in core.BASE_HASHES},
             'native_test_passed': True, 'backend_tests_passed': True,
             'original_three_owner_deadlock_reproduced': True,
             'unchanged_existing_files': unchanged,
             'existing_saves_used_by_tests': False,
             'live_checkpoint_changes_during_preparation': sorted(
                 name for name in before.keys() | after.keys() if before.get(name) != after.get(name))}
    core.write(operation / 'prepared.json', ready)
    print(json.dumps(ready), flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('prepare', 'activate'))
    parser.add_argument('payload', type=Path)
    parser.add_argument('operation', type=Path)
    args = parser.parse_args()
    if args.mode == 'prepare':
        prepare(args.payload.resolve(), args.operation.resolve())
    else:
        core.activate(args.operation.resolve())
