"""Prepare two temporary client builds for cache tests; source assets stay intact."""
import argparse
from pathlib import Path
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('--web-root', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = args.web_root / 'game_data/static'
for name, value, color in [('one', 1, 'rgb(11, 22, 33)'), ('two', 2, 'rgb(44, 55, 66)')]:
    target = args.output / name
    if target.exists():
        raise ValueError('Preserving existing probe root: ' + str(target))
    for path in source.rglob('*'):
        if path.is_file() and path.suffix in ('.js', '.css'):
            destination = target / path.relative_to(source)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)
    shutil.copy2(source / 'floor.png', target / 'floor.png')
    shutil.copy2(source / 'stylesheet-bundles.json', target / 'stylesheet-bundles.json')
    script = target / 'environment-art.js'
    script.write_text(script.read_text() + '\nwindow.cacheProbeVersion = ' + str(value) + ';\n')
    style = target / 'style.css'
    style.write_text(style.read_text() + '\n#cache-style-probe { color: ' + color + '; }\n')
print('Prepared two isolated script/style builds with one identical native atlas')
