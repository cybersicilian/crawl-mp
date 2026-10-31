import json,subprocess
from pathlib import Path
out=Path(__file__).resolve().parent
steps=json.loads((out/'steps.json').read_text())
records=[]
for name in ['route','bottom']:
 if name=='bottom' and any(r['fullRoute'] for r in json.loads(Path(steps['route']['results']).read_text())):
  records.append({'component':name,'skipped':'Full ten-floor route reached Depths:1.'});break
 with (out/(name+'.log')).open('w') as log:
  r=subprocess.run(steps[name]['command'],cwd=steps[name]['cwd'],stdout=log,stderr=subprocess.STDOUT)
 records.append({'component':name,'exitCode':r.returncode})
 (out/'components.json').write_text(json.dumps(records,indent=2)+'\n')
 print(name,r.returncode,flush=True)
 assert r.returncode==0
(out/'components.json').write_text(json.dumps(records,indent=2)+'\n')
