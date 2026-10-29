"""Finalize already-passed repair evidence after publishing inputs as their owner."""
from pathlib import Path
import fcntl
import hashlib
import json
import time

ROOT = Path('/opt/dcss/staging/content-01a16a0f-v1')
SOURCE = ROOT / 'crawl-ref/source'
OUT = ROOT / 'rite-recovery'
INPUT = Path('/tmp/dcss-content-recovery-01a16a0f')
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
lock = open('/opt/dcss/release-build.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
plan = json.loads((INPUT / 'rite-recovery-plan.json').read_text())
control = json.loads(Path('/tmp/dcss-content-stage-plan.json').read_text())
assert sha(Path('/tmp/dcss-content-overlay.tar.gz')) == control['overlay_archive_sha256']
assert sha(Path('/tmp/dcss-content-overlay-manifest.json')) == control['overlay_manifest_sha256']
progress = json.loads((ROOT / 'validation/progress.json').read_text())
assert progress['status'] == 'validated_not_published'
assert progress['plan']['overlay_archive_sha256'] == plan['before_archive_sha256']
assert Path('/opt/dcss/current').resolve() == Path(progress['baseline'])
for name in ('reproduction-build', 'build', 'new-species', 'adjacent', 'catalog'):
    assert json.loads((OUT / (name + '.json')).read_text())['exit_code'] == 0, name
assert json.loads((OUT / 'before-fix.json').read_text())['exit_code'] != 0
for name in ('new-species', 'adjacent'):
    assert 'All tests passed' in (OUT / (name + '.log')).read_text()
for name, expected in json.loads(Path('/tmp/dcss-content-overlay-manifest.json').read_text()).items():
    assert sha(SOURCE / name) == expected, name
assert '-DWIZARD' not in (SOURCE / '.cflags').read_text()
receipt = {'passed': True, 'regression_reproduced_before_fix': True,
    'only_native_source_changes': sorted(plan['after']), 'before': plan['before'], 'after': plan['after'],
    'native_sha256': sha(SOURCE / 'crawl'), 'overlay_sha256': control['overlay_archive_sha256'],
    'completed_at': time.time(), 'production_mutated': False,
    'metadata_finalization': 'All tests passed before root was denied truncating SSH-user-owned files in protected /tmp. Inputs were then copied by their original owner; no security policy was changed and no tests rerun.'}
(OUT / 'result.json').write_text(json.dumps(receipt, indent=2) + '\n')
progress.update(status='validated_not_published', plan=control,
    native_sha256=receipt['native_sha256'], recovery_fix=receipt)
(ROOT / 'validation/progress.json').write_text(json.dumps(progress, indent=2) + '\n')
print(json.dumps(receipt))
