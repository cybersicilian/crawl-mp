const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(name) {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static', name + '.js'), 'utf8'), {
        define(deps, factory) { result = factory(); }
    }); return result;
}
const routes = load('route-plan');
const normalize = value => JSON.parse(JSON.stringify(value));
const start = { x: 0, y: 0 }, end = { x: 3, y: 0 };
const open = point => point.x >= 0 && point.y >= 0 && point.x < 8 && point.y < 8;
assert.equal(routes.route(start, end, open).length, 3);
const around = routes.route(start, end, point => open(point) && !(point.x === 1 && point.y < 2));
assert(around.length > 3, 'Known obstacles route around rather than through walls');
assert.equal(routes.route(start, end, open, 2), null, 'Budget bounds the entire route');
assert.equal(routes.route(start, { x: 1, y: 1 }, point => routes.equal(point, { x: 1, y: 1 })), null,
    'Diagonal routes cannot squeeze through two blocked cardinal neighbours');
assert.equal(routes.route(start, { x: 99, y: 99 }, open), null);
assert.equal(routes.route(start, { x: NaN, y: 0 }, open), null);
assert.deepEqual(normalize(routes.route(start, start, open)), []);
const chunks = load('chunked-view'), view = { x: 0, y: 0, cols: 64, rows: 48 };
const single = chunks.plan(view, [{ x: 20, y: 20 }], 3);
assert(single.rectangles.length < 8, 'Localized changes do not damage the full viewport');
assert(single.includes(18, 18), 'Overlap sources outside the changed cell remain eligible');
assert(!single.includes(60, 40), 'Unrelated chunks are skipped');
const seam = chunks.plan(view, [{ x: 7, y: 7 }, { x: 8, y: 8 }], 1);
assert.equal(new Set(seam.rectangles.map(rect => rect.left + ',' + rect.top)).size, seam.rectangles.length);
assert(seam.includes(9, 9) && seam.includes(6, 6));
const negative = chunks.plan({ x: -17, y: -17, cols: 12, rows: 12 }, [{ x: -8, y: -8 }], 2);
assert(negative.rectangles.length);
assert(negative.rectangles.every(rect => rect.left >= -17 && rect.top >= -17 && rect.right <= -5 && rect.bottom <= -5));
assert.equal(chunks.plan(view, [{ x: 300, y: 300 }], 3).rectangles.length, 0);
assert.equal(chunks.plan(view, [], 3).rectangles.length, 0);
console.log('Bounded routes, obstacles, diagonal corners, damage chunks, seams and negative coordinates passed.');
