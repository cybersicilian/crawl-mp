const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
test('inventory/portrait art shares an injected transform while retaining native layer geometry', () => {
    let art;
    const source = { complete: true, naturalWidth: 64, naturalHeight: 64 }, graded = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/native-tile-art.js'), 'utf8'), {
        document: { getElementById: () => source }, define(deps, factory) { art = factory(() => ({ on() {} })); }
    });
    const calls = [];
    const context = { clearRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
        drawImage: (...args) => calls.push(args) };
    const canvas = { width: 32, height: 32, getContext: () => context };
    const item = { texture: 'player', layers: [{ sx: 4, sy: 5, w: 20, h: 24, ox: 2, oy: 3, ymax: 28 }] };
    assert.equal(art.draw(canvas, item), true); assert.equal(calls[0][0], source);
    art.setImageTransform((texture, image) => { assert.equal(texture, 'player'); assert.equal(image, source); return graded; });
    assert.equal(art.draw(canvas, item), true); assert.equal(calls[1][0], graded);
    assert.deepEqual(calls[1].slice(1), calls[0].slice(1), 'grading cannot alter atlas coordinates or clipping');
});
