/* Real canvas sampling, old native-size output and the actual ground adapter. */
module.exports = async function groundResolutionChecks() {
    const modules = window.artModules, core = modules['terrain-surface'], baseline = modules['terrain-surface-before'];
    const catalog = modules['./environment-art'], dngn = modules['./tileinfo-dngn'];
    function check(value, message) { if (!value) throw new Error(message); }
    function pixels(image) { return image.getContext('2d').getImageData(0, 0, image.width, image.height).data; }
    function same(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
    const materials = catalog.ground.entries.map((entry, cell) => ({ key: 'wilds:' + cell, label: entry.label,
        image: document.getElementById(catalog.ground.id), shade: entry.shade,
        rect: { x: cell % 3 * 512, y: Math.floor(cell / 3) * 512, w: 512, h: 512 } }));
    const stone = modules['./terrain-materials'].floor;
    for (let cell = 0; cell < 3; cell++) {
        const region = stone.find(entry => Math.floor(entry.material.x / 512) === cell);
        materials.push({ key: 'stone:' + cell, label: ['Stone', 'Moss', 'Pebble'][cell], shade: region.shade,
            image: document.getElementById('illustrated_materials'), rect: { x: cell * 512, y: 0, w: 512, h: 512 } });
    }
    const painter = core.create(), before = baseline.create(), detail = [];
    const section = document.createElement('section'); section.id = 'ground-resolution';
    section.innerHTML = '<h2>Painted ground · retained source detail</h2><p>Existing 32-pixel preparation and scale-aware preparation, both displayed at 128 pixels. Same source images.</p>'
        + '<table><thead><tr><th>Material</th><th>Previous</th><th>Scale-aware</th></tr></thead><tbody></tbody></table>';
    document.querySelector('main').append(section);
    let nativeComparisons = 0;
    for (let index = 0; index < materials.length; index++) {
        const own = materials[index], other = materials[(index + 1) % materials.length];
        for (const neighbours of [[], [own, own, other, own, own, other, own, own, other]]) {
            for (const [x, y] of [[0, 0], [-2, 3], [5, -1]]) {
                check(same(pixels(painter.tile(own, neighbours, x, y, 32)), pixels(before.tile(own, neighbours, x, y))),
                    own.label + ' changed native-size pixels'); nativeComparisons++;
            }
        }
        const old = before.tile(own, [], 1, 2), coldStart = performance.now();
        const high = painter.tile(own, [], 1, 2, 128), cold128Ms = performance.now() - coldStart;
        const enlarged = document.createElement('canvas'); enlarged.width = enlarged.height = 128;
        const ctx = enlarged.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(old, 0, 0, 128, 128);
        const a = pixels(enlarged), b = pixels(high); let changed = 0, retainedBlocks = 0;
        for (let n = 0; n < a.length; n += 4) if ([0, 1, 2].some(c => a[n + c] !== b[n + c])) changed++;
        for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
            let varied = false;
            for (let oy = 0; oy < 4; oy++) for (let ox = 0; ox < 4; ox++)
                for (let c = 0; c < 3; c++) if (b[((y + oy) * 128 + x + ox) * 4 + c] !== b[(y * 128 + x) * 4 + c]) varied = true;
            if (varied) retainedBlocks++;
        }
        check(changed > 8000 && retainedBlocks > 800, own.label + ' did not retain source detail');
        detail.push({ material: own.label, changedPixels: changed, detailedFourPixelBlocks: retainedBlocks, cold128Ms });
        const row = document.createElement('tr'), label = document.createElement('th'); label.textContent = own.label; row.append(label);
        for (const image of [enlarged, high]) { const td = document.createElement('td'); td.append(image.cloneNode());
            td.firstChild.getContext('2d').drawImage(image, 0, 0); row.append(td); }
        section.querySelector('tbody').append(row);
    }
    const first = materials[0];
    const sourceCanvas = document.createElement('canvas'); sourceCanvas.width = sourceCanvas.height = 32;
    const sourceContext = sourceCanvas.getContext('2d'); sourceContext.fillStyle = '#ff0000'; sourceContext.fillRect(0, 0, 32, 32);
    const canvasMaterial = { key: 'canvas-source', image: sourceCanvas, rect: { x: 0, y: 0, w: 32, h: 32 } };
    const originalCanvas = painter.tile(canvasMaterial, [], 0, 0, 32); check(Boolean(originalCanvas), 'Populated Canvas source was rejected');
    const replacement = document.createElement('canvas'); replacement.width = replacement.height = 32;
    replacement.getContext('2d').fillStyle = '#0000ff'; replacement.getContext('2d').fillRect(0, 0, 32, 32);
    canvasMaterial.image = replacement;
    const replacedCanvas = painter.tile(canvasMaterial, [], 0, 0, 32);
    check(!same(pixels(originalCanvas), pixels(replacedCanvas)), 'Same-size replacement Canvas reused stale pixels');
    replacement.getContext('2d').fillStyle = '#00ff00'; replacement.getContext('2d').fillRect(0, 0, 32, 32);
    canvasMaterial.revision = 1;
    const revisedCanvas = painter.tile(canvasMaterial, [], 0, 0, 32);
    check(!same(pixels(replacedCanvas), pixels(revisedCanvas)), 'Explicit Canvas revision reused stale pixels');
    check(painter.tile(canvasMaterial, [], 0, 0, 32) === revisedCanvas, 'Immutable Canvas reuse missed its cache');
    const sizes = [16, 32, 33, 48, 64, 65, 96, 128, 500].map(requested => ({ requested,
        actual: painter.tile(first, [], -1, 2, requested).width }));
    check(sizes.map(row => row.actual).join() === '32,32,64,64,64,128,128,128,128', 'Incorrect resolution tiers');
    const warm = painter.tile(first, [], -1, 2, 128), start = performance.now();
    for (let n = 0; n < 1000; n++) check(painter.tile(first, [], -1, 2, 128) === warm, 'Warm tile was recomputed');
    const warm1000Ms = performance.now() - start;
    const previous = before.tile(first, [], -1, 2), previousStart = performance.now();
    for (let n = 0; n < 1000; n++) check(before.tile(first, [], -1, 2) === previous, 'Baseline cache was not warm');
    const previousWarm1000Ms = performance.now() - previousStart;
    check(painter.tile(first, [], -1, 2, 128) === painter.tile(first, [], -5, 6, 128), 'High-resolution world period changed');
    async function flat(key, colour) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = colour; ctx.fillRect(0, 0, 32, 32);
        const image = new Image(); image.src = canvas.toDataURL(); await image.decode();
        return { key, image, rect: { x: 0, y: 0, w: 32, h: 32 } };
    }
    const green = await flat('flat-green', '#304820'), sand = await flat('flat-sand', '#b0a080'), seams = [];
    for (const dimension of [32, 64, 128]) {
        const scale = dimension / 32, right = Array(9).fill(green), left = Array(9).fill(sand);
        right[5] = sand; left[3] = green;
        const a = pixels(painter.tile(green, right, 0, 0, dimension)), b = pixels(painter.tile(sand, left, 1, 0, dimension));
        const plain = pixels(painter.tile(green, [], 0, 0, dimension)); let sharedEdgeDifference = 0;
        for (let y = 10 * scale; y < 22 * scale; y++) for (let c = 0; c < 3; c++) {
            sharedEdgeDifference = Math.max(sharedEdgeDifference, Math.abs(a[(y * dimension + dimension - 1) * 4 + c] - b[y * dimension * 4 + c]));
            for (let x = 10 * scale; x < 22 * scale; x++)
                check(a[(y * dimension + x) * 4 + c] === plain[(y * dimension + x) * 4 + c], 'Feathering consumed a material centre');
        }
        check(sharedEdgeDifference <= 2, 'Scaled material transition developed a seam');
        seams.push({ dimension, sharedEdgeDifference });
    }
    const tileBudget = 3 * 128 * 128 * 4, surfaceBudget = 2 * 512 * 512 * 4;
    const bounded = core.create({ cacheBytes: tileBudget, surfaceBytes: surfaceBudget }); let peakTiles = 0, peakSurfaces = 0;
    for (let n = 0; n < 54; n++) {
        bounded.tile(materials[Math.floor(n / 6) % materials.length], [], n, Math.floor(n / 4), 128);
        const stats = bounded.cacheStats(); peakTiles = Math.max(peakTiles, stats.tileBytes); peakSurfaces = Math.max(peakSurfaces, stats.surfaceBytes);
        check(stats.tileBytes <= tileBudget && stats.surfaceBytes <= surfaceBudget && stats.tiles <= 3 && stats.surfaces <= 2, 'Cache exceeded its byte budget');
    }
    check(same(pixels(bounded.tile(first, [], 0, 0, 128)), pixels(painter.tile(first, [], 0, 0, 128))), 'Evicted surface changed pixels');
    const mixed = [first, materials[1], first, materials[1], first, materials[1], first, materials[1], first];
    const restricted = core.create({ surfaceBytes: 512 * 512 * 4 });
    check(same(pixels(restricted.tile(first, mixed, 0, 0, 128)), pixels(painter.tile(first, mixed, 0, 0, 128))),
        'Eviction while gathering neighbours changed the mixed tile');
    bounded.clear(); check(Object.values(bounded.cacheStats()).every(value => value === 0), 'Clear retained cached state');
    const noCache = core.create({ cacheBytes: 0, surfaceBytes: 0 });
    check(Boolean(noCache.tile(first, [], 0, 0, 128)) && noCache.cacheStats().tileBytes === 0
        && noCache.cacheStats().surfaceBytes === 0, 'Disabled retention failed to draw');
    check(painter.tile(first, [], 0.5, 0, 128) === null
        && painter.tile({ ...first, image: null }, [], 0, 0, 128) === null
        && painter.tile({ ...first, rect: { x: 99999, y: 0, w: 32, h: 32 } }, [], 0, 0, 128) === null, 'Invalid input did not retain fallback');
    const unchanged = painter.tile(first, [], 0, 0, 128), darker = painter.tile({ ...first, shade: first.shade + 0.1 }, [], 0, 0, 128);
    check(darker !== unchanged && !same(pixels(unchanged), pixels(darker)), 'Changed treatment reused stale pixels');
    check(painter.tile(first, [], 0, 0, 128) === unchanged, 'Restoring treatment lost a valid cached result');
    const pack = modules['texture-pack'], map = modules['./map_knowledge'], adapter = modules['./environment-ground'];
    pack.select('illustrated'); map.clear();
    map.merge([{ x: 10, y: 10, t: { bg: dngn.FLOOR_GRASS } }]);
    const adapterSizes = [];
    for (const dimension of [16, 32, 48, 64, 96, 128, 256]) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = dimension;
        const ctx = canvas.getContext('2d'), draw = ctx.drawImage.bind(ctx); let sourceSize;
        ctx.drawImage = (source, ...args) => { sourceSize = source.width; return draw(source, ...args); };
        check(adapter.draw({ ctx, scaled_size: () => ({ width: dimension, height: dimension }) }, dngn.FLOOR_GRASS, 0, 0, 10, 10), 'Actual adapter failed to draw');
        adapterSizes.push({ dimension, sourceSize });
    }
    check(adapterSizes.map(row => row.sourceSize).join() === '32,32,64,64,128,128,128', 'Adapter ignored backing dimensions');
    const requests = [], direction = modules['./tile-art-direction'], requestSheet = direction.requestSheet;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const view = { ctx: canvas.getContext('2d'), scaled_size: () => ({ width: 128, height: 128 }) };
    try {
        direction.requestSheet = id => { requests.push(id); return requestSheet(id); };
        map.clear(); map.merge([{ x: 10, y: 10, t: { bg: dngn.FLOOR_GREY_DIRT } },
            { x: 11, y: 10, t: { bg: { value: dngn.FLOOR_GRASS, UNSEEN: true } } }]);
        check(adapter.draw(view, dngn.FLOOR_GREY_DIRT, 0, 0, 10, 10), 'Known ground failed'); const hidden = pixels(canvas);
        map.merge([{ x: 11, y: 10, t: { bg: { value: dngn.FLOOR_ICE, UNSEEN: true } } }]);
        adapter.draw(view, dngn.FLOOR_GREY_DIRT, 0, 0, 10, 10);
        check(same(hidden, pixels(canvas)) && requests.every(id => id === 'illustrated_materials'), 'Hidden neighbour affected pixels or requested its sheet');
        pack.select('classic'); check(!adapter.draw(view, dngn.FLOOR_GREY_DIRT, 0, 0, 10, 10), 'Classic opted into painted ground');
        pack.select('illustrated'); map.merge([{ x: 10, y: 10, t: { bg: { value: dngn.FLOOR_GREY_DIRT, UNSEEN: true } } }]);
        check(!adapter.draw(view, dngn.FLOOR_GREY_DIRT, 0, 0, 10, 10), 'Unseen ground opted into painting');
    } finally { direction.requestSheet = requestSheet; }
    return { nativeComparisons, detail, sizes, adapterSizes, seams, canvasIdentity: true, canvasRevision: true,
        warm1000Ms, previousWarm1000Ms, peakTiles, peakSurfaces,
        defaultCache: painter.cacheStats(), hiddenRequests: [...new Set(requests)], nativeEngine: false };
};
