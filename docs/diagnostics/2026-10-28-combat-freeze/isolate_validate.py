"""Rerun the candidate's native input checks with private shared game data."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile

release = Path('/opt/dcss/releases/combat-freeze-01a185b7-r4/crawl-ref/source')
output = Path('/opt/dcss/staging/combat-freeze-01a185b7-r4/isolated')
payload = Path('/tmp/dcss-combat-freeze-01a185b7-r4-payload')
assert not output.exists()
output.mkdir(mode=0o700)
account = pwd.getpwnam('dcss')
root = Path(tempfile.mkdtemp(prefix='input-isolated-', dir='/tmp'))
root.chmod(0o755)
os.chown(root, account.pw_uid, account.pw_gid)
source = root / 'source'
subprocess.run(['cp', '-a', '--reflink=auto', str(release), str(source)], check=True)
for name in ('saves', 'rcs'):
    link = source / name
    assert link.is_symlink()
    link.unlink()
    link.mkdir(mode=0o755)
    os.chown(link, account.pw_uid, account.pw_gid)
assert not (source / 'saves').is_symlink()
assert not (source / 'rcs').is_symlink()

def manifest():
    result = {}
    for folder in (Path('/var/lib/dcss/saves'), Path('/var/lib/dcss/rcs/library/saves')):
        for path in folder.rglob('*'):
            if path.is_file() and not path.is_symlink():
                result[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
            elif path.is_symlink():
                result[str(path)] = 'link:' + os.readlink(path)
    return result

scripts = root / 'scripts'
scripts.mkdir(mode=0o755)
for script in ('native-command-completion.py', 'three-player-input-native.py'):
    shutil.copy2(payload / script, scripts / script)
    (scripts / script).chmod(0o644)
before = manifest()
checks = []
for script, name in (('native-command-completion.py', 'native-completion'),
                     ('three-player-input-native.py', 'three-owner')):
    test = output / name
    # dcss must be able to create its result directory; the parent stays private.
    result = root / name
    cmd = ['sudo', '-u', 'dcss', 'env', 'HOME=' + str(root),
           'PYTHONPATH=' + str(source / 'webserver'), 'python3', str(scripts / script),
           str(source), str(result)]
    with (output / (name + '.log')).open('w') as log:
        proc = subprocess.run(cmd, cwd=root, stdout=log, stderr=subprocess.STDOUT, timeout=200)
    assert proc.returncode == 0, name
    report = json.loads((result / 'report.json').read_text())
    assert report['passed'] and report['owned_process_exited'], name
    shutil.copytree(result, test)
    checks.append(name)
after = manifest()
changes = sorted(k for k in before.keys() | after.keys() if before.get(k) != after.get(k))
receipt = {'passed': not changes, 'checks': checks, 'changed_live_paths': changes,
           'private_source': str(source), 'saves_symlink': False, 'rcs_symlink': False}
(output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt), flush=True)
assert not changes, 'Live data changed during isolated tests; investigate before cutover'
