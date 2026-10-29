"""Verify the deployed engine through both native browser clients sequentially."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
SMOKE = ROOT / 'docs/diagnostics/2026-10-27-render-smoothness/public-smoke.cjs'
binding = OUT / 'public-binding.json'


def sources():
    files = [SMOKE, Path(__file__), ROOT / 'crawl-ref/source/webserver/tests/multiplayer-native-client.cjs',
             OUT / 'release-manifest.json', OUT / 'active-verification.json']
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


if '--prepare' in sys.argv:
    report = json.loads((OUT / 'public-binding-template.json').read_text())
    report['source'] = sources()
    binding.write_text(json.dumps(report, indent=2) + '\n')
    print(hashlib.sha256(binding.read_bytes()).hexdigest())
    raise SystemExit()

assert sources() == json.loads(binding.read_text())['source']
env = dict(os.environ, NODE_PATH='/Users/iancaltabiano/.cache/codex-runtimes/'
    'codex-primary-runtime/dependencies/node/node_modules', SMOOTH_PHASE='public',
    SMOOTH_OUTPUT=str(OUT))
result = dict(passed=False, new_accounts=0, new_campaigns=0)
try:
    for engine in ('chromium', 'webkit'):
        completed = subprocess.run([
            '/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node',
            str(SMOKE)], cwd=ROOT, env=dict(env, SMOOTH_ENGINE=engine,
            SMOOTH_AUTOEXPLORE='1' if engine == 'chromium' else '0'),
            capture_output=True, text=True, timeout=300)
        (OUT / ('public-' + engine + '.log')).write_text(completed.stdout + completed.stderr)
        print(completed.stdout[-4000:] + completed.stderr[-3000:], flush=True)
        assert completed.returncode == 0, engine + ' public acceptance failed'
        proof = json.loads((OUT / ('public-' + engine + '.json')).read_text())
        assert proof['passed'] and proof['test_game_saved'] and proof['graphics_restored']
    assert sources() == json.loads(binding.read_text())['source']
    result['passed'] = True
finally:
    (OUT / 'public-result.json').write_text(json.dumps(result, indent=2) + '\n')
