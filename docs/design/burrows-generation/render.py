"""Render exported native layouts with classic tile atlases, without a game UI.

The geometry and occupants come from export.lua. This preview chooses decorative
tile variants deterministically; it does not reproduce client fog or shading.
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SOURCE = OUTPUT = EXPORTS = None
ATLAS, TEXTURES = {}, {}
FONT = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
SMALL = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 16)
CACHE = {}
MONSTERS = {}
TILE_BY_INDEX = {}
WALLS = {'rock_wall', 'stone_wall', 'permarock_wall', 'metal_wall',
         'slimy_wall', 'clear_rock_wall', 'clear_stone_wall'}


def configure(source, output, exports=None):
    """Select one matched native build for this process's rendering session."""
    global SOURCE, OUTPUT, EXPORTS, ATLAS, TEXTURES, TILE_BY_INDEX
    SOURCE, OUTPUT = Path(source).resolve(), Path(output).resolve()
    EXPORTS = Path(exports).resolve() if exports else SOURCE
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'raw').mkdir(exist_ok=True)
    ATLAS = json.loads(subprocess.check_output(
        ['node', str(HERE / 'atlas.cjs'), str(SOURCE)], text=True))
    TEXTURES = {family: Image.open(SOURCE / 'rltiles' / (family+'.png')).convert('RGBA')
                for family in ['floor', 'wall', 'feat', 'main', 'player']}
    TILE_BY_INDEX = {(e['family'],e['index']):e for e in ATLAS.values()}
    CACHE.clear()
    MONSTERS.clear()


def tile(symbol, variation=0):
    entry = ATLAS[symbol]
    variation %= entry['count']
    if variation:
        entry = TILE_BY_INDEX[(entry['family'], entry['index']+variation)]
    key = (entry['family'], entry['index'])
    if key not in CACHE:
        info = entry['info']
        image = Image.new('RGBA', (32, 32))
        image.paste(TEXTURES[entry['family']].crop(
            (info['sx'], info['sy'], info['ex'], info['ey'])), (info['ox'], info['oy']))
        CACHE[key] = image
    return CACHE[key]


def monster_symbol(name):
    # Display names need not match filenames (e.g. walking frostbound tome).
    # Resolve from canonical native YAML names instead of deriving a filename.
    if not MONSTERS:
        for path in sorted((SOURCE / 'dat/mons').glob('*.yaml')):
            data = yaml.safe_load(path.read_text())
            if isinstance(data, dict) and isinstance(data.get('name'), str):
                key = data['name'].casefold()
                if key not in MONSTERS or not path.stem.startswith('deprecated-'):
                    MONSTERS[key] = (path, data)
    path, data = MONSTERS[name.casefold()]
    enum = data.get('enum', path.stem.replace('-', '_'))
    symbol = data.get('tile', enum)
    if symbol.lower().startswith('tilep_'):
        return symbol[6:].upper()
    return 'MONS_' + symbol.upper()


def feature_symbol(name):
    aliases = {'enter_wormlands':'DNGN_ENTER_BURROWS',
               'exit_wormlands':'DNGN_EXIT_BURROWS',
               'wormlands_to_depths':'DNGN_ENTER_DEPTHS',
               'depths_to_wormlands':'DNGN_EXIT_BURROWS',
               'exit_depths':'DNGN_RETURN_DEPTHS',
               'enter_slime_pits':'DNGN_ENTER_SLIME',
               'clear_rock_wall':'DNGN_TRANSPARENT_WALL',
               'clear_stone_wall':'DNGN_TRANSPARENT_STONE',
               'enter_bazaar':'DNGN_PORTAL_BAZAAR',
               'enter_ziggurat':'DNGN_PORTAL_ZIGGURAT',
               'enter_volcano':'DNGN_PORTAL_VOLCANO',
               'enter_necropolis':'DNGN_PORTAL_NECROPOLIS',
               'enter_shop':'SHOP_GENERAL'}
    if name in aliases: return aliases[name]
    if name == 'shaft':
        return 'DNGN_TRAP_SHAFT'
    if name.startswith('stone_stairs_'):
        return 'DNGN_' + name.rsplit('_', 1)[0].upper()
    return 'DNGN_' + name.upper()


