"""Close only this content release's finished supervised host reservation."""
import hashlib
import json
from pathlib import Path
import subprocess
import time

OWNER = 'codex/01a16a0f-b9dc-7e80-ad55-34720b26d695'
STATE = Path('/Users/iancaltabiano/Documents/Codex/work/host-heavy')
policy = json.loads((STATE / 'policy.json').read_text())
state = json.loads((STATE / 'state.json').read_text())
assert state['owner'] == OWNER and state['status'] in ('failed_held', 'completed_held')
assert state['supervisedProcessGroupGone'] is True
request_path = next(path for path in Path(__file__).parent.glob('*/request.json')
                    if hashlib.sha256(path.read_bytes()).hexdigest() == state['requestId'])
rows = subprocess.check_output(['ps', '-axo', 'pid=,pgid=,command='], text=True).splitlines()
owned = [row for row in rows if len(row.split(None, 2)) >= 2
         and row.split(None, 2)[1] == str(state['processGroup'])]
assert not owned, owned
closure = request_path.parent / 'closure.json'
closure.write_text(json.dumps({'reservationId': state['runId'], 'owner': OWNER,
    'allOwnedProcessesGone': True, 'phaseClosureEvidence': {
        'gateStatus': state['status'], 'processGroup': state['processGroup'],
        'gateProcessGroupGone': True, 'freshHostGroupMembers': owned, 'checkedAt': time.time()}}, indent=2) + '\n')
gate = Path(policy['gateScript'])
assert hashlib.sha256(gate.read_bytes()).hexdigest() == policy['gateSha256']
subprocess.run(['python3', str(gate), '--state-dir', str(STATE), 'release', '--owner', OWNER,
                '--reservation-id', state['runId'], '--evidence', str(closure)], check=True)
