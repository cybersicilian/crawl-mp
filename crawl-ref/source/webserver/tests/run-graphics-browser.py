"""Own and close both fixture/browser children inside one supervised phase."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

output = Path(sys.argv[1]).resolve(); output.mkdir(parents=True, exist_ok=True)
tests = Path(__file__).parent
ready = output / 'fixture-ready.json'
ready.unlink(missing_ok=True)
processes = []


def close():
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait()


def stop(signum, frame):
    close(); raise SystemExit(128 + signum)


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
try:
    with (output / 'fixture.log').open('w') as log:
        fixture = subprocess.Popen([sys.executable, str(tests / 'graphics-profile-fixture.py'), '--ready', str(ready)], stdout=log, stderr=log)
        processes.append(fixture)
        for _ in range(100):
            if ready.exists():
                break
            assert fixture.poll() is None, 'Fixture startup failed; see fixture.log'
            time.sleep(.1)
        assert ready.exists(), 'Fixture startup timed out'
        env = dict(os.environ, GRAPHICS_TEST_URL=json.loads(ready.read_text())['url'], GRAPHICS_PROOF_DIR=str(output))
        browser = subprocess.Popen(['node', str(tests / 'graphics-profile-browser.cjs')], env=env)
        processes.append(browser)
        code = browser.wait(timeout=180)
        if code:
            raise SystemExit(code)
finally:
    close()
    (output / 'child-closure.json').write_text(json.dumps({'allOwnedChildrenExited': all(p.poll() is not None for p in processes),
        'processes': [{'pid': p.pid, 'exitCode': p.returncode} for p in processes]}, indent=2) + '\n')
