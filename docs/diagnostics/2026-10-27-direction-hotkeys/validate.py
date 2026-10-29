"""Source-bound browser checks for the direction pad and local hotkey reference."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
WEB = ROOT / 'crawl-ref/source/webserver'
TESTS = ['direction-pad-feedback', 'common-hotkeys', 'quickbar-hotkeys', 'hud-input']


def binding():
    paths = [Path(__file__)]
    for folder, names, suffix in [
        ('game_data/static', ['direction-pad', 'route-plan', 'common-hotkeys', 'adventure-ui',
            'inspection-dialog', 'focus-trap', 'quickbar-model', 'frame-update', 'workflow-actions', 'party-model', 'hud-input'], '.js'),
        ('game_data/static/styles', ['direction-pad', 'common-hotkeys', 'inspection-dialog'], '.css'),
        ('static/scripts', ['comm', 'key_conversion', 'client-input'], '.js'),
        ('tests', TESTS, '.cjs')
    ]:
        paths += [WEB / folder / (name + suffix) for name in names]
    return dict(files={str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
                resource_plan=dict(browsers=1, tests='sequential', timeout_per_test_seconds=120),
                production_mutation=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true')
    args = parser.parse_args()
    manifest = OUT / 'binding.json'
    if args.prepare:
        manifest.write_text(json.dumps(binding(), indent=2) + '\n')
        print(hashlib.sha256(manifest.read_bytes()).hexdigest())
        return
    assert binding() == json.loads(manifest.read_text())
    result = dict(passed=False, checks=[], production_mutation=False)
    env = dict(os.environ, NODE_PATH='/Users/iancaltabiano/.cache/codex-runtimes/'
               'codex-primary-runtime/dependencies/node/node_modules', HOTKEYS_PROOF_DIR=str(OUT))
    try:
        for name in TESTS:
            start = time.monotonic()
            with (OUT / (name + '.log')).open('w') as stream:
                test = subprocess.run(['node', str(WEB / 'tests' / (name + '.cjs'))], cwd=ROOT, env=env,
                                      stdout=stream, stderr=subprocess.STDOUT, timeout=120)
            print(json.dumps(dict(test=name, code=test.returncode, seconds=time.monotonic() - start)), flush=True)
            if test.returncode:
                print((OUT / (name + '.log')).read_text()[-5000:], flush=True)
            assert test.returncode == 0, name
            result['checks'].append(name)
        assert binding() == json.loads(manifest.read_text()), 'Source changed during validation'
        result['passed'] = True
    finally:
        (OUT / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
