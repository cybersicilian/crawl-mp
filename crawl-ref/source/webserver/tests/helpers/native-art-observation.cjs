/* Serialize into the real browser; observe a native-state repaint without sending input. */
function observeNativePaint() {
    const names = Object.keys(require.s.contexts._.defined);
    function module(suffix, optional = false) {
        const name = names.find(value => value.endsWith('/' + suffix));
        if (!name && optional) return null;
        if (!name) throw new Error('Missing native art observation dependency: ' + suffix);
        return require(name);
    }
    const renderer = module('dungeon_renderer'), map = module('map_knowledge');
    const art = module('tile-art-direction'), regions = module('terrain-materials');
    const borders = module('terrain-edges'), tiles = module('tileinfo-dngn'), enums = module('enums');
    const surface = module('environment-ground', true);
    const canvas = document.getElementById('dungeon'), ctx = renderer.ctx;
    if (!ctx || ctx.canvas !== canvas) throw new Error('Observation must use the actual dungeon context');
    const atlases = ['floor', 'wall'].map(id => ({ id, original: document.getElementById(id),
        image: art.image(id, document.getElementById(id)),
        rectangles: new Set(regions[id].map(region => region.x + ':' + region.y)),
        tiles: new Set(regions[id].map(region => region.tile)) }));
    const result = { materialDraws: { floor: 0, wall: 0 }, visibleMaterialCells: { floor: 0, wall: 0 },
        originalAtlasDraws: 0, borderAdapterCalls: 0, borderCallsWithNativeCoordinates: 0,
        connectedBorderRectangles: 0, worldSurfaceDraws: 0, surfaceCallsWithNativeCoordinates: 0,
        rendererCanvasIsDungeon: true, samples: [] };
    let insideBorder = 0, insideSurface = 0;
    const restore = [];
    function wrap(object, key, factory) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key), original = object[key];
        restore.push(() => descriptor ? Object.defineProperty(object, key, descriptor) : delete object[key]);
        object[key] = factory(original);
    }
    try {
        wrap(ctx, 'drawImage', original => function (image, sx, sy) {
            if (insideSurface) { result.materialDraws.floor++; result.worldSurfaceDraws++; }
            for (const atlas of atlases) {
                if (image === atlas.original) result.originalAtlasDraws++;
                if (image === atlas.image && atlas.rectangles.has(sx + ':' + sy)) result.materialDraws[atlas.id]++;
            }
            return original.apply(this, arguments);
        });
        wrap(ctx, 'fillRect', original => function () {
            if (insideBorder) result.connectedBorderRectangles++;
            return original.apply(this, arguments);
        });
        wrap(borders, 'draw', original => function (view, cx, cy) {
            result.borderAdapterCalls++;
            if (Number.isInteger(cx) && Number.isInteger(cy)) result.borderCallsWithNativeCoordinates++;
            insideBorder++;
            try { return original.apply(this, arguments); } finally { insideBorder--; }
        });
        if (surface) wrap(surface, 'draw', original => function (view, idx, x, y, cx, cy) {
            if (Number.isInteger(cx) && Number.isInteger(cy)) result.surfaceCallsWithNativeCoordinates++;
            insideSurface++;
            try { return original.apply(this, arguments); } finally { insideSurface--; }
        });
        const start = performance.now();
        renderer.render_view();
        result.repaintCallMs = performance.now() - start;
        for (let y = renderer.view.y; y < renderer.view.y + renderer.rows; y++) {
            for (let x = renderer.view.x; x < renderer.view.x + renderer.cols; x++) {
                const cell = map.get(x, y);
                if (!cell.t || !map.visible(cell)) continue;
                const idx = enums.prepare_bg_flags(cell.t.bg || 0).value, id = tiles.get_img(idx);
                const atlas = atlases.find(entry => entry.id === id && entry.tiles.has(idx));
                if (!atlas) continue;
                result.visibleMaterialCells[id]++;
                if (result.samples.length < 8) result.samples.push({ x, y, tile: idx, atlas: id });
            }
        }
    } finally {
        restore.reverse().forEach(undo => undo());
    }
    result.observerRestored = true;
    return result;
}
module.exports = { observeNativePaint };
