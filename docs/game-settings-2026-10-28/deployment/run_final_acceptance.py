"""Run the real modal fixture and public verification sequentially under one gate."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
BINDING=OUT/'final-browser-binding.json'


def hashes():
    names=['docs/game-settings-2026-10-28/deployment/verify_live.cjs',
        'docs/game-settings-2026-10-28/deployment/active-release.json',
        'docs/game-settings-2026-10-28/deployment/run_final_acceptance.py',
        'crawl-ref/source/webserver/tests/rc-settings-test.cjs',
        'crawl-ref/source/webserver/tests/helpers/game-settings-fixture.py',
        'crawl-ref/source/webserver/static/scripts/client.js',
        'crawl-ref/source/webserver/static/scripts/client-lobby.js',
        'crawl-ref/source/webserver/static/scripts/client-dialogs.js',
        'crawl-ref/source/webserver/static/scripts/rc-settings.js',
        'crawl-ref/source/webserver/static/game-settings.json',
        'crawl-ref/source/webserver/templates/game-settings.html',
        'crawl-ref/source/webserver/static/styles/rc-settings.css']
    return {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in names}


if '--prepare' in sys.argv:
    BINDING.write_text(json.dumps(dict(owner='codex/01a1838c-0238-7422-9b21-9f9dc9392c41',source=hashes(),
        resources=dict(browser_engines=['chromium'],sequential=True,max_browsers=1,max_pages=1,max_fixture_servers=1,
                       new_accounts=0,native_games=0,qa_preferences_restored=True)),indent=2)+'\n')
    print(hashlib.sha256(BINDING.read_bytes()).hexdigest());raise SystemExit()

assert hashes()==json.loads(BINDING.read_text())['source']
env=dict(os.environ,NODE_PATH='/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',
    SETTINGS_PROOF_DIR=str(OUT/'centering/local-proof'))
for name,script in [('local','crawl-ref/source/webserver/tests/rc-settings-test.cjs'),
                    ('public','docs/game-settings-2026-10-28/deployment/verify_live.cjs')]:
    result=subprocess.run(['node',str(ROOT/script)],cwd=ROOT,env=env,capture_output=True,text=True,timeout=180)
    (OUT/('final-'+name+'.log')).write_text(result.stdout+result.stderr)
    print(result.stdout[-5000:]+result.stderr[-4000:],flush=True)
    assert result.returncode==0,name+' settings verification failed'
    assert hashes()==json.loads(BINDING.read_text())['source']
print('Local and live settings acceptance passed; every browser and fixture process exited.',flush=True)
