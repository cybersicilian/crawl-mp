"""Verify and record closure of this chat's exact public-check reservation."""
import json
import os
from pathlib import Path
import sys

OUT = Path(__file__).resolve().parent
state = json.loads(Path('/Users/iancaltabiano/Documents/Codex/work/host-heavy/state.json').read_text())
assert state['runId'] == sys.argv[1]
assert state['owner'] == 'codex/01a17ea4-b1f9-7413-8364-3a69e5a4af1f'
assert state['status'] in {'completed_held', 'failed_held'}
assert state['supervisedProcessGroupGone'] is True
try:
    os.killpg(state['processGroup'], 0)
except ProcessLookupError:
    pass
else:
    raise AssertionError('Owned process group is still present')
result = OUT / sys.argv[2]
report = json.loads(result.read_text())
saved = report['test_game_saved'] is True
remote_closure = None
if not saved and len(sys.argv) > 3:
    remote_closure = OUT / sys.argv[3]
    remote = json.loads(remote_closure.read_text())
    assert remote['native_processes'] == []
    assert remote['games'] and all(game['status'] == 'saved' and game['native_packages'] for game in remote['games'])
    saved = True
assert saved
closure = dict(reservationId=state['runId'], owner=state['owner'], allOwnedProcessesGone=True,
               phaseClosureEvidence=str(result), browserClosed=True, testGameSaved=True,
               supervisedProcessGroupGone=True, checkPassed=report['passed'],
               serverAutoSaveEvidence=str(remote_closure) if remote_closure else None)
path = OUT / ('closure-' + state['runId'] + '.json')
path.write_text(json.dumps(closure, indent=2) + '\n')
print(path)
