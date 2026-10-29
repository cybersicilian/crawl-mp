"""Render complete native floors and pack their exact pixels for inline inspection."""
import base64
import hashlib
import io
import json
import shutil
import struct
import sys
from collections import Counter
from pathlib import Path

from PIL import Image
import render as tiles


def encoded(values, kind='B'):
    return base64.b64encode(struct.pack('<'+kind*len(values), *values)).decode()


def validate(level):
    walk = {(x+1,y+1) for y,row in enumerate(level['walkable'])
            for x,cell in enumerate(row) if cell}
    visited, pending = set(), [next(iter(walk))]
    while pending:
        p = pending.pop()
        if p in visited:
            continue
        visited.add(p)
        pending.extend((p[0]+dx,p[1]+dy) for dx in [-1,0,1] for dy in [-1,0,1]
                       if (p[0]+dx,p[1]+dy) in walk and (p[0]+dx,p[1]+dy) not in visited)
    assert walk==visited, (level['id'],len(walk),len(visited))
    counts = Counter(level['features'][f-1] for row in level['grid'] for f in row)
    depth = int(level['title'].split(':')[1])
    bottom = 2 if level['branch']=='Hive' else 4
    for number in ['i','ii','iii']:
        assert counts['stone_stairs_down_'+number]==int(depth<bottom)
        if depth>1:
            assert counts['stone_stairs_up_'+number]==1
    assert not any(i['name']=='clay rune of Zot' for i in level['items'])
    expected = {'bur-2':'enter_hive','bur-4':'enter_wormlands','worm-4':'wormlands_to_depths'}
    if level['id'] in expected:
        assert counts[expected[level['id']]]==1
    return len(walk)


def main():
    source, output, exports, fragment = map(Path, sys.argv[1:5])
    tiles.configure(source,output,exports)
    levels, images, records, packed = {}, {}, [], []
    unique_tiles, tile_ids = [], {}
    for path in sorted(exports.glob('burrows-floor-*.json')):
        level = json.loads(path.read_text())
        walkable = validate(level)
        area = tiles.bounds(level)
        image = tiles.render(level,area)
        key = level['id']
        levels[key],images[key] = level,image
        shutil.copy2(path,output/'raw'/path.name)
        fungi = sum(m['name'] in {'wandering mushroom','deathcap'} for m in level['monsters'])
        subtitle = (f"Seed {level['seed']} | {len(level['monsters'])} monsters | "
                    f"{len(level['items'])} ground item stacks | {fungi} mushrooms")
        tiles.plate(image,level['title'],subtitle).save(output/(key+'.png'))
        left,top,right,bottom = area
        width,height = right-left+1,bottom-top+1
        cells,features,vaults = [],[],[]
        for y in range(height):
            for x in range(width):
                sprite = image.crop((x*32,y*32,x*32+32,y*32+32))
                pixels = sprite.tobytes()
                if pixels not in tile_ids:
                    tile_ids[pixels]=len(unique_tiles)
                    unique_tiles.append(sprite)
                cells.append(tile_ids[pixels])
                features.append(level['grid'][top+y-1][left+x-1]-1)
                vaults.append(level['vaultGrid'][top+y-1][left+x-1])
        assert len(unique_tiles)<65536
        assert max(features)<256 and max(vaults)<256
        occupants = {}
        for kind in ['monsters','items']:
            for entity in level[kind]:
                index = (entity['y']-top)*width+entity['x']-left
                occupants.setdefault(str(index),[]).append(entity['name'])
        packed.append(dict(id=key,title=level['title'],branch=level['branch'],
            seed=level['seed'],w=width,h=height,x=left,y=top,
            tiles=encoded(cells,'H'),features=encoded(features),vaults=encoded(vaults),
            featureNames=level['features'],vaultNames=[v['name'] for v in level['vaultPlacements']],
            occupants=occupants,monsters=len(level['monsters']),items=len(level['items']),fungi=fungi))
        records.append(dict(id=key,title=level['title'],branch=level['branch'],seed=level['seed'],
            monsters=len(level['monsters']),mushrooms=fungi,itemStacks=len(level['items']),
            monsterRoster=dict(Counter(m['name'] for m in level['monsters'])),
            lootClasses=dict(Counter(i['class'] for i in level['items'])),
            walkableCells=walkable,bounds=list(area),vaults=level['vaultPlacements']))
    assert len(levels)==9 and Counter(l['branch'] for l in levels.values())=={'Bur':3,'Worm':3,'Hive':3}
    for branch,ids in [('burrows',['bur-1','bur-2','bur-4']),
                       ('wormlands',['worm-1','worm-2','worm-4']),
                       ('hive',['hive-1','hive-2a','hive-2b'])]:
        tiles.montage([(levels[k],images[k]) for k in ids],3,branch+'.png')
    tiles.montage([(levels[k],images[k]) for k in ['bur-2','worm-2','hive-1']],3,'comparison.png')
    atlas = Image.new('RGB',(32*32,32*((len(unique_tiles)+31)//32)))
    for i,sprite in enumerate(unique_tiles):
        atlas.paste(sprite,((i%32)*32,(i//32)*32))
    data = io.BytesIO()
    atlas.save(data,format='PNG',optimize=True)
    payload = json.dumps(dict(atlas=base64.b64encode(data.getvalue()).decode(),levels=packed),
                         separators=(',',':')).replace('</','<\\/')
    template = (Path(__file__).parent/'full-floors.html').read_text()
    assert template.count('<!--NATIVE_FLOORS_DATA-->')==1
    html = template.replace('<!--NATIVE_FLOORS_DATA-->',payload)
    assert len(html.encode())<1_000_000, len(html.encode())
    fragment.write_text(html)
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    manifest = dict(nativeBinarySha256=digest(source/'crawl'),floors=records,
        fragmentSha256=digest(fragment),fragmentBytes=len(html.encode()),packedTiles=len(unique_tiles),
        method='Complete native generated floors, offline classic atlases and native vault ownership.',
        limitations=['fully revealed','generic item class icons','no client lighting or live combat',
                     'independent floor samples reset unique/vault history'])
    candidates = source/'burrows-candidate-index.json'
    if candidates.exists():
        manifest['candidateTrials']=json.loads(candidates.read_text())
        manifest['selection']='Wormlands seeds selected for fungal-vault coverage; all trials retained; no vaults forced.'
        (output/'candidates').mkdir(exist_ok=True)
        for path in source.glob('burrows-candidate-*.json'):
            shutil.copy2(path,output/'candidates'/path.name)
    (output/'generation.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('PASS: nine connected native floors, matching PNGs and',len(html.encode()),'byte inspection view.')


if __name__=='__main__':
    main()