def item_symbol(item):
    name = item['name']
    # The rune/gem are exact; other loot uses a class icon in this overview.
    if name == 'clay rune of Zot': return 'RUNE_BURROWS', 3
    if name == 'ochre gem': return 'GEM_BURROWS', 2
    if 'gold piece' in name: return 'GOLD01', 1
    if 'scroll' in name: return 'SCROLL', 0
    if 'potion' in name: return 'UNSEEN_POTION', 0
    symbols = {'weapon':'WPN_DAGGER','armour':'ARM_PLATE_ARMOUR',
               'jewellery':'UNSEEN_RING','book':'UNSEEN_BOOK',
               'wand':'UNSEEN_WAND','magical staff':'UNSEEN_STAFF'}
    return symbols.get(item.get('class')), 0


def feature(level, x, y):
    if not (1 <= x <= level['width'] and 1 <= y <= level['height']):
        return 'rock_wall'
    return level['features'][level['grid'][y-1][x-1]-1]


def bounds(level):
    cells = [(x, y) for y in range(1, level['height']+1)
             for x in range(1, level['width']+1) if feature(level, x, y) not in WALLS]
    assert cells, level['id']
    return (max(1, min(x for x, _ in cells)-1), max(1, min(y for _, y in cells)-1),
            min(level['width'], max(x for x, _ in cells)+1),
            min(level['height'], max(y for _, y in cells)+1))


def render(level, area):
    left, top, right, bottom = area
    palettes = {'Bur':('WALL_BURROWS','FLOOR_BURROWS'),
                'Worm':('WALL_LAB_ROCK','FLOOR_MOSS'),
                'Hive':('WALL_WAX','FLOOR_ROUGH_YELLOW'),
                'Lair':('WALL_LAIR','FLOOR_LAIR'),
                'Depths':('WALL_NORMAL','FLOOR_GREY_DIRT_B')}
    wall, floor = palettes[level['branch']]
    canvas = Image.new('RGBA', ((right-left+1)*32, (bottom-top+1)*32), '#171412')
    for y in range(top, bottom+1):
        for x in range(left, right+1):
            name = feature(level, x, y)
            position = ((x-left)*32, (y-top)*32)
            variant = (x*73856093 ^ y*19349663) & 0xffffffff
            if name in WALLS:
                # Unused outer solid rock is omitted, preserving the cave outline.
                if name == 'rock_wall' and not any(feature(level, x+dx, y+dy) not in WALLS
                    for dy in [-1, 0, 1] for dx in [-1, 0, 1]):
                    continue
                symbol = wall
                if name == 'stone_wall':
                    symbol = 'STONE_WALL_BURROWS' if level['branch']=='Bur' else 'DNGN_STONE_WALL'
                elif name == 'slimy_wall': symbol = 'WALL_SLIME'
                elif name == 'permarock_wall': symbol = 'WALL_PERMAROCK'
                elif name != 'rock_wall': symbol = feature_symbol(name)
                canvas.alpha_composite(tile(symbol, variant), position)
            else:
                canvas.alpha_composite(tile(floor, variant), position)
                if name != 'floor':
                    canvas.alpha_composite(tile(feature_symbol(name)), position)
    # One item icon per stack; show the rune/gem above ordinary loot.
    stacks = {}
    for item in level['items']:
        symbol, priority = item_symbol(item)
        if symbol:
            key = (item['x'], item['y'])
            if key not in stacks or priority > stacks[key][1]: stacks[key] = (symbol, priority)
    for (x, y), (symbol, _) in stacks.items():
        if left <= x <= right and top <= y <= bottom:
            canvas.alpha_composite(tile(symbol), ((x-left)*32, (y-top)*32))
    for mon in level['monsters']:
        x, y = mon['x'], mon['y']
        if left <= x <= right and top <= y <= bottom:
            canvas.alpha_composite(tile(monster_symbol(mon['name'])), ((x-left)*32, (y-top)*32))
    return canvas.convert('RGB')


