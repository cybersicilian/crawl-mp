const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../game_data/static');

function renderer() {
    let art;
    const source = { complete: true, naturalWidth: 64, naturalHeight: 64 };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'native-tile-art.js'), 'utf8'), {
        document: { getElementById: () => source }, define(deps, factory) { art = factory(() => ({ on() {} })); }
    });
    const draws = [], clips = [], scales = [];
    const context = { clearRect() {}, save() {}, restore() {}, beginPath() {}, clip() {},
        rect: (...args) => clips.push(args), scale: (...args) => scales.push(args),
        drawImage: (...args) => draws.push({ args, smoothing: context.imageSmoothingEnabled }) };
    return { art, source, draws, clips, scales, canvas: { width: 128, height: 128, getContext: () => context } };
}

test('detailed portrait layers keep logical attachment and clipping beside native layers', () => {
    const f = renderer(), detailed = { width: 80, height: 96 };
    f.art.setTileTransform(texture => texture === 'player' ? detailed : null);
    const layers = [
        { texture: 'player', sx: 4, sy: 5, w: 20, h: 24, ox: 2, oy: 3, ymax: 28 },
        { texture: 'icons', sx: 1, sy: 2, w: 8, h: 8, ox: 12, oy: 11, ymax: 16 }
    ];
    assert.equal(f.art.draw(f.canvas, { layers }), true);
    assert.deepEqual(f.scales, [[4, 4]]);
    assert.equal(f.draws[0].args[0], detailed);
    assert.deepEqual(f.draws[0].args.slice(1), [0, 0, 80, 96, 2, 3, 20, 24]);
    assert.equal(f.draws[1].args[0], f.source);
    assert.deepEqual(f.draws[1].args.slice(1), [1, 2, 8, 8, 12, 11, 8, 8]);
    assert.deepEqual(f.clips, [[0, 0, 32, 28], [0, 0, 32, 16]]);
    assert.equal(f.draws[0].smoothing, true); assert.equal(f.draws[1].smoothing, false);
});

test('invalid or unavailable detail falls back to the complete native layer', () => {
    for (const detail of [null, { width: 160, height: 192 }, { width: 80, height: 100 },
        { complete: false, width: 80, height: 96 }, 'throws']) {
        const f = renderer();
        f.art.setTileTransform(() => { if (detail === 'throws') throw new Error('unavailable'); return detail; });
        assert.equal(f.art.draw(f.canvas, { texture: 'player', layers: [
            { sx: 4, sy: 5, w: 20, h: 24, ox: 2, oy: 3, ymax: 28 }
        ] }), true);
        assert.equal(f.draws[0].args[0], f.source);
        assert.deepEqual(f.draws[0].args.slice(1), [4, 5, 20, 24, 2, 3, 20, 24]);
    }
});

test('sprite voxel consumers can explicitly bypass image and tile replacements', () => {
    const f=renderer();
    f.art.setImageTransform(()=>{throw new Error('Must preserve original atlas');});
    f.art.setTileTransform(()=>{throw new Error('Must preserve original pixels');});
    assert.equal(f.art.drawNative(f.canvas,{texture:'main',layers:[{sx:0,sy:0,w:32,h:32,ox:0,oy:0,ymax:32}]}),true);
    assert.equal(f.draws[0].args[0],f.source);assert.equal(f.draws[0].smoothing,false);
});

test('portrait resolver matches canonical rectangles and respects pack and atlas identity', () => {
    const modules = { jquery: Object.assign(() => ({ on() {} }), { extend: Object.assign }) };
    const document = { getElementById: id => ({ id }) };
    function load(name) {
        let result;
        vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
            window: {}, document, assert, define(deps, factory) { result = factory(...deps.map(dep => modules[dep])); }
        });
        modules['./' + name] = result;
    }
    for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-main', 'tileinfo-player',
        'tileinfo-dngn', 'environment-art', 'environment-materials', 'terrain-materials', 'environment-sprites']) load(name);
    let transform, illustrated = true;
    for (const name of ['image-grade', 'atlas-materials']) modules[name] = { create: () => ({}) };
    modules['atlas-sprites'] = { create: () => ({ tile: (sheet, region, source) => ({ sheet, region, source }) }) };
    modules['./native-tile-art'] = { setImageTransform() {}, setTileTransform(value) { transform = value; } };
    modules['texture-pack'] = { illustrated: () => illustrated };
    const requested = [];
    modules['deferred-images'] = { create: () => ({ request(image) { requested.push(image.id); return image; } }) };
    load('tile-art-direction');
    const source = {};
    for (const region of modules['./environment-sprites'].player) {
        const layer = { sx: region.x, sy: region.y, w: region.w, h: region.h };
        const result = transform('player', source, layer);
        assert.equal(result.region.tile, region.tile, 'canonical rectangle is unique');
        assert.equal(result.source, region.preserveAlpha ? source : null);
        assert.equal(transform('main', source, layer), null);
    }
    assert.equal(transform('player', source, { sx: -1, sy: -1, w: 32, h: 32 }), null);
    illustrated = false;
    const first = modules['./environment-sprites'].player[0];
    assert.equal(transform('player', source, { sx: first.x, sy: first.y, w: first.w, h: first.h }), null);
    requested.length = 0;
    const direction = modules['./tile-art-direction'], dungeon = modules['./tileinfo-dngn'];
    direction.tile('floor', dungeon.FLOOR_GREY_DIRT); direction.requestSheet('illustrated_materials');
    assert.equal(direction.image('player', source), source); assert.equal(requested.length, 0, 'Classic never activates optional sheets');
    illustrated = true;
    direction.tile('floor', dungeon.FLOOR_GREY_DIRT);
    assert.deepEqual(requested, ['illustrated_materials']); requested.length = 0;
    direction.tile('floor', dungeon.FLOOR_GRASS);
    assert.deepEqual(requested, ['illustrated_wilds']); requested.length = 0;
    direction.tile('player', modules['./tileinfo-player'].BASE_ELF);
    direction.tile('main', 0); direction.tile('feat', dungeon.DNGN_UNSEEN);
    assert.equal(requested.length, 0, 'Unconfigured and unseen tiles request no artwork');
});
