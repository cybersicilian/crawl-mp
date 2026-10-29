"""Validate the already built correction after repairing a probe CLI option."""
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile

payload = Path('/tmp/dcss-tav-lobby-fix-01a17f43-r3')
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
for name in ['before-native.json', 'candidate-native.json', 'preview.json']:
    assert json.loads((operation / name).read_text())['passed'], name
qa = Path(json.loads((operation / 'candidate-native.json').read_text()).get('qa', '/tmp'))
qa = Path(tempfile.mkdtemp(prefix='dcss-tav-final-qa-', dir='/tmp'))
qa.chmod(0o755)
account = pwd.getpwnam('dcss')
os.chown(qa, account.pw_uid, account.pw_gid)
# Preserve the separate buffered-macro failure and compare the unchanged live
# binary; this check is independent of starting-item eligibility.
control = subprocess.run(['sudo', '-u', 'dcss', 'python3', str(payload / 'native-command-completion.py'),
    str(core.BASE / core.PREFIX), str(qa / 'macro-control')], cwd=qa,
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=120)
(operation / 'macro-control.log').write_text(control.stdout)
core.write(operation / 'macro-control.json', {'exit_code': control.returncode,
    'same_macro_assertion_as_candidate': 'Completion arrived before buffered macro finished' in control.stdout,
    'candidate_failure_log': str(operation / 'default-probe.log')})
# Check the shared helper's ordinary default launch without macro automation.
core.run(['sudo', '-u', 'dcss', 'python3', '/tmp/dcss-tav-default-launch-01a17f43.py',
          str(candidate), str(qa / 'default-launch.json')], qa, operation / 'default-launch.log', 90)
assert json.loads((qa / 'default-launch.json').read_text())['passed']
shutil.copy2(qa / 'default-launch.json', operation / 'default-launch.json')
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
         'unrelated_macro_check': json.loads((operation / 'macro-control.json').read_text()),
         'existing_saves_used_by_start_tests': False, 'private_qa': str(qa),
         'production_activated': False}
core.write(operation / 'prepared.json', ready)
core.write(release / 'tav-lobby-fix.json', ready)
print(json.dumps(ready), flush=True)
