"""Normalize generated artwork into native tiles; never draws new artwork.

Usage: python3 prepare.py generated.json
The input is the built-in image tool's prompt and output path manifest.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
TILES = HERE.parents[2] / 'crawl-ref/source/rltiles'
MONSTERS = {'burrowing_beast', 'crag_boar', 'shale_drake',
            'deep_troll_delver', 'worldworm'}


def destination(name):
    if name in MONSTERS:
        return 'mon/burrows/' + name + '.png'
    if name.startswith(('enter_', 'exit_')):
        return 'dngn/gateways/' + name + '.png'
    if name.startswith('floor_'):
        return 'dngn/floor/' + name + '.png'
    if name.startswith(('wall_', 'stone_wall_')):
        return 'dngn/wall/' + name + '.png'
    if name.startswith('burrows_found_'):
        return 'item/gem/' + name + '.png'
    if name.startswith('uncollected_'):
        return 'item/misc/uncollected_runes/rune_burrows.png'
    return 'item/misc/runes/' + name + '.png'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(source, name):
    image = Image.open(source).convert('RGBA')
    terrain = name.startswith(('floor_', 'wall_', 'stone_wall_'))
    if terrain:
        assert image.getextrema()[3] == (255, 255)
        tile = image.resize((32, 32), Image.Resampling.BOX)
    else:
        mask = image.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
        bounds = mask.getbbox()
        assert bounds, name
        image = image.crop(bounds)
        size = (28, 28)
        if name == 'worldworm' or name.startswith(('enter_', 'exit_')):
            size = (30, 30)
        elif 'rune' in name:
            size = (20, 24)
        elif name.startswith('burrows_found_'):
            size = (20, 24)
        image.thumbnail(size, Image.Resampling.BOX)
        tile = Image.new('RGBA', (32, 32))
        tile.paste(image, ((32 - image.width) // 2, 31 - image.height))
    alpha = tile.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    tile = tile.convert('RGB').quantize(colors=24, dither=Image.Dither.NONE)
    tile = tile.convert('RGBA')
    tile.putalpha(alpha)
    return tile


def preview(entries):
    width, height = 7 * 148, 3 * 176
    sheet = Image.new('RGB', (width, height), '#211b19')
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        x, y = index % 7 * 148, index // 7 * 176
        tile = Image.open(TILES / entry['tile']).convert('RGBA')
        sheet.paste(tile.resize((128, 128), Image.Resampling.NEAREST),
                    (x + 10, y + 5), tile.resize((128, 128), Image.Resampling.NEAREST))
        sheet.paste(tile, (x + 8, y + 138), tile)
        draw.text((x + 45, y + 140), entry['id'].replace('_', '\n', 1), fill='#cfbda5')
    sheet.save(HERE / 'preview.png')


def main():
    entries = json.loads(Path(sys.argv[1]).read_text())
    for entry in entries:
        source = Path(entry.pop('source'))
        archived = HERE / 'sources' / (entry['id'] + '.png')
        archived.parent.mkdir(exist_ok=True)
        shutil.copyfile(source, archived)
        entry['source'] = str(archived.relative_to(HERE))
        entry['sourceSha256'] = digest(archived)
        entry['tool'] = 'built-in image_gen'
        entry['tile'] = destination(entry['id'])
        target = TILES / entry['tile']
        assert not target.exists(), 'Refusing to overwrite: ' + str(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        normalize(archived, entry['id']).save(target)
        entry['tileSha256'] = digest(target)
    (HERE / 'prompts.json').write_text(json.dumps(entries, indent=2) + '\n')
    preview(entries)
    print('Saved', len(entries), 'native 32x32 tiles and archived prompts/sources.')


if __name__ == '__main__':
    main()
