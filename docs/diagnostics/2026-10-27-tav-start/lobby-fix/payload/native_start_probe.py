"""Check real native starting inventories without accounts, a dungeon, or saves."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--before', action='store_true')
args = parser.parse_args()
source = args.source.resolve()
rows = []
new_count = 0 if args.before else 2
cases = [
    ('Rogue Human Tav', ['Rogue'], '1,Tav:Human/Fighter/unarmed/12345', [new_count]),
    ('Case insensitive', ['rOgUe'], '1,tAv:Human/Fighter/unarmed/12345', [new_count]),
    ('Different account', ['Other'], '1,Tav:Human/Fighter/unarmed/12345', [0]),
    ('Unsigned local hero', [''], '1,Tav:Human/Fighter/unarmed/12345', [0]),
    ('Different name', ['Rogue'], '1,Tavern:Human/Fighter/unarmed/12345', [0]),
    ('Existing Oozle grant', ['Rogue'], '1,Jelly:Oozle/Fighter/unarmed/12345', [2]),
    ('Oozle Tav gets two total', ['Rogue'], '1,Tav:Oozle/Fighter/unarmed/12345', [2]),
    ('Rogue guest', ['Host', 'Rogue'],
     '2,Leader:Human/Fighter/unarmed/12345,Tav:Human/Fighter/unarmed/12346', [0, new_count]),
    ('Other guest of Rogue', ['Rogue', 'Other'],
     '2,Leader:Human/Fighter/unarmed/12345,Tav:Human/Fighter/unarmed/12346', [0, 0]),
    ('Companion of Rogue', ['Rogue', ''],
     '2,Leader:Human/Fighter/unarmed/12345,Tav:Human/Fighter/unarmed/12346', [0, 0]),
]
for label, accounts, spec, expected in cases:
    with tempfile.TemporaryDirectory(prefix='tav-native-preview-') as scratch:
        env = dict(os.environ, LC_ALL='C.UTF-8')
        for slot in range(4):
            env['CRAWL_ACCOUNT_' + str(slot)] = accounts[slot] if slot < len(accounts) else ''
        result = subprocess.run([str(source / 'crawl'), '-dir', str(source), '-rc', '/dev/null',
                                 '-extra-opt-last', 'save_dir=' + scratch,
                                 '-character-preview-json', spec], cwd=scratch, env=env,
                                text=True, capture_output=True, timeout=30)
        assert result.returncode == 0, (label, result.stderr)
        members = json.loads(result.stdout)['members']
        counts = []
        for member in members:
            scrolls = [item['name'] for item in member['inventory'] if 'acquirement' in item['name']]
            count = 0
            for name in scrolls:
                match = re.fullmatch(r'(\d+) scrolls? of acquirement', name)
                assert match, (label, name)
                count += int(match[1])
            counts.append(count)
        assert counts == expected, (label, counts, expected)
        assert not list(Path(scratch).rglob('*.cs')), 'Preview unexpectedly wrote a native save'
        rows.append({'case': label, 'scroll_counts': counts})
report = {'passed': True, 'before_change': args.before, 'checks': rows,
          'existing_saves_used': False, 'native_processes_exited': True}
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
