/* Runs in the browser against the actual native texture drawing methods. */
module.exports = function detailedSpriteChecks() {
    const m = window.artModules, tiles = m['./tileinfo-dngn'], art = m['./tile-art-direction'];
    const catalog = m['./environment-art'], pack = m['texture-pack'];
    function check(value, message) { if (!value) throw new Error(message); }
    const sheet = document.getElementById(catalog.features.id);
    check(sheet.naturalWidth === catalog.features.width && sheet.naturalHeight === catalog.features.height, 'feature sheet geometry');
    const main = document.querySelector('main'), title = document.createElement('h2');
    title.textContent = 'Dungeon features · source detail at every zoom'; main.append(title);
    const table = document.createElement('table');
    table.id = 'detailed-feature-comparison';
    table.style.cssText = 'width:100%;border-collapse:collapse;color:#eee7d6;background:#1a211f';
    table.innerHTML = '<thead><tr><th>Feature</th><th>Native 96px</th><th>Illustrated 32px</th><th>Illustrated 96px</th><th>Illustrated 128px</th></tr></thead>';
    const body = document.createElement('tbody'); table.append(body); main.append(table);
    function canvas(size) {
        const c = document.createElement('canvas'); c.width = c.height = size; return c;
    }
    function data(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
    const entries = catalog.features.entries.concat(catalog.thresholds.entries, catalog.sprites.entries.filter(e => e.names.length).slice(0, 2));
    const results = [];
    for (const entry of entries) {
        const index = tiles[entry.names[0]], info = tiles.get_tile_info(index), detail = art.tile('feat', index);
        check(detail && detail.width === (info.ex - info.sx) * 4 && detail.height === (info.ey - info.sy) * 4, 'fourfold source detail: ' + entry.label);
        check(art.tile('feat', index) === detail, 'cached source detail');
        const row = document.createElement('tr'), label = document.createElement('th');
        label.textContent = entry.label; label.style.borderTop = '1px solid #70674e'; row.append(label); body.append(row);
        let observedDetail = false;
        for (const [size, classic] of [[96, true], [32, false], [96, false], [128, false]]) {
            pack.select(classic ? 'classic' : 'illustrated');
            const c = canvas(size), ctx = c.getContext('2d'), draw = ctx.drawImage.bind(ctx);
            const view = Object.assign({ ctx, x_scale: size / 32, y_scale: size / 32,
                current_left_overlap: 0, current_sy: 0 }, m['./cell-renderer-textures']);
            ctx.drawImage = (...args) => { observedDetail = observedDetail || args[0] === detail; draw(...args); };
            view.draw_dngn(index, 0, 0);
            const cell = document.createElement('td'); cell.style.cssText = 'text-align:center;border-top:1px solid #70674e;padding:8px';
            c.style.imageRendering = 'auto'; cell.append(c); row.append(cell);
        }
        check(observedDetail, 'native draw uses detailed source');
        const down = canvas(32), old = canvas(detail.width), reference = canvas(detail.width);
        down.getContext('2d').drawImage(detail, 0, 0, 32, 32);
        old.getContext('2d').imageSmoothingEnabled = false;
        old.getContext('2d').drawImage(down, 0, 0, old.width, old.height);
        reference.getContext('2d').drawImage(detail, 0, 0);
        const highPixels = data(reference), lowPixels = data(old);
        let retainedPixels = 0;
        for (let i = 0; i < highPixels.length; i += 4) if (highPixels[i + 3] > 12
            && Math.abs(highPixels[i] - lowPixels[i]) + Math.abs(highPixels[i + 1] - lowPixels[i + 1])
                + Math.abs(highPixels[i + 2] - lowPixels[i + 2]) > 12) retainedPixels++;
        check(retainedPixels > 100, 'retains detail beyond a 32px upscale');
        results.push({ label: entry.label, sourceWidth: detail.width, sourceHeight: detail.height, retainedPixels });
    }
    for (const name of ['DNGN_UNSEEN', 'DNGN_ERROR', 'DNGN_RUNED_CLEAR_DOOR', 'DNGN_SEALED_CLEAR_DOOR',
        'DNGN_BLOOD_FOUNTAIN', 'DNGN_SPARKLING_FOUNTAIN', 'DNGN_GATE_RUNED_LEFT', 'DNGN_GATE_SEALED_LEFT', 'DNGN_GATE_CLOSED_LEFT']) {
        if (typeof tiles[name] === 'number') check(!art.tile('feat', tiles[name]), 'preserve specialized feature: ' + name);
    }
    check(!art.tile('icons', tiles.DNGN_CLOSED_DOOR), 'semantic atlases excluded');
    const open = art.tile('feat', tiles.DNGN_OPEN_DOOR);
    check(data(open)[(Math.floor(open.height / 2) * open.width + Math.floor(open.width / 2)) * 4 + 3] === 0, 'open doorway has transparent passage');
    sheet.id += '_held';
    check(!art.tile('feat', tiles.DNGN_CLOSED_DOOR), 'missing sheet falls back');
    sheet.id = catalog.features.id;
    check(art.tile('feat', tiles.DNGN_CLOSED_DOOR), 'late sheet restored');
    pack.select('classic');
    check(!art.tile('feat', tiles.DNGN_CLOSED_DOOR) && !art.tile('feat', tiles.DNGN_TREE), 'Classic restores native sprites');
    pack.select('illustrated');
    return { entries: results, missingSheetFallback: true, classicNative: true, specializedFeaturesPreserved: true, openPassageTransparent: true };
};
