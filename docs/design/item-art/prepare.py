"""Normalize generated artwork into native item tiles; never draws new artwork.

Usage: python3 prepare.py [--install] [--preview PATH] [asset ...]
Reads prompts.json and sources/<asset>.png. Without --install it only writes
the preview. Stamps are reduced to the 15 pixel corner glyphs that Crawl layers
over scrolls, potions and jewellery; tiles to full native item sprites.
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
TILES = HERE.parents[2] / 'crawl-ref/source/rltiles'
STAMP_SIZE = 15
STAMP_ORIGIN = {'scroll': (17, 17), 'potion': (16, 16),
                'ring': (17, 17), 'amulet': (17, 17)}
TILE_SIZE = 30
STAMP_COLOURS = 7
TILE_COLOURS = 16
# Spent evokers keep their silhouette and lose their colour, as native ones do.
INERT = {'aegis-standard', 'astral-beacon', 'twin-spark-conduit'}


def destination(name, target):
    if target['kind'] == 'stamp':
        return 'item/{0}/i-{1}.png'.format(target['host'], name)
    return 'item/misc/misc_{0}.png'.format(name.replace('-', '_'))


def inert_destination(name):
    return 'item/misc/misc_{0}_inert.png'.format(name.replace('-', '_'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reduce(image, box, colours):
    """Fit into box, taking each pixel's dominant colour to keep edges crisp."""
    mask = image.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    bounds = mask.getbbox()
    assert bounds, 'no opaque pixels'
    image = image.crop(bounds)
    mask = mask.crop(bounds)
    scale = min(box / image.width, box / image.height)
    width = max(1, round(image.width * scale))
    height = max(1, round(image.height * scale))
    clean = Image.composite(image, Image.new('RGBA', image.size), mask)
    indexed = clean.quantize(colours + 1, method=Image.Quantize.FASTOCTREE,
                             dither=Image.Dither.NONE)
    palette = indexed.getpalette('RGBA')
    tile = Image.new('RGBA', (width, height))
    for y in range(height):
        for x in range(width):
            cell = (x * image.width // width, y * image.height // height,
                    max((x + 1) * image.width // width,
                        x * image.width // width + 1),
                    max((y + 1) * image.height // height,
                        y * image.height // height + 1))
            coverage = mask.crop(cell).histogram()[255]
            area = (cell[2] - cell[0]) * (cell[3] - cell[1])
            if coverage * 2 < area:
                continue
            counts = indexed.crop(cell).histogram(mask=mask.crop(cell))
            index = counts.index(max(counts))
            tile.putpixel((x, y), tuple(palette[index * 4:index * 4 + 3])
                          + (255,))
    return tile


def normalize(source, target):
    image = Image.open(source).convert('RGBA')
    tile = Image.new('RGBA', (32, 32))
    if target['kind'] == 'stamp':
        art = reduce(image, STAMP_SIZE, STAMP_COLOURS)
        x, y = STAMP_ORIGIN[target['host']]
        tile.paste(art, (x + (STAMP_SIZE - art.width) // 2,
                         y + (STAMP_SIZE - art.height) // 2))
    else:
        art = reduce(image, TILE_SIZE, TILE_COLOURS)
        tile.paste(art, ((32 - art.width) // 2, (32 - art.height) // 2))
    return tile


def inert(tile):
    red, green, blue, alpha = tile.split()
    grey = tile.convert('L')
    return Image.merge('RGBA', (grey.point(lambda v: v * 78 // 100),
                                grey.point(lambda v: v * 80 // 100),
                                grey.point(lambda v: v * 86 // 100), alpha))


def composite(tile, target):
    """The sprite as the game shows it, over its native scroll or bottle."""
    if target['kind'] != 'stamp':
        return tile
    host = {'scroll': 'item/scroll/' + str(target['back']) + '.png',
            'potion': 'item/potion/ruby.png',
            'ring': 'item/ring/silver.png',
            'amulet': 'item/amulet/bronze.png'}[target['host']]
    base = Image.open(TILES / host).convert('RGBA').copy()
    if target['host'] == 'potion':
        base.alpha_composite(Image.open(TILES / 'item/potion/i-label.png')
                             .convert('RGBA'))
    base.alpha_composite(tile)
    return base


def preview(entries, path):
    columns = 7
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * 190, rows * 240), '#211b19')
    draw = ImageDraw.Draw(sheet)
    for index, (name, tile, shown) in enumerate(entries):
        x, y = index % columns * 190, index // columns * 240
        large = shown.resize((160, 160), Image.Resampling.NEAREST)
        sheet.paste(large, (x + 15, y + 8), large)
        sheet.paste(shown, (x + 15, y + 176), shown)
        double = shown.resize((64, 64), Image.Resampling.NEAREST)
        sheet.paste(double, (x + 56, y + 172), double)
        glyph = tile.resize((64, 64), Image.Resampling.NEAREST)
        sheet.paste(glyph, (x + 122, y + 172), glyph)
        draw.text((x + 15, y + 226), name, fill='#cfbda5')
    sheet.save(path)


def main():
    arguments = sys.argv[1:]
    install = '--install' in arguments
    if install:
        arguments.remove('--install')
    path = HERE / 'preview.png'
    if '--preview' in arguments:
        index = arguments.index('--preview')
        path = Path(arguments[index + 1])
        del arguments[index:index + 2]
    manifest = json.loads((HERE / 'prompts.json').read_text())
    names = arguments or list(manifest['prompts'])
    entries = []
    records = {}
    for name in names:
        target = manifest['targets'][name]
        source = HERE / 'sources' / (name + '.png')
        tile = normalize(source, target)
        assert tile.getextrema()[3] == (0, 255), name
        entries.append((name, tile, composite(tile, target)))
        record = {'source': 'sources/' + name + '.png',
                  'sourceSha256': digest(source),
                  'tile': destination(name, target), 'enum': target['enum']}
        outputs = [(TILES / record['tile'], tile)]
        if name in INERT:
            spent = inert(tile)
            entries.append((name + ' inert', spent, spent))
            record['inertTile'] = inert_destination(name)
            outputs.append((TILES / record['inertTile'], spent))
        if install:
            for output, image in outputs:
                assert not output.exists(), 'Refusing to overwrite: ' + str(output)
                image.save(output)
            record['tileSha256'] = digest(outputs[0][0])
            if len(outputs) > 1:
                record['inertTileSha256'] = digest(outputs[1][0])
        records[name] = record
    if install:
        (HERE / 'manifest.json').write_text(json.dumps(records, indent=2) + '\n')
    preview(entries, path)
    print('Prepared', len(records), 'assets;', 'installed' if install else 'preview only')


if __name__ == '__main__':
    main()
