/* Spend spare sidebar height on native player facts, then additional pack rows. */
define(["jquery", "./hud-inventory", "./party-model", "item-properties", "character-stat-help", "./frame-update"],
function ($, inventory, model, properties, help, frameUpdate) {
    "use strict";
    var observer, observed = [], focused = "", focusedSlot = null;
    function preserveFocus() {
        var target = document.activeElement;
        if (target && target.closest(".party-sidebar-extra, .party-sidebar-pack")) {
            focused = target.id;
            focusedSlot = target.closest(".party-card").dataset.partySlot;
        }
    }
    function isolate(event) {
        if (event.type.indexOf("key") === 0 && event.key === "Tab") return;
        event.stopPropagation();
    }
    function reading(hero, key, definition, value, glyph) {
        var known = Number.isFinite(value) || typeof value === "boolean";
        var text = known ? String(typeof value === "boolean" ? Number(value) : value) : "?";
        return $("<span class='party-sidebar-reading' tabindex='0' role='img'></span>")
            .attr({ id: "party_detail_" + hero.slot + "_" + key, "data-reading": key,
                "aria-label": definition.title + ": " + (known ? text : "unavailable"),
                "data-tip-title": definition.title, "data-tip-body": definition.body,
                "data-tip-meta": known ? "Current native value: " + text : "Current value unavailable",
                "data-value-state": known ? value < 0 ? "negative" : "known" : "unknown" })
            .append(definition.key ? properties.levelIcons(glyph, help.levels(definition, value))
                : [properties.icon(glyph), $("<span></span>").text(text)])
            .on("click keydown keypress keyup", isolate);
    }
    function details(hero, controlled) {
        var root = $("<div class='party-sidebar-extra' role='group' hidden></div>")
            .attr("aria-label", "Attributes and defenses for " + hero.name);
        if (!controlled) {
            var attributes = $("<div class='party-sidebar-attributes'></div>");
            [["str", "str", "strength"], ["int", "intel", "intelligence"], ["dex", "dex", "dexterity"]]
                .forEach(function (entry) {
                    attributes.append(reading(hero, entry[0], help.stats[entry[0]], hero[entry[1]], entry[2]));
                });
            root.append(attributes);
        }
        var defenses = $("<div class='party-sidebar-defenses' role='group' aria-label='Resistances'></div>");
        help.resistances.filter(function (entry) { return entry.start; }).forEach(function (entry) {
            defenses.append(reading(hero, entry.key, entry, hero.resists && hero.resists[entry.key], entry.icon));
        });
        return root.append(defenses).on("click contextmenu keydown keypress keyup", isolate);
    }
    function pack(hero) {
        var root = $("<section class='party-sidebar-pack' hidden></section>")
            .attr("aria-label", "Inventory for " + hero.name);
        var heading = $("<header></header>");
        var open = $("<button type='button' class='party-sidebar-pack-open'>Inventory</button>")
            .attr({ id: "party_pack_open_" + hero.slot, "aria-label": "Open inventory for " + hero.name,
                "data-tip-title": "Inventory for " + hero.name, "data-tip-meta": "Inspect equipment and carried items" })
            .on("click", function () { window.crawl_party.open_inspector(hero.slot, "equipment"); });
        heading.append(open, $("<small></small>").text(hero.inventory_known === false ? "Unavailable" : hero.inventory.length + " / 52"));
        var grid = $("<div class='hud-item-grid party-sidebar-items' role='group'></div>")
            .attr("aria-label", "Carried items for " + hero.name);
        hero.inventory.forEach(function (item) { grid.append(inventory.itemButton(hero, item, true)); });
        if (!grid.children().length) grid.append($("<p class='hud-empty'></p>").text(
            hero.inventory_known === false ? "Inventory information unavailable." : "Pack is empty."));
        return root.append(heading, grid).on("click contextmenu keydown keypress keyup", isolate);
    }
    function render() {
        var state = window.crawl_party && window.crawl_party.state;
        if (!state || !Array.isArray(state.members)) return;
        $("#party_hud_members > .party-card").each(function () {
            var card = $(this), hero = state.members.find(function (member) { return member.slot === Number(card.attr("data-party-slot")); });
            if (!hero) return;
            var controlled = hero.slot === model.controlledSlot(state);
            var signature = JSON.stringify([hero.name, controlled, hero.str, hero.intel, hero.dex,
                hero.resists, hero.inventory_known, hero.inventory, inventory.artState(hero)]);
            if (card.data("sidebarSignature") === signature) return;
            card.data("sidebarSignature", signature);
            var grid = card.find(".party-sidebar-items"), scroll = grid.scrollTop();
            card.children(".party-sidebar-extra, .party-sidebar-pack").remove();
            var extra = details(hero, controlled), sections = card.children(".party-card-sections");
            if (sections.length) extra.insertBefore(sections);
            else card.append(extra);
            if (!controlled) card.append(pack(hero));
            card.find(".party-sidebar-items").scrollTop(scroll);
        });
    }
    function pixels(value) { return parseFloat(value) || 0; }
    function rowHeight(grid) {
        var style = getComputedStyle(grid), first = grid.firstElementChild;
        return first ? Math.ceil(first.getBoundingClientRect().height + pixels(style.rowGap)) : 0;
    }
    function minimum(grid) {
        var style = getComputedStyle(grid), first = grid.firstElementChild;
        return Math.ceil((first ? first.getBoundingClientRect().height : 0)
            + pixels(style.paddingTop) + pixels(style.paddingBottom));
    }
    function fit() {
        var scroll = document.getElementById("hud_sidebar_scroll");
        var party = document.getElementById("party_hud");
        if (!scroll || !party || party.classList.contains("hud-floating") || !scroll.clientHeight) return;
        var active = document.activeElement, scrollTop = scroll.scrollTop;
        var packScrolls = [];
        var extras = Array.from(party.querySelectorAll(".party-sidebar-extra, .party-sidebar-pack"));
        var grids = Array.from(party.querySelectorAll("#hud_inventory .hud-item-grid, #hud_powers > .hud-panel-body, .party-sidebar-items"));
        // Measure every optional section at its minimum, including currently hidden packs.
        extras.forEach(function (node) { node.hidden = false; });
        grids.forEach(function (grid) {
            packScrolls.push(grid.scrollTop);
            grid.style.maxHeight = minimum(grid) + "px";
        });
        extras.forEach(function (node) { node.hidden = true; });
        function fits() { return scroll.scrollHeight <= scroll.clientHeight; }
        // A first row for each companion has priority over deeper rows in one pack.
        extras.filter(function (node) { return node.classList.contains("party-sidebar-pack"); })
            .concat(extras.filter(function (node) { return node.classList.contains("party-sidebar-extra"); }))
            .forEach(function (node) {
                node.hidden = false;
                if (!fits()) node.hidden = true;
            });
        var visibleGrids = grids.filter(function (grid) { return grid.getBoundingClientRect().height > 0; });
        var grew = true;
        while (grew && fits()) {
            grew = false;
            visibleGrids.forEach(function (grid) {
                var before = pixels(grid.style.maxHeight), natural = grid.scrollHeight;
                if (before >= natural) return;
                grid.style.maxHeight = Math.min(natural, before + rowHeight(grid)) + "px";
                if (fits()) grew = true;
                else grid.style.maxHeight = before + "px";
            });
        }
        grids.forEach(function (grid, index) { grid.scrollTop = packScrolls[index]; });
        scroll.scrollTop = scrollTop;
        // Collapsing a preview must never leave keyboard focus inside hidden content.
        if (active && active.closest(".party-sidebar-extra[hidden], .party-sidebar-pack[hidden]")) {
            var card = active.closest(".party-card"), target = card && card.querySelector(".party-inspect-btn");
            if (target) target.focus({ preventScroll: true });
        }
    }
    function watch() {
        if (!observer) return;
        $("#hud_sidebar_scroll, #party_hud, #monster_list, #hud_inventory, #hud_powers").each(function () {
            if (!observed.includes(this)) { observed.push(this); observer.observe(this); }
        });
    }
    function update() {
        preserveFocus();
        render(); fit(); watch();
        if (focused) {
            var target = document.getElementById(focused);
            focused = "";
            if (!target || !target.getClientRects().length) {
                var card = document.querySelector(".party-card[data-party-slot='" + focusedSlot + "']");
                target = card && card.querySelector(".party-inspect-btn");
            }
            focusedSlot = null;
            if (target) target.focus({ preventScroll: true });
        }
    }
    var refresh = frameUpdate(update);
    function stop() {
        refresh.cancel();
        if (observer) observer.disconnect();
        observer = null; observed = []; focused = ""; focusedSlot = null;
    }
    function init() {
        stop();
        observer = new ResizeObserver(refresh);
        $(document).off(".partySidebar")
            .on("party_state_rendered.partySidebar hud_inventory_updated.partySidebar inventory_art_ready.partySidebar hud_workspace_changed.partySidebar", refresh)
            .on("party_cards_rebuilding.partySidebar", preserveFocus).on("game_cleanup.partySidebar", stop);
        $(window).off("resize.partySidebar").on("resize.partySidebar", refresh);
        update();
    }
    return { init: init, update: update, fit: fit };
});
