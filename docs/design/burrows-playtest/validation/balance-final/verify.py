"""Final sequential economy, rendering and native gameplay checks."""
import json
from pathlib import Path
import subprocess

OUT=Path(__file__).resolve().parent
steps=json.loads((OUT/'steps.json').read_text())
records=[]


def run(name):
    step=steps[name]
    with (OUT/(name+'.log')).open('w') as log:
        result=subprocess.run(step['command'],cwd=step['cwd'],stdout=log,stderr=subprocess.STDOUT)
    records.append(dict(component=name,exitCode=result.returncode))
    (OUT/'components.json').write_text(json.dumps(records,indent=2)+'\n')
    print(name,'exit',result.returncode,flush=True)
    assert result.returncode==0,name


for component in ['contracts','economy','comparison','previews','route']:
    run(component)
results=json.loads(Path(steps['route']['results']).read_text())
if not any(r['fullRoute'] for r in results):
    run('bottom')
else:
    records.append(dict(component='bottom',skipped='A complete ten-floor route already reached Depths:1.'))
(OUT/'components.json').write_text(json.dumps(records,indent=2)+'\n')
