from pathlib import Path
import subprocess
out=Path(__file__).resolve().parent
base=out.parents[1]
src='/private/tmp/dcss-burrows-playtest-20261027'
for name,start,builds in [('snake','Snake:1','melee,ranged,caster'),('caster','Bur:1','caster')]:
 command=['/usr/local/bin/python3',str(base/'run_routes.py'),src,str(out/name),'--builds',builds,'--seeds','2026102701','--xl','16','--skill-boost','2','--gods','--start',start,'--limit','2000','--timeout','180']
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(command,cwd=src,stdout=log,stderr=subprocess.STDOUT)
 print(name,r.returncode,flush=True)
 assert r.returncode==0
