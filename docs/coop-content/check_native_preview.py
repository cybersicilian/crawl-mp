"""Exercise mode-specific starting libraries through the real no-save engine."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile


def preview(binary, spec):
    with tempfile.TemporaryDirectory(prefix='dcss-coop-preview-') as scratch:
        result = subprocess.run(
            [str(binary), '-dir', str(binary.parent), '-rc', '/dev/null',
             '-extra-opt-last', 'save_dir=' + scratch, '-character-preview-json', spec],
            cwd=scratch, capture_output=True, text=True, timeout=30, check=True)
        assert not list(Path(scratch).rglob('*.cs'))
        return json.loads(result.stdout)['members']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', type=Path, required=True)
    args = parser.parse_args()
    binary = args.binary.resolve()
    metadata = json.loads(subprocess.check_output([str(binary), '-playable-json'], text=True))
    names = set(metadata['multiplayer_only_spells'])
    assert names == {'Linked Ward', 'Song of Fellowship', 'Cleansing Mist'}
    for job, spell in [('Skald', 'Song of Fellowship'), ('Warper', 'Linked Ward')]:
        token = 'Preview:Human/' + job + '/unarmed/12345'
        solo = preview(binary, '1,' + token)[0]
        multiplayer = preview(binary, '1,mp=on,' + token)[0]
        assert spell not in solo['library'] + solo['memorized'], (job, 'solo leak')
        assert spell in multiplayer['library'] + multiplayer['memorized'], (job, 'missing multiplayer spell')
        assert multiplayer['spell_details'][spell]['description'].strip()
        assert 'Auramancy' in multiplayer['spell_details'][spell]['schools']
    companion = 'Host:Human/Fighter/unarmed/1,Preview:Human/Skald/unarmed/12345'
    local = preview(binary, '2,' + companion)[1]
    multiplayer = preview(binary, '2,mp=on,' + companion)[1]
    assert 'Song of Fellowship' not in local['library'] + local['memorized']
    assert 'Song of Fellowship' in multiplayer['library'] + multiplayer['memorized']
    print(json.dumps({'passed': True, 'nativePreviews': 6, 'noNativeSaves': True,
                      'metadata': sorted(names), 'roleAndModeBoundaries': True}))


if __name__ == '__main__':
    main()
