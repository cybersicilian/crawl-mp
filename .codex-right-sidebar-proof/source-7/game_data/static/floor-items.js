define(["jquery", "comm", "./workflow-actions", "./hud-inventory", "./status-icons", "./frame-update", "./context-menu", "./party-skill-training"],
function ($, comm, actions, inventory, icons, frameUpdate, menus, training) {
    "use strict";
    var signature = "";
    function context() {
        var state = window.crawl_party && window.crawl_party.state;
        var hero = state && state.members.find(function (entry) { return entry.slot === actions.controlledSlot(); });
        return { state: state, hero: hero };
    }
    function reason(view) {
        return actions.reason(view.hero) || (!view.state.floor_item_actions || !view.hero.floor_items_known
            ? "Ground items are unavailable. Save and resume to refresh native game data." : "");
    }
    function activate(id, inspect, expected) {
        var view = context(), hero = view.hero;
        if (reason(view)) return;
        var item = hero.floor_items.find(function (entry) { return entry.id === id; });
        if (!item || expected !== JSON.stringify([hero.slot, hero.place, hero.pos, item])) return;
        comm.send_message("floor_item_action", { id: item.id, expected_slot: hero.slot,
            expected_name: item.name, expected_qty: item.qty, expected_place: hero.place,
            x: hero.pos.x, y: hero.pos.y, inspect: inspect });
    }
    function update() {
        var root = $("#hud_floor_items"); if (!root.length) return;
        var view = context(), hero = view.hero, blocked = reason(view);
        var items = hero && hero.floor_items_known && Array.isArray(hero.floor_items) ? hero.floor_items : [];
        var image = document.getElementById("main");
        var next = JSON.stringify([hero && [hero.slot, hero.name, hero.place, hero.pos, hero.floor_items_known],
            items, blocked, hero && training.signature(hero), Boolean(image && image.complete && image.naturalWidth)]);
        if (signature === next) return;
        signature = next;
        root.attr("aria-label", "Items on " + (hero ? hero.name + "’s" : "the current") + " tile");
        root.find(".floor-item-count").text(items.length ? String(items.length) : "");
        root.find(".floor-pickup-menu").prop("disabled", Boolean(blocked || !items.length));
        var body = root.find(".floor-item-list"), scroll = body.scrollTop(), focus = document.activeElement.id;
        var focusedIndex = body.children().toArray().indexOf(document.activeElement);
        body.empty();
        items.forEach(function (item) {
            var expected = JSON.stringify([hero.slot, hero.place, hero.pos, item]);
            var button = $("<button type='button' class='floor-item'></button>")
                .attr({ id: "floor_item_" + hero.slot + "_" + item.id,
                    "aria-label": "Pick up " + item.name, "aria-disabled": String(Boolean(blocked)),
                    "data-tip-title": item.name, "data-tip-badge": item.kind_name || "Ground item",
                    "data-tip-body": "On your current tile. Click to pick up this stack. Right-click for actions.",
                    "data-tip-meta": blocked || "Pickup uses a turn. Native inventory limits apply." })
                .on("click", function () { activate(item.id, false, expected); });
            menus.bind(button, function () {
                var trainingState = training.signature(hero);
                function resolve() {
                    var latest = context(), entry = latest.hero && latest.hero.floor_items.find(function (entry) { return entry.id === item.id; });
                    return entry && expected === JSON.stringify([latest.hero.slot, latest.hero.place, latest.hero.pos, entry])
                        && reason(latest) === blocked && training.signature(latest.hero) === trainingState ? latest.hero : null;
                }
                return { title: item.name, valid: function () {
                    return Boolean(resolve());
                }, entries: [
                    { label: "Pick up", detail: "Pick up this stack · uses a turn", disabled: blocked,
                        run: function () { activate(item.id, false, expected); } },
                    { label: "Inspect", detail: "Properties and full description", disabled: blocked,
                        run: function () { activate(item.id, true, expected); } }
                ].concat(training.itemEntries(hero, item, function (callback) {
                    return function () { var latest = resolve(); if (latest) callback(latest); };
                })) };
            });
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
            canvas.setAttribute("aria-hidden", "true");
            button.append(inventory.drawTiles(canvas, item.tile) ? canvas : icons.icon(inventory.itemIcon(item)),
                $("<span class='floor-item-name'></span>").text(item.name));
            body.append(button);
        });
        if (!items.length) body.append($("<p class='floor-items-empty'></p>").text(
            hero && hero.floor_items_known ? "Nothing to pick up here." : "Ground items unavailable."));
        body.scrollTop(scroll);
        var previous = document.getElementById(focus);
        if (previous) previous.focus({ preventScroll: true });
        else if (focusedIndex >= 0) {
            var target = body.find("button").get(Math.min(focusedIndex, items.length - 1)) || root[0];
            target.focus({ preventScroll: true });
        }
    }
    function init() {
        if (!document.getElementById("hud_bottom_row")) return;
        if (!document.getElementById("hud_floor_items")) {
            var root = $("<section id='hud_floor_items' tabindex='-1'><header><strong>On this tile</strong>"
                + "<small class='floor-item-count'></small><button type='button' class='floor-pickup-menu'"
                + " aria-label='Pick up items (g)' data-tip-title='Pick up items'"
                + " data-tip-key='Key: g' data-tip-body='Use native pickup controls. With several stacks, choose items and quantities in the menu.'>"
                + "Pick up <kbd>g</kbd></button></header><div class='floor-item-list' role='group'"
                + " aria-label='Pick up an item'></div></section>").appendTo("#hud_bottom_row");
            root.find("strong").prepend(icons.icon("pickup"));
            root.find(".floor-pickup-menu").on("click", function () {
                var view = context(); if (!reason(view)) comm.send_message("key", { keycode: 103 });
            });
            root.on("keydown.floorItems keypress.floorItems keyup.floorItems", function (event) { event.stopPropagation(); });
        }
        signature = ""; update();
        $("#main").off("load.floorItems").on("load.floorItems", refresh);
    }
    var refresh = frameUpdate(update);
    $(document).on("party_state_rendered.floorItems game_actions_changed.floorItems", refresh)
        .on("game_cleanup.floorItems", function () {
            refresh.cancel(); signature = ""; $("#hud_floor_items").remove(); $("#main").off("load.floorItems");
        });
    return { init: init, update: update };
});
