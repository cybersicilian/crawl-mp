"""Compare controlled original and prepared stylesheet screenshots exactly."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
args = parser.parse_args()
results = []
for name in ['lobby', 'game']:
    with Image.open(args.directory / (name + '-original.png')) as a, Image.open(args.directory / (name + '-prepared.png')) as b:
        left, right = a.convert('RGBA'), b.convert('RGBA')
        same = left.size == right.size and left.tobytes() == right.tobytes()
        results.append({'view': name, 'identical': same, 'size': list(left.size),
                        'changed_bounds': None if same or left.size != right.size else ImageChops.difference(left, right).getbbox()})
(args.directory / 'pixel-validation.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results))
raise SystemExit(0 if all(item['identical'] for item in results) else 1)
