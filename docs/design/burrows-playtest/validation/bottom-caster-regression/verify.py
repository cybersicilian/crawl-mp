import subprocess,json
from pathlib import Path
out=Path(__file__).resolve().parent
base=out.parents[1]
command=['/usr/local/bin/python3',str(base/'run_routes.py'),'/private/tmp/dcss-burrows-playtest-20261027',str(out/'games'),'--builds','caster','--seeds','2026102701','--xl','20','--skill-boost','4','--gods','--start','Worm:4','--timeout','180']
r=subprocess.run(command,cwd='/private/tmp/dcss-burrows-playtest-20261027')
assert r.returncode==0
r=json.loads((out/'games/results.json').read_text())[0]
assert r['startVerified'] and r['audits'][-1]['tag'] in ['complete','death']
