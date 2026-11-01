/* Read canonical atlases and current optional sheets without requesting unused art. */
function inspectNativeAtlases() {
    const names = Object.keys(require.s.contexts._.defined);
    const module = suffix => require(names.find(name => name.endsWith('/' + suffix)));
    const art = module('tile-art-direction'), sprites = module('environment-sprites');
    const catalogs = Object.values(module('environment-art')).filter(value => value.id);
    const optional = Array.from(document.querySelectorAll('img[data-asset-optional]')).map(sheet => {
        const catalog = catalogs.find(value => value.id === sheet.id);
        const requested = Boolean(sheet.getAttribute('src'));
        if (requested && (!sheet.complete || !sheet.naturalWidth)) throw new Error('Requested artwork failed: ' + sheet.id);
        if (requested && catalog && (sheet.naturalWidth !== catalog.width || sheet.naturalHeight !== catalog.height))
            throw new Error('Artwork geometry changed: ' + sheet.id);
        return { id: sheet.id, requested, width: sheet.naturalWidth, height: sheet.naturalHeight };
    });
    const regions = { feat: sprites.feat.concat(sprites.dungeon), player: sprites.player };
    const loaded = new Set(optional.filter(sheet => sheet.requested).map(sheet => sheet.id));
    function pixels(source) {
        const canvas = document.createElement('canvas');
        canvas.width = source.naturalWidth || source.width; canvas.height = source.naturalHeight || source.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    const atlases = [];
    for (const id of ['floor', 'wall', 'feat', 'main', 'player']) {
        const source = document.getElementById(id), original = pixels(source), start = performance.now();
        const styled = art.image(id, source), transformed = pixels(styled);
        let cached = true;
        for (let n = 0; n < 100; n++) cached = cached && art.image(id, source) === styled;
        const elapsed = performance.now() - start, allowed = new Uint8Array(original.length / 4);
        for (const region of regions[id] || []) if (loaded.has(region.sheet))
            for (let y = region.y; y < region.y + region.h; y++)
                allowed.fill(1, y * source.naturalWidth + region.x, y * source.naturalWidth + region.x + region.w);
        let alpha = true, changed = 0, spriteAlphaChanges = 0;
        for (let i = 3; i < original.length; i += 4) {
            const difference = Math.abs(original[i] - transformed[i]);
            if (allowed[(i - 3) / 4]) { if (difference > 1) spriteAlphaChanges++; }
            else alpha = alpha && difference <= 1;
            if (original[i] && [1, 2, 3].some(offset => original[i - offset] !== transformed[i - offset])) changed++;
        }
        const after = pixels(source);
        atlases.push({ id, width: styled.width, height: styled.height,
            nativeWidth: source.naturalWidth, nativeHeight: source.naturalHeight, cached, elapsed, alpha,
            changed, spriteAlphaChanges, nativeSourceImmutable: after.every((value, i) => value === original[i]) });
    }
    for (const id of ['icons', 'gui']) if (art.image(id, document.getElementById(id)) !== document.getElementById(id))
        throw new Error('Semantic icon atlas must retain original pixels');
    return { atlases, optional };
}
module.exports = { inspectNativeAtlases };
