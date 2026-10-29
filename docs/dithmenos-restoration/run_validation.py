#!/usr/bin/env python3
"""Build and exercise an isolated copy while the caller owns the host gate."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

PROJECT = Path(__file__).resolve().parents[2]
EVIDENCE = Path(__file__).resolve().parent
SOURCE = PROJECT / 'crawl-ref/source'
ISOLATED = Path('/private/tmp/dcss-dithmenos-01a1595d-validation')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    request = json.loads((EVIDENCE / 'phase-request.json').read_text())
    for name, expected in request['workingSourceHashes'].items():
        if digest(SOURCE / name) != expected:
            raise RuntimeError('Scoped working source changed: ' + name)
    for name, expected in request['sourceHashes'].items():
        if digest(ISOLATED / name) != expected:
            raise RuntimeError('Frozen snapshot changed: ' + name)
    started = time.time()
    (ISOLATED / "util/release_ver").write_text(request["releaseVersion"] + "\n")
    steps = [
        ['make', '-j2', 'WEBTILES=y', 'NOWIZARD=y', 'NO_OPTIMIZE=y',
         'STDFLAG=-std=c++14', 'PYTHON=/usr/local/bin/python3', 'catch2-tests-executable'],
        ['./catch2-tests-executable', '[dithmenos]', '--reporter', 'console'],
        ['./catch2-tests-executable', '[save-compatibility]', '--reporter', 'console'],
    ]
    results = []
    for index, command in enumerate(steps, 1):
        with (EVIDENCE / ('step-%d.log' % index)).open('w') as log:
            result = subprocess.run(command, cwd=ISOLATED, stdout=log, stderr=subprocess.STDOUT)
        results.append({'command': command, 'exitCode': result.returncode})
        print(json.dumps(results[-1]), flush=True)
        if result.returncode:
            break
    changed = [name for name, expected in request['workingSourceHashes'].items()
               if digest(SOURCE / name) != expected]
    report = {'startedAt': started, 'finishedAt': time.time(), 'results': results,
              'snapshotMatchesRequest': True, 'workingSourceChangedDuringBuild': changed,
              'passed': len(results) == len(steps) and all(r['exitCode'] == 0 for r in results)}
    (EVIDENCE / 'validation-result.json').write_text(json.dumps(report, indent=2) + '\n')
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
