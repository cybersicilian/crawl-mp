"""Run the exact co-op source snapshot while holding the common host gate."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

PROJECT = Path(__file__).resolve().parents[2]
EVIDENCE = Path(__file__).resolve().parent
SNAPSHOT = Path('/private/tmp/dcss-coop-content-01a15b5a')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    request = json.loads((EVIDENCE / 'phase-request.json').read_text())
    source = PROJECT / 'crawl-ref/source'
    for name, expected in request['workingSourceHashes'].items():
        if digest(source / name) != expected:
            raise RuntimeError('Source changed before snapshot: ' + name)
    if not SNAPSHOT.exists():
        SNAPSHOT.mkdir()
        subprocess.run(['cp', '-cR', str(PROJECT / 'crawl-ref'), str(SNAPSHOT)], check=True)
    frozen = SNAPSHOT / 'crawl-ref/source'
    for name, expected in request['sourceHashes'].items():
        if digest(frozen / name) != expected:
            raise RuntimeError('Snapshot differs: ' + name)
    (frozen / 'util/release_ver').write_text('0.33-a0\n')
    started = time.time()
    commands = [
        ['make', '-j2', 'WEBTILES=y', 'STDFLAG=-std=c++14',
         'PYTHON=/usr/local/bin/python3', 'catch2-tests-executable', 'crawl'],
        ['./crawl', '--builddb', '--reset-cache'],
        ['./catch2-tests-executable', '[coop-content]', '--reporter', 'console'],
        ['./catch2-tests-executable', '[paladin],[party-session],[save-compatibility]',
         '--reporter', 'console'],
        ['/usr/local/bin/python3', str(EVIDENCE / 'check_native_preview.py'),
         '--binary', str(frozen / 'crawl')],
        ['/usr/local/bin/python3', 'webserver/util/generate_character_catalog.py',
         '--binary', str(frozen / 'crawl'), '--output', str(SNAPSHOT / 'character-catalog.js'),
         '--weapons-output', str(SNAPSHOT / 'starting-weapons.json')],
        ['node', 'webserver/tests/power-art.cjs'],
    ]
    results = []
    for index, command in enumerate(commands, 1):
        log_path = EVIDENCE / ('step-%d.log' % index)
        with log_path.open('w') as log:
            result = subprocess.run(command, cwd=frozen, stdout=log, stderr=subprocess.STDOUT,
                                    env={**os.environ, 'TERM': 'xterm-256color'})
        entry = {'command': command, 'exitCode': result.returncode, 'log': str(log_path)}
        results.append(entry)
        print(json.dumps(entry), flush=True)
        if result.returncode:
            break
    changed = [name for name, expected in request['workingSourceHashes'].items()
               if digest(source / name) != expected]
    passed = len(results) == len(commands) and all(r['exitCode'] == 0 for r in results)
    report = {'startedAt': started, 'finishedAt': time.time(), 'results': results,
              'snapshotMatchesRequest': True, 'workingSourceChangedDuringBuild': changed,
              'passed': passed}
    (EVIDENCE / 'validation-result.json').write_text(json.dumps(report, indent=2) + '\n')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
