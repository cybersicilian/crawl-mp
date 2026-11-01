/* Describes what a left click would ask the engine to do on a tile. */
define([], function () {
    "use strict";
    var threatWords = ["Harmless", "Easy", "Dangerous", "Deadly"];
    var wall = /\b(?:wall|rock|statue|crystal|tree|glass|grate)\b/i;
    var stairs = /stair|hatch|shaft|portal|gate|exit|entrance|arch/i;
    function name(text) { return String(text || "").replace(/^(?:a|an|the)\s+/i, ""); }
    function title(text) { var value = name(text); return value.charAt(0).toUpperCase() + value.slice(1); }
    function moves(view) {
        if (!Number.isInteger(view.steps)) return "Walk here";
        return view.steps === 1 ? "Walk here · 1 move" : "Walk here · " + view.steps + " moves";
    }
    /* view: { cell, visible, adjacent, distance, steps, ownTile, ally, blocked, targeting } */
    function classify(view) {
        var cell = view.cell;
        if (!cell || !cell.t) return { kind: "unknown", title: "Unexplored", left: "Nothing known here yet", right: "" };
        var feature = cell.feature_name || "", mon = view.visible && cell.mon;
        if (view.targeting) return { kind: "target", title: title(mon ? mon.name : feature || "Tile"),
            left: view.visible ? "Select this target" : "Choose a visible tile", right: "Cancel with Esc" };
        if (view.ownTile) {
            var items = cell.item_name ? "Items here · press g" : "You are here";
            return { kind: "self", title: "Your tile", left: items, right: "Open tile actions" };
        }
        if (view.ally) return { kind: "ally", title: view.ally.name, left: "Party hero", right: "Open hero actions" };
        if (mon) {
            var word = threatWords[mon.threat] || "Unknown";
            if (mon.att !== 0) return { kind: "neutral", title: title(mon.name), left: "Friendly or neutral",
                right: "Inspect or choose an action" };
            if (view.blocked) return { kind: "blocked", title: title(mon.name), left: view.blocked, right: "Inspect" };
            return { kind: "attack", title: title(mon.name), threat: view.harmless ? "" : word,
                left: view.adjacent ? "Attack" : "Walk toward it · " + view.distance + " tiles",
                right: "Inspect its abilities" };
        }
        if (view.blocked) return { kind: "blocked", title: title(feature || "Tile"), left: view.blocked, right: "Inspect" };
        if (cell.item_name && !wall.test(feature)) return { kind: "item", title: title(cell.item_name),
            left: moves(view) + ", then press g", right: "Inspect or choose an action" };
        if (wall.test(feature)) return { kind: "solid", title: title(feature), left: "Can't walk here", right: "Inspect" };
        if (/closed door/i.test(feature)) return { kind: "door", title: "Closed door", left: "Walk here and open it", right: "Inspect" };
        if (stairs.test(feature) && !/\bfloor\b/i.test(feature)) return { kind: "stairs", title: title(feature), left: moves(view),
            right: "Inspect or choose an action" };
        return { kind: "walk", title: title(feature || "Tile"), left: moves(view), right: "Inspect or choose an action" };
    }
    return { classify: classify };
});
