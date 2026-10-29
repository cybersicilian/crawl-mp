"""Freeze the bounded source overlay and a readable diff against deployed source."""
import difflib
import hashlib
import io
import json
from pathlib import Path
import tarfile

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'merged-source'
previous = json.loads((HERE / 'overlay-manifest.json').read_text())
for name in ('overlay-manifest.json', 'overlay.tar.gz', 'stage-plan.json'):
    backup = HERE / (name + '.before-target-fix')
    if not backup.exists():
        backup.write_bytes((HERE / name).read_bytes())
additional = {'webserver/tests/character-options.cjs', 'rltiles/dc-feat.txt',
    'rltiles/dc-invocations.txt', 'rltiles/dngn/altars/vellum.png',
    'rltiles/gui/invocations/vellum_weave.png', 'rltiles/dc-player.txt', 'rltiles/dc-gui.txt',
    'rltiles/player/base/chain_devil.png', 'rltiles/player/base/eldritch.png',
    *{'rltiles/gui/abilities/' + name + '.png' for name in (
        'chain_lash', 'reel_in', 'pinning_chain', 'release_chain', 'profane_altar', 'elder_rite')}}
assert set(previous) | additional == {str(p.relative_to(SOURCE)) for p in SOURCE.rglob('*') if p.is_file()}
previous.update({name: '' for name in additional})
manifest = {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() for name in sorted(previous)}
(HERE / 'overlay-manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
with tarfile.open(HERE / 'overlay.tar.gz', 'w:gz') as archive:
    for name in manifest:
        content = (SOURCE / name).read_bytes()
        entry = tarfile.TarInfo(name)
        entry.size, entry.mtime, entry.mode = len(content), 0, 0o644
        archive.addfile(entry, io.BytesIO(content))
patch = []
changed = []
for name in manifest:
    old = HERE / 'live-source' / name
    if name.endswith('.png'):
        changed.append(name)
        patch.append('Binary asset added: crawl-ref/source/' + name + '\n')
        continue
    before = old.read_text().splitlines(keepends=True) if old.exists() else []
    after = (SOURCE / name).read_text().splitlines(keepends=True)
    if before == after:
        continue
    changed.append(name)
    patch.extend(difflib.unified_diff(before, after,
        fromfile='a/crawl-ref/source/' + name if old.exists() else '/dev/null',
        tofile='b/crawl-ref/source/' + name))
(HERE / 'release.patch').write_text(''.join(patch))
plan = json.loads((HERE / 'stage-plan.json').read_text())
plan['overlay_archive_sha256'] = hashlib.sha256((HERE / 'overlay.tar.gz').read_bytes()).hexdigest()
plan['overlay_manifest_sha256'] = hashlib.sha256((HERE / 'overlay-manifest.json').read_bytes()).hexdigest()
plan['review_patch_sha256'] = hashlib.sha256((HERE / 'release.patch').read_bytes()).hexdigest()
plan['review_patch'] = str(HERE / 'release.patch')
plan['actual_changed_files'] = len(changed)
plan['targeting_fix'] = 'Chain Lash opens ordinary chooser when caller passes an uninitialized dist; cancel remains free.'
(HERE / 'stage-plan.json').write_text(json.dumps(plan, indent=2, sort_keys=True) + '\n')
print(json.dumps({'files': len(manifest), 'changed': len(changed), 'sha256': plan['overlay_archive_sha256']}))
