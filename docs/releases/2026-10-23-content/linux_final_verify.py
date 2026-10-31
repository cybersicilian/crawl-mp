"""Record actual deployed identity, public acceptance, health and state preservation."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import time

ROOT=Path('/opt/dcss/staging/content-01a16a0f-v1')
read=lambda name:json.loads((ROOT/name).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
activation=read('activation.json')
assert activation['passed'] and activation['activated']
release=Path('/opt/dcss/current').resolve()
assert str(release)==activation['release']
assert str(Path('/opt/dcss/previous').resolve())==activation['previous']
source=release/'crawl-ref/source'
assert sha(source/'crawl')==activation['native_sha256']
assert '-DWIZARD' not in (source/'.cflags').read_text()
public_path=Path('/tmp/dcss-content-public-browser-01a16a0f.json')
public=json.loads(public_path.read_text())
assert public['passed'] and public['native_sha256']==activation['native_sha256']
assert not public['errors'] and not public['assetErrors']
assert len(public['contentArt'])==10 and all(row['mismatches']==0 for row in public['contentArt'].values())
assert public['nativeDollLayers']==public['resumedDollLayers']
assert set(public['nativeDollLayers'])=={'BASE_CHAIN_DEVIL','BASE_ELDRITCH'}
for name,expected in public['assetHashes'].items():
    assert sha(source/'webserver/game_data/static'/name)==expected
for name,expected in activation['content_atlases'].items():
    assert sha(source/('webserver/game_data/static/'+name+'.png'))==expected
shutil.copy2(public_path,ROOT/'public-browser.json')
assert subprocess.run(['systemctl','is-active','--quiet','dcss-coop.service']).returncode==0
assert subprocess.run(['systemctl','is-active','--quiet','dcss-content-01a16a0f-qa']).returncode!=0
assert not Path('/sys/fs/cgroup/system.slice/dcss-content-01a16a0f-qa.service').exists()
subprocess.run(['systemctl','start','dcss-health.service','dcss-recovery.service'],check=True,timeout=120)
health=json.loads(Path('/var/lib/dcss-health/status.json').read_text())
assert health['ok']
packages=read('preserved-current-saves.json')
missing=[]
changed=[]
for relative,expected in packages.items():
    path=Path('/var/lib/dcss')/relative
    assert path.resolve().is_relative_to('/var/lib/dcss')
    if not path.exists(): missing.append(relative)
    elif sha(path)!=expected: changed.append(relative)
assert not missing, 'An original package disappeared after cutover'
receipt={'passed':True,'release':str(release),'previous':activation['previous'],
    'native_sha256':activation['native_sha256'],'wizard_disabled':True,
    'public_checks':public['checks'],'public_art_assets':10,'public_console_errors':[],
    'original_packages_preserved_at_cutover':len(packages),
    'original_packages_current_hash_unchanged':len(packages)-len(changed),
    'original_packages_changed_since_cutover':len(changed),'missing_original_packages':0,
    'checkpoint_comparisons':len(read('save-compatibility.json')['packages']),
    'health':health,'recovery_refreshed':True,'private_qa_closed':True,
    'snapshot':activation['snapshot'],'snapshot_id':activation['snapshot_id'],
    'restored_old_state':False,'completed_at':time.time()}
(ROOT/'final-verification.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
print(json.dumps(receipt))