def plate(image, title, subtitle):
    text_width = int(max(FONT.getlength(title), SMALL.getlength(subtitle)))+32
    width = max(image.width, text_width)
    result = Image.new('RGB', (width, image.height+66), '#211b19')
    result.paste(image, ((width-image.width)//2, 66))
    draw = ImageDraw.Draw(result)
    draw.text((16, 10), title, fill='#e1c59a', font=FONT)
    draw.text((16, 38), subtitle, fill='#ad9a84', font=SMALL)
    return result


def montage(images, columns, name):
    cell_w, cell_h = 640, 550
    result = Image.new('RGB', (cell_w*columns, cell_h*((len(images)+columns-1)//columns)), '#171412')
    for i, (level, image) in enumerate(images):
        thumb = image.copy()
        thumb.thumbnail((cell_w-24, cell_h-66), Image.Resampling.NEAREST)
        card = plate(thumb, level['title'],
                     str(len(level['monsters'])) + ' monsters | ' + level['mode'])
        result.paste(card, ((i % columns)*cell_w+(cell_w-card.width)//2, (i//columns)*cell_h))
    result.save(OUTPUT / name)


def main():
    configure(*sys.argv[1:4])
    images = {}
    levels = {}
    for source in sorted(EXPORTS.glob('burrows-preview-*.json')):
        level = json.loads(source.read_text())
        assert isinstance(level['seed'],int) and level['seed']>0
        shutil.copyfile(source, OUTPUT / 'raw' / source.name)
        levels[level['id']] = level
        images[level['id']] = render(level, bounds(level))
        plate(images[level['id']], level['title'],
              'Native generation | Seed ' + str(level['seed']) + ' | Fully revealed tile preview').save(
                  OUTPUT / (level['id'] + '.png'))
    catalogue = json.loads((HERE / 'expansion-catalogue.json').read_text())
    assert len(levels) == 16+len(catalogue)
    for record in catalogue:
        assert levels[record['name']]['vaultRole']==record['role']
    ending_ids = [r['name'] for r in catalogue if r['role']=='ending']
    montage([(levels['bur-'+str(i)], images['bur-'+str(i)]) for i in range(1,5)], 2, 'floors.png')
    montage([(levels[key], images[key]) for key in ending_ids], 3, 'endings.png')
    montage([(levels['worm-'+str(i)], images['worm-'+str(i)]) for i in range(1,5)], 2, 'wormlands.png')
    montage([(levels['hive-'+str(i)], images['hive-'+str(i)]) for i in range(1,3)], 2, 'hive.png')
    montage([(levels[key], images[key]) for key in ['bur-2','worm-2','hive-1']], 3, 'branches.png')
    variant_ids = ['worm-2','hive-1'] + [level['id'] for level in sorted(
        levels.values(),key=lambda value:(value['seed'],value['branch']))
        if level['mode']=='native generated seed variant']
    montage([(levels[key],images[key]) for key in variant_ids],2,'variants.png')
    ordinary_counts = {}
    for branch,filename in [('Bur','bur-vaults.png'),('Worm','worm-vaults.png'),('Hive','hive-vaults.png')]:
        keys = [r['name'] for r in catalogue if r['role']=='ordinary'
                and r['place'].startswith(branch+':')]
        ordinary_counts[branch] = len(keys)
        assert len(keys)>=20
        montage([(levels[key],images[key]) for key in keys],4,filename)
    content_ids = ['worm_delvers_cache','worm_buried_armoury','worm_corroded_gallery',
                   'uniq_old_coil','hive_amber_store','hive_raided_satchel',
                   'hive_guard_line','uniq_vespara']
    montage([(levels[key],images[key]) for key in content_ids],2,'content.png')
    highlights = ['bur_claw_through','worm_mushroom_grove','hive_beetle_gate',
                  'bur_delver_workshop','worm_deathcap_hollow','hive_spark_crossing']
    montage([(levels[key],images[key]) for key in highlights],3,'highlights.png')

    level = levels['bur-2']
    def score(center):
        near = [m for m in level['monsters'] if abs(m['x']-center['x'])<=12 and abs(m['y']-center['y'])<=8]
        return len({m['name'] for m in near})*10 + len(near)
    center = max(level['monsters'], key=score)
    area = (max(1,center['x']-12), max(1,center['y']-8),
            min(level['width'],center['x']+12), min(level['height'],center['y']+8))
    plate(render(level, area), 'Burrows:2 - close-up',
          'Native layout and occupants | 32-pixel tiles | Fully revealed').save(OUTPUT / 'close-up.png')
    summary = {'seed':levels['bur-1']['seed'],'ordinaryVaults':ordinary_counts,'nativeBinarySha256':hashlib.sha256((SOURCE/'crawl').read_bytes()).hexdigest(),
               'levels':[{k:level[k] for k in ['id','title','mode','seed','vaults']} for level in levels.values()],
               'closeUpBounds':area, 'preview':'Native geometry/occupants with offline classic atlas composition; no gameplay fog or client shading.'}
    (OUTPUT / 'generation.json').write_text(json.dumps(summary, indent=2)+'\n')
    print('Rendered',len(levels),'native exports;',ordinary_counts,'ordinary vaults;',len(ending_ids),'endings.')

if __name__ == '__main__':
    main()
