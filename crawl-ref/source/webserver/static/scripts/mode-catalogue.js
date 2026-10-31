/* Shared presentation metadata; server-provided links remain authoritative. */
define(function () {
    "use strict";
    var descriptions = {
        "dcss-web-trunk": ["Classic solo", "The full dungeon, at your own pace.", "Full adventure"],
        "seeded-web-trunk": ["Seeded run", "Replay a specific dungeon or compare runs.", "Repeatable"],
        "descent-web-trunk": ["Descent", "A one-way delve. Every floor takes you deeper.", "One way down"],
        "tut-web-trunk": ["Tutorial", "Learn movement, combat, and spellcasting.", "Start here"],
        "sprint-web-trunk": ["Dungeon Sprint", "A concentrated tactical test on a single floor.", "Single floor"]
    };
    function describe(id, fallback) {
        return descriptions[id] || [fallback || id || "Adventure", "Start or resume this mode.", "Adventure"];
    }
    return { describe: describe, label: function (id) {
        var party = /^coop-(\d)p/.exec(id || "");
        return party ? party[1] + "-hero party" : describe(id)[0];
    } };
});
