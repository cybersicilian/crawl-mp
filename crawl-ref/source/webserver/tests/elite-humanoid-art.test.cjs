const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const load = require('./helpers/art-catalog-fixture.cjs');
const {nativeEquipment} = require('./helpers/native-monster-equipment.cjs');
const root = path.resolve(__dirname,'..');
test('six exact elite bodies retain native geometry, distinct attachments and independent special forms', () => {
    const m=load(),catalog=m['./environment-art'].eliteHumanoids,tiles=m['./tileinfo-player'];
    const all=m['./environment-sprites'].player,regions=all.filter(region=>region.sheet===catalog.id);
    const names=Array.from(catalog.entries,entry=>entry.names[0]);
    assert.deepEqual(names,['MONS_ORC_KNIGHT','MONS_ORC_WARLORD','MONS_ORC_HIGH_PRIEST','MONS_ORC_SORCERER','MONS_GNOLL_SERGEANT','MONS_GNOLL_BOUDA']);
    assert.equal(regions.length,6);assert.equal(new Set(all.map(region=>region.tile)).size,all.length);
    const attachments=nativeEquipment(names);assert.equal(attachments.filter(entry=>entry.shield).length,3);
    assert(new Set(attachments.map(entry=>entry.weapon.x+':'+entry.weapon.y)).size>1);
    for(const entry of catalog.entries){
        assert.equal(entry.variants,false);
        const index=tiles[entry.names[0]],info=tiles.get_tile_info(index),region=regions.find(region=>region.tile===index);
        assert.deepEqual([region.x,region.y,region.w,region.h],[info.sx,info.sy,info.ex-info.sx,info.ey-info.sy]);
        assert.equal(region.fit,'stretch');assert.equal(region.mirror,false);
        assert(region.sprite.x+region.sprite.w<=catalog.width&&region.sprite.y+region.sprite.h<=catalog.height);
    }
    for(const name of ['MONS_FALLEN_ORC_KNIGHT','MONS_FALLEN_ORC_WARLORD','MONS_KOBOLD_BRIGAND','MONS_ORC_WARRIOR','BASE_HUMAN']){
        assert.equal(typeof tiles[name],'number',name);assert(!regions.some(region=>region.tile===tiles[name]),name);
        const info=tiles.get_tile_info(tiles[name]);
        assert(!regions.some(region=>region.x===info.sx&&region.y===info.sy&&region.w===info.ex-info.sx&&region.h===info.ey-info.sy),
            'independent portrait crop: '+name);
    }
});
test('elite source bytes remain canonical and the game image is optional, deferred and versioned', () => {
    const asset=path.join(root,'static/tabletop/assets/dungeon-elites-v1.png');
    const provenance=JSON.parse(fs.readFileSync(asset.replace('.png','.provenance.json'),'utf8'));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex'),provenance.sha256);
    const template=fs.readFileSync(path.join(root,'game_data/templates/game.html'),'utf8');
    const tag=template.match(/<img[^>]*id="illustrated_elites"[^>]*>/)?.[0];
    assert(tag);assert.match(tag,/data-asset-optional/);assert.doesNotMatch(tag,/\ssrc=/);
    assert.match(tag,/image_url\('tabletop\/assets\/dungeon-elites-v1\.png', True\)/);
});
