const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const load = require('./helpers/art-catalog-fixture.cjs');
const source = path.resolve(__dirname, '../..');
test('six human appearances preserve the canonical family order, saved base choices and geometry', () => {
    const m=load(), catalog=m['./environment-art'].humanBases, tiles=m['./tileinfo-player'];
    const dc=fs.readFileSync(path.join(source,'rltiles/dc-player.txt'),'utf8');
    assert.match(dc,/human_f HUMAN\s+human_m\s+human2_f\s+human2_m\s+human3_f\s+human3_m\s+elf_m ELF/);
    const cpp=fs.readFileSync(path.join(source,'tilepick-p.cc'),'utf8');
    assert.match(cpp,/case SP_HUMAN:\s*case SP_IRIT:\s*return TILEP_BASE_HUMAN;/);
    assert.match(cpp,/if \(parts\[TILEP_PART_BASE\] != TILEP_SHOW_EQUIP\)\s*result = parts\[TILEP_PART_BASE\];/);
    const all=m['./environment-sprites'].player, regions=all.filter(r=>r.sheet===catalog.id);
    assert.equal(tiles.tile_count(tiles.BASE_HUMAN),6);assert.equal(regions.length,6);
    assert.equal(new Set(all.map(r=>r.tile)).size,all.length);
    for(const [n,entry] of catalog.entries.entries()) {
        assert.equal(entry.variants,false);const index=tiles[entry.names[0]], info=tiles.get_tile_info(index), r=regions.find(r=>r.tile===index);
        assert.equal(index,tiles.BASE_HUMAN+n);assert.equal(r.fit,'stretch');assert.equal(r.preserveAlpha.y,16-info.oy);
        assert.equal(r.preserveAlpha.h,4);assert.equal(r.preserveAlpha.w,r.w);
        assert.deepEqual([r.x,r.y,r.w,r.h],[info.sx,info.sy,info.ex-info.sx,info.ey-info.sy]);
        assert(r.sprite.x+r.sprite.w<=catalog.width && r.sprite.y+r.sprite.h<=catalog.height);
    }
    assert.equal(new Set(regions.map(r=>[r.x,r.y,r.w,r.h].join(':'))).size,6,'portraits retain exact appearance identity');
});
test('other species, transformations and monster bodies do not alias the human player family', () => {
    const m=load(), tiles=m['./tileinfo-player'], id=m['./environment-art'].humanBases.id;
    const selected=m['./environment-sprites'].player.filter(r=>r.sheet===id);
    for(const symbol of ['BASE_ELF','BASE_DEEP_ELF','BASE_DWARF','BASE_NAGA','BASE_DJINNI','BASE_TROLL','BASE_COGLIN','BASE_OCTOPODE',
        'BASE_FELID','BASE_MERFOLK_WATER','MONS_ORC','MONS_GOBLIN']) {
        const index=tiles[symbol];assert.equal(typeof index,'number',symbol);
        for(let n=0;n<tiles.tile_count(index);n++)assert(!selected.some(r=>r.tile===index+n),symbol);
    }
});
