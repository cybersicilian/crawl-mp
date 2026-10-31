"""Run bounded native acceptance once this task's optimized build finishes."""
import json
from pathlib import Path
import subprocess
import time

ROOT = Path('/tmp/dcss-autoexplore-01a1801a')
BUILD = Path('/opt/dcss/staging/autoexplore-01a1801a')
BASE = Path('/opt/dcss/releases/render-smoothness-01a1801a/crawl-ref/source')


def run():
    report = dict(passed=False, existing_saves_used=False, checks={})
    try:
        deadline = time.monotonic() + 2700
        while not (BUILD / 'build-result.json').exists():
            assert time.monotonic() < deadline, 'Build wait expired'
            time.sleep(15)
        built = json.loads((BUILD / 'build-result.json').read_text())
        assert built['passed'], 'Optimized build failed'
        commands = {
            'optimized': ['python3', '-I', str(ROOT / 'native_pacing_probe.py'),
                str(BUILD / 'source'), str(ROOT / 'native-command-completion.py'), str(ROOT / 'optimized')],
            'save-compatibility': ['python3', '-I', '/tmp/save_compatibility_probe.py',
                str(BASE), str(BUILD / 'source'), '/tmp/native-command-completion.py',
                str(ROOT / 'save-compatibility')]}
        for name, command in commands.items():
            result = subprocess.run(command, capture_output=True, text=True, timeout=180)
            (ROOT / (name + '.log')).write_text(result.stdout + result.stderr)
            print(result.stdout[-4000:] + result.stderr[-3000:], flush=True)
            report['checks'][name] = dict(exit_code=result.returncode)
            assert result.returncode == 0, name + ' failed'
        report['passed'] = True
    finally:
        (ROOT / 'optimized-verification.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    run()
