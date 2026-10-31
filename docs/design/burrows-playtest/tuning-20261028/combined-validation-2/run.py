from pathlib import Path
import subprocess,shutil,json,hashlib
out=Path(__file__).resolve().parent
base=out.parents[1]
src=Path('/Users/iancaltabiano/.codex/visualizations/2026/10/28/01a182a9-4f73-7ba2-b45a-20b0022a438a/step1-validation/source')
dest=Path('/Users/iancaltabiano/.codex/visualizations/2026/10/23/01a16ade-77cb-7c81-b7a3-ddfd402494d7/burrows-port-validation-2')
assert not dest.exists()
subprocess.run(['/bin/cp','-cR',str(src),str(dest)],check=True)
shutil.copy2(base.parents[2]/'crawl-ref/source/Makefile.obj',dest/'Makefile.obj')
for a,b in [(base/'audit.lua','route_audit.lua'),(base/'economy.lua','route_economy.lua'),(base.parent/'burrows-generation/export.lua','burrows_preview.lua')]:shutil.copy2(a,dest/'dat/dlua'/b)
with (out/'build.log').open('w') as log:
 subprocess.run(['make','-j2','-o','.contrib-libs','-o','Makefile.obj','STDFLAG=-std=c++17','PYTHON=/Users/iancaltabiano/Documents/Projects/dcss/.venv/bin/python3','catch2-tests-executable'],cwd=dest,stdout=log,stderr=subprocess.STDOUT,check=True)
assert (src/'crawl').read_bytes()==(dest/'crawl').read_bytes(),'Native runtime changed in test-only build'
with (out/'contracts.log').open('w') as log:
 subprocess.run([str(dest/'catch2-tests-executable'),'[burrows],[character-trait],[game-modifiers],select_exactly_one_of_each_lair_group,create_brentry_validity'],cwd=dest,stdout=log,stderr=subprocess.STDOUT,check=True)
with (out/'survey.log').open('w') as log:
 subprocess.run(['/usr/local/bin/python3',str(base/'run_routes.py'),str(dest),str(out/'survey'),'--survey','--builds','melee','--seeds','2026102701','--timeout','240'],cwd=dest,stdout=log,stderr=subprocess.STDOUT,check=True)
a=json.loads((out.parent/'verify-2/survey/melee-2026102701/economy.json').read_text());b=json.loads((out/'survey/melee-2026102701/economy.json').read_text());assert a==b,'Port default rules changed native floor economy'
(out/'compatibility.json').write_text(json.dumps(dict(exactEconomyMatchFloors=len(b),nativeSha256=hashlib.sha256((dest/'crawl').read_bytes()).hexdigest(),source=str(dest)),indent=2)+'\n')
command=['/usr/bin/env','PATH=/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/usr/bin:/bin','/usr/local/bin/python3',str(base/'render_preview.py'),str(dest),str(out.parent/'previews'),str(out/'survey/melee-2026102701/result.json')]
with (out/'render.log').open('w') as log:subprocess.run(command,cwd=dest,stdout=log,stderr=subprocess.STDOUT,check=True)
