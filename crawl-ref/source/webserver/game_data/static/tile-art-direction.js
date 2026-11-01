define(["jquery", "image-grade", "atlas-materials", "./native-tile-art", "./terrain-materials", "./tileinfo-dngn",
        "atlas-sprites", "./environment-materials", "./environment-sprites", "./environment-art", "texture-pack", "deferred-images"],
function ($, grading, materials, nativeArt, regions, tiles, sprites, wilds, trees, environment, texturePack, deferredImages) {
    "use strict";
    // Presentation profiles are separate from native texture IDs and drawing rules.
    var terrain = Object.freeze({ saturation: 0.72, contrast: 1.08, brightness: 1.07,
        tint: [169, 175, 141], tintAmount: 0.065 });
    var features = Object.freeze({ saturation: 0.88, contrast: 1.05, brightness: 1.05,
        tint: [178, 179, 145], tintAmount: 0.035 });
    var actors = Object.freeze({ saturation: 0.91, contrast: 1.06, brightness: 1.05,
        tint: [202, 187, 149], tintAmount: 0.025 });
    var floor = Object.freeze(Object.assign({}, terrain, { preserve: [tiles.DNGN_UNSEEN, tiles.DNGN_ERROR].map(function (idx) {
        var info = tiles.get_tile_info(idx);
        return { x: info.sx, y: info.sy, width: info.ex - info.sx, height: info.ey - info.sy };
    }) }));
    var profiles = { floor: floor, wall: terrain, feat: features, main: actors, player: actors };
    var cache = grading.create(), painted = materials.create(), objects = sprites.create();
    function refreshed() { $(document).trigger("art_materials_ready"); }
    var deferred = deferredImages.create({ onLoad: refreshed, onError: refreshed });
    var sheets = new Map();
    function requestSheet(id) {
        var sheet = sheets.get(id);
        if (!sheet || sheet.id !== id || sheet.isConnected === false) {
            sheet = document.getElementById(id); sheets.set(id, sheet);
        }
        return texturePack.illustrated() ? deferred.request(sheet) : sheet;
    }
    var materialSheets = {};
    function materialUses(catalog, sheet) {
        Object.keys(catalog).forEach(function (id) {
            if (!materialSheets[id]) materialSheets[id] = new Map();
            catalog[id].forEach(function (region) {
                var uses = materialSheets[id].get(region.tile) || new Set();
                uses.add(sheet); materialSheets[id].set(region.tile, uses);
            });
        });
    }
    materialUses(regions, "illustrated_materials"); materialUses(wilds, environment.ground.id);
    var detailed = { feat: new Map(), player: new Map() };
    trees.feat.concat(trees.dungeon).forEach(function (region) { detailed.feat.set(region.tile, region); });
    trees.player.forEach(function (region) { detailed.player.set(region.tile, region); });
    var portraitRegions = new Map();
    trees.player.forEach(function (region) {
        portraitRegions.set([region.x, region.y, region.w, region.h].join(":"), region);
    });
    function sheetGroups(items) {
        return Array.from(new Set(items.map(function (region) { return region.sheet; }))).map(function (id) {
            return { id: id, sheet: null, regions: items.filter(function (region) { return region.sheet === id; }) };
        });
    }
    var atlasSheets = { feat: sheetGroups(trees.feat.concat(trees.dungeon)), player: sheetGroups(trees.player) };
    $(document).on("game_cleanup.artDirection", function () {
        sheets.clear();
        Object.keys(atlasSheets).forEach(function (id) {
            atlasSheets[id].forEach(function (entry) { entry.sheet = null; });
        });
    });
    function tile(id, index, requestedScale) {
        if (!texturePack.illustrated()) return null;
        var uses = materialSheets[id] && materialSheets[id].get(index);
        if (uses) uses.forEach(requestSheet);
        var region = detailed[id] && detailed[id].get(index);
        return region ? objects.tile(requestSheet(region.sheet), region,
            region.preserveAlpha ? document.getElementById(id) : null, requestedScale) : null;
    }
    function image(id, source) {
        if (!texturePack.illustrated()) return source;
        var graded = cache.image(source, profiles[id]);
        var stone = regions[id] ? painted.image(graded, document.getElementById("illustrated_materials"), regions[id]) : graded;
        var ground = wilds[id] ? painted.image(stone, document.getElementById(environment.ground.id), wilds[id]) : stone;
        if (atlasSheets[id]) {
            atlasSheets[id].forEach(function (entry) { entry.sheet = document.getElementById(entry.id); });
            return objects.imageGroups(ground, atlasSheets[id]);
        }
        return ground;
    }
    nativeArt.setImageTransform(image);
    nativeArt.setTileTransform(function (id, source, layer) {
        if (id !== "player" || !texturePack.illustrated()) return null;
        var region = portraitRegions.get([layer.sx, layer.sy, layer.w, layer.h].join(":"));
        return region ? objects.tile(requestSheet(region.sheet), region, region.preserveAlpha ? source : null) : null;
    });
    return { image: image, tile: tile, requestSheet: requestSheet };
});
