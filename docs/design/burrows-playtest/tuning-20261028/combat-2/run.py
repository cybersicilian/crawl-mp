from pathlib import Path
import subprocess,json
out=Path(__file__).resolve().parent
base=out.parents[1]
components=[]
for name,src,builds,seeds,start,xl,boost in [
 ('baseline-fighter','/private/tmp/dcss-burrows-playtest-20261027','melee','2026102701','Bur:1','16','2'),
 ('candidate','/private/tmp/dcss-burrows-encounters-20261028','melee,ranged,caster','2026102701,2026102702','Bur:1','16','2'),
 ('bottom','/private/tmp/dcss-burrows-encounters-20261028','melee,ranged,caster','2026102701','Worm:4','20','4')]:
 command=['/usr/local/bin/python3',str(base/'run_routes.py'),src,str(out/name),'--builds',builds,'--seeds',seeds,'--xl',xl,'--skill-boost',boost,'--gods','--start',start,'--limit','30000','--timeout','300']
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(command,cwd=src,stdout=log,stderr=subprocess.STDOUT)
 components.append(dict(name=name,exitCode=r.returncode));(out/'components.json').write_text(json.dumps(components,indent=2)+'\n')
 print(name,r.returncode,flush=True)
assert all(r['exitCode']==0 for r in components)
