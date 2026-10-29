define(["comm", "client", "./context-menu", "./workflow-actions", "./party-model", "./map_knowledge", "./game-context"],
function (comm, client, menus, actions, party, map, game) {
    "use strict";
    function view() {
        var state = window.crawl_party && window.crawl_party.state;
        return { state: state, hero: state && state.members.find(function (hero) { return hero.slot === actions.controlledSlot(); }) };
    }
    function signature(loc) {
        var current = view(), hero = current.hero, cell = map.get(loc.x, loc.y);
        return JSON.stringify([hero && [hero.slot, hero.place, hero.pos, hero.floor_items], actions.reason(hero),
            game.get_input_mode(), game.get_ui_state(), cell && [cell.mon, cell.item_name, cell.feature_name, map.visible(cell)],
            current.state && current.state.members.map(function (member) { return [member.slot, member.pos, member.on_same_level]; })]);
    }
    function open(event) {
        var loc = { x: event.cell.x, y: event.cell.y }, cell = map.get(loc.x, loc.y);
        if (!cell || !cell.t) { event.preventDefault(); return; }
        var current = view(), state = current.state, hero = current.hero, expected = signature(loc);
        var blocked = actions.reason(hero), visible = map.visible(cell), target = game.can_target();
        var ownTile = hero && hero.pos && hero.pos.x === loc.x && hero.pos.y === loc.y;
        var member = visible && state && state.members.find(function (entry) {
            return entry.on_same_level !== false && entry.pos && entry.pos.x === loc.x && entry.pos.y === loc.y;
        });
        var entries = [];
        function click(button) { return function () { comm.send_message("click_cell", { x: loc.x, y: loc.y, button: button }); }; }
        entries.push({ label: "Inspect", disabled: client.is_watching() ? "Join the party to inspect this tile." :
            !game.can_describe() ? "Finish the current action first." : "", detail: "Full description of this tile", run: click(3) });
        if (target) {
            entries.push({ label: "Select target", disabled: !visible ? "Choose a visible tile." : client.is_watching() ? "Join the party to target." : "",
                run: click(1) });
        } else if (!blocked && !ownTile && !member && !/wall|rock|closed door/i.test(cell.feature_name || "")) {
            var adjacent = hero.pos && Math.max(Math.abs(loc.x - hero.pos.x), Math.abs(loc.y - hero.pos.y)) === 1;
            entries.push({ label: visible && cell.mon && cell.mon.att === 0 && adjacent ? "Attack" : "Move here",
                detail: "Move or travel to this tile", run: click(1) });
        } else if (!blocked && !ownTile && /closed door/i.test(cell.feature_name || "")) {
            entries.push({ label: "Open door / move here", run: click(1) });
        }
        if (member && window.crawl_party.open_inspector) entries.push({ label: "Open character sheet",
            run: function () { window.crawl_party.open_inspector(member.slot, "overview"); } });
        if (member && member.slot !== actions.controlledSlot() && party.canControl(state, member.slot))
            entries.push({ label: "Control this hero", disabled: blocked || (member.alive === false || member.ghost_haunting ? "This hero is downed." : ""),
                run: function () { comm.send_message("switch_player", { slot: member.slot }); } });
        if (ownTile && hero.floor_items_known && hero.floor_items.length) entries.push({ label: "Pick up items",
            disabled: blocked, detail: "Choose stacks and quantities", run: function () { comm.send_message("key", { keycode: 103 }); } });
        if (!blocked && ownTile && /staircase.*down|down.*staircase|entrance/i.test(cell.feature_name || ""))
            entries.push({ label: "Go downstairs / enter", run: function () { comm.send_message("key", { keycode: 62 }); } });
        if (!blocked && ownTile && /staircase.*up|up.*staircase|exit/i.test(cell.feature_name || ""))
            entries.push({ label: "Go upstairs / leave", run: function () { comm.send_message("key", { keycode: 60 }); } });
        if (!client.is_watching() && state && state.enabled && visible) ["look", "danger"].forEach(function (kind) {
            entries.push({ label: kind === "look" ? "Ping: look here" : "Ping: danger",
                run: function () { comm.send_message("party_ping", { x: loc.x, y: loc.y, kind: kind }); } });
        });
        if (!blocked && state.tile_exclusions) entries.push({ label: "Toggle travel exclusion",
            detail: "Keep auto-explore and travel off this tile", run: function () {
                comm.send_message("click_cell", { x: loc.x, y: loc.y, button: 1, exclude: true,
                    expected_slot: hero.slot, expected_place: hero.place });
            } });
        menus.open(event, { title: member ? member.name : cell.mon ? cell.mon.name : cell.item_name || cell.feature_name || "Dungeon tile",
            entries: entries, valid: function () { return signature(loc) === expected; } });
    }
    return { open: open };
});
