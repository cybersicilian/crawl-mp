/* Runs in the real HTTP fixture with actual catalogs and the optional loader. */
module.exports = async function assetDemandChecks(budgets) {
    const m = window.deliveryModules, art = m['./tile-art-direction'], player = m['./tileinfo-player'];
    const dungeon = m['./tileinfo-dngn'], sheets = Array.from(document.querySelectorAll('img[id^=illustrated_]'));
    function check(value, message) { if (!value) throw new Error(message); }
    function active() { return sheets.filter(sheet => sheet.getAttribute('src')); }
    async function decoded() { await Promise.all(active().map(sheet => sheet.decode())); }
    async function metrics() { return (await fetch('/metrics', { cache: 'no-store' })).json(); }
    window.jQuery(document).trigger('game_init');
    art.tile('player', player.MONS_RAT); art.tile('floor', dungeon.FLOOR_GREY_DIRT);
    check(active().length === 0, 'Classic activated optional artwork');
    const paths = sheets.map(sheet => sheet.dataset.src), initial = await metrics();
    check(paths.every(path => !initial[path]), 'Classic downloaded optional artwork');
    window.useIllustrated = true; window.jQuery(document).trigger('texture_pack_changed');
    check(active().length === 0, 'Mode selection fetched unused artwork families');
    for (let i = 0; i < 100; i++) {
        art.tile('floor', dungeon.FLOOR_GREY_DIRT); art.tile('player', player.MONS_RAT);
    }
    check(active().length === 2, 'Rat on stone should request exactly two sheets');
    await decoded();
    const cold = await metrics();
    check(active().every(sheet => cold[sheet.dataset.src] === 1), 'Repeated draws issued duplicate image requests');
    const coldPaths = active().map(sheet => sheet.dataset.src);
    const coldBytes = coldPaths.reduce((sum, path) => sum + performance.getEntriesByName(new URL(path, location.href).href)
        .reduce((bytes, entry) => bytes + entry.encodedBodySize, 0), 0);
    const allOptionalBytes = paths.reduce((sum, path) => sum + budgets[new URL(path, location.href).pathname], 0);
    check(coldBytes > 0 && coldBytes < allOptionalBytes, 'Cold image transfer did not decrease');
    check(Number.isInteger(player.BASE_OCTOPODE), 'Native-only doll control is missing');
    art.tile('player', player.BASE_OCTOPODE); check(active().length === 2, 'Native-only dolls fetched unrelated art');
    const info = player.get_tile_info(player.MONS_ORC);
    window.portraitDemand('player', {}, { sx: info.sx, sy: info.sy, w: info.ex - info.sx, h: info.ey - info.sy });
    check(active().length === 3, 'A humanoid portrait should request only its body family'); await decoded();

    const broken = document.createElement('img'); broken.id = 'optional_failure_test';
    broken.dataset.src = '/static/missing-optional.png'; broken.setAttribute('data-asset-optional', ''); document.body.append(broken);
    const failed = new Promise(resolve => broken.addEventListener('error', resolve, { once: true }));
    art.requestSheet(broken.id); await failed;
    for (let i = 0; i < 100; i++) art.requestSheet(broken.id);
    check((await metrics())[broken.dataset.src] === 1, 'Failed artwork retried during rendering');
    const barrier = document.createElement('div'), native = document.createElement('img');
    native.src = document.getElementById('illustrated_materials').src; await native.decode();
    barrier.append(native, broken);
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Optional art blocked native game readiness')), 1000);
        m['asset-readiness'](barrier, () => { clearTimeout(timer); resolve(); }, reject);
    });
    barrier.remove();

    for (const region of m['./environment-sprites'].player) art.tile('player', region.tile);
    for (const region of m['./environment-sprites'].feat.concat(m['./environment-sprites'].dungeon)) art.tile('feat', region.tile);
    for (const [id, regions] of Object.entries(m['./environment-materials'])) for (const region of regions) art.tile(id, region.tile);
    await decoded();
    const loaded = await metrics();
    window.useIllustrated = false; window.jQuery(document).trigger('texture_pack_changed');
    art.tile('player', player.MONS_RAT);
    window.useIllustrated = true; window.jQuery(document).trigger('texture_pack_changed'); art.tile('player', player.MONS_RAT);
    const again = await metrics();
    check(active().every(sheet => loaded[sheet.dataset.src] === again[sheet.dataset.src]), 'Artwork re-downloaded on mode toggle');
    return { classicRequests: 0, selectionRequests: 0, coldFixture: 'rat on stone', coldSheets: 2,
        coldImageBytes: coldBytes, allOptionalImageBytes: allOptionalBytes,
        coldImageSavingPercent: Math.round((1 - coldBytes / allOptionalBytes) * 10000) / 100,
        portraitRequestsOnlyOwnFamily: true, failedSheetRequests: 1, optionalFailureDoesNotBlockReadiness: true,
        activatedSheets: active().length, toggleRedownloads: 0, activePaths: active().map(sheet => sheet.dataset.src) };
};
