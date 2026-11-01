/* Full native actor composition using offsets extracted from tilemcache.cc. */
module.exports = function humanoidArtChecks() {
    const m = window.benchModules, art = m['./tile-art-direction'], pack = m['texture-pack'];
    const tiles = m['./tileinfo-player'], dungeon = m['./tileinfo-dngn'], icons = m['./tileinfo-icons'];
    const catalog = m['./environment-art'][window.creatureCatalogKey || 'humanoids'], sheet = document.getElementById(catalog.id);
    const regions = m['./environment-sprites'].player.filter(r => r.sheet === catalog.id);
    const native = new Map(window.nativeEquipmentOffsets.map(entry => [entry.symbol, entry]));
    function check(value, message) { if (!value) throw new Error(message); }
    function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function pixels(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
    function copy(image) {
        const c = canvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
        c.getContext('2d').drawImage(image, 0, 0); return pixels(c);
    }
    check(sheet.naturalWidth === catalog.width && sheet.naturalHeight === catalog.height, 'humanoid sheet dimensions');
    const source = copy(sheet), margins = [];
    for (const entry of catalog.entries) {
        const rect = entry.sprite; let left = rect.w, top = rect.h, right = 0, bottom = 0;
        for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
            if (source[((rect.y + y) * catalog.width + rect.x + x) * 4 + 3] <= 12) continue;
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
        const margin = Math.min(left, top, rect.w - right, rect.h - bottom);
        check(margin >= 1 && right > left && bottom > top, 'complete isolated crop: ' + entry.label);
        margins.push({ label: entry.label, margin });
    }
    const portrait = window.creaturePortraitFixture, fresh = canvas(portrait.frame.querySelector('canvas').width);
    check(m['./native-tile-art'].draw(fresh, portrait.art), 'fresh humanoid portrait');
    const portraitPixels = pixels(portrait.frame.querySelector('canvas')), expectedPortrait = pixels(fresh);
    check(portraitPixels.every((v, i) => v === expectedPortrait[i]), 'deferred humanoid portrait refresh');
    check(portraitPixels.some((v, i) => v !== portrait.before[i]), 'portrait uses loaded body');
    const raw = document.getElementById('player'), sourceBefore = copy(raw);
    sheet.id += '_held'; const baseline = copy(art.image('player', raw)); sheet.id = catalog.id;
    const composed = art.image('player', raw), styled = copy(composed), allowed = new Uint8Array(raw.naturalWidth * raw.naturalHeight);
    for (let n = 0; n < 1000; n++) check(art.image('player', raw) === composed, 'multi-sheet player atlas stays cached');
    for (const region of regions) for (let y = region.y; y < region.y + region.h; y++)
        allowed.fill(1, y * raw.naturalWidth + region.x, y * raw.naturalWidth + region.x + region.w);
    let changed = 0, outsideChanges = 0;
    for (let n = 0; n < allowed.length; n++) if ([0, 1, 2, 3].some(c => baseline[n * 4 + c] !== styled[n * 4 + c])) {
        if (allowed[n]) changed++; else outsideChanges++;
    }
    check(changed > 0 && outsideChanges === 0, 'only configured humanoid rectangles change');
    check(copy(raw).every((v, i) => v === sourceBefore[i]), 'native player atlas remains immutable');
    const main = document.createElement('main'); document.body.prepend(main);
    main.innerHTML = '<h1>' + (catalog.title || 'Inhabitants of the upper dungeon') + '</h1><p>' + catalog.entries.length + ' authored bodies · actual native weapon and shield offsets · controlled renderer fixture</p>'
        + '<table><thead><tr><th>Enemy</th><th>Native sword 96px</th><th>Body 32px</th><th>Body 128px</th><th>Sword 96px</th>'
        + '<th>Spear 96px</th><th>Shield 96px</th><th>Submerged 96px</th><th>Markers 96px</th></tr></thead><tbody></tbody></table>';
    const body = main.querySelector('tbody'), results = [];
    function render(symbol, size, state = {}) {
        const index = tiles[symbol], offsets = native.get(symbol), weapon = state.spear ? tiles.HAND1_SPEAR : tiles.HAND1_SHORT_SWORD;
        const parts = [[index, 0, 0]];
        if (!state.unarmed) parts.push([weapon, offsets.weapon.x, offsets.weapon.y]);
        if (state.shield && offsets.shield) parts.push([tiles.HAND2_BUCKLER, offsets.shield.x, offsets.shield.y]);
        const c = canvas(size), renderer = new m['./cell_renderer'].DungeonCellRenderer();
        renderer.init(c); renderer.set_cell_size(size, size);
        const ctx = c.getContext('2d'), originalDraw = ctx.drawImage.bind(ctx), calls = [], iconsDrawn = [], drawnParts = [];
        const detail = art.tile('player', index), drawIcon = renderer.draw_icon, drawPlayer = renderer.draw_player;
        renderer.draw_player = function (i, x, y, ox, oy, ymax) {
            drawnParts.push([i, ox || 0, oy || 0]); return drawPlayer.call(this, i, x, y, ox, oy, ymax);
        };
        renderer.draw_icon = function (i, ...args) { iconsDrawn.push(i); return drawIcon.call(this, i, ...args); };
        ctx.drawImage = (...args) => { calls.push({ image: args[0], alpha: ctx.globalAlpha }); originalDraw(...args); };
        renderer.do_render_cell(2, 2, 0, 0, { x: 2, y: 2, mon: { id: 13, name: symbol }, t: {
            bg: { value: state.water ? dungeon.DNGN_SHALLOW_WATER : dungeon.FLOOR_GREY_DIRT,
                WATER: Boolean(state.water), CURSOR1: Boolean(state.markers) },
            fg: { value: tiles.MCACHE_START, POISON: Boolean(state.markers), PET: Boolean(state.markers) },
            mcache: parts, flv: { f: dungeon.FLOOR_GREY_DIRT, s: 0 }, trans: Boolean(state.trans)
        } });
        const passCount = state.water ? 2 : 1;
        check(drawnParts.length === parts.length * passCount, 'native body/equipment pass count');
        for (let pass = 0; pass < passCount; pass++) for (let i = 0; i < parts.length; i++)
            check(JSON.stringify(drawnParts[pass * parts.length + i]) === JSON.stringify(parts[i]), 'native mcache order and offsets');
        if (detail) {
            const bodyDraws = calls.filter(call => call.image === detail);
            check(bodyDraws.length === passCount, 'authored body draws in every native pass');
            if (state.water) check(bodyDraws[0].alpha === (state.trans ? .5 : 1)
                && Math.abs(bodyDraws[1].alpha - (state.trans ? .1 : .3)) < .001, 'native submerged body alpha');
            if (state.markers) {
                check([icons.FRIENDLY, icons.POISON, icons.CURSOR].every(i => iconsDrawn.includes(i)), 'native markers');
                check(calls.findIndex(call => call.image === document.getElementById('icons'))
                    > calls.findIndex(call => call.image === detail), 'markers above the body');
            }
        }
        return c;
    }
    for (const entry of catalog.entries) {
        const symbol = entry.names[0], index = tiles[symbol], offsets = native.get(symbol), info = tiles.get_tile_info(index);
        const detail = art.tile('player', index);
        check(detail && detail.width === (info.ex - info.sx) * 4 && detail.height === (info.ey - info.sy) * 4, 'fourfold body source');
        const row = document.createElement('tr'), label = document.createElement('th'); label.textContent = entry.label; row.append(label); body.append(row);
        for (const [size, classic, state] of [[96, true, {}], [32, false, { unarmed: true }], [128, false, { unarmed: true }], [96, false, {}],
            [96, false, { spear: true }], [96, false, { shield: true }], [96, false, { water: true, shield: true }],
            [96, false, { markers: true, shield: true }]]) {
            pack.select(classic ? 'classic' : 'illustrated');
            const td = document.createElement('td');
            if (state.shield && !offsets.shield && !state.water && !state.markers) td.textContent = 'Native shield unavailable';
            else td.append(render(symbol, size, state));
            row.append(td);
        }
        render(symbol, 96, { water: true, trans: true, shield: true });
        const isolated = canvas(128), view = new m['./cell_renderer'].DungeonCellRenderer();
        view.init(isolated); view.set_cell_size(128, 128); view.draw_player(index, 0, 0);
        const bodyPixels = pixels(isolated), gx = (6.5 + offsets.weapon.x) * 4, gy = (17.5 + offsets.weapon.y) * 4;
        let nearestGrip = Infinity;
        for (let y = Math.max(0, Math.floor(gy - 20)); y < Math.min(128, gy + 20); y++)
            for (let x = Math.max(0, Math.floor(gx - 20)); x < Math.min(128, gx + 20); x++)
                if (bodyPixels[(y * 128 + x) * 4 + 3] > 64) nearestGrip = Math.min(nearestGrip, Math.hypot(x + .5 - gx, y + .5 - gy) / 4);
        check(nearestGrip <= .75, 'body contacts the native sword grip: ' + entry.label);
        results.push({ label: entry.label, symbol, source: [detail.width, detail.height], renderedTileSizes: [32, 96, 128], offsets, nearestGrip });
    }
    for (const name of ['BASE_ELF', 'BASE_DWARF', 'MONS_FALLEN_ORC_KNIGHT', 'MONS_FALLEN_ORC_WARLORD', 'MONS_KOBOLD_BRIGAND']) {
        check(Number.isInteger(tiles[name]), 'native control symbol exists: ' + name);
        check(!art.tile('player', tiles[name]), 'independent native doll or special enemy: ' + name);
    }
    pack.select('classic');
    check(art.image('player', raw) === raw && !art.tile('player', tiles.MONS_ORC), 'Classic restoration');
    pack.select('illustrated');
    return { passed: true, nativeEngine: false, margins, entries: results, changed, outsideChanges, sourceImmutable: true,
        nativeEquipmentOffsets: true, nativeEquipmentOrder: true, nativeSubmergedPasses: true, nativeMarkers: true,
        deferredPortraitRefresh: true, cachedPlayerAtlas: true };
};
