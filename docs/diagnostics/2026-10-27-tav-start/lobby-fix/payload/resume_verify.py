"""Validate the already built correction after repairing a probe CLI option."""
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile

payload = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('fixed_overlay', payload / 'deploy_fix.py')
overlay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overlay)
core = overlay.core
held = core.locks()
core.baseline()
operation = Path('/opt/dcss/staging/tav-lobby-fix-01a17f43')
release = Path('/opt/dcss/releases/tav-lobby-fix-01a17f43')
candidate = release / core.PREFIX
build = Path('/opt/dcss/staging/tav-lobby-fix-01a17f43-build')
assert not (operation / 'prepared.json').exists() and not (operation / 'activation.json').exists()
assert core.sha(candidate / 'crawl') == core.sha(build / 'crawl')
assert core.sha(candidate / 'crawl') != core.BASE_HASHES['crawl']
assert '-DWIZARD' not in (build / '.cflags').read_text()
for name in ['account-start.cc', 'party.cc', 'party.h']:
    assert core.sha(candidate / name) == overlay.manifest['files'][name], name
shutil.copy2(operation / 'before-native.log', operation / 'attempt-2-before-native.log')
core.replace_file(payload / 'native-command-completion.py',
                  candidate / 'webserver/tests/native-command-completion.py', 0o644)
account = pwd.getpwnam('dcss')
qa = Path(tempfile.mkdtemp(prefix='dcss-tav-lobby-qa-', dir='/tmp'))
qa.chmod(0o755)
os.chown(qa, account.pw_uid, account.pw_gid)
for source, label, flags in [(core.BASE / core.PREFIX, 'before', ['--before']), (candidate, 'candidate', [])]:
    core.run(['sudo', '-u', 'dcss', 'python3', str(payload / 'native-starting-grants.py'),
              str(source), str(qa / (label + '.json'))] + flags,
             qa, operation / (label + '-native.log'), 350)
    assert json.loads((qa / (label + '.json')).read_text())['passed']
    shutil.copy2(qa / (label + '.json'), operation / (label + '-native.json'))
core.run(['sudo', '-u', 'dcss', 'python3', str(payload / 'native_start_probe.py'),
          str(candidate), str(qa / 'preview.json')], qa, operation / 'preview.log', 350)
assert json.loads((qa / 'preview.json').read_text())['passed']
shutil.copy2(qa / 'preview.json', operation / 'preview.json')
core.run(['sudo', '-u', 'dcss', 'python3', str(payload / 'native-command-completion.py'),
          str(candidate), str(qa / 'default-probe')], qa, operation / 'default-probe.log', 120)
assert json.loads((qa / 'default-probe/report.json').read_text())['passed']
core.run(['env', 'PYTHONDONTWRITEBYTECODE=1', 'PYTHONPATH=' + str(candidate / 'webserver'),
          'python3', '-m', 'unittest', 'webtiles.starting_accounts_test', '-v'],
         qa, operation / 'account-tests.log')
allowed = {core.PREFIX + name for name in ['crawl'] + list(overlay.RUNTIME.values())}
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
                           for name in ['crawl'] + list(overlay.RUNTIME.values())},
         'unchanged_existing_files': unchanged, 'native_test_passed': True,
         'backend_tests_passed': True, 'native_rebuilt': True,
         'actual_dungeon_start_cases': 6, 'preview_cases': 10,
         'shared_probe_default_contract_passed': True,
         'existing_saves_used_by_start_tests': False, 'private_qa': str(qa),
         'production_activated': False}
core.write(operation / 'prepared.json', ready)
core.write(release / 'tav-lobby-fix.json', ready)
print(json.dumps(ready), flush=True)
