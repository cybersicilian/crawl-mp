#!/usr/bin/env python3
"""Pack licensed source pixels into the stable HUD atlas; never draw icon art.

Inputs stay outside distributable source. See static/ui-sprites/README.md.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'static/scripts/item-properties.js'
DEST = ROOT / 'static/ui-sprites'
MAPPING = Path(__file__).with_name('hud-raven-mapping.json')
LEGACY = DEST / 'hud-sprites.f4c7e20144b6.png'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_tile(name, entry, config, sources, legacy):
    size = config['size']
    if entry['pack'] == 'legacy':
        index = entry['frame']
        x, y = index % config['columns'] * size, index // config['columns'] * size
        tile = legacy.crop((x, y, x + size, y + size))
        provenance = {'file': LEGACY.name, 'crop': [x, y, size, size]}
    else:
        pack = config['packs'][entry['pack']]
        relative = Path(pack['root']) / entry['file']
        path = (sources / relative).resolve()
        if not path.is_relative_to(sources.resolve()):
            raise ValueError(f'Asset outside source directory: {name}')
        with Image.open(path) as original:
            image = original.convert('RGBA')
        if image.width > size or image.height > size:
            raise ValueError(f'{name} is not a native <= {size}px source: {image.size}')
        tile = Image.new('RGBA', (size, size))
        offset = ((size - image.width) // 2, (size - image.height) // 2)
        tile.paste(image, offset)
        provenance = {'file': relative.as_posix(), 'fileSha256': digest(path.read_bytes()),
                      'nativeSize': list(image.size), 'offset': list(offset)}
    if not tile.getbbox():
        raise ValueError(f'Empty source art: {name}')
    visible = bytearray(tile.tobytes())
    for index in range(0, len(visible), 4):
        if visible[index + 3] == 0:
            visible[index:index + 3] = b'\0\0\0'
    return tile, {**entry, **provenance, 'rgbaSha256': digest(tile.tobytes()),
                  'browserRgbaSha256': digest(visible)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True,
                        help='Private directory containing the extracted licensed Raven packs')
    parser.add_argument('--verify', action='store_true', help='Verify source provenance and current output without writing')
    args = parser.parse_args()
    config = json.loads(MAPPING.read_text())
    source = REGISTRY.read_text()
    names = json.loads(re.search(r'var spriteNames = (\[.*?\]);', source, re.S)[1])
    if list(config['roles']) != names:
        raise ValueError('Mapping must cover canonical roles exactly in registry order')
    size, columns = config['size'], config['columns']
    atlas = Image.new('RGBA', (columns * size, ((len(names) + columns - 1) // columns) * size))
    manifest = {'tileSize': size, 'columns': columns, 'family': config['family'],
                'license': config['license'], 'product': config['product'],
                'ravenSprites': 0, 'legacySprites': 0, 'rgba': True,
                'sourceArchives': {}, 'frames': {}, 'sources': {}}
    for pack in config['packs'].values():
        archive = args.sources / pack['archive']
        manifest['sourceArchives'][pack['archive']] = digest(archive.read_bytes())
    with Image.open(LEGACY) as image:
        legacy = image.convert('RGBA')
    for index, name in enumerate(names):
        entry = config['roles'][name]
        tile, provenance = source_tile(name, entry, config, args.sources, legacy)
        x, y = index % columns * size, index // columns * size
        atlas.paste(tile, (x, y))
        manifest['frames'][name] = {'x': x, 'y': y, 'width': size, 'height': size}
        manifest['sources'][name] = provenance
        manifest['legacySprites' if entry['pack'] == 'legacy' else 'ravenSprites'] += 1
    if args.verify:
        current = json.loads((DEST / 'hud-sprites.json').read_text())
        manifest['file'] = current['file']
        if '/static/ui-sprites/' + current['file'] not in source:
            raise ValueError('Renderer does not reference the verified atlas')
        if current != manifest:
            raise ValueError('Manifest differs from licensed sources or role mapping')
        raw = (DEST / current['file']).read_bytes()
        if digest(raw)[:12] not in current['file']:
            raise ValueError('Atlas content does not match its URL hash')
        with Image.open(DEST / current['file']) as image:
            if image.convert('RGBA').tobytes() != atlas.tobytes():
                raise ValueError('Atlas pixels differ from original source tiles')
    else:
        DEST.mkdir(exist_ok=True)
        temporary = DEST / 'hud-sprites.png'
        atlas.save(temporary, optimize=True)
        filename = 'hud-sprites.' + digest(temporary.read_bytes())[:12] + '.png'
        temporary.replace(DEST / filename)
        manifest['file'] = filename
        # Compact per-role records keep the human-reviewable manifest concise.
        # file is stored before collections to avoid a dangling final comma.
        lines = ['{'] + ['  ' + json.dumps(k) + ': ' + json.dumps(v) + ','
                         for k, v in manifest.items() if k not in ('frames', 'sources')]
        for key in ('frames', 'sources'):
            lines.append('  ' + json.dumps(key) + ': {')
            records = list(manifest[key].items())
            lines.extend('    ' + json.dumps(n) + ': ' + json.dumps(v)
                         + (',' if i < len(records) - 1 else '') for i, (n, v) in enumerate(records))
            lines.append('  },' if key == 'frames' else '  }')
        (DEST / 'hud-sprites.json').write_text('\n'.join(lines + ['}']) + '\n')
        declaration = (f'    var spriteAtlas = {{ url: "/static/ui-sprites/{filename}", size: {size}, '
                       f'columns: {columns}, width: {atlas.width}, height: {atlas.height} }};')
        REGISTRY.write_text(re.sub(r'^    var spriteAtlas = .*;$', declaration, source, flags=re.M))
    print(json.dumps({'verified' if args.verify else 'built': True, 'raven': manifest['ravenSprites'],
                      'retainedControls': manifest['legacySprites'], 'file': manifest['file']}))


if __name__ == '__main__':
    main()
