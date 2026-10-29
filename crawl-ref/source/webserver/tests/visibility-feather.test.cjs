/* All local visibility configurations preserve pixels and reuse scene-independent masks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let feather, canvases = 0;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/visibility-feather.js'), 'utf8'), {
    define(deps, factory) { feather = factory(); },
    document: { createElement() {
        canvases++;
        const canvas = { getContext() { return {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData(image) { canvas.pixels = image.data; }
        }; } };
        return canvas;
    } }
});
function paint(scene, erase = false) {
    const images = [];
    const context = { save() {}, restore() {}, drawImage(canvas, ...rect) { images.push({ canvas, rect }); } };
    feather.paint(context, scene, (x, y) => ({ x, y, width: 1, height: 1 }), erase);
    assert.equal(context.globalCompositeOperation, erase ? 'destination-out' : undefined);
    return images;
}
let reads = 0;
function scene(bits, cx, cy) {
    return { cells: [{ x: cx, y: cy }], known(x, y) {
        reads++;
        const dx = x - cx, dy = y - cy;
        return dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1
            && Boolean(bits & (1 << ((dy + 1) * 3 + dx + 1)));
    } };
}
for (let bits = 0; bits < 512; bits++) {
    const cx = bits % 2 ? -117 : 203, cy = 41;
    const original = scene(bits, cx, cy), before = reads;
    const images = paint(original);
    assert.equal(reads - before, 9, 'Only nine world queries are needed for each cell');
    if (bits === 511) { assert.equal(images.length, 0); continue; }
    assert.equal(images.length, 1);
    const canvas = images[0].canvas;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const distance = feather.distance(cx + (x + .5) / 32, cy + (y + .5) / 32, original.known);
        const t = Math.min(1, distance / .8);
        const expected = new Uint8ClampedArray([(1 - t * t * (3 - 2 * t)) * 255])[0];
        const offset = (y * 32 + x) * 4;
        assert.deepEqual([...canvas.pixels.slice(offset, offset + 4)], [2, 4, 8, expected]);
    }
    const sameScene = reads;
    assert.equal(paint(original, true)[0].canvas, canvas);
    assert.equal(reads, sameScene, 'The second light/erasure pass reuses the scene preparation');
    assert.equal(paint(scene(bits, cx + 19, cy - 27))[0].canvas, canvas,
        'Camera movement and translated scenes reuse identical visibility masks');
}
assert.equal(canvases, 511, 'The complete cache is bounded by the finite visibility patterns');
const unknown = paint({ cells: [{ x: 4, y: 9 }] });
assert.deepEqual(unknown[0].rect, [4, 9, 1, 1]);
assert.equal(canvases, 511, 'The cells-only fallback shares the same pattern cache');
console.log('All 512 visibility patterns preserve exact pixels, world queries stay bounded, and masks survive scene/camera changes.');
