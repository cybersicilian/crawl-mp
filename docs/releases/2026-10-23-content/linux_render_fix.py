"""Repair the shared co-op view doll, preserving the installed candidate's history."""
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

ROOT=Path('/opt/dcss/staging/content-01a16a0f-v1')
INPUT=Path('/tmp/dcss-render-fix-01a16a0f')
SOURCE=ROOT/'crawl-ref/source'
OUT=ROOT/'render-fix'
RELEASE=Path('/opt/dcss/releases/20261023T220119Z-content')
INSTALLED=RELEASE/'crawl-ref/source'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
save=lambda p,v:p.write_text(json.dumps(v,indent=2,sort_keys=True)+'\n')
lock=open('/opt/dcss/release-build.lock','a')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
progress=json.loads((ROOT/'validation/progress.json').read_text())
prepared=json.loads((ROOT/'prepared.json').read_text())
assert progress['status']=='validated_not_published' and prepared['passed']
assert Path('/opt/dcss/current').resolve()==Path(prepared['baseline'])
assert sha(INSTALLED/'crawl')==prepared['native_sha256']==sha(SOURCE/'crawl')
assert subprocess.run(['systemctl','is-active','--quiet','dcss-content-01a16a0f-qa']).returncode!=0
assert not Path('/sys/fs/cgroup/system.slice/dcss-content-01a16a0f-qa.service').exists()
before=json.loads((ROOT/'release-input/overlay-manifest.json').read_text())
after=json.loads((INPUT/'overlay-manifest.json').read_text())
control=json.loads((INPUT/'stage-plan.json').read_text())
assert control['production_mutation_authorized']
assert sha(INPUT/'overlay.tar.gz')==control['overlay_archive_sha256']
assert sha(INPUT/'overlay-manifest.json')==control['overlay_manifest_sha256']
assert set(before)==set(after) and {n for n in after if after[n]!=before[n]}=={'tileweb.cc'}
for name,expected in before.items():
    assert sha(SOURCE/name)==sha(INSTALLED/name)==expected,name
assert not OUT.exists()
OUT.mkdir()
for name in ('prepared.json','save-compatibility.json','validation/progress.json'):
    backup=OUT/'before'/name
    backup.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/name,backup)
shutil.copy2(SOURCE/'tileweb.cc',OUT/'tileweb.before.cc')
with tarfile.open(INPUT/'overlay.tar.gz') as archive:
    data=archive.extractfile('tileweb.cc').read()
    assert hashlib.sha256(data).hexdigest()==after['tileweb.cc']
    (SOURCE/'tileweb.cc').write_bytes(data)
identity=pwd.getpwnam('nobody')
os.chown(SOURCE/'tileweb.cc',identity.pw_uid,identity.pw_gid)
env={**os.environ,'HOME':str(ROOT/'validation/home'),'TERM':'xterm-256color',
    'TMPDIR':str(ROOT/'validation/tmp'),'PYTHONPATH':str(SOURCE/'webserver')}
make=['make','-k','-j2','WEBTILES=y','NOWIZARD=y','STDFLAG=-std=c++17','NO_OPTIMIZE=y']
steps=[('build',make+['crawl','catch2-tests-executable']),
    ('new-species',['./catch2-tests-executable','[new-species]','--reporter','console']),
    ('adjacent',['./catch2-tests-executable','[vellum],[pakellas],[vorr],[bloodcraft],[shell],[party-session],[party-trade],[save-compatibility]','--reporter','console'])]
os.nice(10)
for name,command in steps:
    start=time.monotonic()
    with (OUT/(name+'.log')).open('w') as log:
        call=subprocess.run(command,cwd=SOURCE,env=env,stdout=log,stderr=subprocess.STDOUT,
            user=identity.pw_uid,group=identity.pw_gid,extra_groups=[],timeout=600)
    receipt={'step':name,'exit_code':call.returncode,'seconds':round(time.monotonic()-start,2)}
    save(OUT/(name+'.json'),receipt)
    print(json.dumps(receipt),flush=True)
    assert call.returncode==0,name
assert '-DWIZARD' not in (SOURCE/'.cflags').read_text()
for name,expected in after.items():
    assert sha(SOURCE/name)==expected,name
for name in ('tileweb.cc','crawl'):
    shutil.copy2(INSTALLED/name,OUT/(name+'.before'))
    pending=INSTALLED/(name+'.render-fix')
    shutil.copy2(SOURCE/name,pending)
    os.chmod(pending,0o755 if name=='crawl' else 0o644)
    os.chown(pending,0,0)
    pending.replace(INSTALLED/name)
for name,expected in after.items():
    assert sha(INSTALLED/name)==expected,name
user=pwd.getpwnam('dcss')
for name,command in [('creation',['python3',str(INPUT/'verify_creation.py'),str(INSTALLED/'crawl')]),
    ('installed-preview',['python3',str(RELEASE/'deploy/verify_preview_runtime.py'),str(INSTALLED)])]:
    with (OUT/(name+'.log')).open('w') as log:
        subprocess.run(command,cwd='/tmp',env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},
            stdout=log,stderr=subprocess.STDOUT,user=user.pw_uid,group=user.pw_gid,extra_groups=[],timeout=300,check=True)
compat=json.loads((ROOT/'save-compatibility.json').read_text())
for i,row in enumerate(compat['packages']):
    copy=ROOT/'saved-checkpoints'/(str(i).zfill(4)+'.cs')
    assert sha(copy)==row['sha256']
    call=subprocess.run([str(INSTALLED/'crawl'),'-save-json',str(copy)],cwd=ROOT/'save-audit-scratch',
        env={**os.environ,'CRAWL_DIR':str(INSTALLED),'CRAWL_SAVE_DIR':str(ROOT/'save-audit-scratch'),'CRAWL_RC':'/dev/null'},
        capture_output=True,text=True,timeout=30)
    row['candidate']={'exit_code':call.returncode}
    if call.returncode==0: row['candidate']['metadata']=json.loads(call.stdout)
    if row['baseline']['exit_code']==0:
        assert call.returncode==0 and row['candidate']['metadata']==row['baseline']['metadata'],row
    assert sha(copy)==row['sha256']
save(ROOT/'save-compatibility.json',compat)
(ROOT/'release-input').rename(OUT/'before-release-input')
(ROOT/'release-input').mkdir()
for name in ('overlay.tar.gz','overlay-manifest.json','stage-plan.json'):
    shutil.copy2(INPUT/name,ROOT/'release-input'/name)
receipt={'passed':True,'native_sha256':sha(INSTALLED/'crawl'),
    'overlay_sha256':control['overlay_archive_sha256'],'only_source_change':'tileweb.cc',
    'reason':'Co-op active-view sprites use the existing per-hero equipment doll builder instead of the shared leader base.',
    'checkpoint_packages':len(compat['packages']),'production_mutated':False,'completed_at':time.time()}
save(OUT/'result.json',receipt)
prepared.update(native_sha256=receipt['native_sha256'],overlay_sha256=receipt['overlay_sha256'],render_fix=receipt,prepared_at=time.time())
save(ROOT/'prepared.json',prepared)
progress.update(native_sha256=receipt['native_sha256'],plan=control,render_fix=receipt)
save(ROOT/'validation/progress.json',progress)
print(json.dumps(receipt),flush=True)
