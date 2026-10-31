define(["jquery", "comm", "client", "./workflow-actions", "./minimap", "./power-picker", "./frame-update", "./party-model", "./inspection-dialog", "./game-context", "./enums"],
function ($, comm, client, actions, minimap, powerPicker, frameUpdate, model, inspection, game, enums) {
    "use strict";
    var camera = null, compactChoice = null;
    var labels = { o: "Explore", "\t": "Fight", "5": "Rest", g: "Pick up",
        i: "Inventory", z: "Cast", a: "Ability", m: "Skills", A: "Traits", "%": "Resists", "<": "Up stairs", ">": "Down stairs" };
    // Keys the engine only accepts for the controlling hero's own turn.
    var turnKeys = ["o", "\t", "5", "g"];
    var sectionKeys = { i: "equipment", I: "abilities", "@": "overview", X: "map",
        m: "skills", A: "mutations", "%": "overview", z: "abilities", a: "abilities" };
    function party() { return window.crawl_party && window.crawl_party.state; }
    function rename(button, label) {
        Array.from(button.childNodes).forEach(function (node) { if (node.nodeType === 3) node.remove(); });
        var text = button.querySelector(".workflow-action-label");
        if (!text) { text = document.createElement("span"); text.className = "workflow-action-label"; button.appendChild(text); }
        text.textContent = label;
    }
    function current() {
        var state = party();
        return state && state.members.find(function (member) { return member.slot === actions.controlledSlot(); });
    }
    function openSection(section, key) {
        if (section === "map") {
            var source = document.getElementById("minimap"), canvas = document.createElement("canvas");
            if (!source || !source.width || !source.height) return;
            canvas.width = source.width; canvas.height = source.height;
            canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "Explored terrain on your current floor");
            canvas.className = "inspection-map";
            canvas.getContext("2d").drawImage(source, 0, 0);
            var overlay = document.getElementById("minimap_overlay");
            if (overlay && overlay.width && overlay.height) canvas.getContext("2d").drawImage(overlay, 0, 0);
            inspection.showContent("Level map", canvas, "Your explored map at opening. Viewing takes no turn.");
            return;
        }
        if (key === "z" || key === "a") { powerPicker.open(key === "z" ? "spell" : "ability"); return; }
        if (window.crawl_party && window.crawl_party.open_inspector)
            window.crawl_party.open_inspector(actions.controlledSlot(), section);
        var heading = document.getElementById(key === "z" ? "party_spells_heading" : key === "a" ? "party_abilities_heading" : "");
        if (heading) { heading.scrollIntoView({ block: "nearest" }); heading.focus({ preventScroll: true }); }
    }
    function organizeLibrary() {
        var library = document.getElementById("library_dock");
        if (!library) return;
        var details = document.getElementById("workflow_expedition_details");
        if (!details) {
            details = document.createElement("details"); details.id = "workflow_expedition_details";
            details.className = "workflow-expedition-details";
            details.innerHTML = "<summary>Expedition</summary><div class='hud-expedition-menu'></div>";
            library.appendChild(details);
        }
        var menu = details.querySelector(".hud-expedition-menu");
        library.querySelectorAll("a, #dock_save_exit_btn").forEach(function (element) {
            if (element.parentNode !== menu) menu.appendChild(element);
        });
        $("#workflow_item_settings").remove();
    }
    function init() {
        var dock = document.getElementById("dcss_quick_dock");
        if (!dock) return;
        document.body.classList.add("workflow-playing");
        var groups = {};
        var groupLabels = { exploration: "Move", combat: "Act", character: "Inspect", expedition: "Expedition" };
        ["exploration", "combat", "character", "expedition"].forEach(function (key) {
            var group = dock.querySelector("[data-action-group='" + key + "']");
            if (!group) {
                group = document.createElement("span"); group.className = "workflow-action-group";
                group.setAttribute("data-action-group", key); group.setAttribute("role", "group");
                group.setAttribute("aria-label", key); dock.appendChild(group);
            }
            group.setAttribute("data-label", groupLabels[key]);
            group.setAttribute("aria-label", groupLabels[key]);
            groups[key] = group;
        });
        $("#party_add_btn, #party_join_btn").appendTo(groups.expedition);
        dock.querySelectorAll("[data-dock-key]").forEach(function (button) {
            var key = button.getAttribute("data-dock-key");
            var group = ["o", "5", "g", "<", ">"].includes(key) ? "exploration"
                : ["\t", "z", "a"].includes(key) ? "combat" : "character";
            groups[group].appendChild(button);
            rename(button, labels[key] || button.textContent);
            if (sectionKeys[key]) $(button).off("click.workflow").on("click.workflow", function (event) {
                if (["i", "I", "@", "X"].includes(key) && !actions.reason(current())) return;
                event.stopPropagation(); event.preventDefault(); openSection(sectionKeys[key], key);
            });
        });
        var sheet = document.getElementById("dock_party_sheet_btn");
        if (sheet) { groups.character.appendChild(sheet); rename(sheet, "Character"); }
        ["dock_chat_btn", "dock_codex_btn", "library_dock"].forEach(function (id) {
            var element = document.getElementById(id); if (element) groups.expedition.appendChild(element);
        });
        organizeLibrary();
        if (!document.getElementById("workflow_map_btn")) {
            $("<button type='button' class='dcss-dock-btn' id='workflow_map_btn' data-dock-key='X'>Map <kbd>X</kbd></button>")
                .attr("title", "Open the native level map; Escape returns to play. Takes no turn.").appendTo(groups.exploration);
        }
        $("#workflow_map_btn").off("click.workflow").on("click.workflow", function (event) {
            if (!current() || !actions.reason(current())) return;
            event.preventDefault(); event.stopPropagation(); openSection("map", "X");
        });
        if (!document.getElementById("workflow_compact_btn")) {
            $("<button type='button' class='party-mini-btn dcss-dock-btn' id='workflow_compact_btn'>Compact roster</button>")
                .on("click", function () {
                    compactChoice = !document.body.classList.contains("workflow-compact-roster"); update();
                }).appendTo(groups.expedition);
        }
        if (!document.getElementById("workflow_camera_context"))
            $("<span id='workflow_camera_context' role='status'></span>").appendTo("#party_turn_banner");
        $("#party_turn_banner .party-banner-label").first().text("Controlling");
        $("#party_banner_cycle").attr({ "data-tip-title": "Control next hero",
            "data-tip-key": "Next button", "data-tip-meta": "Tab remains the native auto-fight shortcut." });
        $("#minimap_block").attr("data-tip-meta", "Right-drag to preview terrain. Open Map for native map navigation.");
        $("#hud_minimap").off("toggle.workflow").on("toggle.workflow", function () {
            minimap.fit_to($("#hud_minimap").width() || $("#stats").outerWidth()); minimap.update_overlay();
        });
        $("#hud_minimap").off("keydown.workflow keypress.workflow").on("keydown.workflow keypress.workflow", "summary", function (event) {
            event.stopPropagation();
        });
        update();
    }
    function cancelPing() {
        if (window.crawl_party) window.crawl_party.armed_ping_kind = null;
        $(".party-ping-btn").removeClass("armed").attr("aria-pressed", "false");
        $("#dungeon").css("cursor", ""); pingState();
    }
    function pingState() {
        var kind = window.crawl_party && window.crawl_party.armed_ping_kind;
        var status = document.getElementById("workflow_ping_status");
        if (!status) {
            status = document.createElement("div"); status.id = "workflow_ping_status";
            status.setAttribute("role", "status");
            status.innerHTML = "<span></span><button type='button' class='workflow-button'>Cancel · Esc</button>";
            status.querySelector("button").addEventListener("click", cancelPing);
            $(status).insertBefore("#dcss_quick_dock");
        }
        status.hidden = !kind;
        status.querySelector("span").textContent = kind ? "Place a " + kind + " ping: choose a map tile." : "";
        $(".party-ping-btn").each(function () {
            this.setAttribute("aria-pressed", String(this.getAttribute("data-ping-kind") === kind));
        });
    }
    var lastMinimapWidth = 0;
    function update() {
        var state = party(), member = current();
        if (!state || !member || !document.getElementById("workflow_compact_btn")) return;
        var compact = compactChoice === null ? window.innerHeight <= 900 && state.members.length > 2 : compactChoice;
        document.body.classList.toggle("workflow-compact-roster", compact);
        var compactLabel = compact ? "Show details" : "Compact roster";
        var $compactBtn = $("#workflow_compact_btn").attr("aria-pressed", String(compact));
        if ($compactBtn.attr("data-compact-label") !== compactLabel) {
            $compactBtn.attr({ "data-compact-label": compactLabel, "aria-label": compactLabel,
                "data-tip-title": compactLabel });
            // Preserve the icon and hidden label across snapshot updates.
            rename($compactBtn[0], compactLabel);
        }
        $("#party_banner_who").text("P" + (member.slot + 1) + " · " + member.name);
        var guest = client.is_watching() || Boolean(Number(window.crawl_party_slot || 0));
        $("#party_join_btn").toggle(client.is_watching());
        var guestTitle = guest ? "The expedition owner manages party rules and companions." : "";
        $("#party_banner_cycle").toggle(!guest && model.canSwitch(state)).prop("disabled", guest || !model.canSwitch(state));
        $("#party_add_btn, #party_banner_add")
            .prop("disabled", guest).each(function () {
                if ((this.getAttribute("data-guest-title") || "") !== guestTitle) {
                    this.setAttribute("data-guest-title", guestTitle);
                    this.setAttribute("title", guestTitle);
                }
            });
        // The multiplayer party renderer owns region, intent and recovery
        // text. Refreshing controls must not replace it with a floor-wide turn.
        if (!state.multiplayer) {
            var queued = state.combat_locked && !state.simultaneous_turns && member.slot !== state.active_slot;
            $("#party_banner_mode").text(queued ? "Tactical Combat · Waiting for P" + (state.active_slot + 1)
                : state.combat_locked ? "Tactical Combat" : "Free Explore");
        }
        var viewing = camera && state.members.find(function (hero) {
            return hero.pos && hero.pos.x === camera.x && hero.pos.y === camera.y;
        });
        $("#workflow_camera_context").text(viewing && viewing.slot !== member.slot ? "Viewing " + viewing.name
            : camera && member.pos && (camera.x !== member.pos.x || camera.y !== member.pos.y) ? "Camera away from " + member.name : "");
        var turnReason = actions.reason(member);
        $("#dcss_quick_dock [data-dock-key]").each(function () {
            var key = this.getAttribute("data-dock-key"), reason = "";
            if (turnKeys.includes(key)) {
                // Existing action guards decide; the engine still validates every key.
                this.disabled = Boolean(turnReason);
                var turnTip = turnReason || this.getAttribute("data-tip-meta") || "";
                if (this.getAttribute("data-turn-reason") !== turnReason) {
                    this.setAttribute("data-turn-reason", turnReason);
                    this.setAttribute("title", turnTip);
                }
            }
            if (key === "<" || key === ">") {
                var direction = key === "<" ? "up" : "down";
                reason = actions.reason(member) || (member.stairs === undefined ? "Stair information unavailable."
                    : member.stairs !== direction ? "Stand on a matching stair or portal first." : "");
                this.disabled = Boolean(reason);
                var stairTip = reason || "Use these stairs. Native travel requirements and warnings apply.";
                if (this.getAttribute("data-tip-body") !== stairTip) {
                    this.setAttribute("title", stairTip);
                    this.setAttribute("data-tip-body", stairTip);
                }
            }
            if (["z", "a"].includes(key)) {
                var list = key === "z" ? "spells" : "abilities";
                reason = !member[list + "_known"] ? "Capability information unavailable."
                    : !member[list].length ? (key === "z" ? "No spells memorised." : "No active abilities unlocked.") : "";
                this.disabled = Boolean(reason) || client.is_watching();
                var powerTip = reason || (key === "z" ? "Choose a spell. Native costs and targeting apply." : "Choose an active ability.");
                if (this.getAttribute("data-tip-body") !== powerTip) {
                    this.setAttribute("title", powerTip);
                    this.setAttribute("data-tip-body", powerTip);
                }
            }
        });
        var minimapWidth = $("#hud_minimap").width() || $("#stats").outerWidth();
        if (minimapWidth && minimapWidth !== lastMinimapWidth) {
            lastMinimapWidth = minimapWidth;
            minimap.fit_to(minimapWidth);
        }
    }
    var refresh = frameUpdate(update);
    $(document).on("party_state_rendered.workflow game_actions_changed.workflow", refresh)
        .on("game_library_controls.workflow", organizeLibrary)
        .on("game_camera_changed.workflow", function (event, center) { camera = center; refresh(); })
        .on("game_cleanup.workflowControls", function () {
            refresh.cancel(); cancelPing(); camera = null; compactChoice = null;
            document.body.classList.remove("workflow-compact-roster", "workflow-playing");
        }).on("party_ping_mode.workflowPing", pingState);
    document.addEventListener("keydown", function (event) {
        // Message-only prompts (including level-up stats) have no UI popup.
        // Native input mode owns their keys even when the hero cannot act.
        if (event.defaultPrevented || ![enums.mouse_mode.NORMAL, enums.mouse_mode.COMMAND].includes(game.get_input_mode())) return;
        if (event.key === "Escape" && window.crawl_party && window.crawl_party.armed_ping_kind) {
            event.preventDefault(); event.stopImmediatePropagation(); cancelPing();
            return;
        }
        var logKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p";
        if (logKey && current() && actions.reason(current()) && !event.altKey && !event.shiftKey
            && !event.isComposing && !$("dialog[open], #ui-stack > *").length
            && !$(event.target).closest("input, textarea, select, [contenteditable='true'], #chat").length) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!event.repeat) $(document).trigger("game_message_history");
            return;
        }
        if (!sectionKeys[event.key] || !current() || client.is_watching()
            || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || $("#ui-stack > *, dialog[open]").length
            || $(event.target).closest("input, textarea, select, [contenteditable='true'], #chat").length) return;
        if (["i", "I", "@", "X"].includes(event.key) && !actions.reason(current())) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) openSection(sectionKeys[event.key], event.key);
    }, true);
    $(window).off("resize.workflowControls").on("resize.workflowControls", update);
    return { init: init, update: update };
});
