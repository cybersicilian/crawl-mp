"""Bind the final tested remote engine and narrow server overlay."""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path('/tmp/dcss-autoexplore-01a1801a')
BUILD = Path('/opt/dcss/staging/autoexplore-01a1801a')
LIVE = Path('/opt/dcss/releases/render-smoothness-01a1801a/crawl-ref/source')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    report = json.loads((BUILD / 'build-result.json').read_text())
    assert report['passed'] and report['source_content_unchanged']
    manifest = json.loads(Path('/tmp/release-manifest-template.json').read_text())
    for name in ('deploy_autoexplore.py', 'save_and_activate.py', 'deployment_core.py'):
        shutil.copyfile(Path('/tmp') / name, ROOT / name)
    assert sha(BUILD / 'source/crawl') == report['native_sha256']
    for name, expected in manifest['candidate'].items():
        assert sha(ROOT / Path(name).name) == expected, name
    manifest['candidate']['crawl'] = report['native_sha256']
    manifest['candidate']['.cflags'] = sha(BUILD / 'source/.cflags')
    manifest['candidate']['compflag.h'] = sha(BUILD / 'source/compflag.h')
    manifest['baseline']['.cflags'] = sha(LIVE / '.cflags')
    manifest['baseline']['compflag.h'] = sha(LIVE / 'compflag.h')
    for name, expected in manifest['baseline'].items():
        assert sha(LIVE / name) == expected, name
    manifest['evidence'] = {}
    for name in ('scheduler-verification.json', 'optimized/result.json',
                 'scheduler-optimized/result.json', 'save-compatibility/result.json'):
        result = json.loads((ROOT / name).read_text())
        assert result['passed'], name
        manifest['evidence'][name] = sha(ROOT / name)
    for name in ('fast-default/result.json', 'explicit-delay/result.json'):
        assert json.loads((ROOT / name).read_text())['passed']
        manifest['evidence'][name] = sha(ROOT / name)
    manifest['helpers'] = {name: sha(ROOT / name) for name in (
        'deploy_autoexplore.py', 'save_and_activate.py', 'deployment_core.py')}
    (ROOT / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == '__main__':
    run()
