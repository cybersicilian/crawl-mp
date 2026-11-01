/* Serialize into a native browser. Count only sources drawn on the dungeon canvas. */
function observeNativeSprites() {
    const names = Object.keys(require.s.contexts._.defined);
    function module(suffix) {
        const name = names.find(value => value.endsWith('/' + suffix));
        if (!name) throw new Error('Missing native sprite dependency: ' + suffix);
        return require(name);
    }
    const renderer = module('dungeon_renderer'), art = module('tile-art-direction');
    const sprites = module('environment-sprites'), ctx = renderer.ctx;
    if (!ctx || ctx.canvas !== document.getElementById('dungeon'))
        throw new Error('Sprite observation must use the dungeon context');
    const regions = { feat: sprites.feat.concat(sprites.dungeon), player: sprites.player };
    const byTile = new Map(), bySource = new Map(), counts = new Map(), restore = [];
    for (const [atlas, entries] of Object.entries(regions)) for (const region of entries)
        byTile.set(atlas + ':' + region.tile, { atlas, ...region });
    function wrap(object, key, factory) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        const original = object[key];
        restore.push(() => descriptor ? Object.defineProperty(object, key, descriptor) : delete object[key]);
        object[key] = factory(original);
    }
    let unmappedTileCalls = 0, pendingTileCalls = 0;
    try {
        wrap(art, 'tile', original => function (atlas, tile) {
            const source = original.apply(this, arguments), region = byTile.get(atlas + ':' + tile);
            if (!region) unmappedTileCalls++;
            else if (!source) pendingTileCalls++;
            else bySource.set(source, region);
            return source;
        });
        wrap(ctx, 'drawImage', original => function (source, sx, sy, sw, sh) {
            const region = bySource.get(source);
            if (region) {
                const key = region.atlas + ':' + region.tile;
                let count = counts.get(key);
                if (!count) {
                    count = { atlas: region.atlas, tile: region.tile, sheet: region.sheet,
                        sourceWidth: source.width, sourceHeight: source.height,
                        nativeWidth: region.w, nativeHeight: region.h, draws: 0, clippedDraws: 0 };
                    counts.set(key, count);
                }
                count.draws++;
                if (sx !== 0 || sy !== 0 || sw !== source.width || sh !== source.height) count.clippedDraws++;
            }
            return original.apply(this, arguments);
        });
        renderer.render_view();
    } finally { restore.reverse().forEach(undo => undo()); }
    return { entries: Array.from(counts.values()), pendingTileCalls, unmappedTileCalls, observerRestored: true };
}
module.exports = { observeNativeSprites };
