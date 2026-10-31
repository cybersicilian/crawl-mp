define(["jquery", "./party-sidebar"], function ($, sidebar) {
    "use strict";
    var retained = {}, focused = "";
    var ids = ["hud_powers", "hud_inventory"];

    function preserve() {
        ids.forEach(function (id) {
            var panel = document.getElementById(id);
            if (!panel || !panel.closest("#party_hud_members")) return;
            if (panel.contains(document.activeElement)) focused = document.activeElement.id;
            retained[id] = $(panel).detach();
        });
    }
    function dock(panel) {
        panel.removeClass("hud-floating hud-workspace-panel");
        panel.children(".hud-panel-move, .hud-panel-resize").remove();
        ["left", "top", "width", "height", "--panel-width"].forEach(function (name) {
            panel[0].style.removeProperty(name);
        });
    }
    function mount() {
        var card = $(".party-card.is-controlled-card").first();
        var state = window.crawl_party && window.crawl_party.state;
        if (!state || !state.members || !state.members.length) card = $();
        var sections = card.children(".party-card-sections");
        var available = ids.some(function (id) { return document.getElementById(id) || retained[id]; });
        if (!available) return;
        if (card.length && !sections.length) {
            sections = $("<div class='party-card-sections' role='group' aria-label='Your actions and inventory'></div>")
                .on("click.cardSections contextmenu.cardSections", function (event) { event.stopPropagation(); })
                .appendTo(card);
        }
        ids.forEach(function (id) {
            var panel = $(document.getElementById(id));
            if (!panel.length && retained[id]) panel = retained[id];
            if (!panel.length) return;
            dock(panel);
            if (card.length) {
                if (panel.parent()[0] !== sections[0]) panel.detach().appendTo(sections);
            }
            else {
                var sidebar = $("#hud_sidebar_scroll");
                if (!sidebar.length) sidebar = $("#right_column");
                if (panel.parent()[0] !== sidebar[0]) panel.detach().appendTo(sidebar);
            }
            delete retained[id];
        });
        $(document).trigger("player_card_sections_mounted");
        // Keep the same native nodes and listeners when snapshots rebuild cards.
        if (focused) {
            var target = document.getElementById(focused);
            if (target) target.focus({ preventScroll: true });
            focused = "";
        }
    }
    function init() {
        sidebar.init();
        $(document).off(".cardSections")
            .on("party_cards_rebuilding.cardSections", preserve)
            .on("party_state_rendered.cardSections hud_inventory_ready.cardSections", mount)
            .on("game_cleanup.cardSections", function () { retained = {}; focused = ""; });
        mount();
    }
    return { init: init, preserve: preserve, mount: mount };
});
