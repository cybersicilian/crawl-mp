import fcntl
import json
from pathlib import Path
import subprocess

source = Path('/opt/dcss/current/crawl-ref/source').resolve()
assert source == Path('/opt/dcss/releases/tav-start-01a17f43/crawl-ref/source')
pid = int(subprocess.check_output(['systemctl', 'show', 'dcss-coop', '-p', 'MainPID', '--value'], text=True))
assert pid > 0
actual = (Path('/proc') / str(pid) / 'cwd').resolve()
assert actual == source, (actual, source)
for name in ['/opt/dcss/release-build.lock', '/run/lock/dcss-counts-activation.lock']:
    with open(name, 'r') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
print(json.dumps({'passed': True, 'service_cwd': str(actual), 'pid': pid,
                  'both_deployment_locks_available': True}))
