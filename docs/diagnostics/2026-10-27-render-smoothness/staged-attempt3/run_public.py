"""Bound, sequential public smoke using an existing disposable QA campaign."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
phase = sys.argv[1]
assert phase in ['staged', 'public']
binding = OUT / (phase + '-browser-binding.json')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def manifest():
    paths = [OUT / 'public-smoke.cjs', OUT / 'run_public.py',
             ROOT / 'crawl-ref/source/webserver/tests/multiplayer-native-client.cjs']
    paths.extend(path for path in (OUT / 'deploy-payload').rglob('*') if path.is_file())
    return {str(path.relative_to(ROOT)): sha(path) for path in sorted(paths)}

if len(sys.argv) > 2 and sys.argv[2] == '--prepare':
    binding.write_text(json.dumps({'files': manifest(), 'resources': {
        'simultaneous_browsers': 1, 'browser_engines': ['chromium', 'webkit'],
        'existing_disposable_campaign_only': True, 'new_accounts': 0, 'client_pages': 2,
        'host_native_actions_per_browser': 1, 'maximum_guest_recovery_actions': 10,
        'maximum_seconds_per_browser': 180,
        'target': 'https://dcss.iancaltabiano.com', 'routed_candidate_assets': phase == 'staged'
    }}, indent=2) + '\n')
    print(sha(binding)); sys.exit()

assert manifest() == json.loads(binding.read_text())['files']
env = dict(os.environ, NODE_PATH='/Users/iancaltabiano/.cache/codex-runtimes/'
           'codex-primary-runtime/dependencies/node/node_modules', SMOOTH_PHASE=phase)
report = {'passed': False, 'phase': phase, 'source_manifest_sha256': sha(OUT / 'deploy-payload/manifest.json')}
try:
    for engine in ['chromium', 'webkit']:
        command = ['/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node',
                   str(OUT / 'public-smoke.cjs')]
        result = subprocess.run(command, env=dict(env, SMOOTH_ENGINE=engine), cwd=ROOT,
                                capture_output=True, text=True, timeout=180)
        (OUT / (phase + '-' + engine + '.log')).write_text(result.stdout + result.stderr)
        print(result.stdout[-3500:] + result.stderr[-3500:], flush=True)
        assert result.returncode == 0, engine + ' public smoke failed'
        proof = json.loads((OUT / (phase + '-' + engine + '.json')).read_text())
        assert proof['passed'] and proof['test_game_saved'] and proof['graphics_restored']
    assert manifest() == json.loads(binding.read_text())['files']
    report['passed'] = True
finally:
    (OUT / (phase + '-browser-result.json')).write_text(json.dumps(report, indent=2) + '\n')
