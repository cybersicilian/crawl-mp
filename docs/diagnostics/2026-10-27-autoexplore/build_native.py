"""Build the exact live native source at O2 in an isolated server directory."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path('/opt/dcss/staging/autoexplore-01a1801a')
LIVE = Path('/opt/dcss/releases/render-smoothness-01a1801a/crawl-ref/source')
EXPECTED = '8adcfbcb080e95ee7c3859dd91fd570b26b8bebb6cedbc05c1c004df0fb00a37'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    report = dict(passed=False, baseline_native_sha256=EXPECTED,
                  source=str(LIVE), started_at=time.time())
    try:
        assert sha(LIVE / 'crawl') == EXPECTED, 'Unexpected baseline engine'
        assert shutil.disk_usage(ROOT).free > 3_000_000_000, 'Insufficient scratch capacity'
        source = ROOT / 'source'
        resume = '--resume' in sys.argv
        if resume:
            inputs = json.loads((ROOT / 'source-binding.json').read_text())
            assert all(sha(source / p) == value for p, value in inputs.items()
                       if p not in {'.cflags', 'compflag.h'} and not p.startswith('util/')), 'Source drift'
        else:
            assert not source.exists(), 'Candidate directory already exists'
            shutil.copytree(LIVE, source, symlinks=True,
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
            inputs = {str(p.relative_to(source)): sha(p) for p in source.rglob('*')
                      if p.is_file() and not p.is_symlink() and p.suffix in {'.cc', '.h', '.l', '.y'}
                      or p.is_file() and p.name in {'Makefile', 'Makefile.obj', '.cflags'}}
            (ROOT / 'source-binding.json').write_text(json.dumps(inputs, indent=2) + '\n')
        report['baseline_cflags'] = (LIVE / '.cflags').read_text().strip()
        command = ['make', '-j2' if resume else '-j1', 'WEBTILES=y', 'NOWIZARD=y', 'NO_OPTIMIZE=y',
                   'CFOPTIMIZE=-O2', 'STDFLAG=-std=c++17', 'PYTHON=python3', 'crawl']
        report['command'] = command
        (ROOT / 'progress.json').write_text(json.dumps(report, indent=2) + '\n')
        with (ROOT / 'build.log').open('a' if resume else 'w') as log:
            completed = subprocess.run(command, cwd=source, stdout=log,
                                       stderr=subprocess.STDOUT, timeout=3500)
        report['exit_code'] = completed.returncode
        assert completed.returncode == 0, 'Native build failed'
        report['candidate_cflags'] = (source / '.cflags').read_text().strip()
        assert report['candidate_cflags'] == report['baseline_cflags'].replace(' -O0 ', ' -O2 '), 'Unexpected compiler defines'
        report['native_sha256'] = sha(source / 'crawl')
        assert (source / 'compflag.h').read_text() == (LIVE / 'compflag.h').read_text().replace('-O0', '-O2')
        report['source_content_unchanged'] = all(sha(source / p) == value
            for p, value in inputs.items() if p not in {'.cflags', 'compflag.h'} and not p.startswith('util/'))
        assert report['source_content_unchanged'], 'Native source changed during build'
        report['passed'] = True
    finally:
        report['elapsed_seconds'] = time.time() - report['started_at']
        report['pid'] = os.getpid()
        (ROOT / 'build-result.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report), flush=True)


if __name__ == '__main__':
    run()
