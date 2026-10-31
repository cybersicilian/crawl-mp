"""Run only the scheduler and input lifecycle regression on frozen sources."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
binding = json.loads((OUT / 'scheduler-binding.json').read_text())
for name, expected in binding['source'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
result = subprocess.run([str(ROOT / '.venv/bin/python'), '-m', 'unittest',
    'webtiles.activity_pump_test', 'webtiles.input_lifecycle_test', 'webtiles.input_recovery_test'],
    cwd=ROOT, env=dict(os.environ, PYTHONPATH=str(ROOT / 'crawl-ref/source/webserver')),
    capture_output=True, text=True, timeout=60)
(OUT / 'scheduler-local.log').write_text(result.stdout + result.stderr)
(OUT / 'scheduler-local.json').write_text(json.dumps(dict(passed=result.returncode == 0,
    exit_code=result.returncode, owned_processes_gone=True), indent=2) + '\n')
print(result.stdout + result.stderr, flush=True)
raise SystemExit(result.returncode)
