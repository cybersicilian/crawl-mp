"""One bound sequential browser and transport regression phase."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
binding = json.loads((OUT / 'binding.json').read_text())
for name, digest in binding['files'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, name
env = dict(os.environ, NODE_PATH='/Users/iancaltabiano/.cache/codex-runtimes/'
           'codex-primary-runtime/dependencies/node/node_modules')
commands = [['node', 'crawl-ref/source/webserver/tests/' + name + '.cjs']
            for name in ['client-transport', 'client-connection', 'comm', 'socket-lifecycle']]
commands.append(['node', str(OUT / 'catchup-browser.cjs')])
commands.append(['.venv/bin/python', '-m', 'unittest', 'webtiles.activity_pump_test',
                 'webtiles.input_lifecycle_test', 'webtiles.input_recovery_test',
                 'webtiles.gameplay_protocol_test'])
env['PYTHONPATH'] = str(ROOT / 'crawl-ref/source/webserver')
for command in commands:
    label = Path(command[1]).stem if command[0] == 'node' else 'activity-regressions'
    with (OUT / (label + '.log')).open('w') as stream:
        result = subprocess.run(command, cwd=ROOT, env=env, stdout=stream,
                                stderr=subprocess.STDOUT, timeout=240)
    print(label, (OUT / (label + '.log')).read_text()[-2000:], flush=True)
    assert result.returncode == 0, label + ' failed'
