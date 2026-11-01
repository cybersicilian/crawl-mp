/* Run against the actual cell renderer in the shared synthetic game fixture. */
module.exports = function creatureArtChecks() {
    const m = window.benchModules, art = m['./tile-art-direction'], pack = m['texture-pack'];
    const tiles = m['./tileinfo-player'], dungeon = m['./tileinfo-dngn'], icons = m['./tileinfo-icons'];
    const catalog = m['./environment-art'][window.creatureCatalogKey || 'creatures'];
    const regions = m['./environment-sprites'].player.filter(region => region.sheet === catalog.id);
    const sheet = document.getElementById(catalog.id), raw = document.getElementById('player');
    function check(value, message) { if (!value) throw new Error(message); }
    function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function pixels(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
    function copy(image) {
        const c = canvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
        c.getContext('2d').drawImage(image, 0, 0); return pixels(c);
    }
    check(sheet.naturalWidth === catalog.width && sheet.naturalHeight === catalog.height, 'sheet dimensions');
    const portrait = window.creaturePortraitFixture, expectedPortrait = canvas(portrait.frame.querySelector('canvas').width);
    check(m['./native-tile-art'].draw(expectedPortrait, portrait.art), 'fresh portrait draws');
    const mountedPixels = pixels(portrait.frame.querySelector('canvas')), expectedPixels = pixels(expectedPortrait);
    check(mountedPixels.every((v, i) => v === expectedPixels[i]), 'mounted portrait updates after deferred artwork loads');
    check(mountedPixels.some((v, i) => v !== portrait.before[i]), 'portrait was repainted with the loaded creature art');
    const sourcePixels = copy(sheet), gutters = [];
    for (let cell = 0; cell < catalog.entries.length; cell++) {
        const rect = catalog.entries[cell].sprite || { x: cell % catalog.columns * catalog.cell,
            y: Math.floor(cell / catalog.columns) * catalog.cell, w: catalog.cell, h: catalog.cell };
        let left = rect.w, top = rect.h, right = 0, bottom = 0;
        for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
            if (sourcePixels[((rect.y + y) * catalog.width + rect.x + x) * 4 + 3] <= 12) continue;
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
        const margin = Math.min(left, top, rect.w - right, rect.h - bottom);
        check(right > left && bottom > top, 'nonempty creature source');
        check(margin >= 16, 'sprite crosses cell boundary: ' + catalog.entries[cell].label);
        gutters.push({ label: catalog.entries[cell].label, minimumGutter: margin });
    }
    const sourceBefore = copy(raw);
    sheet.id += '_held'; const baseline = copy(art.image('player', raw)); sheet.id = catalog.id;
    const styled = copy(art.image('player', raw)), allowed = new Uint8Array(raw.naturalWidth * raw.naturalHeight);
    for (const region of regions) for (let y = region.y; y < region.y + region.h; y++)
        allowed.fill(1, y * raw.naturalWidth + region.x, y * raw.naturalWidth + region.x + region.w);
    let changed = 0, outsideChanges = 0;
    for (let n = 0; n < allowed.length; n++) {
        const different = [0, 1, 2, 3].some(c => baseline[n * 4 + c] !== styled[n * 4 + c]);
        if (different) { if (allowed[n]) changed++; else outsideChanges++; }
    }
    check(changed > 0 && outsideChanges === 0, 'creature atlas modifies only configured body rectangles');
    check(copy(raw).every((v, i) => v === sourceBefore[i]), 'native atlas remains immutable');
    const main = document.createElement('main'); document.body.prepend(main);
    main.innerHTML = '<h1>Painted dungeon creatures</h1><p>' + catalog.entries.length + ' authored creatures · real native cell renderer · controlled fixture</p>'
        + '<table><thead><tr><th>Creature</th><th>Native 96px</th><th>Illustrated 32px</th><th>Illustrated 96px</th>'
        + '<th>Illustrated 128px</th><th>Submerged 96px</th><th>Native markers 96px</th></tr></thead><tbody></tbody></table>';
    const body = main.querySelector('tbody'), results = [], signatures = new Set();
    function render(index, size, state = {}) {
        const c = canvas(size), renderer = new m['./cell_renderer'].DungeonCellRenderer();
        renderer.init(c); renderer.set_cell_size(size, size);
        const ctx = c.getContext('2d'), originalDraw = ctx.drawImage.bind(ctx), calls = [], drawnIcons = [];
        const detail = art.tile('player', index), drawIcon = renderer.draw_icon;
        renderer.draw_icon = function (i, ...args) { drawnIcons.push(i); return drawIcon.call(this, i, ...args); };
        ctx.drawImage = (...args) => { calls.push({ image: args[0], alpha: ctx.globalAlpha }); originalDraw(...args); };
        const entry = { x: 2, y: 2, mon: { id: 77, name: 'Fixture creature' }, t: {
            bg: { value: state.water ? dungeon.DNGN_SHALLOW_WATER : dungeon.FLOOR_GREY_DIRT,
                WATER: Boolean(state.water), CURSOR1: Boolean(state.markers) },
            fg: { value: tiles.MCACHE_START, PET: Boolean(state.markers), POISON: Boolean(state.markers) },
            doll: [[index, 32]], flv: { f: dungeon.FLOOR_GREY_DIRT, s: 0 }, trans: Boolean(state.trans)
        } };
        if (state.mcache) { delete entry.t.doll; entry.t.mcache = [[index, -2, -3]]; }
        renderer.do_render_cell(2, 2, 0, 0, entry);
        const detailDraws = detail ? calls.filter(call => call.image === detail) : [];
        return { canvas: c, detailDraws, drawnIcons, renderer, calls };
    }
    for (const entry of catalog.entries) {
        const index = tiles[entry.names[0]], info = tiles.get_tile_info(index), detail = art.tile('player', index);
        check(detail && detail.width === (info.ex - info.sx) * 4 && detail.height === (info.ey - info.sy) * 4, entry.label + ' detailed source');
        check(detail === art.tile('player', index), 'cached creature source');
        const portraitCanvas = canvas(128), portraitContext = portraitCanvas.getContext('2d');
        const portraitDraw = portraitContext.drawImage.bind(portraitContext); let portraitUsesDetail = false;
        portraitContext.drawImage = (...args) => { portraitUsesDetail ||= args[0] === detail; portraitDraw(...args); };
        check(m['./native-tile-art'].draw(portraitCanvas, { layers: [{ texture: 'player', sx: info.sx, sy: info.sy,
            w: info.ex - info.sx, h: info.ey - info.sy, ox: info.ox, oy: info.oy, ymax: 32 }] }), 'native portrait draws');
        check(portraitUsesDetail, 'portrait samples the exact creature variant');
        const high = pixels(detail), down = canvas(info.ex - info.sx, info.ey - info.sy), up = canvas(detail.width, detail.height);
        down.getContext('2d').drawImage(detail, 0, 0, down.width, down.height);
        up.getContext('2d').imageSmoothingEnabled = false;
        up.getContext('2d').drawImage(down, 0, 0, up.width, up.height);
        const low = pixels(up); let retainedPixels = 0, hash = 2166136261;
        for (let n = 0; n < high.length; n++) hash = Math.imul(hash ^ high[n], 16777619) >>> 0;
        const signature = detail.width + ':' + detail.height + ':' + hash;
        check(!signatures.has(signature), 'distinct creature artwork: ' + entry.label); signatures.add(signature);
        for (let n = 0; n < high.length; n += 4) if (high[n + 3] > 128
            && Math.abs(high[n] - low[n]) + Math.abs(high[n + 1] - low[n + 1]) + Math.abs(high[n + 2] - low[n + 2]) > 24) retainedPixels++;
        check(retainedPixels > 100, 'creature retains detail beyond native-size upscale');
        const row = document.createElement('tr'), label = document.createElement('th'); label.textContent = entry.label; row.append(label); body.append(row);
        for (const [size, classic, state] of [[96, true, {}], [32, false, {}], [96, false, {}], [128, false, {}],
            [96, false, { water: true }], [96, false, { markers: true }]]) {
            pack.select(classic ? 'classic' : 'illustrated');
            const result = render(index, size, state), td = document.createElement('td'); td.append(result.canvas); row.append(td);
            if (!classic) check(result.detailDraws.length === (state.water ? 2 : 1), 'native actor pass count');
            if (state.water) check(result.detailDraws[0].alpha === 1 && Math.abs(result.detailDraws[1].alpha - .3) < .001, 'submerged alpha passes');
            if (state.markers) {
                check([icons.FRIENDLY, icons.POISON, icons.CURSOR].every(i => result.drawnIcons.includes(i)), 'native semantic markers');
                check(result.calls.findIndex(call => call.image === document.getElementById('icons'))
                    > result.calls.findIndex(call => call.image === detail), 'markers remain above the creature');
            }
        }
        const transparent = render(index, 96, { water: true, trans: true });
        check(transparent.detailDraws[0].alpha === .5 && Math.abs(transparent.detailDraws[1].alpha - .1) < .001, 'native translucent water passes');
        results.push({ label: entry.label, width: detail.width, height: detail.height, retainedPixels, waterPasses: 2,
            markers: true, portraitUsesDetail });
    }
    const bat = render(tiles.MONS_BAT, 96, { mcache: true });
    check(bat.detailDraws.length === 1 && bat.renderer.current_left_overlap === -2 && bat.renderer.current_sy === -2, 'mcache offsets and overlap');
    for (const name of ['BASE_ELF', 'BASE_DWARF', 'MONS_HELL_RAT', 'MONS_RIVER_RAT', 'MONS_VAMPIRE_BAT', 'MONS_ANACONDA'])
        check(!art.tile('player', tiles[name]), 'native doll or special species: ' + name);
    check(!art.tile('feat', tiles.MONS_RAT) && !art.tile('icons', tiles.MONS_RAT), 'atlas identity is part of the lookup');
    const missing = { complete: true, naturalWidth: 0, naturalHeight: 0 };
    check(m['atlas-sprites'].create().tile(missing, regions[0]) === null, 'failed image fallback');
    pack.select('classic');
    check(!art.tile('player', tiles.MONS_RAT) && art.image('player', raw) === raw, 'Classic native restoration');
    pack.select('illustrated');
    check(art.image('icons', document.getElementById('icons')) === document.getElementById('icons'), 'native UI atlas identity');
    return { passed: true, nativeEngine: false, sourceImmutable: true, changed, outsideChanges, gutters, entries: results,
        mcachePreserved: true, nativeMarkersPreserved: true, classicNative: true, atlasLookupSeparated: true,
        deferredPortraitRefresh: true };
};
