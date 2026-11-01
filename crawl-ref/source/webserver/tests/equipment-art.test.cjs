const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function load() {
    const modules = { jquery: { extend: Object.assign } };
    for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-main', 'tileinfo-player',
        'tileinfo-dngn', 'environment-art', 'environment-sprites']) {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static', name + '.js'), 'utf8'), {
            window: {}, assert, define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep])); }
        });
    }
    return modules;
}
test('nine held-equipment styles use exact native slots and retain alternate and artefact identities', () => {
    const m = load(), catalog = m['./environment-art'].equipment, tiles = m['./tileinfo-player'];
    const all = m['./environment-sprites'].player, regions = all.filter(r => r.sheet === catalog.id);
    assert.equal(regions.length, 9); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    for (const entry of catalog.entries) {
        const index = tiles[entry.names[0]], region = regions.find(r => r.tile === index), info = tiles.get_tile_info(index);
        assert(region, entry.label); assert.equal(entry.variants, false); assert.equal(region.fit, 'stretch');
        assert.deepEqual([region.x, region.y, region.w, region.h], [info.sx, info.sy, info.ex - info.sx, info.ey - info.sy]);
        assert(region.sprite.x + region.sprite.w <= catalog.width && region.sprite.y + region.sprite.h <= catalog.height);
        if (entry.gripBand) {
            assert.deepEqual([region.preserveAlpha.x, region.preserveAlpha.y, region.preserveAlpha.w, region.preserveAlpha.h],
                [0, 16 - info.oy, info.ex - info.sx, 3]);
        } else assert.equal(region.preserveAlpha, null);
    }
    for (const name of ['HAND2_BUCKLER', 'HAND2_KITE_SHIELD', 'HAND2_TOWER_SHIELD'])
        for (let n = 1; n < tiles.tile_count(tiles[name]); n++) assert(!regions.some(r => r.tile === tiles[name] + n));
    for (const name of ['BASE_HUMAN', 'HAND1_DAGGER_MAGIC', 'HAND1_SPEAR_MAGIC', 'HAND1_MORG', 'HAND2_KITE_SHIELD_GONG',
        'HAND2_KITE_SHIELD_OF_RESISTANCE']) {
        assert.equal(typeof tiles[name], 'number', name); assert(!regions.some(r => r.tile === tiles[name]), name);
    }
});
test('all nineteen ordinary shield appearances resolve to distinct authored entries without taking artefact slots', () => {
    const m = load(), tiles = m['./tileinfo-player'], catalogs = m['./environment-art'];
    const all = m['./environment-sprites'].player;
    const shields = all.filter(r => r.sheet === catalogs.shields.id);
    assert.equal(shields.length, 16); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    const selected = new Set(all.filter(r => r.sheet === catalogs.equipment.id || r.sheet === catalogs.shields.id).map(r => r.tile));
    let count = 0;
    for (const name of ['HAND2_BUCKLER', 'HAND2_KITE_SHIELD', 'HAND2_TOWER_SHIELD'])
        for (let n = 0; n < tiles.tile_count(tiles[name]); n++) { assert(selected.has(tiles[name] + n), name + '+' + n); count++; }
    assert.equal(count, 19);
    for (const entry of catalogs.shields.entries) {
        const region = shields.find(r => r.tile === tiles[entry.names[0]]); assert(region, entry.label);
        assert.equal(region.preserveAlpha, null); assert.equal(entry.variants, false);
        assert(region.sprite.x >= 0 && region.sprite.y >= 0);
        assert(region.sprite.x + region.sprite.w <= catalogs.shields.width && region.sprite.y + region.sprite.h <= catalogs.shields.height);
    }
    for (const name of ['HAND2_BUCKLER_WARLOCK', 'HAND2_KITE_SHIELD_GONG', 'HAND2_KITE_SHIELD_OF_RESISTANCE', 'HAND2_TOWER_SHIELD_OF_IGNORANCE']) {
        assert.equal(typeof tiles[name], 'number', name); assert(!selected.has(tiles[name]), name);
    }
});
test('extended melee styles preserve native slots, hand windows and independent enchanted identities', () => {
    const m = load(), catalog = m['./environment-art'].melee, tiles = m['./tileinfo-player'];
    const all = m['./environment-sprites'].player, regions = all.filter(r => r.sheet === catalog.id);
    const expected = ['RAPIER', 'FALCHION', 'LONG_SWORD_SLANT', 'GREAT_SWORD', 'WAR_AXE', 'BROAD_AXE',
        'BATTLEAXE', 'GREAT_MACE', 'MORNINGSTAR', 'FLAIL', 'WHIP', 'GIANT_CLUB_PLAIN', 'TRIDENT2', 'HALBERD', 'GLAIVE', 'QUARTERSTAFF1'];
    assert.equal(regions.length, expected.length); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    expected.forEach((name, i) => {
        const symbol = 'HAND1_' + name, entry = catalog.entries[i], region = regions.find(r => r.tile === tiles[symbol]);
        assert.equal(entry.names[0], symbol); assert.equal(entry.variants, false); assert(region, name);
        const info = tiles.get_tile_info(region.tile);
        assert.deepEqual([region.x, region.y, region.w, region.h], [info.sx, info.sy, info.ex - info.sx, info.ey - info.sy]);
        assert.deepEqual([region.preserveAlpha.x, region.preserveAlpha.y, region.preserveAlpha.w, region.preserveAlpha.h],
            [0, 16 - info.oy, info.ex - info.sx, 3]);
        assert(region.sprite.x >= 0 && region.sprite.y >= 0);
        assert(region.sprite.x + region.sprite.w <= catalog.width && region.sprite.y + region.sprite.h <= catalog.height);
        for (const suffix of ['_MAGIC', '_RANDART'])
            if (typeof tiles[symbol + suffix] === 'number') assert(!all.some(r => r.tile === tiles[symbol + suffix]), symbol + suffix);
    });
    for (const name of ['HAND1_TRIDENT_OCTOPUS_KING', 'HAND1_FINISHER', 'HAND1_GLAIVE_OF_THE_GUARD', 'HAND1_FIRESTARTER'])
        assert(!all.some(r => r.tile === tiles[name]), name);
});
test('extended melee entries replace the actual native default weapon selection', () => {
    const m = load(), catalog = m['./environment-art'].melee;
    const defaults = require('./helpers/native-monster-equipment.cjs').nativeDefaultWeaponTiles();
    const subtypes = ['RAPIER', 'FALCHION', 'LONG_SWORD', 'GREAT_SWORD', 'WAR_AXE', 'BROAD_AXE', 'BATTLEAXE',
        'GREAT_MACE', 'MORNINGSTAR', 'FLAIL', 'WHIP', 'GIANT_CLUB', 'TRIDENT', 'HALBERD', 'GLAIVE', 'QUARTERSTAFF'];
    subtypes.forEach((type, i) => assert.equal(catalog.entries[i].names[0], defaults.get('WPN_' + type), type));
    assert.equal(defaults.get('WPN_SHORT_SWORD'), 'HAND1_SHORT_SWORD_SLANT');
    assert.equal(defaults.get('WPN_CLUB'), 'HAND1_CLUB_SLANT');
});
test('angled and heavy forms cover their real native defaults while alternate and magical forms stay separate', () => {
    const m = load(), tiles = m['./tileinfo-player'], catalog = m['./environment-art'].weaponForms;
    const defaults = require('./helpers/native-monster-equipment.cjs').nativeDefaultWeaponTiles();
    const all = m['./environment-sprites'].player, regions = all.filter(r => r.sheet === catalog.id);
    const subtypes = ['SHORT_SWORD', 'CLUB', 'SCIMITAR', 'DIRE_FLAIL', 'EVENINGSTAR', 'EXECUTIONERS_AXE'];
    assert.equal(regions.length, subtypes.length); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    subtypes.forEach((type, i) => {
        const entry = catalog.entries[i], symbol = defaults.get('WPN_' + type);
        assert.equal(entry.names[0], symbol); assert.equal(entry.variants, false);
        const region = regions.find(r => r.tile === tiles[symbol]), info = tiles.get_tile_info(tiles[symbol]);
        assert(region, type); assert.equal(region.preserveAlpha.y, 16 - info.oy); assert.equal(region.preserveAlpha.h, 3);
        for (const suffix of ['_MAGIC', '_RANDART'])
            if (typeof tiles[symbol + suffix] === 'number') assert(!all.some(r => r.tile === tiles[symbol + suffix]), symbol + suffix);
    });
    assert(!all.some(r => r.tile === tiles.HAND1_CLUB2));
    assert(!all.some(r => r.tile === tiles.HAND1_SHORT_SWORD_SLANT2));
});
test('ranged art covers five exact native launcher slots and the longbow alias without taking unfinished or enchanted choices', () => {
    const m = load(), tiles = m['./tileinfo-player'], catalog = m['./environment-art'].ranged;
    const native = require('./helpers/native-monster-equipment.cjs'), defaults = native.nativeDefaultWeaponTiles();
    const all = m['./environment-sprites'].player, regions = all.filter(r => r.sheet === catalog.id);
    const subtypes = ['SLING', 'SHORTBOW', 'ORCBOW', 'ARBALEST', 'TRIPLE_CROSSBOW'];
    assert.equal(regions.length, subtypes.length); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    subtypes.forEach((type, i) => {
        const symbol = defaults.get('WPN_' + type), entry = catalog.entries[i], index = tiles[symbol];
        assert.equal(entry.names[0], symbol); assert.equal(entry.variants, false);
        const region = regions.find(r => r.tile === index), info = tiles.get_tile_info(index); assert(region, type);
        assert.deepEqual([region.x, region.y, region.w, region.h], [info.sx, info.sy, info.ex - info.sx, info.ey - info.sy]);
        assert.deepEqual([region.preserveAlpha.x, region.preserveAlpha.y, region.preserveAlpha.w, region.preserveAlpha.h],
            [0, 16 - info.oy, info.ex - info.sx, 3]);
        assert(region.sprite.x + region.sprite.w <= catalog.width && region.sprite.y + region.sprite.h <= catalog.height);
    });
    assert.equal(defaults.get('WPN_LONGBOW'), catalog.entries[2].names[0]);
    const required = native.nativeForcedTwoHanded();
    for (const name of ['HAND1_SHORTBOW', 'HAND1_ORCBOW', 'HAND1_ARBALEST', 'HAND1_TRIPLE_CROSSBOW']) assert(required.includes(name), name);
    for (const name of ['HAND1_SLING', 'HAND1_HAND_CANNON']) assert(!required.includes(name), name);
    for (const name of ['HAND1_ORCBOW_MAGIC', 'HAND1_ORCBOW_RANDART', 'HAND1_HAND_CANNON_MAGIC', 'HAND1_HAND_CANNON_RANDART',
        'HAND1_HAND_CANNON', 'HAND1_ARBALEST2', 'HAND1_FUSTIBALUS', 'HAND1_BLOWGUN_ASSASSIN', 'HAND1_SNIPER', 'HAND1_MULE']) {
        assert.equal(typeof tiles[name], 'number', name); assert(!all.some(r => r.tile === tiles[name]), name);
    }
});
