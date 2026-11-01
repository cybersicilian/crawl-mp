/* Explicit native opt-ins; decorative props have no placement side effects. */
define(["./tileinfo-dngn", "./environment-art", "./tileinfo-player"], function (dungeon, art, player) {
    "use strict";
    var regions = { feat: [], dungeon: [], player: [] };
    function append(sheet, target, tiles, atlas, woodland) {
        sheet.entries.forEach(function (entry, cell) {
            entry.names.forEach(function (name) {
                var base = tiles[name];
                if (typeof base !== "number") return;
                for (var n = 0; n < (entry.variants === false ? 1 : tiles.tile_count(base)); n++) {
                    var idx = base + n, info = tiles.get_tile_info(idx);
                    if (!info || tiles.get_img(idx) !== atlas || (entry.variants !== false && tiles.basetile(idx) !== base)) continue;
                    var variant = woodland && cell === 0 ? n % 2 : cell;
                    var w = info.ex - info.sx, h = info.ey - info.sy;
                    var bands = entry.alphaBands || (entry.gripBand ? [entry.gripBand] : sheet.alphaBands || []);
                    var masks = bands.map(function (band) {
                        var first = Math.max(0, band[0] - info.oy), last = Math.min(h, band[1] - info.oy);
                        return last > first ? { x: 0, y: first, w: w, h: last - first } : null;
                    }).filter(Boolean);
                    target.push(Object.assign({}, sheet.style, { tile: idx, sheet: sheet.id,
                        x: info.sx, y: info.sy, w: w, h: h,
                        preserveAlpha: masks.length > 1 ? masks : masks[0] || null,
                        sprite: entry.sprite || { x: variant % sheet.columns * sheet.cell,
                            y: Math.floor(variant / sheet.columns) * sheet.cell, w: sheet.cell, h: sheet.cell },
                        mirror: woodland && n % 2 === 1 }));
                }
            });
        });
    }
    append(art.sprites, regions.feat, dungeon, "feat", true);
    append(art.features, regions.dungeon, dungeon, "feat", false);
    append(art.thresholds, regions.dungeon, dungeon, "feat", false);
    append(art.creatures, regions.player, player, "player", false);
    append(art.denizens, regions.player, player, "player", false);
    append(art.lair, regions.player, player, "player", false);
    append(art.hydras, regions.player, player, "player", false);
    append(art.humanoids, regions.player, player, "player", false);
    append(art.eliteHumanoids, regions.player, player, "player", false);
    append(art.equipment, regions.player, player, "player", false);
    append(art.shields, regions.player, player, "player", false);
    append(art.melee, regions.player, player, "player", false);
    append(art.weaponForms, regions.player, player, "player", false);
    append(art.ranged, regions.player, player, "player", false);
    append(art.armour, regions.player, player, "player", false);
    append(art.humanBases, regions.player, player, "player", false);
    append(art.headwear, regions.player, player, "player", false);
    append(art.hair, regions.player, player, "player", false);
    return regions;
});
