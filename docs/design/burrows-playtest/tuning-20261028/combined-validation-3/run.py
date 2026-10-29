from pathlib import Path
import subprocess,json,hashlib
out=Path(__file__).resolve().parent
base=out.parents[1]
dest=Path('/Users/iancaltabiano/.codex/visualizations/2026/10/23/01a16ade-77cb-7c81-b7a3-ddfd402494d7/burrows-port-validation-2')
with (out/'survey.log').open('w') as log:
 subprocess.run(['/usr/local/bin/python3',str(base/'run_routes.py'),str(dest),str(out/'survey'),'--survey','--builds','melee','--seeds','2026102701','--timeout','240'],cwd=dest,stdout=log,stderr=subprocess.STDOUT,check=True)
a=json.loads((out.parent/'verify-2/survey/melee-2026102701/economy.json').read_text());b=json.loads((out/'survey/melee-2026102701/economy.json').read_text());assert a==b,'Port default rules changed native floor economy'
(out/'compatibility.json').write_text(json.dumps(dict(exactEconomyMatchFloors=len(b),nativeSha256=hashlib.sha256((dest/'crawl').read_bytes()).hexdigest(),source=str(dest)),indent=2)+'\n')
command=['/usr/bin/env','PATH=/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/usr/bin:/bin','/usr/local/bin/python3',str(base/'render_preview.py'),str(dest),str(out.parent/'previews'),str(out/'survey/melee-2026102701/result.json')]
with (out/'render.log').open('w') as log:subprocess.run(command,cwd=dest,stdout=log,stderr=subprocess.STDOUT,check=True)
