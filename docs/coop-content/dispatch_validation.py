"""Wait without occupying the host, then reserve and run the bound phase."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

EVIDENCE = Path(__file__).resolve().parent
POLICY = Path('/Users/iancaltabiano/Documents/Codex/work/host-heavy/policy.json')


def main():
    request_path = EVIDENCE / 'phase-request.json'
    request_bytes = request_path.read_bytes()
    request = json.loads(request_bytes)
    request_id = hashlib.sha256(request_bytes).hexdigest()
    previous_owner = None
    while True:
        policy = json.loads(POLICY.read_text())
        gate = Path(policy['gateScript'])
        if hashlib.sha256(gate.read_bytes()).hexdigest() != policy['gateSha256']:
            raise RuntimeError('Shared gate hash changed')
        if policy.get('resourceHold', {}).get('active'):
            raise RuntimeError('Shared host capacity hold is active; no job launched')
        if request_path.read_bytes() != request_bytes:
            raise RuntimeError('Bound request changed while waiting')
        command = [sys.executable, str(gate), 'reserve', '--owner', request['owner'],
                   '--label', request['label'], '--request-id', request_id]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode == 0:
            reservation = json.loads(result.stdout)
            (EVIDENCE / 'reservation.json').write_text(result.stdout)
            print(result.stdout.strip(), flush=True)
            return subprocess.call([sys.executable, str(gate), 'run',
                '--owner', request['owner'], '--label', request['label'],
                '--reservation-id', reservation['runId'], '--request-id', request_id,
                '--cwd', str(EVIDENCE.parents[1]), '--', sys.executable,
                str(EVIDENCE / 'run_validation.py')])
        if result.returncode != 75:
            raise RuntimeError(result.stderr)
        state = json.loads((Path(policy['stateDirectory']) / 'state.json').read_text())
        owner = state.get('owner')
        if owner != previous_owner:
            print(json.dumps({'waitingForOwner': owner, 'label': state.get('label')}), flush=True)
            previous_owner = owner
        time.sleep(30)


if __name__ == '__main__':
    raise SystemExit(main())
