const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const load = require('./helpers/art-catalog-fixture.cjs');
const root = path.resolve(__dirname, '..');
test('six headwear selections preserve native silhouette masks and independent variants', () => {
    const m=load(), catalog=m['./environment-art'].headwear, tiles=m['./tileinfo-player'];
    const regions=m['./environment-sprites'].player.filter(region=>region.sheet===catalog.id);
    assert.equal(regions.length,6);
    assert.equal(new Set(m['./environment-sprites'].player.map(region=>region.tile)).size,m['./environment-sprites'].player.length);
    assert.deepEqual(Array.from(catalog.entries,entry=>entry.names[0]),[
        'HELM_HAT_NORMAL','HELM_CAP_BLUE','HELM_HELM_IRON','HELM_FHELM_GRAY','HELM_HOOD_GRAY','HELM_CROWN']);
    const selected=new Set(Array.from(catalog.entries,entry=>tiles[entry.names[0]]));
    for(const entry of catalog.entries){
        assert.equal(entry.variants,false);
        const index=tiles[entry.names[0]],info=tiles.get_tile_info(index),region=regions.find(region=>region.tile===index);
        assert.deepEqual([region.x,region.y,region.w,region.h],[info.sx,info.sy,info.ex-info.sx,info.ey-info.sy]);
        assert.equal(region.fit,'stretch');
        assert.deepEqual(JSON.parse(JSON.stringify(region.preserveAlpha)),{x:0,y:0,w:region.w,h:region.h});
        assert(entry.sprite.x>=0&&entry.sprite.y>=0&&entry.sprite.x+entry.sprite.w<=catalog.width
            &&entry.sprite.y+entry.sprite.h<=catalog.height);
        for(let variant=1;variant<tiles.tile_count(index);variant++){
            const other=regions.find(region=>region.tile===index+variant);
            if(selected.has(index+variant))assert.notDeepEqual(JSON.parse(JSON.stringify(other.sprite)),entry.sprite);
            else assert(!other);
        }
    }
    for(const symbol of ['HELM_HELM_RED','HELM_HOOD_RED','HELM_ART_DRAGONHELM','HELM_HELM_HORNED','HELM_WIZARD_BLUE','HELM_DYROVEPREVA']){
        assert.equal(typeof tiles[symbol],'number',symbol);
        assert(!regions.some(region=>region.tile===tiles[symbol]),symbol);
    }
});
test('headwear preparation follows the native hair and beard visibility rules', () => {
    const source=fs.readFileSync(path.resolve(root,'../tilepick-p.cc'),'utf8');
    assert.match(source,/doll.parts\[TILEP_PART_HELM\] >= TILEP_HELM_HELM_OFS\)\s*flag\[TILEP_PART_HAIR\] = TILEP_FLAG_HIDE/);
    assert.match(source,/doll.parts\[TILEP_PART_HELM\] >= TILEP_HELM_FHELM_OFS\)\s*flag\[TILEP_PART_BEARD\] = TILEP_FLAG_HIDE/);
});
test('headwear source is canonical and its game image is optional and content-versioned', () => {
    const asset=path.join(root,'static/tabletop/assets/headwear-v1.png');
    const provenance=JSON.parse(fs.readFileSync(asset.replace('.png','.provenance.json'),'utf8'));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex'),provenance.sha256);
    const tag=fs.readFileSync(path.join(root,'game_data/templates/game.html'),'utf8').match(/<img[^>]*id="illustrated_headwear"[^>]*>/)?.[0];
    assert(tag);assert.match(tag,/data-asset-optional/);assert.doesNotMatch(tag,/\ssrc=/);
    assert.match(tag,/image_url\('tabletop\/assets\/headwear-v1\.png', True\)/);
});
