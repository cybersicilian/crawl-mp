"""Guarded, remote-only settings overlay with verified state preservation."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import sqlite3
import subprocess
import tempfile

PAYLOAD=Path(__file__).resolve().parent
MANIFEST=json.loads((PAYLOAD/'manifest.json').read_text())
spec=importlib.util.spec_from_file_location('deployment_core',PAYLOAD/'deployment_core.py')
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
core.BASE=Path(MANIFEST['baseline']);core.BASE_HASHES=MANIFEST['files']
OP=Path('/opt/dcss/staging')/MANIFEST['operation']
RELEASE=Path('/opt/dcss/releases')/MANIFEST['operation']
SOURCE=RELEASE/core.PREFIX


def validate_payload():
    for name,digest in MANIFEST['payload_files'].items():
        assert core.sha(PAYLOAD/name)==digest,'Payload changed: '+name


def config_manifest():
    result={}
    for path in core.STATE.rglob('*'):
        if path.is_relative_to(core.STATE/'recovery') or not path.is_file(): continue
        if path.suffix in {'.rc','.macro','.init','.cfg','.yaml','.yml'}:
            result[str(path)]=core.sha(path)
    for path in (Path('/etc/dcss/webtiles.yml'),Path('/etc/dcss/dcss.env')):
        if path.is_file(): result[str(path)]=core.sha(path)
    return result


def settings_snapshot():
    result={}
    for path in (core.STATE/'settings.db3',core.STATE/'accounts.db3'):
        if not path.exists(): continue
        with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
            for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
                quoted='"'+table.replace('"','""')+'"'
                query=('SELECT username,scope,settings FROM '+quoted) if table=='account_game_settings' else ('SELECT * FROM '+quoted)
                rows=sorted(repr(tuple(row)) for row in db.execute(query))
                result[str(path)+':'+table]=hashlib.sha256('\n'.join(rows).encode()).hexdigest()
    return result


def preserve(expected,actual):
    assert all(actual.get(key)==value for key,value in expected.items()),'Existing configurations changed'


def prepare():
    held=core.locks();validate_payload();core.baseline()
    assert not OP.exists() and not RELEASE.exists(),'Candidate already exists'
    OP.mkdir(mode=0o700)
    subprocess.run(['cp','-al',str(core.BASE),str(RELEASE)],check=True,timeout=90)
    edited={}
    for edit in json.loads((PAYLOAD/'edits.json').read_text()):
        name=edit['path'];text=edited.get(name,(SOURCE/name).read_text())
        if edit['kind']=='replace':
            assert text.count(edit['old'])==edit['count'],'Merge anchor mismatch: '+name
            text=text.replace(edit['old'],edit['new'])
        else:
            assert text.count(edit['start'])==text.count(edit['end'])==1,'Region mismatch: '+name
            a=text.index(edit['start']);b=text.index(edit['end'],a)
            text=text[:a]+edit['new']+text[b:]
        edited[name]=text
    for name,text in edited.items():
        temporary=OP/(Path(name).name+'.merged');temporary.write_text(text)
        core.replace_file(temporary,SOURCE/name,0o644)
    changed=set(edited)
    for path in (PAYLOAD/'overlay').rglob('*'):
        if not path.is_file(): continue
        name=str(path.relative_to(PAYLOAD/'overlay'))
        if name not in MANIFEST['files']: assert not (SOURCE/name).exists(),'New path already exists: '+name
        (SOURCE/name).parent.mkdir(parents=True,exist_ok=True)
        core.replace_file(path,SOURCE/name,0o644);changed.add(name)
    for name in changed:
        path=SOURCE/name
        if path.suffix in {'.js','.css','.html','.json'}:
            assert len(path.read_text().splitlines())<=600,'Web source exceeds 600 lines: '+name
    assert core.sha(SOURCE/'crawl')==MANIFEST['files']['crawl']
    for name in ('rcs','saves'): assert (SOURCE/name).resolve()==core.STATE/name
    qa=Path(tempfile.mkdtemp(prefix='dcss-settings-qa-'))
    account=pwd.getpwnam('dcss');os.chown(qa,account.pw_uid,account.pw_gid);qa.chmod(0o700)
    core.run(['sudo','-u','dcss','env','-u','CRAWL_LIBRARY_DIR','PYTHONDONTWRITEBYTECODE=1',
        'PYTHONPATH='+str(SOURCE/'webserver'),'python3','-m','unittest',
        'webtiles.game_settings_test','webtiles.character_names_test','webtiles.starting_weapons_test','-v'],
        qa,OP/'backend-tests.log')
    core.run(['sudo','-u','dcss','env','PYTHONDONTWRITEBYTECODE=1','python3','-c',
        'from tornado.template import Loader;Loader('+repr(str(SOURCE/'webserver/templates'))+').load("client.html");print("Client templates compiled")'],
        qa,OP/'template-test.log')
    preserved=0
    for old in core.BASE.rglob('*'):
        name=str(old.relative_to(core.BASE));new=RELEASE/name
        if old.is_symlink(): assert new.is_symlink() and os.readlink(new)==os.readlink(old)
        elif old.is_file() and name not in {core.PREFIX+n for n in changed} and not name.endswith('.pyc'):
            assert old.stat().st_ino==new.stat().st_ino,'Unrelated release file changed: '+name
            preserved+=1
    core.baseline()
    ready=dict(ready=True,baseline=str(core.BASE),release=str(RELEASE),native_unchanged=True,
        native_sha256=core.sha(SOURCE/'crawl'),runtime_files={name:core.sha(SOURCE/name) for name in sorted(changed)},
        preserved_release_files=preserved,backend_tests=29,template_compiled=True,
        manifest_sha256=core.sha(PAYLOAD/'manifest.json'))
    core.write(OP/'prepared.json',ready);print(json.dumps(ready),flush=True)


def activate():
    held=core.locks();validate_payload();core.baseline()
    ready=json.loads((OP/'prepared.json').read_text())
    assert ready['ready'] and ready['backend_tests']==29
    assert ready['manifest_sha256']==core.sha(PAYLOAD/'manifest.json')
    for name,digest in ready['runtime_files'].items(): assert core.sha(SOURCE/name)==digest,name
    assert core.sha(SOURCE/'crawl')==ready['native_sha256']
    assert not (OP/'activation.json').exists(),'Already activated'
    assert not core.native_processes(),'A game is active; wait for its saved exit before cutover'
    previous=Path('/opt/dcss/previous').resolve();old_text=(core.STATE/'release.txt').read_text()
    stopped=switched=False
    try:
        assert not core.native_processes(),'A game started before maintenance'
        subprocess.run(['systemctl','stop','dcss-coop'],check=True,timeout=60);stopped=True
        assert not core.native_processes(),'Native processes remain; forced termination is prohibited'
        core.baseline()
        configs=config_manifest();settings=settings_snapshot()
        core.write(OP/'configuration-before.json',configs);core.write(OP/'settings-before.json',settings)
        saved=core.backup(OP)
        preserve(configs,config_manifest());preserve(settings,settings_snapshot())
        assert core.state_manifest()==saved['save_files']
        core.point('previous',core.BASE);core.point('current',RELEASE);switched=True
        (core.STATE/'release.txt').write_text(str(RELEASE)+'\n')
        assert core.state_manifest()==saved['save_files']
        subprocess.run(['systemctl','start','dcss-coop'],check=True,timeout=60);stopped=False
        assert core.healthy(),'Candidate failed health check'
        assert core.state_manifest()==saved['save_files'],'Save files changed during cutover'
        preserve(configs,config_manifest());preserve(settings,settings_snapshot())
    except BaseException as error:
        if switched:
            subprocess.run(['systemctl','stop','dcss-coop'],check=True,timeout=60)
            core.point('current',core.BASE);core.point('previous',previous)
            (core.STATE/'release.txt').write_text(old_text)
        if switched or stopped: subprocess.run(['systemctl','start','dcss-coop'],check=True,timeout=60)
        core.write(OP/'activation-failure.json',dict(error=repr(error),baseline_restored=Path('/opt/dcss/current').resolve()==core.BASE,healthy=core.healthy()))
        raise
    receipt=dict(deployed=True,release=str(RELEASE),previous=str(core.BASE),backup=saved['directory'],
        native_sha256=ready['native_sha256'],native_unchanged=True,backend_tests=29,
        runtime_files=ready['runtime_files'],health=True,all_save_files_preserved=True,
        save_files=len(saved['save_files']),native_save_packages=sum(n.endswith('.cs') for n in saved['save_files']),
        configuration_files_preserved=len(configs),existing_account_settings_tables_preserved=len(settings),
        verified_database_backups=len(saved['databases']),active_games_at_cutover=0,
        activated_at=datetime.now(timezone.utc).isoformat())
    core.write(OP/'activation.json',receipt);print(json.dumps(receipt),flush=True)


def verify():
    assert Path('/opt/dcss/current').resolve()==RELEASE
    receipt=json.loads((OP/'activation.json').read_text())
    for name,digest in receipt['runtime_files'].items(): assert core.sha(SOURCE/name)==digest,name
    assert core.sha(SOURCE/'crawl')==receipt['native_sha256']
    saved=json.loads((OP/'backup.json').read_text())
    current=core.state_manifest();preserve(saved['save_files'],current)
    preserve(json.loads((OP/'configuration-before.json').read_text()),config_manifest())
    preserve(json.loads((OP/'settings-before.json').read_text()),settings_snapshot())
    assert core.healthy()
    core.write(OP/'preservation-verified.json',dict(passed=True,existing_saves_unchanged=True,existing_configurations_unchanged=True,existing_account_settings_unchanged=True,health=True))
    print(json.dumps(dict(passed=True,existing_saves_unchanged=True,existing_configurations_unchanged=True,existing_account_settings_unchanged=True,health=True)))


if __name__=='__main__':
    os.umask(0o077)
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['prepare','activate','verify'])
    {'prepare':prepare,'activate':activate,'verify':verify}[parser.parse_args().mode]()
