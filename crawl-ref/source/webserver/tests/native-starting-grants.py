"""Actual dungeon startup with separate login/save and lobby hero names."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time

spec = importlib.util.spec_from_file_location('native_commands',
    Path(__file__).with_name('native-command-completion.py'))
native = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = native
spec.loader.exec_module(native)


def verify(source, output, before):
    report = {'passed': False, 'existing_saves_used': False, 'before_fix': before, 'checks': []}
    expected = 0 if before else 2
    cases = [
        ('Rogue launches Tav', native.NativeLaunch(name='Rogue', species='Minotaur', job='Fighter',
            weapon='war axe', party=('Tav:Minotaur/Fighter/war axe/2820070508989335',),
            accounts=('Rogue',), multiplayer=False), [expected]),
        ('Login name cannot override another selected hero', native.NativeLaunch(name='Tav',
            party=('Another:Human/Conjurer/unarmed/12345',), accounts=('Rogue',),
            multiplayer=False), [0 if not before else 2]),
        ('Another account launches Tav', native.NativeLaunch(name='Other',
            party=('Tav:Human/Conjurer/unarmed/12345',), accounts=('Other',),
            multiplayer=False), [0]),
        ('Unsigned Tav', native.NativeLaunch(name='Tav',
            party=('Tav:Human/Conjurer/unarmed/12345',), accounts=('',),
            multiplayer=False), [0]),
        ('Rogue host in co-op', native.NativeLaunch(name='Rogue',
            party=('Tav:Human/Conjurer/unarmed/12345', 'Guest:Human/Conjurer/unarmed/12346'),
            accounts=('Rogue', 'Other')), [expected, 0]),
        ('Rogue guest in co-op', native.NativeLaunch(name='Host',
            party=('Leader:Human/Conjurer/unarmed/12345', 'Tav:Human/Conjurer/unarmed/12346'),
            accounts=('Host', 'Rogue')), [0, 2]),
    ]
    try:
        for label, launch, counts in cases:
            with tempfile.TemporaryDirectory(prefix='tav-start-dungeon-', dir='/tmp') as scratch:
                probe = native.NativeProbe(source, Path(scratch), players=len(launch.party), launch=launch)
                try:
                    assert probe.until(lambda: probe.mode == 1 and bool(probe.party), 45), label
                    members = probe.party[0]['members']
                    assert [p['name'] for p in members] == [s.split(':', 1)[0] for s in launch.party]
                    actual = [sum(item['qty'] for item in p['inventory'] if 'acquirement' in item['name'])
                              for p in members]
                    assert actual == counts, (label, actual, counts)
                    probe.send('record_save', exit=True)
                    deadline = time.monotonic() + 15
                    while probe.process.poll() is None and time.monotonic() < deadline:
                        probe.poll()
                    assert probe.process.poll() == 0, 'Normal save-and-exit failed'
                    report['checks'].append({'case': label, 'scroll_counts': actual,
                                             'normal_save_and_exit': True})
                finally:
                    probe.close()
        report['passed'] = True
    finally:
        output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--before', action='store_true')
    args = parser.parse_args()
    verify(args.source.resolve(), args.output.resolve(), args.before)
