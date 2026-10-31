define(["jquery", "image-grade", "atlas-materials", "./native-tile-art", "./terrain-materials", "./tileinfo-dngn",
        "atlas-sprites", "./environment-materials", "./environment-sprites", "./environment-art", "texture-pack"],
function ($, grading, materials, nativeArt, regions, tiles, sprites, wilds, trees, environment, texturePack) {
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
    function image(id, source) {
        if (!texturePack.illustrated()) return source;
        var graded = cache.image(source, profiles[id]);
        var stone = regions[id] ? painted.image(graded, document.getElementById("illustrated_materials"), regions[id]) : graded;
        var ground = wilds[id] ? painted.image(stone, document.getElementById(environment.ground.id), wilds[id]) : stone;
        return trees[id] ? objects.image(ground, document.getElementById(environment.sprites.id), trees[id]) : ground;
    }
    $(document).on("game_init.artDirection", function () {
        ["illustrated_materials", environment.ground.id, environment.sprites.id].forEach(function (id) {
            var sheet = document.getElementById(id);
            if (sheet && !sheet.complete) $(sheet).one("load.artDirection", function () {
                $(document).trigger("art_materials_ready");
            });
        });
    });
    nativeArt.setImageTransform(image);
    return { image: image };
});
