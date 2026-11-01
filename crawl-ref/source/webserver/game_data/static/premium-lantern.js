/* DCSS adapter: a light travels with each hero on this floor. Presentation only;
 * it reads native positions and changes nothing a player can target or walk on. */
define(["jquery", "./map_knowledge", "./player", "./premium-figures", "./premium-view-layer", "visual-presentation", "lantern-pool"],
function ($, map, player, figures, layers, presentation, pools) {
    "use strict";
    var party = [], style = { shade: .36, inner: 1.2, outer: 8.4, warmth: 5.4, glow: "rgba(255,186,112", intensity: .1 };
    var source = { radius: 7, strength: .9, colour: [255, 190, 124], elevation: .8 };
    function bearers() {
        if (party.length) return party;
        return map.player_on_level() && player.pos ? [player.pos] : [];
    }
    // Only visible cells take the light. Monsters stay readable however far they
    // stand from a lantern. One scan per camera position or native map packet.
    var seen = null, seenKey = null, generation = 0;
    function survey(view) {
        var key = [view.view.x, view.view.y, view.cols, view.rows, generation].join(":");
        if (seen && seenKey === key) return seen;
        var mask = document.createElement("canvas"), ctx, clear = [];
        mask.width = view.cols; mask.height = view.rows; ctx = mask.getContext("2d");
        if (ctx) ctx.fillStyle = "#fff";
        for (var y = view.view.y; y < view.view.y + view.rows; y++)
            for (var x = view.view.x; x < view.view.x + view.cols; x++) {
                var entry = map.get(x, y);
                if (!map.visible(entry)) continue;
                if (ctx) ctx.fillRect(x - view.view.x, y - view.view.y, 1, 1);
                if (entry.mon) clear.push({ x: x + .5 - view.view.x, y: y + .5 - view.view.y });
            }
        seenKey = key; return seen = { mask: ctx ? mask : null, clear: clear };
    }
    var layer = layers.create({ name: "premiumLantern", className: "premium-dungeon-lantern", resolution: 8, cadence: 90,
        allowed: function () { return presentation.enabled("lantern"); },
        paint: function (context, resolution, now, moving, view) {
            var time = now / 1000, swell = moving ? 1 + Math.sin(time * 2.1) * .012 + Math.sin(time * 5.3 + 1.7) * .007 : 1;
            var carried = bearers(), known = survey(view);
            pools.paint(context, { pools: carried.map(function (pos) { return { x: pos.x + .5 - view.view.x, y: pos.y + .5 - view.view.y }; }),
                clear: known.clear, mask: known.mask }, resolution, Object.assign({ swell: swell }, style));
            if (context.canvas.dataset.pools !== String(carried.length)) context.canvas.dataset.pools = String(carried.length);
            return carried.length > 0;
        } });
    // Creatures near a hero catch the same light that the pool shows.
    figures.addLightSource(function (cx, cy) {
        if (!presentation.enabled("lantern")) return null;
        return bearers().filter(function (pos) {
            return (pos.x !== cx || pos.y !== cy) && Math.hypot(pos.x - cx, pos.y - cy) < source.radius;
        }).map(function (pos) { return Object.assign({ x: pos.x, y: pos.y }, source); });
    });
    $(document).on("map_knowledge_changed.premiumLanternParty map_knowledge_cleared.premiumLanternParty", function () { generation++; })
        .on("game_init.premiumLanternParty game_cleanup.premiumLanternParty", function () { party = []; })
        .on("party_state_rendered.premiumLanternParty", function (event, state) {
            party = ((state && state.members) || []).filter(function (hero) {
                return hero.pos && hero.on_same_level !== false && hero.alive !== false && !hero.ghost_haunting;
            }).map(function (hero) { return hero.pos; });
            layer.invalidate();
        });
    return { bearers: bearers };
});
