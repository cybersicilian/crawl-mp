"""Render the surveyed native floors using their matching classic atlases."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

from PIL import Image

BASE=Path(__file__).resolve().parent
sys.path.insert(0,str(BASE.parent/'burrows-generation'))
import render as tiles
from full_floors import validate


def main():
    source,output=map(Path,sys.argv[1:3])
    tiles.configure(source,output)
    records=[]
    for path in sorted(source.glob('route-floor-*.json')):
        level=json.loads(path.read_text())
        cells=validate(level)
        honey=[(x+1,y+1) for y,row in enumerate(level['grid']) for x,f in enumerate(row)
               if level['features'][f-1]=='shallow_honey']
        image=tiles.render(level,tiles.bounds(level))
        caption=f"Seed {level['seed']} | {len(level['monsters'])} monsters | {len(level['items'])} item stacks | {len(honey)} honey cells"
        tiles.plate(image,level['title'],caption).save(output/(level['id']+'.png'))
        shutil.copy2(path,output/'raw'/path.name)
        if level['id']=='hive-1':
            assert honey
            x,y=honey[0]
            close=tiles.render(level,(x-5,y-4,x+5,y+4))
            close=close.resize((close.width*2,close.height*2),Image.Resampling.NEAREST)
            tiles.plate(close,'Hive:1 — honey pool','Native terrain and tiles; fully revealed offline preview').save(output/'honey-close-up.png')
        records.append(dict(floor=level['title'],seed=level['seed'],walkable=cells,
            honey=len(honey),monsters=len(level['monsters']),items=len(level['items']),
            vaults=level['vaultPlacements']))
    assert len(records)==10
    generation=Path(sys.argv[3]) if len(sys.argv)>3 else BASE/'validation/economy-after-2/games/melee-2026102701/result.json'
    manifest=dict(generationNativeSha256=json.loads(generation.read_text())['nativeSha256'],
        renderingBuildNativeSha256=hashlib.sha256((source/'crawl').read_bytes()).hexdigest(),
        floors=records,limitations=['Fully revealed offline native exports.','Generic item class icons.','No client lighting or live gameplay screenshot.'])
    (output/'preview-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Rendered',len(records),'native route floors and the honey close-up')


if __name__=='__main__':
    main()
