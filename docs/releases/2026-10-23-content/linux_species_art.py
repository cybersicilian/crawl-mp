"""Apply the exact native-art delta and validate the final combined release."""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import pwd
import shutil
import subprocess
import tarfile
import time

ROOT = Path('/opt/dcss/staging/content-01a16a0f-v1')
SOURCE = ROOT / 'crawl-ref/source'
INPUT = Path('/tmp/dcss-species-art-01a16a0f')
OUT = ROOT / 'species-art'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
save = lambda p,v: p.write_text(json.dumps(v, indent=2, sort_keys=True) + '\n')
lock = open('/opt/dcss/release-build.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
progress = json.loads((ROOT / 'validation/progress.json').read_text())
assert progress['status'] == 'validated_not_published' and progress['vellum_art']['passed']
assert Path('/opt/dcss/current').resolve() == Path(progress['baseline'])
assert not Path('/opt/dcss/releases/20261023T220119Z-content').exists()
assert not OUT.exists()
before = json.loads((ROOT / 'release-input/overlay-manifest.json').read_text())
control = json.loads((INPUT / 'stage-plan.json').read_text())
after = json.loads((INPUT / 'overlay-manifest.json').read_text())
assert control['production_mutation_authorized']
assert sha(INPUT / 'overlay.tar.gz') == control['overlay_archive_sha256']
assert sha(INPUT / 'overlay-manifest.json') == control['overlay_manifest_sha256']
for name, expected in before.items():
    assert sha(SOURCE / name) == expected, name
changed = {n for n in after if after[n] != before.get(n)}
assert changed == set(json.loads((INPUT / 'species-art-delta.json').read_text()))
OUT.mkdir()
save(OUT / 'original-progress.json', progress)
identity = pwd.getpwnam('nobody')
with tarfile.open(INPUT / 'overlay.tar.gz') as archive:
    assert set(archive.getnames()) == set(after)
    for entry in archive:
        assert entry.isfile() and not Path(entry.name).is_absolute() and '..' not in Path(entry.name).parts
        content = archive.extractfile(entry).read()
        assert hashlib.sha256(content).hexdigest() == after[entry.name]
        if entry.name not in changed:
            continue
        target = SOURCE / entry.name
        if target.exists():
            backup = OUT / 'before' / entry.name
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        os.chown(target, identity.pw_uid, identity.pw_gid)
env = {**os.environ, 'HOME': str(ROOT / 'validation/home'), 'TERM': 'xterm-256color',
    'TMPDIR': str(ROOT / 'validation/tmp'), 'PYTHONPATH': str(SOURCE / 'webserver')}
make = ['make','-k','-j2','WEBTILES=y','NOWIZARD=y','STDFLAG=-std=c++17','NO_OPTIMIZE=y']
steps = [('build',make+['crawl','catch2-tests-executable','webserver']),
    ('new-species',['./catch2-tests-executable','[new-species]','--reporter','console']),
    ('adjacent',['./catch2-tests-executable','[vellum],[pakellas],[vorr],[bloodcraft],[shell],[party-session],[party-trade],[save-compatibility]','--reporter','console']),
    ('catalog',['python3','webserver/util/generate_character_catalog.py','--binary',str(SOURCE/'crawl')]),
    ('preview',['python3','webserver/tests/native-character-preview.py','--binary',str(SOURCE/'crawl')])]
progress.update(status='validating_species_art', plan=control)
save(ROOT/'validation/progress.json',progress)
os.nice(10)
for name,command in steps:
    start=time.monotonic()
    with (OUT/(name+'.log')).open('w') as log:
        call=subprocess.run(command,cwd=SOURCE,env=env,stdout=log,stderr=subprocess.STDOUT,
            user=identity.pw_uid,group=identity.pw_gid,extra_groups=[],timeout=3600)
    receipt={'step':name,'exit_code':call.returncode,'seconds':round(time.monotonic()-start,2)}
    save(OUT/(name+'.json'),receipt)
    print(json.dumps(receipt),flush=True)
    assert call.returncode==0,name
for name,expected in after.items():
    assert sha(SOURCE/name)==expected,name
assert '-DWIZARD' not in (SOURCE/'.cflags').read_text()
for name,tokens in {'player':['TILEP_BASE_CHAIN_DEVIL','TILEP_BASE_ELDRITCH'],
    'gui':['TILEG_SP_CHAIN_DEVIL','TILEG_SP_ELDRITCH','TILEG_ABILITY_CHAIN_LASH','TILEG_ABILITY_ELDER_RITE']}.items():
    header=(SOURCE/('rltiles/tiledef-'+name+'.h')).read_text()
    assert all(token in header for token in tokens)
atlases={}
for name in ('feat','gui','player'):
    expected=sha(SOURCE/('rltiles/'+name+'.png'))
    assert sha(SOURCE/('dat/tiles/'+name+'.png'))==expected
    assert sha(SOURCE/('webserver/game_data/static/'+name+'.png'))==expected
    atlases[name]=expected
(ROOT/'release-input').rename(OUT/'previous-release-input')
(ROOT/'release-input').mkdir()
for name in ('overlay.tar.gz','overlay-manifest.json','stage-plan.json','species-art-delta.json'):
    shutil.copy2(INPUT/name,ROOT/'release-input'/name)
receipt={'passed':True,'native_sha256':sha(SOURCE/'crawl'),'overlay_sha256':control['overlay_archive_sha256'],
    'atlases':atlases,'changed_files':sorted(changed),'production_mutated':False,'completed_at':time.time()}
save(OUT/'result.json',receipt)
progress.update(status='validated_not_published',native_sha256=receipt['native_sha256'],species_art=receipt)
save(ROOT/'validation/progress.json',progress)
print(json.dumps(receipt),flush=True)
