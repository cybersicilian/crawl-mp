"""Build and test the frozen sprite repair under the shared host reservation."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

PROJECT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--snapshot', type=Path, required=True)
    args = parser.parse_args()
    evidence = args.evidence.resolve()
    snapshot = args.snapshot.resolve()
    request = json.loads((evidence / 'phase-request.json').read_text())
    source = PROJECT / 'crawl-ref/source'
    for name, expected in request['sourceHashes'].items():
        if digest(source / name) != expected:
            raise RuntimeError('Source changed before snapshot: ' + name)
    if snapshot.exists():
        raise RuntimeError('Refusing to reuse an existing validation snapshot')
    snapshot.mkdir()
    subprocess.run(['cp', '-cR', str(PROJECT / 'crawl-ref'), str(snapshot)],
                   check=True)
    frozen = snapshot / 'crawl-ref/source'
    for name, expected in request['sourceHashes'].items():
        if digest(frozen / name) != expected:
            raise RuntimeError('Snapshot differs: ' + name)
    (frozen / 'util/release_ver').write_text('0.33-a0\n')
    frozen_hashes = {}
    for path in sorted(frozen.rglob('*')):
        relative = path.relative_to(frozen)
        if any(part in {'contrib', '__pycache__'} for part in relative.parts):
            continue
        if path.is_file() and (path.suffix in {'.cc', '.c', '.h', '.hpp',
                                               '.txt', '.png', '.py', '.pl',
                                               '.lua', '.yaml', '.yml', '.des'}
                               or path.name.startswith('Makefile')):
            frozen_hashes[str(relative)] = digest(path)
    manifest = evidence / 'frozen-source-hashes.json'
    manifest.write_text(json.dumps(frozen_hashes, indent=2) + '\n')
    print(json.dumps({'frozenSourceFiles': len(frozen_hashes),
                      'frozenSourceManifestSha256': digest(manifest)}), flush=True)
    commands = [
        ['make', '-j2', 'WEBTILES=y', 'STDFLAG=-std=c++14',
         'PYTHON=/usr/local/bin/python3', 'catch2-tests-executable'],
        ['./catch2-tests-executable', '[item-tiles]', '--reporter', 'console'],
    ]
    results = []
    started = time.time()
    for index, command in enumerate(commands, 1):
        log_path = evidence / ('step-%d.log' % index)
        with log_path.open('w') as log:
            result = subprocess.run(command, cwd=frozen, stdout=log,
                                    stderr=subprocess.STDOUT,
                                    env={**os.environ, 'TERM': 'xterm-256color'})
        entry = {'command': command, 'exitCode': result.returncode,
                 'log': str(log_path)}
        results.append(entry)
        print(json.dumps(entry), flush=True)
        if result.returncode:
            break
    passed = (len(results) == len(commands)
              and all(result['exitCode'] == 0 for result in results))
    report = {'startedAt': started, 'finishedAt': time.time(),
              'requestSha256': digest(evidence / 'phase-request.json'),
              'frozenSourceManifestSha256': digest(manifest),
              'snapshot': str(frozen), 'snapshotMatchesRequest': True,
              'results': results, 'passed': passed}
    (evidence / 'validation-result.json').write_text(
        json.dumps(report, indent=2) + '\n')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
