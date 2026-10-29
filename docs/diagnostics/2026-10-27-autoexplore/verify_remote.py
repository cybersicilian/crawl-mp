"""Verify only the scheduler overlay, using the frozen live native engine."""
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path('/tmp/dcss-autoexplore-01a1801a')
LIVE = Path('/opt/dcss/releases/render-smoothness-01a1801a/crawl-ref/source')


def run():
    candidate = ROOT / 'candidate-backend'
    if not candidate.exists():
        shutil.copytree(LIVE / 'webserver', candidate, symlinks=True,
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for name in ('activity_pump.py', 'process_handler.py'):
        shutil.copyfile(ROOT / name, candidate / 'webtiles' / name)
    report = dict(passed=False, existing_saves_used=False)
    try:
        with (ROOT / 'scheduler-unit.log').open('w') as log:
            result = subprocess.run(['/usr/bin/python3',
                str(ROOT / 'test_scheduler_wakeup.py')], env=dict(os.environ,
                PYTHONPATH=str(candidate)), stdout=log, stderr=subprocess.STDOUT, timeout=30)
        report['unit_exit_code'] = result.returncode
        assert result.returncode == 0, 'Scheduler regression failed'
        for name, backend in [('baseline', LIVE / 'webserver'), ('candidate', candidate)]:
            output = ROOT / ('scheduler-' + name)
            result = subprocess.run(['/usr/bin/python3',
                str(ROOT / 'scheduler_native_probe.py'), str(LIVE), str(backend),
                str(ROOT / 'native-command-completion.py'), str(output)],
                capture_output=True, text=True, timeout=100)
            (ROOT / ('scheduler-' + name + '.log')).write_text(result.stdout + result.stderr)
            print(result.stdout[-4000:] + result.stderr[-3000:], flush=True)
            report[name] = dict(exit_code=result.returncode)
            assert result.returncode == 0, name + ' native regression failed'
        report['passed'] = True
    finally:
        (ROOT / 'scheduler-verification.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    run()
