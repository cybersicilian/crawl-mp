"""Dispatch one exact prepared content validation through the canonical gate."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OWNER = 'codex/01a16a0f-b9dc-7e80-ad55-34720b26d695'
STATE = Path('/Users/iancaltabiano/Documents/Codex/work/host-heavy')
request_file = HERE / ('native-attempt-' + str(int(sys.argv[1]))) / 'request.json'
request_id = hashlib.sha256(request_file.read_bytes()).hexdigest()
request = json.loads(request_file.read_text())
policy = json.loads((STATE / 'policy.json').read_text())
gate = Path(policy['gateScript'])
assert hashlib.sha256(gate.read_bytes()).hexdigest() == policy['gateSha256']
assert not policy.get('resourceHold', {}).get('active')
assert request['owner'] == OWNER and request['stateDirectory'] == str(STATE)
assert request['runnerSha256'] == hashlib.sha256((HERE / 'validate.py').read_bytes()).hexdigest()
base = ['python3', str(gate), '--state-dir', str(STATE)]
reservation = subprocess.run(base + ['reserve', '--owner', OWNER,
    '--label', 'DCSS both species and god validation', '--request-id', request_id],
    text=True, capture_output=True)
print(reservation.stdout, end='', flush=True)
if reservation.returncode:
    print(reservation.stderr, file=sys.stderr)
    raise SystemExit(reservation.returncode)
run_id = json.loads(reservation.stdout)['runId']
raise SystemExit(subprocess.call(base + ['run', '--owner', OWNER,
    '--label', 'DCSS content native validation attempt ' + sys.argv[1],
    '--reservation-id', run_id, '--request-id', request_id, '--cwd', str(ROOT),
    '--', 'python3', str(HERE / 'validate.py'), 'run']))
