/* Authored equipment with real native dolls, grips, offsets and submerged passes. */
module.exports = function equipmentArtChecks() {
    const m = window.benchModules, art = m['./tile-art-direction'], pack = m['texture-pack'];
    const tiles = m['./tileinfo-player'], dungeon = m['./tileinfo-dngn'], icons = m['./tileinfo-icons'];
    const catalog = m['./environment-art'][window.creatureCatalogKey || 'equipment'];
    const sheet = document.getElementById(catalog.id), raw = document.getElementById('player');
    const regions = m['./environment-sprites'].player.filter(r => r.sheet === catalog.id);
    const native = new Map(window.nativeEquipmentOffsets.map(entry => [entry.symbol, entry]));
    const twoHanded = new Set(window.nativeTwoHandedSymbols);
    function check(value, message) { if (!value) throw new Error(message); }
    function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function pixels(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
    function copy(image) {
        const c = canvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
        c.getContext('2d').drawImage(image, 0, 0); return pixels(c);
    }
    check(sheet.naturalWidth === catalog.width && sheet.naturalHeight === catalog.height, 'equipment sheet geometry');
    const rawPixels = copy(raw), sourcePixels = copy(sheet), margins = [], details = new Map(), sourceWidth = raw.naturalWidth;
    for (const entry of catalog.entries) {
        const rect = entry.sprite; let left = rect.w, top = rect.h, right = 0, bottom = 0;
        for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
            if (sourcePixels[((rect.y + y) * catalog.width + rect.x + x) * 4 + 3] <= 12) continue;
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
        const margin = Math.min(left, top, rect.w - right, rect.h - bottom);
        check(margin >= 1, 'isolated complete equipment crop: ' + entry.label); margins.push({ label: entry.label, margin });
        const index = tiles[entry.names[0]], info = tiles.get_tile_info(index), detail = art.tile('player', index);
        check(detail && detail.width === (info.ex - info.sx) * 4 && detail.height === (info.ey - info.sy) * 4, 'equipment source detail');
        details.set(index, detail);
    }
    for (let n = 0; n < 20; n++) for (const [index, detail] of details)
        check(art.tile('player', index) === detail, 'masked weapons and unmasked shields keep stable caches');
    sheet.id += '_held'; const baseline = copy(art.image('player', raw));
    check(!art.tile('player', tiles[catalog.entries[0].names[0]]) && art.tile('player', tiles.MONS_ORC), 'missing sheet keeps native gear and authored bodies');
    sheet.id = catalog.id;
    const composed = art.image('player', raw), styled = copy(composed), allowed = new Uint8Array(sourceWidth * raw.naturalHeight);
    for (const r of regions) for (let y = r.y; y < r.y + r.h; y++) allowed.fill(1, y * sourceWidth + r.x, y * sourceWidth + r.x + r.w);
    let changed = 0, outsideChanges = 0, preservedGripPixels = 0, authoredSilhouetteChanges = 0;
    const gripChecks = [];
    for (let n = 0; n < allowed.length; n++) if ([0, 1, 2, 3].some(c => baseline[n * 4 + c] !== styled[n * 4 + c])) {
        if (allowed[n]) changed++; else outsideChanges++;
    }
    check(changed > 0 && outsideChanges === 0, 'only configured equipment rectangles change');
    for (const region of regions) {
        const detail = details.get(region.tile), data = pixels(detail), band = region.preserveAlpha;
        let empty = 0, occupiedRows = 0;
        for (let y = 0; y < region.h; y++) {
            let rowNative = false, rowAuthored = false;
            for (let x = 0; x < region.w; x++) {
                const alpha = rawPixels[((region.y + y) * sourceWidth + region.x + x) * 4 + 3];
                if (band && y >= band.y && y < band.y + band.h && x >= band.x && x < band.x + band.w) {
                    if (alpha <= 12) {
                        check(styled[((region.y + y) * sourceWidth + region.x + x) * 4 + 3] === 0, 'atlas finger gap stays transparent');
                        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++)
                            check(data[((y * 4 + dy) * detail.width + x * 4 + dx) * 4 + 3] === 0, 'detailed finger gap stays transparent');
                        empty++; preservedGripPixels++;
                    } else {
                        rowNative = true;
                        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++)
                            rowAuthored = rowAuthored || data[((y * 4 + dy) * detail.width + x * 4 + dx) * 4 + 3] > 12;
                    }
                } else if (data[((y * 4 + 2) * detail.width + x * 4 + 2) * 4 + 3] !== alpha) authoredSilhouetteChanges++;
            }
            if (rowNative) { check(rowAuthored, 'authored shaft crosses the grip window: ' + region.tile + ' row ' + y); occupiedRows++; }
        }
        if (band) gripChecks.push({ tile: region.tile, nativeTransparentPixels: empty, retainedShaftRows: occupiedRows });
    }
    check((!regions.some(r => r.preserveAlpha) || preservedGripPixels > 0) && authoredSilhouetteChanges > 0,
        'only attachment windows constrain authored silhouettes');
    check(copy(raw).every((v, i) => v === rawPixels[i]), 'native atlas source immutable');
    const portrait = window.creaturePortraitFixture, fresh = canvas(portrait.frame.querySelector('canvas').width);
    check(m['./native-tile-art'].draw(fresh, portrait.art), 'fresh equipment portrait');
    const portraitPixels = pixels(portrait.frame.querySelector('canvas')), expected = pixels(fresh);
    check(portraitPixels.every((v, i) => v === expected[i]) && portraitPixels.some((v, i) => v !== portrait.before[i]), 'deferred equipment portrait refresh');
    const main = document.createElement('main'); document.body.prepend(main);
    main.innerHTML = '<h1>Steel, oak, and leather</h1><p>Authored held equipment · native grip windows and attachment offsets · controlled renderer fixture</p>'
        + '<table><thead><tr><th>Equipment</th><th>Native 96px</th><th>Illustrated 32px</th><th>Illustrated 128px</th>'
        + '<th>Orc 96px</th><th>Gnoll 96px</th><th>Goblin 96px</th><th>Submerged 96px</th></tr></thead><tbody></tbody></table>';
    const body = main.querySelector('tbody');
    function isolated(index, size) {
        const c = canvas(size), renderer = new m['./cell_renderer'].DungeonCellRenderer(); renderer.init(c); renderer.set_cell_size(size, size);
        renderer.draw_player(index, 0, 0); return c;
    }
    function render(symbol, entry, state = {}) {
        const offset = native.get(symbol), index = tiles[symbol], held = tiles[entry.names[0]], shield = entry.names[0].startsWith('HAND2_');
        const parts = [[index, 0, 0], [shield ? tiles.HAND1_SHORT_SWORD : held, offset.weapon.x, offset.weapon.y]];
        if (offset.shield && (shield || !twoHanded.has(entry.names[0])))
            parts.push([shield ? held : tiles.HAND2_BUCKLER, offset.shield.x, offset.shield.y]);
        const c = canvas(96), renderer = new m['./cell_renderer'].DungeonCellRenderer(); renderer.init(c); renderer.set_cell_size(96, 96);
        const draws = [], paint = renderer.draw_player, iconDraws = [], drawIcon = renderer.draw_icon;
        renderer.draw_player = function (i, x, y, ox, oy, ymax) { draws.push({ index: i, ox: ox || 0, oy: oy || 0, alpha: this.ctx.globalAlpha }); return paint.call(this, i, x, y, ox, oy, ymax); };
        renderer.draw_icon = function (i, ...args) { iconDraws.push(i); return drawIcon.call(this, i, ...args); };
        renderer.do_render_cell(2, 2, 0, 0, { x: 2, y: 2, mon: { id: 33, name: symbol }, t: {
            bg: { value: state.water ? dungeon.DNGN_SHALLOW_WATER : dungeon.FLOOR_GREY_DIRT, WATER: Boolean(state.water), CURSOR1: Boolean(state.markers) },
            fg: { value: tiles.MCACHE_START, POISON: Boolean(state.markers), PET: Boolean(state.markers) },
            mcache: parts, flv: { f: dungeon.FLOOR_GREY_DIRT, s: 0 }, trans: Boolean(state.trans)
        } });
        const passes = state.water ? 2 : 1; check(draws.length === parts.length * passes, 'native equipment pass count');
        for (let pass = 0; pass < passes; pass++) for (let i = 0; i < parts.length; i++) {
            const draw = draws[pass * parts.length + i]; check(JSON.stringify([draw.index, draw.ox, draw.oy]) === JSON.stringify(parts[i]), 'native equipment order and offsets');
            const alpha = state.water ? (pass === 0 ? state.trans ? .5 : 1 : state.trans ? .1 : .3) : 1;
            check(Math.abs(draw.alpha - alpha) < .001, 'native submerged equipment alpha');
        }
        if (state.markers) check([icons.FRIENDLY, icons.POISON, icons.CURSOR].every(i => iconDraws.includes(i)), 'native markers remain available');
        return c;
    }
    for (const entry of catalog.entries) {
        const index = tiles[entry.names[0]], row = document.createElement('tr'), label = document.createElement('th'); label.textContent = entry.label; row.append(label); body.append(row);
        pack.select('classic'); const original = isolated(index, 96); pack.select('illustrated');
        for (const c of [original, isolated(index, 32), isolated(index, 128), render('MONS_ORC', entry), render('MONS_GNOLL', entry),
            render('MONS_GOBLIN', entry), render('MONS_ORC', entry, { water: true })]) {
            const cell = document.createElement('td'); cell.append(c); row.append(cell);
        }
        render('MONS_ORC', entry, { water: true, trans: true }); render('MONS_GOBLIN', entry, { markers: true });
    }
    for (const name of ['HAND2_BUCKLER', 'HAND2_KITE_SHIELD', 'HAND2_TOWER_SHIELD']) {
        const seen = new Set();
        for (let n = 0; n < tiles.tile_count(tiles[name]); n++) {
            const frame = art.tile('player', tiles[name] + n); check(frame, 'ordinary shield variant is authored');
            let hash = 2166136261; for (const byte of pixels(frame)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
            const key = frame.width + ':' + frame.height + ':' + hash; check(!seen.has(key), 'shield variants must not collapse into one design'); seen.add(key);
        }
    }
    for (const name of ['HAND1_DAGGER_MAGIC', 'HAND1_SPEAR_MAGIC', 'HAND1_MORG', 'HAND2_KITE_SHIELD_GONG', 'HAND2_KITE_SHIELD_OF_RESISTANCE'])
        check(!art.tile('player', tiles[name]), 'enchanted or artefact identity: ' + name);
    check(art.image('icons', document.getElementById('icons')) === document.getElementById('icons'), 'native semantic icon atlas');
    pack.select('classic'); check(art.image('player', raw) === raw && !art.tile('player', tiles.HAND1_SHORT_SWORD), 'Classic restoration'); pack.select('illustrated');
    return { passed: true, nativeEngine: false, entries: catalog.entries.map(e => e.label), margins, changed, outsideChanges, preservedGripPixels,
        authoredSilhouetteChanges, gripChecks, nativeEquipmentOffsets: true, nativeSubmergedPasses: true, nativeMarkers: true,
        alternateShieldIdentity: true, nativeSourceImmutable: true, deferredPortraitRefresh: true, stableMixedMaskCache: true,
        nativeTwoHandedLayouts: true };
};
