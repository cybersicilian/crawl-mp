/* Compare semantic feature cues in both detailed sources and composed atlas. */
module.exports = function thresholdArtChecks() {
    const m = window.artModules, art = m['./tile-art-direction'], tiles = m['./tileinfo-dngn'];
    const catalog = m['./environment-art'].thresholds, regions = m['./environment-sprites'].dungeon.filter(r => r.sheet === catalog.id);
    const sheet = document.getElementById(catalog.id), raw = document.getElementById('feat'), pack = m['texture-pack'];
    function check(value, label) { if (!value) throw new Error(label); }
    function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function pixels(source) {
        const c = canvas(source.naturalWidth || source.width, source.naturalHeight || source.height);
        c.getContext('2d').drawImage(source, 0, 0); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    }
    function cues(data, width, height, amberFloor = 230) {
        let green = 0, amber = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const n = (y * width + x) * 4, r = data[n], g = data[n + 1], b = data[n + 2];
            if (data[n + 3] < 128) continue;
            if (g > 100 && g > r * 1.4 && g > b * 1.4) green++;
            if (y > height * .32 && y < height * .58 && x > width * .15 && x < width * .85
                && r > amberFloor && g > 100 && g < r * .9 && b < 120) amber++;
        }
        return { green, amber };
    }
    check(sheet.naturalWidth === catalog.width && sheet.naturalHeight === catalog.height, 'threshold sheet dimensions');
    const nativeBefore = pixels(raw), source = pixels(sheet), width = raw.naturalWidth;
    sheet.id += '_held';
    check(!art.tile('feat', tiles.DNGN_RUNED_DOOR) && art.tile('feat', tiles.DNGN_CLOSED_DOOR), 'missing threshold sheet preserves other art');
    const before = pixels(art.image('feat', raw)); sheet.id = catalog.id;
    const composed = art.image('feat', raw), after = pixels(composed), allowed = new Uint8Array(width * raw.naturalHeight);
    for (const region of regions) for (let y = region.y; y < region.y + region.h; y++)
        allowed.fill(1, y * width + region.x, y * width + region.x + region.w);
    let changed = 0, outsideChanges = 0;
    for (let n = 0; n < allowed.length; n++) if ([0, 1, 2, 3].some(c => before[n * 4 + c] !== after[n * 4 + c])) {
        if (allowed[n]) changed++; else outsideChanges++;
    }
    check(changed > 0 && outsideChanges === 0, 'only mapped threshold rectangles change in composed atlas');
    check(art.image('feat', raw) === composed, 'stable multischeet feature-atlas cache');
    const ordinaryCatalog = m['./environment-art'].features, ordinarySheet = document.getElementById(ordinaryCatalog.id);
    const ordinaryRegions = m['./environment-sprites'].dungeon.filter(r => r.sheet === ordinaryCatalog.id);
    ordinarySheet.id += '_held'; const withoutOrdinary = pixels(art.image('feat', raw)); ordinarySheet.id = ordinaryCatalog.id;
    const restored = art.image('feat', raw), ordinaryMask = new Uint8Array(allowed.length);
    for (const region of ordinaryRegions) for (let y = region.y; y < region.y + region.h; y++)
        ordinaryMask.fill(1, y * width + region.x, y * width + region.x + region.w);
    let ordinaryChanges = 0, ordinaryOutsideChanges = 0;
    for (let n = 0; n < ordinaryMask.length; n++) if ([0, 1, 2, 3].some(c => withoutOrdinary[n * 4 + c] !== after[n * 4 + c])) {
        if (ordinaryMask[n]) ordinaryChanges++; else ordinaryOutsideChanges++;
    }
    check(ordinaryChanges > 0 && ordinaryOutsideChanges === 0, 'ordinary feature atlas artwork composes independently');
    check(pixels(restored).every((value, index) => value === after[index]), 'all feature groups restore exactly');
    const ordinary = tiles.get_tile_info(tiles.DNGN_CLOSED_DOOR), control = canvas(ordinary.ex - ordinary.sx, ordinary.ey - ordinary.sy);
    control.getContext('2d').drawImage(composed, ordinary.sx, ordinary.sy, control.width, control.height, 0, 0, control.width, control.height);
    const ordinaryDoorCues = cues(pixels(control), control.width, control.height, 180);
    const entries = [], hashes = new Set();
    for (const entry of catalog.entries) {
        const index = tiles[entry.names[0]], detail = art.tile('feat', index), region = regions.find(r => r.tile === index), rect = entry.sprite;
        check(detail && detail.width === region.w * 4 && detail.height === region.h * 4, 'threshold fourfold source');
        let left = rect.w, top = rect.h, right = 0, bottom = 0;
        for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
            if (source[((rect.y + y) * catalog.width + rect.x + x) * 4 + 3] <= 12) continue;
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
        const gutter = Math.min(left, top, rect.w - right, rect.h - bottom); check(gutter >= 8, 'complete isolated threshold crop');
        const atlasTile = canvas(region.w, region.h);
        atlasTile.getContext('2d').drawImage(composed, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
        const atlasPixels = pixels(atlasTile), detailedPixels = pixels(detail);
        const atlasCues = cues(atlasPixels, region.w, region.h, 180), detailCues = cues(detailedPixels, detail.width, detail.height);
        if (entry.names[0].includes('SEALED')) check(atlasCues.green > 3 && detailCues.green > 20, 'green seal is visible in atlas and detailed source');
        if (entry.names[0] === 'DNGN_RUNED_DOOR') check(atlasCues.amber >= ordinaryDoorCues.amber + 2 && detailCues.amber > 15,
            'amber rune band contrasts with ordinary door at atlas size: ' + JSON.stringify({ atlasCues, detailCues, ordinaryDoorCues }));
        let hash = 2166136261; for (const value of detailedPixels) hash = Math.imul(hash ^ value, 16777619) >>> 0;
        const signature = detail.width + ':' + detail.height + ':' + hash; check(!hashes.has(signature), 'feature states must retain distinct artwork'); hashes.add(signature);
        entries.push({ label: entry.label, gutter, sourceWidth: detail.width, sourceHeight: detail.height, atlasCues, detailCues });
    }
    check(pixels(raw).every((v, i) => v === nativeBefore[i]), 'native feature atlas immutable');
    for (const name of ['DNGN_RUNED_CLEAR_DOOR', 'DNGN_SEALED_CLEAR_DOOR', 'DNGN_GATE_RUNED_LEFT', 'DNGN_GATE_SEALED_LEFT',
        'DNGN_OPEN_DOOR_CRYPT', 'DNGN_ZOT_STAIRS_UP', 'DNGN_STONE_ARCH_HELL']) check(!art.tile('feat', tiles[name]), 'independent specialised feature: ' + name);
    pack.select('classic'); check(art.image('feat', raw) === raw && !art.tile('feat', tiles.DNGN_RUNED_DOOR), 'Classic restores native feature states'); pack.select('illustrated');
    return { passed: true, changed, outsideChanges, ordinaryChanges, ordinaryOutsideChanges, entries, ordinaryDoorCues, distinctStates: true, nativeSourceImmutable: true,
        detailedAndAtlasCues: true, missingSheetIsolation: true, classicNative: true };
};
