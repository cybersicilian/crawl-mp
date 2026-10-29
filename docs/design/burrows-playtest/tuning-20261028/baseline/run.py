from pathlib import Path
import subprocess,json
out=Path(__file__).resolve().parent
base=out.parents[1]
src=Path('/private/tmp/dcss-burrows-playtest-20261027')
clone=Path('/private/tmp/dcss-burrows-encounters-20261028')
assert not clone.exists()
subprocess.run(['/bin/cp','-cR',str(src),str(clone)],check=True)
for name,start in [('route','Bur:1'),('snake','Snake:1')]:
 command=['/usr/local/bin/python3',str(base/'run_routes.py'),str(src),str(out/name),'--seeds','2026102701','--xl','16','--skill-boost','2','--gods','--start',start,'--limit','2000','--timeout','180']
 with (out/(name+'.log')).open('w') as log:
  r=subprocess.run(command,cwd=src,stdout=log,stderr=subprocess.STDOUT)
 print(name,r.returncode,flush=True)
 assert r.returncode==0
