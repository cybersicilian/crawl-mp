/* Recipient-owned perception facts. Sensing is not terrain mapping or line of sight.
 * Outside current sight, markers deliberately omit monster/item identity and stats. */
define(["./enums", "./tileinfo-dngn", "./tileinfo-main"], function (enums, tiles, main) {
    "use strict";
    var tiers = new Map();
    [["MONS_SENSED_FRIENDLY", "friendly"], ["MONS_SENSED_TRIVIAL", "trivial"],
        ["MONS_SENSED_EASY", "easy"], ["MONS_SENSED_TOUGH", "tough"], ["MONS_SENSED_NASTY", "nasty"],
        ["UNSEEN_MONSTER", "unknown"]].forEach(function (entry) {
        if (Number.isInteger(main[entry[0]])) tiers.set(main[entry[0]], entry[1]);
    });
    function same(value, names) {
        return names.some(function (name) { return Number.isInteger(enums[name]) && value === enums[name]; });
    }
    function terrainKind(index, mf) {
        if (index >= tiles.FLOOR_MAX && index < tiles.WALL_MAX
            || same(mf, ["MF_WALL", "MF_MAP_WALL", "MF_WALL_MAGIC", "MF_WALL_PERM", "MF_WALL_FLESH", "MF_TREE", "MF_WALL_TELEPORTABLE"])) return "wall";
        if (same(mf, ["MF_WATER", "MF_DEEP_WATER"])) return "water";
        if (same(mf, ["MF_LAVA"])) return "lava";
        if (same(mf, ["MF_STAIR_UP"])) return "up";
        if (same(mf, ["MF_STAIR_DOWN"])) return "down";
        if (same(mf, ["MF_STAIR_BRANCH"])) return "branch";
        if (same(mf, ["MF_DOOR"])) return "door";
        if (same(mf, ["MF_TRAP"])) return "trap";
        if (same(mf, ["MF_FEATURE"])) return "feature";
        if (same(mf, ["MF_PORTAL", "MF_TRANSPORTER", "MF_TRANSPORTER_LANDING"])) return "portal";
        return "floor";
    }
    function describe(entry, visible) {
        if (!entry) return null;
        var cell = entry.t || {}, bg = enums.prepare_bg_flags(cell.bg || 0), fg = enums.prepare_fg_flags(cell.fg || 0);
        var index = bg.value || 0, mf = entry.mf;
        var mappedTerrain = same(mf, ["MF_MAP_FLOOR", "MF_MAP_WALL"]);
        var tileKnown = index > tiles.DNGN_ERROR && (!Number.isInteger(tiles.DNGN_MAX) || index < tiles.DNGN_MAX);
        var minimapKnown = same(mf, ["MF_FLOOR", "MF_WALL", "MF_MAP_FLOOR", "MF_MAP_WALL", "MF_DOOR", "MF_STAIR_UP",
            "MF_STAIR_DOWN", "MF_STAIR_BRANCH", "MF_FEATURE", "MF_WATER", "MF_DEEP_WATER", "MF_LAVA", "MF_TRAP", "MF_PORTAL",
            "MF_TRANSPORTER", "MF_TRANSPORTER_LANDING"]);
        var terrainKnown = tileKnown || minimapKnown;
        var inSight = visible === true && !bg.UNSEEN && !bg.MM_UNSEEN && !mappedTerrain;
        // Native get_cell_map_feature reports detected monsters as hostile by default.
        // MM_UNSEEN is also set for detection, so it alone must not count as mapping.
        var tier = tiers.get(fg.value), sensed = tier !== undefined || !inSight && same(mf, ["MF_MONS_HOSTILE", "MF_MONS_FRIENDLY", "MF_MONS_PEACEFUL", "MF_MONS_NEUTRAL"]);
        var itemSensed = !inSight && Number.isInteger(main.UNSEEN_ITEM) && fg.value === main.UNSEEN_ITEM;
        var rememberedInvisible = Boolean(bg.REMEMBERED_INVIS || fg.REMEMBERED_INVIS);
        var presence = sensed ? { kind: "sensed", label: "Sensed presence", tier: tier || "unknown", current: true }
            : itemSensed ? { kind: "sensed-item", label: "Sensed item", current: true }
            : rememberedInvisible ? { kind: "last-known", label: "Last-known invisible presence", current: false } : null;
        var mapped = terrainKnown && (mappedTerrain || Boolean(bg.MM_UNSEEN && !presence));
        var knowledge = terrainKnown ? inSight ? "visible" : mapped ? "mapped" : "remembered" : "unknown";
        if (!terrainKnown && !presence) return null;
        return { x: entry.x, y: entry.y, knowledge: knowledge, terrainKnown: terrainKnown,
            terrain: terrainKnown ? terrainKind(index, mf) : null, mapped: mapped,
            actor: inSight && !rememberedInvisible && !sensed && entry.mon
                ? { name: entry.mon.name || "Creature", attitude: entry.mon.att || 0 } : null,
            presence: presence, visible: inSight && terrainKnown,
            canInspectActor: Boolean(inSight && !rememberedInvisible && !sensed && entry.mon) };
    }
    function markers(map) {
        var bounds = map.bounds(), result = [];
        if (!bounds) return result;
        for (var y = bounds.top; y <= bounds.bottom; y++) for (var x = bounds.left; x <= bounds.right; x++) {
            var entry = map.get(x, y), projection = describe(entry, map.visible(entry));
            if (projection && projection.presence) result.push({ x: x, y: y, presence: projection.presence });
        }
        return result;
    }
    return { describe: describe, markers: markers };
});
