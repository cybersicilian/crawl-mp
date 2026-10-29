"""Start or close only this release's private ordinary Linux WebTiles service."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT = Path('/opt/dcss/staging/content-01a16a0f-v1')
UNIT = 'dcss-content-01a16a0f-qa'
prepared = json.loads((ROOT / 'prepared.json').read_text())
assert prepared['passed']
source = Path(prepared['release']) / 'crawl-ref/source'
assert hashlib.sha256((source / 'crawl').read_bytes()).hexdigest() == prepared['native_sha256']
assert Path('/opt/dcss/current').resolve() == Path(prepared['baseline'])
if sys.argv[1] == 'start':
    attempt = sys.argv[2] if len(sys.argv) > 2 else '1'
    assert attempt.isdigit()
    suffix = '' if attempt == '1' else '-' + attempt
    runtime = ROOT / ('qa/runtime' + suffix)
    assert subprocess.run(['systemctl', 'is-active', '--quiet', UNIT]).returncode != 0
    assert not runtime.exists()
    qa_source = ROOT / ('qa/source' + suffix)
    assert not qa_source.exists()
    shutil.copytree(source / 'webserver', qa_source / 'webserver', symlinks=True,
        ignore=shutil.ignore_patterns('config.yml', 'debug-config.yml', '__pycache__', 'run'))
    games = qa_source / 'webserver/games.d/base.yaml'
    games.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(Path(__file__).with_name('base.qa.yaml'), games)
    command = ['systemd-run', '--collect', '--unit', UNIT]
    properties = {'User': 'dcss', 'Group': 'dcss', 'NoNewPrivileges': 'yes',
        'ProtectSystem': 'strict', 'ProtectHome': 'yes', 'PrivateTmp': 'yes',
        'ReadWritePaths': str(ROOT / 'qa'), 'UMask': '0077', 'Nice': '10'}
    for name, value in properties.items():
        command += ['--property', name + '=' + value]
    command += ['--setenv', 'PYTHONDONTWRITEBYTECODE=1', '--setenv', 'HOME=' + str(ROOT / 'qa'),
        '/usr/bin/python3', str(qa_source / 'webserver/util/qa_server.py'),
        '--source', str(qa_source), '--build', str(source),
        '--runtime', str(runtime), '--port', '18987']
    subprocess.run(command, check=True)
    for _ in range(100):
        try:
            with urllib.request.urlopen('http://127.0.0.1:18987', timeout=1) as response:
                assert response.status == 200
            break
        except OSError:
            time.sleep(0.25)
    else:
        raise RuntimeError('Owned private QA service did not become ready')
    identity = json.loads((runtime / 'run-info.json').read_text())
    assert identity['binary_sha256'] == prepared['native_sha256'], identity
    print(json.dumps({'passed': True, 'unit': UNIT, 'runtime': str(runtime),
        'native_sha256': prepared['native_sha256']}))
else:
    assert sys.argv[1] == 'stop'
    subprocess.run(['systemctl', 'stop', UNIT], check=True, timeout=90)
    assert subprocess.run(['systemctl', 'is-active', '--quiet', UNIT]).returncode != 0
    assert not Path('/sys/fs/cgroup/system.slice/' + UNIT + '.service').exists()
    receipt = {'passed': True, 'unit': UNIT, 'cgroup_gone': True, 'closed_at': time.time()}
    destination = ROOT / ('qa-closure-' + str(time.time_ns()) + '.json')
    destination.write_text(json.dumps(receipt, indent=2) + '\n')
    (ROOT / 'qa-closure.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
