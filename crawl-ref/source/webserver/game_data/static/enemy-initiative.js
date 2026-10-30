define(["jquery", "./party-initiative", "./party-model", "./frame-update", "./enemy-banner-model",
        "./view_data", "./enums", "./map_knowledge", "./cell_renderer", "./tileinfo-main", "./util", "./dungeon-context-menu", "./status-icons", "./indexed-paint", "./monster_list", "./creature-roster-model", "./collapsible-roster"],
function ($, initiative, party, frameUpdate, model, view, enums, map, cells, main, util, contextMenu, icons, indexedPaint, nearby, roster, createRoster) {
    "use strict";
    var observer, state, hovered, cursor, disclosure, rosterSignature, nodes = new Map();
    function clearTarget() {
        if (cursor && view.cursor_locs[enums.CURSOR_MOUSE] === cursor)
            view.remove_cursor(enums.CURSOR_MOUSE);
        hovered = null; cursor = null;
    }
    function point(node) {
        clearTarget();
        hovered = node;
        cursor = { x: node.enemy.x, y: node.enemy.y };
        view.place_cursor(enums.CURSOR_MOUSE, cursor);
    }
    function position() {
        var rail = document.getElementById("enemy_initiative_rail");
        var hud = document.querySelector("#party_hud .is-controlled-card") || document.getElementById("party_hud_members");
        var doom = document.getElementById("party_doom_meter");
        if (!rail || !hud) return;
        var bounds = hud.getBoundingClientRect();
        var layout = model.layout(bounds, doom && doom.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
        rail.classList.toggle("is-compact", layout.compact);
        rail.style.visibility = !layout.compact && (bounds.bottom <= 0 || bounds.top >= window.innerHeight) ? "hidden" : "";
        var styles = layout.compact ? { left: "", top: "" }
            : { left: layout.left + "px", top: layout.top + "px" };
        Object.keys(styles).forEach(function (name) { if (rail.style[name] !== styles[name]) rail.style[name] = styles[name]; });
        var height = layout.compact ? Math.max(0, Math.min(240, window.innerHeight - rail.getBoundingClientRect().top - 12)) : layout.maxHeight;
        if (rail.style.maxHeight !== height + "px") rail.style.maxHeight = height + "px";
    }
    var refresh = frameUpdate(position);
    var portraits = indexedPaint(function (node) {
        var enemy = node.enemy;
        if (!node.renderer) {
            node.renderer = new cells.DungeonCellRenderer();
            util.init_canvas(node.parts.canvas, 32, 32); node.renderer.init(node.parts.canvas);
        }
        node.renderer.clear();
        if (enemy.perception === "last_known") node.renderer.draw_main(main.UNSEEN_INVISIBLE, 0, 0, 1);
        else if (map.get(enemy.x, enemy.y).t) node.renderer.render_cell(enemy.x, enemy.y, 0, 0);
    });
    function effectIcon(effect, enemy) {
        // Use the player badge primitive when present; retain compatible badges
        // for existing bundles that export only the shared glyphs and resolver.
        var badge = icons.effect ? icons.effect(effect) : document.createElement("span");
        if (!icons.effect) {
            badge.className = "party-effect is-" + effect.tone;
            badge.appendChild(icons.icon(effect.key === "unknown" ? "question" : icons.resolve(effect.name)));
            $(badge).attr({ "data-tip-title": effect.name, "data-tip-body": effect.description,
                "data-tip-meta": effect.tone === "bad" ? "Harmful effect" : "Active effect",
                "data-effect-key": effect.key });
            if (effect.tone === "bad") $(badge).append("<span class='party-effect-warning' aria-hidden='true'></span>");
        }
        badge.classList.add("party-status-icon");
        badge.removeAttribute("tabindex"); // The containing banner is the keyboard action.
        badge.setAttribute("role", "img");
        badge.setAttribute("aria-label", enemy.name + ": " + effect.name);
        return badge;
    }
    function menu(event, node) {
        event.cell = { x: node.enemy.x, y: node.enemy.y };
        var expected = Object.assign({}, node.enemy), floor = state && state.floor, slot = state && party.controlledSlot(state);
        contextMenu.open(event, { title: expected.name + (expected.perception === "last_known" ? " · Last known location" : ""),
            valid: function () { return state && state.floor === floor && node.isConnected
                && slot === party.controlledSlot(state) && currentContacts().some(function (contact) {
                    return roster.key(expected) === roster.key(contact) && model.sameContact(expected, contact)
                        && roster.category(expected) === roster.category(contact);
                }); } });
    }
    function create(enemy, key) {
        var node = document.createElement("button");
        node.type = "button"; node.className = "enemy-timing"; node.dataset.enemyId = key;
        node.setAttribute("aria-haspopup", "menu");
        node.innerHTML = "<canvas class='enemy-timing-icon' aria-hidden='true'></canvas><span class='enemy-timing-details'>"
            + "<span class='enemy-timing-name'></span><span class='enemy-health-track' aria-hidden='true'><i></i></span>"
            + "<span class='enemy-timing-track' aria-hidden='true'><i></i></span><small></small><span class='enemy-timing-effects'></span></span>";
        node.parts = { canvas: node.querySelector("canvas"), name: node.querySelector(".enemy-timing-name"),
            reading: node.querySelector("small"), effects: node.querySelector(".enemy-timing-effects"),
            health: node.querySelector(".enemy-health-track"), timing: node.querySelector(".enemy-timing-track") };
        node.parts.healthFill = node.parts.health.querySelector("i");
        node.parts.timingFill = node.parts.timing.querySelector("i");
        $(node).on("mouseenter focusin", function () { point(node); })
            .on("mouseleave focusout", function () { if (hovered === node) clearTarget(); })
            .on("contextmenu click", function (event) { menu(event, node); })
            .on("keydown", function (event) {
                if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) menu(event, node);
            });
        return node;
    }
    function currentContacts() {
        return roster.collect(state && state.enemy_initiative, nearby.contacts());
    }
    function card(enemy) {
        var key = roster.key(enemy), node = nodes.get(key);
        if (!node) { node = create(enemy, key); nodes.set(key, node); }
        var moved = !model.sameContact(node.enemy, enemy), signature = JSON.stringify(enemy);
        if (node.readingSignature === signature) return node;
        node.readingSignature = signature;
        var data = model.project(enemy);
        node.enemy = enemy;
        portraits.track(node, enemy.x, enemy.y);
        if (moved) portraits.invalidate(node);
        if (hovered === node && moved) point(node);
        [[node.parts.health, node.parts.healthFill, data.health], [node.parts.timing, node.parts.timingFill, data.initiative]].forEach(function (bar) {
            var known = String(bar[2] !== null), width = (bar[2] === null ? 100 : bar[2]) + "%";
            if (bar[0].dataset.known !== known) bar[0].dataset.known = known;
            if (bar[1].style.width !== width) bar[1].style.width = width;
        });
        var statusSignature = JSON.stringify([enemy.name, data.remembered, data.statusSubject]);
        signature = JSON.stringify([enemy.name, Boolean(enemy.ready) && data.timed, data.remembered,
            data.reading, data.healthText, statusSignature]);
        if (node.signature === signature) return node;
        node.signature = signature;
        var ready = String(Boolean(enemy.ready) && data.timed), perception = data.remembered ? "last_known" : "visible";
        if (node.dataset.ready !== ready) node.dataset.ready = ready;
        if (node.dataset.perception !== perception) node.dataset.perception = perception;
        if (node.parts.name.textContent !== enemy.name) node.parts.name.textContent = enemy.name;
        if (node.parts.reading.textContent !== data.reading) node.parts.reading.textContent = data.reading;
        if (node.statusSignature !== statusSignature) {
            node.statusSignature = statusSignature;
            var $effects = $(node.parts.effects).empty();
            data.effects.forEach(function (effect) { $effects.append(effectIcon(effect, enemy)); });
        }
        var effectNames = data.effects.map(function (effect) { return effect.name; }).join(", ");
        var attributes = { "aria-label": enemy.name + ": " + data.healthText + "; initiative: " + data.reading
                + (effectNames ? "; effects: " + effectNames : "") + ". Open monster menu",
            "data-tip-title": enemy.name + (data.remembered ? " · Last known location" : ""),
            "data-tip-body": data.remembered ? "Native invisible contact. The reticle marks its last known location; current health, action energy and position are unknown."
                : data.healthText + ". Initiative: " + data.reading + ". The filling bar shows readiness based on the creature's speed and recovery."
                    + (effectNames ? " Active effects: " + effectNames + "." : ""),
            "data-tip-meta": "Hover to locate · Click or right-click for monster menu" };
        Object.keys(attributes).forEach(function (name) {
            if (node.getAttribute(name) !== attributes[name]) node.setAttribute(name, attributes[name]);
        });

        return node;
    }
    function render() {
        var rail = document.getElementById("enemy_initiative_rail");
        if (!rail || !disclosure) return;
        var hero = state && (state.members || []).find(function (entry) { return entry.slot === party.controlledSlot(state); });
        var label = "Nearby creatures beside " + (hero ? hero.name : "player");
        if (rail.getAttribute("aria-label") !== label) rail.setAttribute("aria-label", label);
        var contacts = currentContacts(), signature = JSON.stringify(contacts);
        rail.hidden = !contacts.length && !(state && state.multiplayer);
        if (signature === rosterSignature) return;
        rosterSignature = signature;
        disclosure.update(roster.groups(contacts), card);
        nodes.forEach(function (node, key) {
            if (!node.isConnected) {
                if (hovered === node) clearTarget();
                portraits.remove(node); nodes.delete(key);
            }
        });
        var empty = rail.querySelector(".enemy-timing-empty");
        empty.hidden = contacts.length > 0;
        if (empty.textContent !== "No nearby creatures") empty.textContent = "No nearby creatures";
        refresh();
    }
    var renderFrame = frameUpdate(render);
    function update(next) {
        if (state && next && (state.floor !== next.floor || party.controlledSlot(state) !== party.controlledSlot(next))) {
            clearTarget(); portraits.changed(); rosterSignature = null;
        }
        state = next;
        var $rail = $("#enemy_initiative_rail");
        if (!$rail.length) return;
        $rail.attr("data-native-readings", String(Boolean(next && Array.isArray(next.enemy_initiative))));
        initiative.updateMonster($("#party_progress_monsters"), next);
        var hero = next && (next.members || []).find(function (entry) { return entry.slot === party.controlledSlot(next); });
        $rail.attr("aria-label", "Nearby creatures beside " + (hero ? hero.name : "player"));
        render();
    }
    function init() {
        if (!$("#party_hud").length) return;
        clearTarget(); renderFrame.cancel(); portraits.clear(); nodes.clear(); rosterSignature = null;
        var $meter = $("#party_progress_monsters").detach();
        $("#enemy_initiative_rail").remove();
        var $rail = $("<aside id='enemy_initiative_rail' data-creature-groups='true' hidden><div class='creature-categories'></div><small class='enemy-timing-empty'></small></aside>");
        $rail.append($meter.length ? $meter : initiative.createMonster()).prependTo("#party_hud");
        disclosure = createRoster($rail.find(".creature-categories")[0], function () {
            rosterSignature = null; render(); refresh();
        });
        $rail.on("click keydown keypress keyup mousedown mouseup", function (event) { event.stopPropagation(); });
        if (observer) observer.disconnect();
        observer = new ResizeObserver(refresh);
        observer.observe(document.getElementById("party_hud"));
        $("#hud_sidebar_scroll").off("scroll.enemyInitiative").on("scroll.enemyInitiative", refresh);
        update(window.crawl_party && window.crawl_party.state);
    }
    $(document).on("party_state_rendered.enemyInitiative", function (event, next) {
        // Keep native state current for menu validation; coalesce presentation bursts.
        if (state && next && (state.floor !== next.floor || party.controlledSlot(state) !== party.controlledSlot(next))) {
            clearTarget(); portraits.changed(); rosterSignature = null;
        }
        state = next; renderFrame();
        initiative.updateMonster($("#party_progress_monsters"), next);
    })
        .on("nearby_creatures_changed.enemyInitiative", renderFrame)
        .on("map_knowledge_changed.enemyInitiative dungeon_tiles_changed.enemyInitiative", function (event, changed) { portraits.changed(changed); })
        .on("hud_workspace_changed.enemyInitiative", refresh)
        .on("game_cleanup.enemyInitiative", function () {
            clearTarget(); renderFrame.cancel(); refresh.cancel(); portraits.clear(); nodes.clear(); if (observer) observer.disconnect(); observer = null;
            state = null; disclosure = null; rosterSignature = null; $("#enemy_initiative_rail").remove();
        });
    $(window).on("resize.enemyInitiative scroll.enemyInitiative", refresh)
        .on("blur.enemyInitiative", clearTarget);
    return { init: init, update: update };
});
