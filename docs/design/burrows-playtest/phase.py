"""Execute an exact bound phase through the shared gate, then close its lease."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

OWNER='codex/01a16ade-77cb-7c81-b7a3-ddfd402494d7'
STATE=Path('/Users/iancaltabiano/Documents/Codex/work/host-heavy')
request_path=Path(sys.argv[1]).resolve()
request=json.loads(request_path.read_text())
digest=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
policy=json.loads((STATE/'policy.json').read_text())
assert not policy.get('resourceHold',{}).get('active')
assert not any(q.get('currentlyBookable') for q in policy.get('queue',[]))
assert digest(policy['gateScript'])==policy['gateSha256']==request['gateSha256']
for path,expected in request['inputs'].items():
    assert digest(path)==expected,'Input changed: '+path
gate=['/usr/local/bin/python3',policy['gateScript'],'--state-dir',str(STATE)]
identity=['--owner',OWNER,'--label',request['label'],'--request-id',digest(request_path)]
reserved=subprocess.run(gate+['reserve']+identity,capture_output=True,text=True)
print(reserved.stdout,reserved.stderr,flush=True)
if reserved.returncode:raise SystemExit(reserved.returncode)
reservation=json.loads(reserved.stdout)
(request_path.parent/'reservation.json').write_text(json.dumps(reservation,indent=2)+'\n')
command=gate+['run']+identity+['--reservation-id',reservation['runId'],
    '--cwd',request['cwd'],'--wait','--']+request['command']
run=subprocess.run(command)
record=json.loads((STATE/'state.json').read_text())
assert record['owner']==OWNER and record['runId']==reservation['runId']
assert record['status'] in ['completed_held','failed_held']
assert record['supervisedProcessGroupGone']
closure=dict(reservationId=reservation['runId'],owner=OWNER,allOwnedProcessesGone=True,
    phaseClosureEvidence=dict(gate=record,requestSha256=digest(request_path)))
path=request_path.parent/'closure.json';path.write_text(json.dumps(closure,indent=2)+'\n')
release=subprocess.run(gate+['release','--owner',OWNER,'--reservation-id',reservation['runId'],
    '--evidence',str(path)])
assert release.returncode==0
raise SystemExit(run.returncode)
