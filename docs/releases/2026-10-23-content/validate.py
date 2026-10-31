"""Bind and validate an isolated content-release source snapshot under the shared gate.

Preparation is read-only source hashing. Run requires this chat's exact active
reservation; it never takes or releases another task's reservation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[2]
STATE = Path.home() / 'Documents/Codex/work/host-heavy'
OWNER = 'codex/01a16a0f-b9dc-7e80-ad55-34720b26d695'
EVIDENCE = HERE / 'native-attempt-6'
REQUEST = EVIDENCE / 'request.json'
BUILD = ['make', '-k', '-j2', 'WEBTILES=y', 'STDFLAG=-std=c++17',
         'NO_OPTIMIZE=y', 'PYTHON=/usr/local/bin/python3', 'crawl', 'catch2-tests-executable']
COMPILE = BUILD[:-2] + ['actor-displacement.o', 'chain-devil.o', 'eldritch.o',
    'eldritch-policy.o', 'eldritch-powers.o', 'eldritch-rites.o', 'eldritch-equipment.o',
    'catch2-tests/test_new_species.o']
COMMANDS = [COMPILE, BUILD, ['./crawl', '--builddb', '--reset-cache'],
    ['./catch2-tests-executable', '[new-species]', '--reporter', 'console'],
    ['./catch2-tests-executable',
     '[vellum],[pakellas],[vorr],[bloodcraft],[shell],[party-session],[party-trade],[save-compatibility]',
     '--reporter', 'console']]



def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n')


def prepare(reuse: Path | None) -> None:
    names = subprocess.check_output(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'crawl-ref'],
        cwd=PROJECT).decode().split('\0')
    paths = {name for name in names if name.startswith('crawl-ref/source/')
             and '/webserver/' not in name and (PROJECT / name).is_file()}
    # Installed third-party dependencies are bound byte-for-byte. Game objects,
    # executables and PCH files are excluded; all game code builds afresh.
    contrib = PROJECT / 'crawl-ref/source/contrib'
    for directory in ('install', 'libpng', 'zlib', 'lua', 'sqlite', 'pcre'):
        paths.update(str(path.relative_to(PROJECT)) for path in (contrib / directory).rglob('*')
                     if path.is_file() and '.git' not in path.relative_to(contrib).parts)
    hashes = {name: digest(PROJECT / name) for name in sorted(paths)
              if Path(name).suffix not in {'.o', '.d', '.gch', '.pyc'}}
    EVIDENCE.mkdir(exist_ok=True, parents=True)
    manifest = EVIDENCE / 'source.json'
    write(manifest, hashes)
    policy = json.loads((STATE / 'policy.json').read_text())
    if digest(Path(policy['gateScript'])) != policy['gateSha256']:
        raise RuntimeError('Gate script does not match policy')
    request = {'owner': OWNER, 'project': str(PROJECT), 'createdAt': time.time(),
               'sourceManifest': str(manifest), 'sourceSha256': digest(manifest),
               'runnerSha256': digest(Path(__file__)), 'commands': COMMANDS,
               'gateScript': policy['gateScript'], 'gateSha256': policy['gateSha256'],
               'stateDirectory': str(STATE), 'resourceBinding': {'makeJobs': 2, 'phases': 'sequential'},
               'scope': 'isolated native build, both species contracts and adjacent god, party and save regressions',
               'notClaimed': ['campaign balance', 'browser gameplay', 'deployment']}
    if reuse:
        reuse = reuse.resolve()
        if reuse.parent != Path('/private/tmp') or not reuse.name.startswith('dcss-content-'):
            raise RuntimeError('Only this validation runner\'s isolated candidates can be reused')
        cache = EVIDENCE / 'cache.json'
        write(cache, {str(path.relative_to(reuse)): digest(path)
                      for path in sorted(reuse.rglob('*')) if path.is_file()})
        request.update(reuseSnapshot=str(reuse), cacheManifest=str(cache), cacheSha256=digest(cache))
    write(REQUEST, request)
    print(json.dumps({'request': str(REQUEST), 'requestId': digest(REQUEST),
                      'sourceFiles': len(hashes), 'sourceSha256': digest(manifest)}))


def run() -> int:
    request = json.loads(REQUEST.read_text())
    state = json.loads((STATE / 'state.json').read_text())
    policy = json.loads((STATE / 'policy.json').read_text())
    if (state.get('owner') != OWNER or state.get('requestId') != digest(REQUEST)
            or state.get('status') != 'running' or not state.get('reservation')
            or state.get('processGroup') != os.getpgrp()
            or policy.get('resourceHold', {}).get('active')):
        raise RuntimeError('Run requires the exact live foreground gate reservation')
    if digest(Path(__file__)) != request['runnerSha256']:
        raise RuntimeError('Runner changed; prepare a fresh request')
    manifest = Path(request['sourceManifest'])
    if digest(manifest) != request['sourceSha256']:
        raise RuntimeError('Source manifest changed')
    hashes = json.loads(manifest.read_text())
    snapshot = Path(request.get('reuseSnapshot', '/private/tmp/dcss-content-' + digest(REQUEST)[:16]))
    if 'reuseSnapshot' in request:
        cache = Path(request['cacheManifest'])
        if digest(cache) != request['cacheSha256']:
            raise RuntimeError('Cache manifest changed')
        for name, expected in json.loads(cache.read_text()).items():
            if digest(snapshot / name) != expected:
                raise RuntimeError('Owned build cache changed: ' + name)
    else:
        snapshot.mkdir()  # Never overwrite an unrelated candidate.
    for name, expected in hashes.items():
        original = PROJECT / name
        if digest(original) != expected:
            raise RuntimeError('Source changed before snapshot: ' + name)
        target = snapshot / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or digest(target) != expected:
            shutil.copy2(original, target)
            # Source changes must invalidate cached objects even if a restored
            # source file has an older filesystem timestamp.
            os.utime(target, None)
        if digest(target) != expected:
            raise RuntimeError('Snapshot differs: ' + name)
    source = snapshot / 'crawl-ref/source'
    (source / 'util/release_ver').write_text('0.33-a0\n')
    results = []
    for index, command in enumerate(request['commands'], 1):
        log = EVIDENCE / f'step-{index}.log'
        with log.open('w') as output:
            result = subprocess.run(command, cwd=source, stdout=output, stderr=subprocess.STDOUT,
                                    env={**os.environ, 'TERM': 'xterm-256color'})
        entry = {'command': command, 'exitCode': result.returncode, 'log': str(log)}
        results.append(entry)
        print(json.dumps(entry), flush=True)
        write(EVIDENCE / 'result.json', {'requestId': digest(REQUEST), 'snapshot': str(snapshot),
                                       'results': results, 'complete': len(results) == len(COMMANDS),
                                       'passed': len(results) == len(COMMANDS)
                                       and all(entry['exitCode'] == 0 for entry in results)})
        if result.returncode:
            return result.returncode
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'run'])
    parser.add_argument('--reuse', type=Path, help='Bind this runner\'s previous isolated build cache')
    args = parser.parse_args()
    if args.action == 'prepare':
        prepare(args.reuse)
    else:
        try:
            raise SystemExit(run())
        except Exception as error:
            write(EVIDENCE / 'result.json', {'requestId': digest(REQUEST),
                                            'complete': False, 'passed': False,
                                            'error': str(error)})
            raise
