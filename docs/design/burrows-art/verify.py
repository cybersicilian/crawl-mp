"""Check that native atlas metadata selects the generated Burrows pixels."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from math import ceil

from PIL import Image

here = Path(__file__).resolve().parent
source = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
manifest = Path(sys.argv[3]).resolve() if len(sys.argv) > 3 else here / 'prompts.json'
entries = {x['id']: x for x in json.loads(manifest.read_text())}
command = ['node', str(here / 'atlas-info.cjs'), str(source)]
if len(sys.argv) > 3:
    command.append(str(manifest))
assets = json.loads(subprocess.check_output(
    command, text=True))
atlases = {}
tiles = []
for asset in assets:
    family = asset['family']
    atlas = atlases.setdefault(family, Image.open(source / 'rltiles' / (family + '.png')).convert('RGBA'))
    info = asset['info']
    assert info['w'] == info['h'] == 32, asset
    assert 0 <= info['sx'] < info['ex'] <= atlas.width, asset
    assert 0 <= info['sy'] < info['ey'] <= atlas.height, asset
    tile = Image.new('RGBA', (32, 32))
    tile.paste(atlas.crop((info['sx'], info['sy'], info['ex'], info['ey'])),
               (info['ox'], info['oy']))
    assert tile.getchannel('A').getbbox(), asset
    if asset['id'] in entries:
        entry = entries[asset['id']]
        path = source / 'rltiles' / entry['tile']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['tileSha256']
        expected = Image.open(path).convert('RGBA')
        assert expected.size == (32, 32)
        pixels = [expected.getpixel((x, y)) for y in range(32) for x in range(32)]
        assert {p[3] for p in pixels} <= {0, 255}
        assert len({p[:3] for p in pixels if p[3] == 255}) <= 24
        for y in range(32):
            for x in range(32):
                original, target = expected.getpixel((x, y)), tile.getpixel((x, y))
                if original[3] == 255:
                    assert target == original, ('Atlas pixel mismatch', asset['id'], target, original)
    else:
        assert asset['count'] == 1, ('Missing native corpse tile', asset)
        living = entries[asset['id'].removeprefix('corpse_')]
        assert tile.tobytes() != Image.open(source / 'rltiles' / living['tile']).convert('RGBA').tobytes()
    tiles.append(tile)
out.mkdir(parents=True, exist_ok=True)
(out / 'atlas-info.json').write_text(json.dumps(assets, indent=2) + '\n')
columns = min(13, len(tiles))
sheet = Image.new('RGBA', (columns * 40, ceil(len(tiles)/columns) * 40), '#211b19')
for i, tile in enumerate(tiles):
    sheet.alpha_composite(tile, ((i % columns) * 40 + 4, (i // columns) * 40 + 4))
sheet.resize((sheet.width*2, sheet.height*2), Image.Resampling.NEAREST).save(
    out / 'generated-atlas-preview.png')
print('PASS:', len(entries), 'dedicated tiles match native atlases;',
      len(tiles)-len(entries), 'distinct corpses use the native transform.')
