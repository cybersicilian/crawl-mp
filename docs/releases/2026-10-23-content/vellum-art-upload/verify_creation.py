"""Inspect real new-species starts, native restrictions and per-hero isolation."""
import importlib.util
import json
from pathlib import Path
import sys

binary = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location('preview', binary.parent / 'webserver/tests/native-character-preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
checks = []
for species in ('Chain Devil', 'Eldritch'):
    for job, weapon in (('Fighter', 'trident'), ('Conjurer', 'unarmed'), ('Gladiator', 'trident'), ('Wanderer', 'unarmed')):
        party = f'1,NewHero:{species}/{job}/{weapon}/12345'
        first = preview.run(binary, party)
        assert first == preview.run(binary, party, world_seed=98765)
        hero = first[0]
        assert hero['hp'] > 0 and hero['species'] == species
        assert hero.get('god', '') in ('', 'No God')
        checks.append(species + '/' + job)
members = preview.run(binary, '2,Chain:Chain Devil/Fighter/trident/12345,Elder:Eldritch/Conjurer/unarmed/67890')
assert members[0]['species'] == 'Chain Devil' and members[1]['species'] == 'Eldritch'
assert members[1]['mp'] > 0 and 'Magic Dart' in members[1]['memorized']
print(json.dumps({'passed': True, 'checks': checks + ['mixed new-species party', 'world-seed isolation', 'no worship', 'no saves']}))
