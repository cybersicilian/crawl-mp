"""Sequential, source-bound transport checks under the shared host reservation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
WEB = ROOT / 'crawl-ref/source/webserver'
NATIVE = Path('/private/tmp/dcss-prompt-ownership-01a17b3b/source/crawl')
PYTHON_TESTS = ['player_update', 'stream_performance', 'state_transport', 'map_snapshot',
                'multiplayer', 'party_control', 'activity_pump', 'gameplay_protocol',
                'tile_presence', 'input_lifecycle', 'input_recovery', 'ai_party']
JS_TESTS = ['state-stream', 'client-transport', 'player-updates']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def binding():
    files = list((WEB / 'webtiles').glob('*.py'))
    files += [WEB / 'static/scripts' / (name + '.js') for name in ('state-stream', 'client-transport')]
    files += [WEB / 'game_data/static/player.js']
    files += [WEB / 'tests' / (name + '.cjs') for name in JS_TESTS]
    files += [WEB / 'tests' / (name + '.py') for name in ('native-command-completion', 'three-player-input-native')]
    files += list(OUT.glob('*.py')) + list((OUT / 'before').glob('*.py'))
    return dict(inputs={str(path.relative_to(ROOT)): sha(path) for path in sorted(files)},
                native_path=str(NATIVE), native_sha256=sha(NATIVE), native_rebuild=False,
                existing_saves_used=False, production_mutation=False,
                resources=dict(sequential=True, native_processes=1, repetitions=3,
                               synthetic_turns=80, native_turns=24, timeout_seconds=120))


def run(command, name, extra_env=None):
    env = dict(os.environ, PYTHONPATH=str(WEB), PYTHON=str(ROOT / '.venv/bin/python'))
    env.update(extra_env or {})
    start = time.monotonic()
    with (OUT / (name + '.log')).open('w') as stream:
        process = subprocess.run(command, cwd=ROOT, env=env, stdout=stream,
                                 stderr=subprocess.STDOUT, timeout=120)
    print(json.dumps(dict(check=name, exit_code=process.returncode,
                          seconds=time.monotonic() - start)), flush=True)
    if process.returncode:
        print((OUT / (name + '.log')).read_text()[-5000:], flush=True)
        raise AssertionError(name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true')
    args = parser.parse_args()
    path = OUT / 'source-binding.json'
    if args.prepare:
        path.write_text(json.dumps(binding(), indent=2) + '\n')
        print(sha(path))
        return
    assert binding() == json.loads(path.read_text()), 'Source drift before validation'
    result = dict(passed=False, binding_sha256=sha(path), checks=[], existing_saves_used=False,
                  production_mutation=False, native_rebuilt=False)
    try:
        run([str(ROOT / '.venv/bin/python'), '-m', 'unittest']
            + ['webtiles.' + name + '_test' for name in PYTHON_TESTS], 'backend')
        result['checks'].append('12 backend transport, ownership and command lifecycle modules')
        run([str(ROOT / '.venv/bin/python'), str(OUT / 'benchmark.py')], 'benchmark')
        result['checks'].append('Four-seat transport and party encoder before/after benchmarks')
        run([str(ROOT / '.venv/bin/python'), str(OUT / 'native_transport_probe.py')], 'native-transport')
        result['checks'].append('24 native actions through three personal recipient streams, map parity and reconnect')
        for name in JS_TESTS:
            run(['node', str(WEB / 'tests' / (name + '.cjs'))], name,
                dict(PLAYER_NATIVE_TRACE=str(OUT / 'native-player-trace.json')))
        result['checks'].append('Actual browser player handler, state delta decoder and transport queue')
        run([str(ROOT / '.venv/bin/python'), str(WEB / 'tests/three-player-input-native.py'),
             str(NATIVE.parent), str(OUT / 'native-ownership')], 'native-ownership')
        result['checks'].append('Three-owner native command/prompt and automation regression')
        assert binding() == json.loads(path.read_text()), 'Source drift during validation'
        result['passed'] = True
    finally:
        (OUT / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
