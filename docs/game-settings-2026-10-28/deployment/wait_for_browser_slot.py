"""Wait briefly for an ordinary reservation; never change another owner's state."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

request=sys.argv[1]
label=sys.argv[2] if len(sys.argv)>2 else 'DCSS settings phone layout diagnostic'
policy=Path('/Users/iancaltabiano/Documents/Codex/work/host-heavy/policy.json')
last=None
for attempt in range(10):
    data=json.loads(policy.read_text());gate=Path(data['gateScript'])
    assert data['stateDirectory']=='/Users/iancaltabiano/Documents/Codex/work/host-heavy'
    assert hashlib.sha256(gate.read_bytes()).hexdigest()==data['gateSha256']
    if data.get('resourceHold',{}).get('active'): raise SystemExit('Host resource hold is active')
    last=subprocess.run(['python3',str(gate),'reserve','--owner','codex/01a1838c-0238-7422-9b21-9f9dc9392c41',
        '--label',label,'--request-id',request],capture_output=True,text=True)
    if last.returncode==0:
        print(last.stdout,flush=True);raise SystemExit(0)
    if last.returncode!=75:
        print(last.stderr,flush=True);raise SystemExit(last.returncode)
    if attempt<9: time.sleep(4)
print(last.stderr,flush=True)
raise SystemExit(last.returncode)
