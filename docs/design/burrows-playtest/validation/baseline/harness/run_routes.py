"""Run bounded, isolated native games; retain raw telemetry and actual deaths."""
import argparse
import hashlib
import json
import os
import re
import pty
import select
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
    parser=argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--builds', default='melee,ranged,caster')
    parser.add_argument('--seeds', default='2026102701,2026102702,2026102703')
    parser.add_argument('--limit', type=int, default=30000)
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('--survey', action='store_true')
    args=parser.parse_args()
    base=Path(__file__).resolve().parent
    source,output=args.source.resolve(),args.output.resolve()
    output.mkdir(parents=True,exist_ok=True)
    builds=json.loads((base/'builds.json').read_text())
    results=[]
    for kind in args.builds.split(','):
        for seed in args.seeds.split(','):
            folder=output/(kind+'-'+seed);folder.mkdir(exist_ok=False)
            config=builds[kind]
            settings=dict(name='Route_'+kind,species=config['species'],background=config['background'],
                weapon=config['weapon'],restart_after_game='false',show_more='false',
                autofight_stop=0,pregen_dungeon='false',prompt_menu='false',
                save_dir=str(folder/'saves')+'/',morgue_dir=str(folder)+'/',
                travel_delay=-1,explore_delay=-1,rest_delay=-1,
                view_delay=0,use_animations='',
                easy_confirm='all',default_manual_training='true',
                tile_skip_title='true',dump_on_save='true')
            rc='\n'.join(f'{k} = {v}' for k,v in settings.items())+'\n'
            rc+='Lua{\nROUTE_SURVEY='+('true' if args.survey else 'false')+'\nROUTE_KIND='+lua(kind)+'\nROUTE_BUILD='+lua(config)+'\nROUTE_LIMIT='+str(args.limit)+'\n'
            rc+=(base/'player.lua').read_text()+'\n}\n'
            (folder/'game.rc').write_text(rc)
            command=[str(source/'crawl'),'-no-save','-wizard','-no-throttle',
                     '-seed',seed,'-name','Route_'+kind,'-species',config['species'],
                     '-background',config['background'],'-rc',str(folder/'game.rc')]
            print('START',kind,seed,flush=True)
            timed_out=False
            master,slave=pty.openpty()
            fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',50,160,0,0))
            with (folder/'native.log').open('w') as log:
                p=subprocess.Popen(command,cwd=source,stdin=slave,stdout=slave,stderr=slave,
                                   env={**os.environ,'TERM':'xterm-256color'})
                os.close(slave)
                until=time.monotonic()+args.timeout
                finishing=False
                finish_key_time=0
                while p.poll() is None:
                    if time.monotonic()>until:
                        p.kill();p.wait();timed_out=True;break
                    if select.select([master],[],[],0.1)[0]:
                        try: data=os.read(master,131072)
                        except OSError: break
                        if not data:break
                        log.write(data.decode(errors='replace'));log.flush()
                        finishing=finishing or any(token in data for token in [b'morgue file',
                            b'Best Crawlers',b'You die...',b'ROUTE_EVENT survey-complete',
                            b'ROUTE_EVENT turn-limit',b'ROUTE_EVENT complete',b'ROUTE_EVENT combat-stalled'])
                    if finishing and time.monotonic()-finish_key_time>0.5:
                        os.write(master,b'\r \x1b')
                        finish_key_time=time.monotonic()
                code=124 if timed_out else p.wait()
                os.close(master)
            log=(folder/'native.log').read_text(errors='replace')
            log=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b\([A-Z]','',log)
            (folder/'terminal.txt').write_text(log)
            audits=[]
            for line in log.splitlines():
                if 'ROUTE_AUDIT ' in line:
                    audits.append(json.JSONDecoder().raw_decode(line.split('ROUTE_AUDIT ',1)[1])[0])
            events=[line.split('ROUTE_EVENT ',1)[1] for line in log.splitlines() if 'ROUTE_EVENT ' in line]
            result=dict(build=kind,seed=seed,exitCode=code,timedOut=timed_out,
                completed=any(a['tag']=='complete' for a in audits),
                death=any(a['tag']=='death' for a in audits),audits=audits,events=events,
                nativeSha256=hashlib.sha256((source/'crawl').read_bytes()).hexdigest())
            if args.survey and (source/'route-economy.json').exists():
                (folder/'economy.json').write_bytes((source/'route-economy.json').read_bytes())
                result['surveyFloors']=len(json.loads((folder/'economy.json').read_text()))
            (folder/'result.json').write_text(json.dumps(result,indent=2)+'\n')
            results.append(result)
            print('END',kind,seed,'complete',result['completed'],'death',result['death'],
                  'audits',len(audits),'exit',code,flush=True)
    (output/'results.json').write_text(json.dumps(results,indent=2)+'\n')
    if any(r['timedOut'] or (not r['audits'] and not r.get('surveyFloors')) for r in results):
        raise SystemExit(1)


if __name__=='__main__':
    main()
