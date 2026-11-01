define(["jquery", "comm", "chat", "client", "./status-icons", "interface-polish", "./encyclopedia", "library-ui", "./gameplay-controls", "./hud-inventory", "./panel-workspace", "./hud-iconography", "./hud-polish", "./viewport-zoom", "./quickbar", "./player-card-details", "./hud-bottom-strip", "./player-card-sections", "./party-progress", "./party-card-readings", "./floor-items", "./session-menu", "./assimilation-panel", "./hud-input", "./premium-dungeon", "./common-hotkeys", "./mission-bar", "./action-feedback", "./pointer-intent", "./play-guide"],
function ($, comm, chat, client, icons, polish, encyclopedia, library, controls, inventory, workspace, iconography, hudPolish, viewportZoom, quickbar, cardDetails, bottomStrip, cardSections, progress, cardReadings, floorItems, sessionMenu, assimilation, hudInput, premium, hotkeys, missionBar, feedback, pointerIntent, playGuide) {
    "use strict";
    var statusObserver;

    function init() {
        var dock = document.getElementById("dcss_quick_dock");
        if (!dock) return;
        hudInput.init();
        feedback.init();
        encyclopedia.init();
        library.init();
        // Control activation stays local; hud-input routes gameplay keys before
        // these bubble handlers, including for controls added by the library.
        $(dock).off(".adventureInput").on("keydown.adventureInput keypress.adventureInput",
            "button, a, input, select, textarea, summary, [role='button']", function (event) {
                event.stopPropagation();
            });
        polish.observe(document.getElementById("normal"));
        polish.observe(document.getElementById("party_inspector_modal"));
        if (!document.getElementById("dock_chat_btn")) {
            var chatButton = $("<button type='button' id='dock_chat_btn' class='dcss-dock-btn'></button>")
                .attr({ "data-tip-title": "Expedition Chat", "data-tip-key": "F12",
                    "data-tip-body": "Chat with players and spectators in this expedition. Enter sends; Escape returns to the dungeon." })
                .append(icons.icon("chat"), document.createTextNode(" Chat "),
                    $("<span id='dock_chat_count' hidden></span>"));
            $(dock).append(chatButton);
        }
        if (!document.getElementById("dock_codex_btn")) {
            $("<button type='button' id='dock_codex_btn' class='dcss-dock-btn'></button>")
                .attr({ "data-tip-title": "Dungeon Encyclopedia", "data-tip-key": "?/",
                    "data-tip-body": "Search the game's descriptions of monsters, items, spells, gods, abilities, terrain, mutations, and status effects. Opening the encyclopedia takes no turn." })
                .append(icons.icon("codex"), document.createTextNode(" Encyclopedia"))
                .appendTo(dock);
        }
        $("#dock_chat_btn").off("click.adventure").on("click.adventure", function () { chat.focus(); });
        $("#dock_codex_btn").prop("disabled", client.is_watching()).off("click.adventure").on("click.adventure", function () {
            comm.send_message("lookup_open", {});
        });
        $("#chat_input").attr({ "aria-label": "Message this expedition", placeholder: "Message expedition… Enter to send", maxlength: 500 });
        $("#chat_history").attr({ role: "log", "aria-live": "polite", "aria-relevant": "additions" });
        $("#chat_caption").attr("aria-label", "Toggle expedition chat");
        if (statusObserver) statusObserver.disconnect();
        var lights = document.getElementById("stats_status_lights");
        if (lights) {
            statusObserver = new MutationObserver(function () { icons.decorate(lights); });
            statusObserver.observe(lights, { childList: true, subtree: true, characterData: true });
            icons.decorate(lights);
        }
        controls.init();
        if (!document.getElementById("hud_sidebar_scroll")) {
            var scroll = $("<div id='hud_sidebar_scroll'></div>").prependTo("#right_column");
            $("#party_hud, #monster_list").appendTo(scroll);
        }
        cardSections.init();
        inventory.init();
        viewportZoom.init();
        bottomStrip.init();
        premium.init();
        floorItems.init();
        pointerIntent.init();
        playGuide.init();
        workspace.init();
        iconography.init();
        hudPolish.init();
        quickbar.init();
        sessionMenu.init();
        hotkeys.init();
        cardDetails.mount();
        progress.init();
        if (missionBar) missionBar.init();
        cardReadings.init();
        assimilation.init();
    }
    $(document).on("game_init.adventure", init).on("game_cleanup.adventure", function () {
        library.reset();
        if (statusObserver) statusObserver.disconnect();
    }).on("chat_unread_changed.adventure", function (ev, count) {
        $("#dock_chat_count").text(count).prop("hidden", count === 0);
        $("#dock_chat_btn").attr("aria-label", "Expedition chat" + (count ? ", " + count + " unread messages" : ""));
    });
    return { init: init };
});
