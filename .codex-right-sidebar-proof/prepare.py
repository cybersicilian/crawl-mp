import hashlib
import json
from pathlib import Path
import shutil
import sys

proof = Path(__file__).resolve().parent
web = proof.parent / 'crawl-ref/source/webserver'
version = sys.argv[1]
source = proof / ('source-' + version)
files = list((web / 'game_data/static').glob('*.js'))
files += list((web / 'game_data/static/styles').glob('*.css'))
files += list((web / 'static/tabletop').glob('*.css'))
files += list((web / 'static/ui-sprites').glob('*.png'))
files += [web / 'game_data/templates/character-sheet.html', web / 'game_data/static/style.css']
files += [web / 'static/scripts' / name for name in [
    'item-properties.js', 'character-stat-help.js', 'spell-cost.js', 'contrib/jquery.js']]
files += [web / 'tests/party-sidebar.cjs', web / 'tests/helpers/ui-sprite-fixture.cjs']
for file in files:
    target = source / file.relative_to(web)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(file, target)
request = {
    'owner': 'codex/01a15713-daf3-7ae2-b41b-7446c716a1ee',
    'phase': 'right-side-player-info-browser-' + version,
    'sourceRoot': str(source),
    'files': {str(file.relative_to(web)): hashlib.sha256(file.read_bytes()).hexdigest() for file in files},
    'resources': {'browserProcesses': 1, 'parallelTests': 1, 'nativeBuild': False, 'timeoutSeconds': 120},
    'gateSha256': 'f02acd58827cc227882521177b4dd95218db3e554604175395f274af36b928ca',
    'runnerSha256': hashlib.sha256((proof / 'run.py').read_bytes()).hexdigest(),
}
payload = json.dumps(request, sort_keys=True, indent=2) + '\n'
(proof / ('request-' + version + '.json')).write_text(payload)
print(hashlib.sha256(payload.encode()).hexdigest())
