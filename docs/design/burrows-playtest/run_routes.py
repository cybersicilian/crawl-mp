"""Run bounded, isolated native games; retain raw telemetry and actual deaths."""
import argparse
import copy
import hashlib
import json
import os
import re
import pty
import select
import signal
import struct
import fcntl
import termios
import time
from pathlib import Path
import subprocess


def lua(value):
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        return '{'+','.join(map(lua, value))+'}'
    if isinstance(value, dict):
        return '{'+','.join('['+lua(k)+']='+lua(v) for k,v in value.items())+'}'
    return str(value)


def main():
    active=None
    def close_owned_game(signum,frame):
        if active is not None and active.poll() is None:
            active.kill();active.wait()
        raise SystemExit(128+signum)
    signal.signal(signal.SIGINT,close_owned_game)
    signal.signal(signal.SIGTERM,close_owned_game)
    parser=argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--builds', default='melee,ranged,caster')
    parser.add_argument('--seeds', default='2026102701,2026102702,2026102703')
    parser.add_argument('--limit', type=int, default=30000)
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('--survey', action='store_true')
    parser.add_argument('--xl', type=int, default=14)
    parser.add_argument('--skill-boost', type=int, default=0)
    parser.add_argument('--gods', action='store_true')
    parser.add_argument('--start', choices=['Bur:1','Worm:1','Worm:4','Snake:1','Spider:1'], default='Bur:1')
    args=parser.parse_args()
    base=Path(__file__).resolve().parent
    source,output=args.source.resolve(),args.output.resolve()
    output.mkdir(parents=True,exist_ok=True)
    builds=json.loads((base/'builds.json').read_text())
    results=[]
    for kind in args.builds.split(','):
        for seed in args.seeds.split(','):
            folder=output/(kind+'-'+seed);folder.mkdir(exist_ok=False)
            config=copy.deepcopy(builds[kind])
            config['xl']=args.xl
            config['skills']={k:min(27,v+args.skill_boost) for k,v in config['skills'].items()}
            if args.gods:
                config['god']='Vehumet' if kind=='caster' else 'Okawaru'
                if kind!='caster':
                    config['skills']['Invocations']=8
                    config['train'].append('Invocations')
            settings=dict(name='Route_'+kind,species=config['species'],background=config['background'],
                weapon=config['weapon'],restart_after_game='false',show_more='false',
                autofight_stop=0,pregen_dungeon='false',prompt_menu='false',
                save_dir=str(folder/'saves')+'/',morgue_dir=str(folder)+'/',
                travel_delay=-1,explore_delay=-1,rest_delay=-1,
                view_delay=0,use_animations='',
                easy_confirm='all',default_manual_training='true',
                tile_skip_title='true',dump_on_save='true')
            rc='\n'.join(f'{k} = {v}' for k,v in settings.items())+'\n'
            rc+='Lua{\nROUTE_START='+lua(args.start)+'\nROUTE_START_KEYS='+lua('&1' if args.start=='Bur:1' else {'Worm':'(','Snake':'P','Spider':'N'}[args.start.split(':')[0]]+args.start.split(':')[1])+'\nROUTE_SURVEY='+('true' if args.survey else 'false')+'\nROUTE_KIND='+lua(kind)+'\nROUTE_BUILD='+lua(config)+'\nROUTE_LIMIT='+str(args.limit)+'\n'
            rc+=(base/'tactics.lua').read_text()+'\n'+(base/'player.lua').read_text()+'\n}\n'
            (folder/'game.rc').write_text(rc)
            command=[str(source/'crawl'),'-no-save','-wizard','-no-throttle',
                     '-seed',seed,'-name','Route_'+kind,'-species',config['species'],
                     '-background',config['background'],'-rc',str(folder/'game.rc')]
            print('START',kind,seed,flush=True)
            timed_out=False
            if args.survey and (source/'route-economy.json').exists():
                (folder/'previous-economy.json').write_bytes((source/'route-economy.json').read_bytes())
                (source/'route-economy.json').unlink()
            master,slave=pty.openpty()
            fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',50,160,0,0))
            with (folder/'native.log').open('w') as log:
                p=subprocess.Popen(command,cwd=source,stdin=slave,stdout=slave,stderr=slave,
                                   env={**os.environ,'TERM':'xterm-256color'})
                active=p
                os.close(slave)
                until=time.monotonic()+args.timeout
                finishing=False
                recent=b''
                finish_key_time=0
                while p.poll() is None:
                    if time.monotonic()>until:
                        p.kill();p.wait();timed_out=True;break
                    if select.select([master],[],[],0.1)[0]:
                        try: data=os.read(master,131072)
                        except OSError: break
                        if not data:break
                        log.write(data.decode(errors='replace'));log.flush()
                        if b'Lua error:' in data or b'Infinite lua loop detected' in data:
                            p.kill();p.wait();break
                        recent=(recent+data)[-4096:]
                        finishing=finishing or any(token in recent for token in [b'ROUTE_EVENT death ',b'morgue file',
                            b'Best Crawlers',b'You die...',b'ROUTE_EVENT survey-complete',
                            b'ROUTE_EVENT turn-limit',b'ROUTE_EVENT complete',b'ROUTE_EVENT combat-stalled'])
                    if finishing and time.monotonic()-finish_key_time>0.5:
                        os.write(master,b'\r \x1b')
                        finish_key_time=time.monotonic()
                code=124 if timed_out else p.wait()
                os.close(master)
                active=None
            log=(folder/'native.log').read_text(errors='replace')
            log=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b\([A-Z]','',log)
            (folder/'terminal.txt').write_text(log)
            audits=[]
            for line in log.splitlines():
                if 'ROUTE_AUDIT ' in line:
                    audits.append(json.JSONDecoder().raw_decode(line.split('ROUTE_AUDIT ',1)[1])[0])
            events=[line.split('ROUTE_EVENT ',1)[1] for line in log.splitlines() if 'ROUTE_EVENT ' in line]
            result=dict(build=kind,seed=seed,start=args.start,exitCode=code,timedOut=timed_out,
                completed=any(a['tag']=='complete' for a in audits),
                death=any(a['tag']=='death' for a in audits),audits=audits,events=events,
                nativeSha256=hashlib.sha256((source/'crawl').read_bytes()).hexdigest())
            result['startVerified']=bool(audits and audits[0]['where']==args.start)
            result['routeFloorsExplored']=sorted({a['where'] for a in audits if a['tag']=='explored'})
            result['scenarioCompleted']=result['completed']
            result['fullRoute']=args.start=='Bur:1' and result['completed'] and len(result['routeFloorsExplored'])==10
            if args.survey and (source/'route-economy.json').exists():
                (folder/'economy.json').write_bytes((source/'route-economy.json').read_bytes())
                result['surveyFloors']=len(json.loads((folder/'economy.json').read_text()))
            (folder/'result.json').write_text(json.dumps(result,indent=2)+'\n')
            results.append(result)
            print('END',kind,seed,'complete',result['completed'],'death',result['death'],
                  'audits',len(audits),'exit',code,flush=True)
    (output/'results.json').write_text(json.dumps(results,indent=2)+'\n')
    if any(r['exitCode']!=0 or r['timedOut']
           or (r.get('surveyFloors')!=300 if args.survey else (not r['startVerified'] or r['audits'][-1]['tag'] not in ['death','complete','turn-limit']))
           for r in results):
        raise SystemExit(1)


if __name__=='__main__':
    main()
