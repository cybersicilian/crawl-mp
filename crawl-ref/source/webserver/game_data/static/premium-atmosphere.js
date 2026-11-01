/* DCSS adapter: every branch keeps its own air. A faint colour wash and drifting
 * motes over visible open ground; no effect is simulated or depends on the turn. */
define(["jquery", "./map_knowledge", "./player", "./premium-terrain-model", "./premium-view-layer", "visual-presentation", "ambient-motes"],
function ($, map, player, model, layers, presentation, motes) {
    "use strict";
    var moods = { D: ["dust"], Dungeon: ["dust"], Temple: ["sparkle", 255, 226, 170, .16], Orc: ["dust", 255, 170, 92, .12], Elf: ["sparkle", 200, 190, 255, .14],
        Dwarf: ["dust", 255, 196, 130, .1], Lair: ["pollen", 152, 212, 112, .14], Swamp: ["fireflies", 142, 182, 92, .22], Shoals: ["spray", 142, 212, 232, .16],
        Snake: ["pollen", 204, 192, 92, .14], Spider: ["dust", 122, 132, 172, .16], Slime: ["spores", 132, 222, 92, .22], Vaults: ["dust", 172, 192, 232, .12],
        Blade: ["dust", 172, 192, 232, .12], Crypt: ["wisps", 132, 172, 192, .2], Tomb: ["dust", 222, 192, 122, .16], Depths: ["dust", 142, 122, 172, .16],
        Hell: ["embers", 255, 112, 72, .16], Dis: ["ash", 162, 182, 212, .16], Geh: ["embers", 255, 92, 52, .24], Coc: ["snow", 152, 212, 255, .24],
        Tar: ["ash", 132, 192, 122, .18], Zot: ["sparkle", 202, 122, 255, .18], Forest: ["fireflies", 122, 212, 132, .16], Abyss: ["void", 172, 92, 236, .22],
        Pan: ["void", 236, 92, 192, .18], Zig: ["sparkle"], Lab: ["dust"], Bazaar: ["sparkle", 255, 212, 130, .12], Trove: ["sparkle", 255, 216, 130, .16],
        Sewer: ["spores", 132, 192, 112, .18], Ossuary: ["dust", 212, 192, 142, .14], Bailey: ["dust"], Gauntlet: ["dust", 222, 122, 82, .12],
        IceCv: ["snow", 172, 226, 255, .24], Volcano: ["embers", 255, 112, 62, .22], Desolation: ["ash", 216, 206, 192, .14], Crucible: ["wisps", 222, 92, 102, .18],
        Necropolis: ["wisps", 152, 202, 172, .16], Gulch: ["spores", 152, 172, 112, .14], Bur: ["dust", 196, 164, 120, .1], Worm: ["spores", 196, 132, 122, .14],
        Hive: ["pollen", 242, 192, 82, .18], Forge: ["embers", 255, 150, 90, .14], Arena: ["dust"] };
    var scattered = null, scatterKey = null, generation = 0;
    function mood() { return moods[player.place] || moods.D; }
    function open(x, y) {
        var cell = model.describe(map.get(x, y));
        return Boolean(cell && cell.visible && !cell.solid);
    }
    function candidates(view, kind) {
        var key = [view.view.x, view.view.y, view.cols, view.rows, kind, generation].join(":");
        if (scattered && scatterKey === key) return scattered;
        var cells = [];
        for (var y = view.view.y - 2; y < view.view.y + view.rows; y++)
            for (var x = view.view.x - 2; x < view.view.x + view.cols; x++) cells.push({ x: x, y: y });
        scatterKey = key; return scattered = motes.scatter(cells, kind);
    }
    var air = layers.create({ name: "premiumAtmosphere", className: "premium-dungeon-motes", resolution: 24, cadence: 66,
        allowed: function () { return presentation.enabled("atmosphere"); },
        paint: function (context, resolution, now, moving, view) {
            var canvas = context.canvas, kind = mood()[0];
            context.clearRect(0, 0, canvas.width, canvas.height);
            if (canvas.dataset.kind !== kind) canvas.dataset.kind = kind;
            if (!moving) return false;
            motes.paint(context, candidates(view, kind), kind, resolution, view.view, now / 1000, open);
            return true;
        } });
    var wash = layers.create({ name: "premiumMood", className: "premium-dungeon-mood", resolution: 2,
        allowed: function () { return presentation.enabled("atmosphere"); },
        paint: function (context) {
            var canvas = context.canvas, tone = mood();
            context.clearRect(0, 0, canvas.width, canvas.height);
            if (tone.length < 5) return false;
            var colour = tone.slice(1, 4).join(","), reach = Math.hypot(canvas.width, canvas.height) / 2;
            var fill = context.createRadialGradient(canvas.width / 2, canvas.height / 2, reach * .25, canvas.width / 2, canvas.height / 2, reach);
            fill.addColorStop(0, "rgba(" + colour + "," + tone[4] * .12 + ")"); fill.addColorStop(1, "rgba(" + colour + "," + tone[4] * .62 + ")");
            context.fillStyle = fill; context.fillRect(0, 0, canvas.width, canvas.height);
            return false;
        } });
    $(document).on("map_knowledge_changed.premiumAtmosphereMotes map_knowledge_cleared.premiumAtmosphereMotes", function () { generation++; });
    return { mood: mood, moods: moods };
});
