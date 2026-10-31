import json,subprocess
from pathlib import Path
out=Path(__file__).resolve().parent
q=json.loads((out/'request.json').read_text())
with (out/'contracts.log').open('w') as log:
 r=subprocess.run([q['cwd']+'/catch2-tests-executable','[burrows],select_exactly_one_of_each_lair_group,create_brentry_validity','--reporter','console'],cwd=q['cwd'],stdout=log,stderr=subprocess.STDOUT)
assert r.returncode==0
with (out/'games.log').open('w') as log:
 r=subprocess.run(q['command'],cwd=q['cwd'],stdout=log,stderr=subprocess.STDOUT)
raise SystemExit(r.returncode)
