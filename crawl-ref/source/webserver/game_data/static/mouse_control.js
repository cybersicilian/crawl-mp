define(["jquery", "comm", "./dungeon_renderer", "./tileinfo-gui", "./map_knowledge",
        "./enums", "./hover-cards", "./nested-tips", "./workflow-actions", "./dungeon-context-menu", "./context-menu", "./tactical-planner", "./party-ping"],
function ($, comm, dr, gui, map_knowledge, enums, cards, nested, actions, dungeonMenus, menus, planner, pings) {
    var api = { show_tooltip: show_tooltip, hide_tooltip: hide_tooltip };
    var suppress_hover = false;
    var exclusion_selection = null;

    function cancel_exclusion()
    {
        exclusion_selection = null;
        $("#workflow_exclusion_status").remove();
        $("#dungeon").css("cursor", "");
        $(window).trigger("resize");
    }

    function exclusion_valid()
    {
        var state = window.crawl_party && window.crawl_party.state;
        var hero = state && state.members.find(function (member) { return member.slot === actions.controlledSlot(); });
        return exclusion_selection && state.tile_exclusions && !actions.reason(hero)
            && hero.slot === exclusion_selection.slot && hero.place === exclusion_selection.place;
    }

    $(document).on("tile_exclusion_mode.mouse_control", function () {
        var state = window.crawl_party && window.crawl_party.state;
        var hero = state && state.members.find(function (member) { return member.slot === actions.controlledSlot(); });
        if (!state || !state.tile_exclusions || actions.reason(hero)) return;
        cancel_exclusion(); hide_tooltip();
        window.crawl_party.armed_ping_kind = null;
        $(".party-ping-btn").removeClass("armed").attr("aria-pressed", "false");
        $(document).trigger("party_ping_mode");
        exclusion_selection = { slot: hero.slot, place: hero.place };
        $("<div id='workflow_exclusion_status' role='status'>Choose a tile: mark out of bounds or remove its exclusion. "
            + "<button type='button' class='workflow-button'>Cancel · Esc</button></div>")
            .insertBefore("#dcss_quick_dock").find("button").on("click", cancel_exclusion);
        $("#dungeon").css("cursor", "crosshair");
        $(window).trigger("resize");
    }).on("game_cleanup.mouse_control", cancel_exclusion)
        .on("party_state_rendered.mouse_control game_actions_changed.mouse_control party_ping_mode.mouse_control", function () {
            if (exclusion_selection && (!exclusion_valid() || window.crawl_party.armed_ping_kind)) cancel_exclusion();
        });
    document.addEventListener("keydown", function (event) {
        if (!exclusion_selection || ["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
        cancel_exclusion();
        if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    document.addEventListener("mousedown", function (event) {
        if (exclusion_selection && !$(event.target).closest("#dungeon, #minimap_overlay").length) cancel_exclusion();
    }, true);

    function handle_cell_click(ev)
    {
        // Context actions are selected on contextmenu, never on button-down.
        if (ev.which === 3 || (ev.which === 1 && ev.ctrlKey)) { ev.preventDefault(); return false; }
        if (exclusion_selection)
        {
            var selection = exclusion_selection, valid = exclusion_valid();
            cancel_exclusion();
            if (valid && ev.which === 1) comm.send_message("click_cell", {
                x: ev.cell.x, y: ev.cell.y, button: 1, exclude: true,
                expected_slot: selection.slot, expected_place: selection.place
            });
            ev.preventDefault();
            return false;
        }
        if (window.crawl_party && window.crawl_party.armed_ping_kind)
        {
            var kind = window.crawl_party.armed_ping_kind;
            window.crawl_party.armed_ping_kind = null;
            $(".party-ping-btn").removeClass("armed");
            $("#dungeon").css("cursor", "");
            $(document).trigger("party_ping_mode");
            pings.send(ev.cell.x, ev.cell.y, kind);
            ev.preventDefault();
            return false;
        }
        if ((ev.altKey && ev.which === 1) || ev.which === 2)
        {
            pings.send(ev.cell.x, ev.cell.y, ev.shiftKey ? "danger" : "look");
            ev.preventDefault();
            return false;
        }
        if (planner.click(ev)) return false;
        comm.send_message("click_cell", {
            x: ev.cell.x,
            y: ev.cell.y,
            button: ev.which
        });
    }

    function show_tooltip(text, x, y)
    {
        $("#tooltip")
            .html(text)
            .css({ left: x, top: y })
            .show();
    }

    function hide_tooltip()
    {
        tip_host.hidden();
        $("#tooltip").hide().attr("aria-hidden", "true");
    }

    var tip_host = nested.host("cell", function () {
        return document.getElementById("tooltip");
    }, hide_tooltip);

    function handle_cell_tooltip(ev)
    {
        if (suppress_hover || exclusion_selection || menus.isOpen()) return;
        // The pointer has entered a locked card; don't replace it underneath.
        if (tip_host.locked && tip_host.holds(nested.pointer())) return;
        if (nested.pointer() && !ev.currentTarget.contains(nested.pointer())) return;
        var map_cell = map_knowledge.get(ev.cell.x, ev.cell.y);

        if (!map_cell) return;
        var visible = map_knowledge.visible(map_cell);
        var state = window.crawl_party && window.crawl_party.state;
        var member = state && state.members && state.members.find(function (m) {
            return m.on_same_level !== false && m.pos && m.pos.x === ev.cell.x && m.pos.y === ev.cell.y;
        });
        var card;
        if (member && visible) {
            card = { title: member.name, badge: "Party Hero",
                body: member.species + " " + member.job + "\nHP " + member.hp + "/" + member.hp_max
                    + " · MP " + member.mp + "/" + member.mp_max,
                meta: "Open the Party Sheet to inspect this hero." };
        } else if (map_cell.mon) {
            var mon = map_cell.mon;
            var threats = ["Trivial threat", "Easy threat", "Dangerous threat", "Extremely dangerous"];
            card = { title: mon.name, badge: visible ? "Creature" : "Last seen",
                body: mon.att > 0 ? "Friendly or neutral creature." : (threats[mon.threat] || "Creature in the dungeon."),
                meta: "Right-click for actions and the full description." };
            if (mon.typedata && mon.typedata.avghp)
                card.body += "\nTypical health: " + mon.typedata.avghp + " HP (species average).";
            if (visible && api.game && api.game.can_target()) card.meta += " Left-click to select a target.";
        } else if (map_cell.item_name) {
            card = { title: map_cell.item_name, badge: visible ? "Item" : "Remembered item",
                body: map_cell.item_description || "",
                meta: "Right-click for actions. Stand on the tile to pick up." };
        } else if (map_cell.feature_name && !/^(a |an |the )?(floor|.*wall|rock)$/i.test(map_cell.feature_name)) {
            card = { title: map_cell.feature_name, badge: visible ? "Terrain" : "Explored terrain",
                body: "A known feature of the dungeon.", meta: "Right-click for actions and the full description." };
        }
        if (!card) { hide_tooltip(); return; }
        if (map_cell.item_name && (member || map_cell.mon))
            card.body += "\nOn the ground: " + map_cell.item_name;
        cards.show("#tooltip", card, ev.clientX, ev.clientY);
        tip_host.shown(null);
        // The host adds reading controls; measure again after that content.
        cards.position("#tooltip", ev.clientX, ev.clientY);
    }

    $(document)
        .off("game_init.mouse_control")
        .on("game_init.mouse_control", function () {
            $("#dungeon")
                .on("cell_click", handle_cell_click)
                .on("cell_contextmenu", function (event) {
                    if (exclusion_selection) {
                        cancel_exclusion(); event.preventDefault(); return;
                    }
                    hide_tooltip(); dungeonMenus.open(event);
                })
                .on("cell_tooltip", handle_cell_tooltip)
                .on("mouseleave", function () { if (!tip_host.locked) hide_tooltip(); })
                .contextmenu(function() { return false; });
        });
    $(window)
        .off("mouseup.mouse_control mousemove.mouse_control mousedown.mouse_control")
        .on("mousemove.mouse_control", function (ev) {
            suppress_hover = false;
            // A locked card waits for the pointer to travel into it.
            if (!tip_host.locked) hide_tooltip();
        })
        .on("mousedown.mouse_control", function (ev) {
            if (tip_host.locked && tip_host.holds(ev.target)) return;
            hide_tooltip();
        });
    $(document).off("keydown.mouse_control").on("keydown.mouse_control", function () {
        suppress_hover = true;
    });

    return api;
});
