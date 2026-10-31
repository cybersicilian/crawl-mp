"""Normalize generated monster sources with the existing native tile pipeline."""
import hashlib
import importlib.util
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('tile_prepare', HERE.parent / 'prepare.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
entries = json.loads((HERE / 'generated.json').read_text())
sheet = Image.new('RGB', (5 * 180, 210), '#211b19')
draw = ImageDraw.Draw(sheet)
for index, entry in enumerate(entries):
    name = entry['id']
    source = Path(entry['source'])
    archived = HERE / 'sources' / (name + '.png')
    archived.parent.mkdir(exist_ok=True)
    shutil.copy2(source, archived)
    target = native.TILES / 'mon/burrows' / (name + '.png')
    assert not target.exists(), 'Refusing to overwrite ' + str(target)
    sprite = native.normalize(archived, name)
    sprite.save(target)
    entry.update(source=str(archived.relative_to(HERE)),
                 sourceSha256=native.digest(archived), tool='built-in image_gen',
                 tile=str(target.relative_to(native.TILES)), tileSha256=native.digest(target))
    x = index * 180
    enlarged = sprite.resize((128, 128), Image.Resampling.NEAREST)
    sheet.paste(enlarged, (x+26, 8), enlarged)
    sheet.paste(sprite, (x+8, 150), sprite)
    draw.text((x+48, 153), name.replace('_', '\n'), fill='#e1c59a')
sheet.save(HERE / 'monsters.png')
(HERE / 'prompts.json').write_text(json.dumps(entries, indent=2)+'\n')
print('Normalized five transparent 32x32 native monster tiles.')
