from pathlib import Path
import subprocess
out=Path(__file__).resolve().parent
base=out.parents[1]
src='/private/tmp/dcss-burrows-playtest-20261027'
for name,start,builds,seed,limit in [('caster','Bur:1','caster','2026102701','2000'),('melee-route','Bur:1','melee','2026102701','30000'),('snake-seed2','Snake:1','melee,ranged,caster','2026102702','2000')]:
 command=['/usr/local/bin/python3',str(base/'run_routes.py'),src,str(out/name),'--builds',builds,'--seeds',seed,'--xl','16','--skill-boost','2','--gods','--start',start,'--limit',limit,'--timeout','300']
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(command,cwd=src,stdout=log,stderr=subprocess.STDOUT)
 print(name,r.returncode,flush=True)
 assert r.returncode==0
