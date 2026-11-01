/* Actual region painters and Premium terrain, with controlled visible lights. */
module.exports = function distortionDetailChecks() {
    const m = window.artModules, map = m['./map_knowledge'], enums = m['./enums'], dngn = m['./tileinfo-dngn'];
    const terrain = m['./premium-terrain'], regions = m['./premium-regions'], pack = m['texture-pack'];
    function check(value, message) { if (!value) throw new Error(message); }
    function pixels(image) { return image.getContext('2d').getImageData(0, 0, image.width, image.height).data; }
    function same(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
    let dimension = 128, lastWarp;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), draw = ctx.drawImage.bind(ctx); let draws = [];
    ctx.drawImage = (source, ...args) => { draws.push(source); return draw(source, ...args); };
    const renderer = Object.assign({ ctx, element: canvas, cell_width: 32, cell_height: 32, x_scale: 2, y_scale: 2,
        current_left_overlap: 0, current_sy: 0, view: { x: 8, y: 8 }, cols: 5, rows: 5, frame_time: 3000,
        scaled_size: () => ({ width: dimension, height: dimension }) }, m['./cell-renderer-textures']);
    m['./options'].get = name => name === 'tile_display_mode' ? 'tiles' : ['tile_realtime_anim', 'tile_misc_anim'].includes(name);
    m['visual-presentation'].animated = () => true;
    window.detailFlags.add('auras'); window.detailFlags.add('distortion'); window.detailLightsAt = () => [];
    window.jQuery(document).trigger('visual_presentation_changed');
    function set(index) {
        map.clear(); const cells = [];
        for (let y = 9; y <= 11; y++) for (let x = 9; x <= 11; x++) cells.push({ x, y,
            t: { bg: index, flv: { f: index, s: 0 }, halo: x === 10 && y === 10 ? enums.HALO_UMBRA_1 : 0 } });
        map.merge(cells);
    }
    function paint(previous = false) {
        draws = []; ctx.clearRect(0, 0, 128, 128);
        (previous ? window.previousRegionPainter : window.currentRegionPainter)(renderer, 10, 10, 0, 0);
        check(draws.length > 0, 'Region painter did not draw'); lastWarp = draws[0]; return lastWarp;
    }
    const section = document.createElement('section'); section.id = 'distortion-detail';
    section.innerHTML = '<h2>Magical ripples · preserved painted detail</h2><p>Previous native-raster distortion and scale-aware distortion. Same source artwork, field and world displacement.</p>'
        + '<table><thead><tr><th>Material</th><th>Previous</th><th>Preserved detail</th></tr></thead><tbody></tbody></table>';
    document.querySelector('main').append(section);
    pack.select('illustrated'); const detail = [];
    for (const [label, index] of [['Grass', dngn.FLOOR_GRASS], ['Leaf litter', dngn.FLOOR_GRASS_DARK],
        ['Mud', dngn.FLOOR_MUD], ['Stone', dngn.FLOOR_GREY_DIRT], ['Moss', dngn.FLOOR_MOSS], ['Pebble', dngn.FLOOR_PEBBLE_DARKGRAY]]) {
        check(typeof index === 'number', label + ' has no native tile'); set(index);
        const previous = paint(true), start = performance.now(), current = paint(), coldMs = performance.now() - start;
        check(previous.width === 32 && current.width === 128, label + ' lost its detailed warp raster');
        const data = pixels(current); let detailedBlocks = 0;
        for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
            let varied = false;
            for (let oy = 0; oy < 4; oy++) for (let ox = 0; ox < 4; ox++) for (let c = 0; c < 3; c++)
                if (data[((y + oy) * 128 + x + ox) * 4 + c] !== data[(y * 128 + x) * 4 + c]) varied = true;
            if (varied) detailedBlocks++;
        }
        check(detailedBlocks > 800, label + ' became a magnified native raster');
        check(paint() === current, 'Unchanged warp missed its cache'); detail.push({ material: label, detailedBlocks, coldMs });
        const row = document.createElement('tr'), th = document.createElement('th'); th.textContent = label; row.append(th);
        for (const image of [previous, current]) {
            const td = document.createElement('td'), preview = document.createElement('canvas'); preview.width = preview.height = 128;
            preview.getContext('2d').imageSmoothingEnabled = false; preview.getContext('2d').drawImage(image, 0, 0, 128, 128);
            td.style.cssText = 'padding:12px 20px;border:1px solid #70674e'; preview.style.cssText = 'width:128px;height:128px';
            td.append(preview); row.append(td);
        }
        section.querySelector('tbody').append(row);
    }
    pack.select('classic'); dimension = 32; set(dngn.FLOOR_GREY_DIRT);
    check(same(pixels(paint(true)), pixels(paint())), 'Native 32-pixel warp differs from captured prior implementation');
    pack.select('illustrated'); dimension = 128; set(dngn.FLOOR_GREY_DIRT);
    map.merge([{ x: 11, y: 10, t: { bg: { value: dngn.FLOOR_GRASS, UNSEEN: true }, halo: 0 } }]);
    const hidden = pixels(paint()).slice(); map.merge([{ x: 11, y: 10, t: { bg: { value: dngn.FLOOR_ICE, UNSEEN: true }, halo: 0 } }]);
    check(same(hidden, pixels(paint())), 'A hidden neighbour entered the detailed halo');
    set(dngn.FLOOR_GREY_DIRT); let strength = .1;
    window.detailLightsAt = (x, y) => x === 11 && y === 10 ? [{ x, y, radius: 4, strength, colour: [255, 70, 20] }] : [];
    const centre = terrain.frame(renderer, 10, 10), original = paint(); strength = .4;
    check(terrain.frame(renderer, 10, 10) === centre, 'Neighbour-only light changed the centre source');
    const neighbourChanged = paint(); check(neighbourChanged !== original, 'Neighbour-only light did not invalidate the warp');
    check(!same(pixels(original), pixels(neighbourChanged)), 'Visible changed neighbour did not contribute new boundary pixels');
    const pressureStart = performance.now(); let peakWarpBytes = 0, peakRasterBytes = 0;
    for (let phase = 0; phase < 280; phase++) {
        renderer.frame_time = phase * 100; strength = .1 + phase / 1000; paint();
        const stats = regions.cacheStats(); peakWarpBytes = Math.max(peakWarpBytes, stats.warps.bytes); peakRasterBytes = Math.max(peakRasterBytes, stats.rasters.bytes);
        check(stats.warps.bytes <= 16 * 1024 * 1024 && stats.rasters.bytes <= 8 * 1024 * 1024, 'Distortion cache exceeded its byte budget');
    }
    const pressureMs = performance.now() - pressureStart, retained = regions.cacheStats();
    check(retained.warps.entries < 280 && retained.rasters.entries < 280, 'Pressure did not exercise both evictions');
    regions.clear(); m['visual-presentation'].animated = () => false; paint();
    check(regions.cacheStats().warps.bytes === 0 && regions.cacheStats().rasters.bytes === 0, 'Disabled motion prepared a warp');
    m['visual-presentation'].animated = () => true; renderer.frame_time += 100; paint();
    window.jQuery(document).trigger('art_materials_ready');
    check(regions.cacheStats().warps.bytes === 0 && regions.cacheStats().rasters.bytes === 0, 'Artwork refresh retained stale warp pixels');
    map.clear();
    return { detail, native32Exact: true, hiddenInvariant: true, neighbourLightInvalidation: true,
        peakWarpBytes, peakRasterBytes, retained, pressureMs, reducedMotion: true, artRefreshClear: true, nativeEngine: false };
};
