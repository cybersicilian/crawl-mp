"""One sequential, bound native verification phase; keep component evidence."""
import json
from pathlib import Path
import subprocess

BASE=Path(__file__).resolve().parent
OUT=BASE/'validation/final-verification'
records=[]


def run(name):
    spec=json.loads((BASE/'validation'/name/'request.json').read_text())
    with (OUT/(name+'.log')).open('w') as log:
        result=subprocess.run(spec['command'],cwd=spec['cwd'],stdout=log,stderr=subprocess.STDOUT)
    records.append(dict(component=name,exitCode=result.returncode))
    print(name,'exit',result.returncode,flush=True)


run('render-final-2')
run('melee-crash-regression')
results=BASE/'validation/melee-crash-regression/games/results.json'
cleared=results.exists() and any(r.get('fullRoute') for r in json.loads(results.read_text()))
if not cleared:
    run('late-wormlands')
else:
    records.append(dict(component='late-wormlands',skipped='Full route including Hive already cleared in regression replay.'))
(OUT/'components.json').write_text(json.dumps(records,indent=2)+'\n')
raise SystemExit(any(r.get('exitCode',0)!=0 for r in records))
