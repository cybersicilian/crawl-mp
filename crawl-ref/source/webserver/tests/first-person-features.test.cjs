const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const tiles={FLOOR_MAX:100,WALL_MAX:200,WALL_BRICK_DARK_2:110,WALL_BRICK_DARK_2_TORCH:111,
    DNGN_TRANSPARENT_WALL:120,DNGN_CRYSTAL_WALL:121,DNGN_CLOSED_DOOR:201,DNGN_OPEN_DOOR:202,
    DNGN_RUNED_CLEAR_DOOR:203,DNGN_STONE_STAIRS_DOWN:210,DNGN_STONE_STAIRS_UP:211,
    DNGN_BLUE_FOUNTAIN:212,DNGN_ENTER_ZOT_CLOSED:220,DNGN_EXIT_VAULTS_CLOSED:221,DNGN_PORTAL_VOLCANO_GONE:222,SHOP_WEAPONS:223,DNGN_STONE_ARCH:224,DNGN_LAVA:30,basetile:index=>index};
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game_data/static/first-person-features.js'),'utf8'),{
    define(deps,factory){model=factory(tiles);}
});
test('torch tiles separate the plain wall surface from the light/model attachment',()=>{
    const profile=model.describe(111);
    assert.equal(profile.wallTexture,110);assert.equal(profile.attachments[0].kind,'torch');
    assert.equal(profile.attachments[0].sourceTile,111);assert(profile.solid);
    assert.equal(model.describe(110).attachments.length,0);
});
test('native door state and stair direction survive mesh adaptation',()=>{
    assert.equal(model.describe(201).kind,'door');assert(model.describe(201).solid);
    assert.equal(model.describe(202).kind,'open_door');assert(!model.describe(202).solid);
    assert.equal(model.describe(210).kind,'stairs_down');assert.equal(model.describe(211).kind,'stairs_up');
    assert.equal(model.describe(212).attachments[0].kind,'fountain');
});
test('glass, clear doors and crystal retain native collision while using translucent materials',()=>{
    for(const tile of [120,203]){
        const profile=model.describe(tile);
        assert(profile.solid);assert(profile.transparent);
        assert(profile.optical.opacity>0&&profile.optical.opacity<1);
        assert(profile.optical.transmission>0);assert.equal(profile.optical.castShadow,false);
    }
    assert.equal(model.describe(110).optical,null);
    assert.equal(model.describe(121).transparent,false);assert.equal(model.describe(121).optical.opacity,1);
});

test('native closed-looking entrances stay walkable and retain explicit connector identity',()=>{
    for(const index of [220,221,222,223]){
        const profile=model.describe(index);assert(!profile.solid);assert(!profile.door);assert(profile.connector);
        assert.equal(profile.connector.sourceTile,index);assert.equal(profile.kind,null);
    }
    assert.equal(model.describe(222).connector.inactive,true);
    assert.equal(model.describe(223).connector.kind,'shop');
    assert.equal(model.describe(224).connector,null,'Decorative stone arches do not imply a level transition');
    assert(model.describe(203).runed);assert(!model.describe(203).sealed);
});
