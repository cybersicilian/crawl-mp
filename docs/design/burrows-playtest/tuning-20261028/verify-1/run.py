from pathlib import Path
import subprocess,json
out=Path(__file__).resolve().parent
base=out.parents[1]
src=Path('/private/tmp/dcss-burrows-encounters-20261028')
with (out/'contracts.log').open('w') as log:
 r=subprocess.run([str(src/'catch2-tests-executable'),'[burrows],select_exactly_one_of_each_lair_group,create_brentry_validity'],cwd=src,stdout=log,stderr=subprocess.STDOUT)
assert r.returncode==0
with (out/'survey.log').open('w') as log:
 r=subprocess.run(['/usr/local/bin/python3',str(base/'run_routes.py'),str(src),str(out/'survey'),'--survey','--builds','melee','--seeds','2026102701','--timeout','240'],cwd=src,stdout=log,stderr=subprocess.STDOUT)
assert r.returncode==0
before=base/'validation/economy-after-3/games/melee-2026102701/economy.json'
after=out/'survey/melee-2026102701/economy.json'
subprocess.run(['/usr/local/bin/python3',str(base/'analyse_economy.py'),str(before),str(after),str(out/'results')],check=True)
rows=json.loads((out/'results/economy-comparison.json').read_text())
assert all(r['within25Percent'] for r in rows),'XP parity outside declared band'
