const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const load = require('./helpers/art-catalog-fixture.cjs');
const root = path.resolve(__dirname, '..');
test('six explicit hair choices preserve native crop geometry and every native alpha opening', () => {
    const m=load(), catalog=m['./environment-art'].hair, tiles=m['./tileinfo-player'];
    const regions=m['./environment-sprites'].player.filter(region=>region.sheet===catalog.id);
    assert.equal(regions.length,6);
    assert.equal(new Set(m['./environment-sprites'].player.map(region=>region.tile)).size,m['./environment-sprites'].player.length);
    assert.deepEqual(Array.from(catalog.entries,entry=>entry.names[0]),[
        'HAIR_SHORT_BLACK','HAIR_LONG_BLACK','HAIR_FEM_RED','HAIR_HIGHTAIL','HAIR_PONYTAIL_YELLOW','HAIR_TOPKNOT']);
    for(const entry of catalog.entries){
        assert.equal(entry.variants,false);
        const index=tiles[entry.names[0]],info=tiles.get_tile_info(index),region=regions.find(region=>region.tile===index);
        assert.deepEqual([region.x,region.y,region.w,region.h],[info.sx,info.sy,info.ex-info.sx,info.ey-info.sy]);
        assert.equal(region.fit,'stretch');
        assert.deepEqual(JSON.parse(JSON.stringify(region.preserveAlpha)),{x:0,y:0,w:region.w,h:region.h});
        assert(region.sprite.x>=0&&region.sprite.y>=0&&region.sprite.x+region.sprite.w<=catalog.width
            &&region.sprite.y+region.sprite.h<=catalog.height);
    }
    for(const symbol of ['HAIR_SHORT_RED','HAIR_ELF_YELLOW','HAIR_ELF_WHITE','HAIR_TROLL','HAIR_GREEN','HAIR_PART2_RED',
        'HELM_HAT_NORMAL','HELM_HELM_IRON','HELM_FHELM_GRAY','HELM_CROWN']){
        assert.equal(typeof tiles[symbol],'number',symbol);
        assert(!regions.some(region=>region.tile===tiles[symbol]),symbol);
    }
});
test('hair source remains canonical and its optional game image is deferred and content-versioned', () => {
    const asset=path.join(root,'static/tabletop/assets/hair-overlays-v1.png');
    const provenance=JSON.parse(fs.readFileSync(asset.replace('.png','.provenance.json'),'utf8'));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex'),provenance.sha256);
    const template=fs.readFileSync(path.join(root,'game_data/templates/game.html'),'utf8');
    const tag=template.match(/<img[^>]*id="illustrated_hair"[^>]*>/)?.[0];
    assert(tag);assert.match(tag,/data-asset-optional/);assert.doesNotMatch(tag,/\ssrc=/);
    assert.match(tag,/image_url\('tabletop\/assets\/hair-overlays-v1\.png', True\)/);
});
