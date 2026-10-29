"""Bound, sequential local lifecycle validation under the shared host gate."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path('/Users/iancaltabiano/Documents/Projects/dcss')
OUT = ROOT / 'docs/diagnostics/2026-10-26-prompt-ownership/audit'
SOURCE = Path('/private/tmp/dcss-prompt-ownership-01a17b3b/source')
CORE = ['tileweb.cc', 'webserver/webtiles/activity_pump.py', 'webserver/webtiles/process_handler.py']
PYTHON_TESTS = ['activity_pump', 'multiplayer', 'gameplay_protocol', 'input_lifecycle',
                'input_recovery', 'ai_party', 'party_control', 'connection', 'session_recovery',
                'websocket_stability', 'tile_presence', 'state_transport', 'save_lifecycle']
JS_TESTS = ['client-transport', 'socket-lifecycle', 'client-connection', 'comm', 'tactical-planner', 'state-stream']
NATIVE_TESTS = [('native-command-completion.py', 'native-completion'),
                ('three-player-input-native.py', 'three-owner')]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def binding():
    inputs = set(CORE)
    inputs.update('webserver/webtiles/' + name + '_test.py' for name in PYTHON_TESTS)
    inputs.update('webserver/tests/' + name + '.cjs' for name in JS_TESTS)
    inputs.update('webserver/tests/' + name for name, _ in NATIVE_TESTS)
    for folder in ('webserver/webtiles', 'webserver/game_data/static', 'webserver/static/scripts'):
        inputs.update(str(p.relative_to(ROOT / 'crawl-ref/source'))
                      for p in (ROOT / 'crawl-ref/source' / folder).glob('*')
                      if p.suffix in ('.py', '.js'))
    overlays = {str(p.relative_to(OUT.parent / 'payload')): sha(p)
                for p in (OUT.parent / 'payload/crawl-ref/source').rglob('*') if p.is_file()}
    return dict(runner_sha256=sha(Path(__file__)), overlay_inputs=overlays,
                inputs={name: sha(ROOT / 'crawl-ref/source' / name) for name in sorted(inputs)},
                existing_saves_used=False, production_mutation=False)


def run(command, label, cwd=ROOT, env=None, timeout=200):
    with (OUT / (label + '.log')).open('w') as stream:
        result = subprocess.run(command, cwd=cwd, env=env, stdout=stream,
                                stderr=subprocess.STDOUT, timeout=timeout)
    if result.returncode:
        print((OUT / (label + '.log')).read_text()[-5000:], flush=True)
    assert result.returncode == 0, label
    print(json.dumps(dict(phase=label, passed=True)), flush=True)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepare', action='store_true')
args = parser.parse_args()
path = OUT / 'source-binding.json'
if args.prepare:
    path.write_text(json.dumps(binding(), indent=2) + '\n')
    print(sha(path))
else:
    assert binding() == json.loads(path.read_text())
    started = time.monotonic()
    report = dict(passed=False, binding_sha256=sha(path), existing_saves_used=False,
                  production_mutation=False, checks=[])
    try:
        env = dict(os.environ, PYTHONPATH=str(ROOT / 'crawl-ref/source/webserver'), TERM='xterm')
        run([str(ROOT / '.venv/bin/python'), '-m', 'unittest']
            + ['webtiles.' + name + '_test' for name in PYTHON_TESTS] + ['-q'], 'backend', env=env)
        report['checks'].append('13 backend lifecycle/transport/save modules')
        with tempfile.TemporaryDirectory(prefix='dcss-audit-overlay-') as temporary:
            qa = Path(temporary)
            shutil.copytree(ROOT / 'crawl-ref/source/webserver/webtiles', qa / 'webtiles',
                            ignore=shutil.ignore_patterns('__pycache__'))
            (qa / 'static').symlink_to(ROOT / 'crawl-ref/source/webserver/static', target_is_directory=True)
            payload = OUT.parent / 'payload'
            for name in ('activity_pump.py', 'process_handler.py'):
                shutil.copy2(payload / 'crawl-ref/source/webserver/webtiles' / name, qa / 'webtiles' / name)
            names = ['activity_pump', 'multiplayer', 'gameplay_protocol', 'input_lifecycle', 'input_recovery']
            run([str(ROOT / '.venv/bin/python'), '-m', 'unittest']
                + ['webtiles.' + name + '_test' for name in names] + ['-q'], 'production-overlay-backend',
                cwd=qa, env=dict(env, PYTHONPATH=str(qa)))
        report['checks'].append('Minimal production Python overlay lifecycle regressions')
        for name in JS_TESTS:
            run(['node', str(ROOT / 'crawl-ref/source/webserver/tests' / (name + '.cjs'))], name)
        report['checks'].append('Six browser queue/transport/recovery/planner suites')
        for name in CORE:
            shutil.copy2(ROOT / 'crawl-ref/source' / name, SOURCE / name)
        run(['make', '-j2', '-o', '.contrib-libs', 'NO_OPTIMIZE=y', 'WEBTILES=y',
             'STDFLAG=-std=c++17', 'PYTHON=/usr/local/bin/python3', 'crawl'], 'build', cwd=SOURCE, env=env)
        report['native_sha256'] = sha(SOURCE / 'crawl')
        for script, label in NATIVE_TESTS:
            run([str(ROOT / '.venv/bin/python'), str(ROOT / 'crawl-ref/source/webserver/tests' / script),
                 str(SOURCE), str(OUT / label)], label,
                env=dict(env, PYTHONPATH=str(SOURCE / 'webserver')))
            evidence = json.loads((OUT / label / 'report.json').read_text())
            assert evidence['passed'] and evidence['owned_process_exited']
            report['checks'].extend(evidence.get('checks', []))
        assert binding() == json.loads(path.read_text()), 'Source drifted during validation'
        report['passed'] = True
    finally:
        report['elapsed_seconds'] = time.monotonic() - started
        (OUT / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report), flush=True)
