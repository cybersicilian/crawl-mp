/* Named travel targets. Native click travel owns routes, warnings and interruptions. */
define(["comm", "./map_knowledge", "./workflow-actions", "./context-menu"],
function (comm, map, actions, menus) {
    "use strict";
    var patterns = { down: /stair.*down|down.*stair/i, up: /stair.*up|up.*stair/i };
    function hero() {
        var state = window.crawl_party && window.crawl_party.state;
        return state && state.members.find(function (member) { return member.slot === actions.controlledSlot(); });
    }
    function nearest(direction, origin) {
        var bounds = map.bounds(), best = null;
        if (!bounds || !origin) return null;
        for (var y = bounds.top; y <= bounds.bottom; y++) {
            for (var x = bounds.left; x <= bounds.right; x++) {
                var cell = map.get(x, y);
                if (!cell || !cell.t || !patterns[direction].test(cell.feature_name || "")) continue;
                var distance = Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y));
                if (!best || distance < best.distance) best = { x: x, y: y, distance: distance };
            }
        }
        return best;
    }
    function here(member, direction) { return member.stairs === direction; }
    function travel(direction) {
        var member = hero();
        if (!member || actions.reason(member)) return false;
        if (here(member, direction)) {
            comm.send_message("key", { keycode: direction === "down" ? 62 : 60 });
            return true;
        }
        var target = nearest(direction, member.pos);
        if (!target) return false;
        comm.send_message("click_cell", { x: target.x, y: target.y, button: 1 });
        return true;
    }
    function entry(member, direction, label, blocked) {
        var target = nearest(direction, member.pos), standing = here(member, direction);
        return { label: label, disabled: blocked || (!target && !standing ? "None found yet. Keep exploring." : ""),
            detail: standing ? "You are on them. Uses the stairs." : target ? target.distance + " tiles away. Stops if something appears." : "",
            run: function () { travel(direction); } };
    }
    function open(event) {
        var member = hero();
        if (!member) return;
        var blocked = actions.reason(member);
        menus.open(event, { title: "Go", entries: [
            entry(member, "down", "Stairs down", blocked),
            entry(member, "up", "Stairs up", blocked),
            { label: "Another floor or branch…", detail: "Choose any discovered destination · G", disabled: blocked,
                run: function () { comm.send_message("key", { keycode: 71 }); } }
        ] });
    }
    return { open: open, travel: travel, nearest: nearest };
});
