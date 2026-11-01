/* Actual terrain adapters and canvas lighting, with controlled known lights. */
module.exports = function premiumDetailChecks() {
    const m = window.artModules, map = m['./map_knowledge'], dngn = m['./tileinfo-dngn'];
    const terrain = m['./premium-terrain'], before = m['./premium-terrain-before'], pack = m['texture-pack'];
    function check(value, message) { if (!value) throw new Error(message); }
    function pixels(image) { return image.getContext('2d').getImageData(0, 0, image.width, image.height).data; }
    function same(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
    let dimension = 128, stamp = 1000;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const renderer = Object.assign({ ctx: canvas.getContext('2d'), element: canvas, cell_width: 32, cell_height: 32,
        x_scale: 2, y_scale: 2, current_left_overlap: 0, current_sy: 0, view: {}, frame_time: stamp,
        scaled_size: () => ({ width: dimension, height: dimension }) }, m['./cell-renderer-textures']);
    function frame(x = 10, y = 10, previous = false) {
        renderer.frame_time = ++stamp; return (previous ? before : terrain).frame(renderer, x, y);
    }
    function set(index, extra = {}) {
        map.clear(); map.merge([{ x: 10, y: 10, t: { bg: index, flv: { f: index, s: 0 }, ...extra } }]);
    }
    const section = document.createElement('section'); section.id = 'premium-detail';
    section.innerHTML = '<h2>Painted ground through Premium lighting</h2><p>Same known warm light and source artwork. Previous 32-pixel shader versus separated lighting and pigment.</p>'
        + '<table style="border-collapse:collapse"><thead><tr><th>Material</th><th>Previous</th><th>Preserved detail</th></tr></thead><tbody></tbody></table>';
    document.querySelector('main').append(section);
    pack.select('illustrated'); const materials = m['./environment-art'].ground.entries.map(entry => [entry.label, dngn[entry.names[0]]]);
    materials.push(['Stone', dngn.FLOOR_GREY_DIRT], ['Moss', dngn.FLOOR_MOSS], ['Pebble', dngn.FLOOR_PEBBLE_DARKGRAY]);
    const detail = [];
    for (const [label, index] of materials) {
        set(index); const old = frame(10, 10, true), start = performance.now(), current = frame(), coldMs = performance.now() - start;
        check(old && current && old.image.width === 32 && current.image.width === 128, label + ' lost detailed source');
        check(current.pixels.length === 32 * 32 * 4, 'Legacy warp sample dimensions changed');
        const previous = document.createElement('canvas'); previous.width = previous.height = 128;
        const ctx = previous.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(old.image, 0, 0, 128, 128);
        const data = pixels(current.image); let detailedBlocks = 0;
        for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
            let changed = false;
            for (let oy = 0; oy < 4; oy++) for (let ox = 0; ox < 4; ox++)
                for (let c = 0; c < 3; c++) if (data[((y + oy) * 128 + x + ox) * 4 + c] !== data[(y * 128 + x) * 4 + c]) changed = true;
            if (changed) detailedBlocks++;
        }
        check(detailedBlocks > 800, label + ' retained insufficient detail through lighting');
        check(frame() === current, 'Unchanged high resolution frame was recomputed');
        detail.push({ material: label, sourceWidth: current.image.width, detailedBlocks, coldMs });
        const row = document.createElement('tr'), th = document.createElement('th'); th.textContent = label; row.append(th);
        for (const source of [previous, current.image]) {
            const td = document.createElement('td'), preview = document.createElement('canvas'); preview.width = preview.height = 128;
            td.style.cssText = 'padding:12px 20px;border:1px solid #70674e'; preview.style.cssText = 'width:128px;height:128px';
            preview.getContext('2d').drawImage(source, 0, 0); td.append(preview); row.append(td);
        }
        section.querySelector('tbody').append(row);
    }
    const sizes = [];
    for (dimension of [32, 48, 64, 96, 128, 256]) {
        renderer.frame_time = 10000; const result = terrain.frame(renderer, 10, 10);
        sizes.push({ requested: dimension, actual: result.image.width });
    }
    check(sizes.map(row => row.actual).join() === '32,64,64,128,128,128', 'Resize reused stale-resolution output');
    dimension = 128; set(dngn.FLOOR_GREY_DIRT);
    window.detailLightsAt = () => []; const unlit = pixels(frame().image).slice();
    window.detailLightsAt = (x, y) => [{ x: x - 1, y, radius: 4, strength: .3, colour: [255, 70, 20] }];
    const lit = pixels(frame().image).slice(); check(!same(unlit, lit), 'Detailed pigment ignored the light field');
    set(dngn.FLOOR_GREY_DIRT); map.merge([{ x: 11, y: 10, t: { bg: { value: dngn.FLOOR_GRASS, UNSEEN: true } } }]);
    const hidden = pixels(frame().image).slice(); map.merge([{ x: 11, y: 10, t: { bg: { value: dngn.FLOOR_ICE, UNSEEN: true } } }]);
    check(same(hidden, pixels(frame().image)), 'Hidden terrain changed Premium pigment or lighting');
    pack.select('classic'); const classic = [];
    for (const index of [dngn.FLOOR_GREY_DIRT, dngn.FLOOR_MOSS, dngn.WALL_STONE_GRAY, dngn.DNGN_SHALLOW_WATER]) {
        set(index); const original = frame(10, 10, true), result = frame();
        check(original && result && result.image.width === 32 && same(pixels(original.image), pixels(result.image)), 'Native Classic-pack Premium pixels changed');
        classic.push(index);
    }
    pack.select('illustrated'); set(dngn.FLOOR_GREY_DIRT);
    window.detailPremium = false; check(!terrain.draw(renderer, 10, 10, 0, 0, map.get(10, 10).t), 'Classic effects activated Premium drawing');
    window.detailPremium = true; dimension = 128;
    window.detailLightsAt = (x, y) => [{ x: x - .5, y, radius: 4, strength: .1 + x / 10000, colour: [255, 170, 90] }];
    map.clear(); map.merge(Array.from({ length: 280 }, (_, x) => ({ x, y: 0, t: { bg: dngn.FLOOR_GREY_DIRT, flv: { f: dngn.FLOOR_GREY_DIRT } } })));
    const initial = pixels(frame(0, 0).image).slice(); let peakBytes = 0;
    for (let x = 1; x < 280; x++) {
        check(Boolean(frame(x, 0)), 'Cache pressure stopped terrain rendering');
        const stats = terrain.cacheStats(); peakBytes = Math.max(peakBytes, stats.bytes);
        check(stats.bytes <= 16 * 1024 * 1024, 'Premium raster cache exceeded its byte budget');
    }
    const retained = terrain.cacheStats(); check(retained.entries < 280, 'Cache pressure did not exercise eviction');
    const descriptor = terrain.snapshot(renderer, 0, 0);
    check(descriptor && descriptor.width === 128 && terrain.cacheStats().bytes === retained.bytes
        && terrain.cacheStats().entries === retained.entries, 'Identity lookup resurrected an evicted image');
    check(same(initial, pixels(frame(0, 0).image)), 'Eviction changed a revisited tile');
    map.clear(); check(terrain.cacheStats().bytes === 0, 'Realm clear retained Premium raster data');
    return { detail, sizes, classic, peakBytes, retained, hiddenInvariant: true, lightResponse: true,
        legacyWarpDimensions: [32, 32], nativeEngine: false };
};
