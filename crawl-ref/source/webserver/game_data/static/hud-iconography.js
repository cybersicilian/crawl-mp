define(["jquery", "./status-icons", "./frame-update"], function ($, icons, frameUpdate) {
    "use strict";
    var glyphs = { o: "explore", "\t": "autofight", "5": "rest", g: "pickup", i: "inventory",
        z: "spells", a: "abilities", m: "skills", A: "trait", "%": "shield",
        "<": "stairs-up", ">": "stairs-down", X: "map" };

    // Shared tactics vocabulary. Lobby and game surfaces use the same words,
    // glyphs and .tr-badge data attributes (styled in tactics-components.css).
    var vocabulary = {
        roles: { frontline: ["Frontline", "shield"], striker: ["Striker", "blade"], caster: ["Caster", "spark"],
            support: ["Support", "heart"], scout: ["Scout", "eye"] },
        modes: { explore: ["Free Explore", "explore"], combat: ["Tactical Combat", "autofight"] },
        factions: { hero: ["Your hero", "user"], ally: ["Ally", "heart"], enemy: ["Enemy", "skull"], neutral: ["Neutral", "question"] },
        threat: { low: ["Low threat", "ready"], med: ["Moderate threat", "danger"], high: ["High threat", "danger"],
            lethal: ["Lethal threat", "skull"] },
        initiative: { banked: ["Banked time", "time"], debt: ["Recovery debt", "slow"] },
        resources: { hp: ["Health", "heart"], mp: ["Magic", "spark"], gold: ["Gold", "coin"], xp: ["Experience", "experience"] }
    };

    // badge("role", "caster") -> <span class="tr-badge" data-role="caster" role="img" aria-label="Caster">
    function badge(kind, value, options) {
        options = options || {};
        var table = vocabulary[kind] || {}, key = String(value || "").toLowerCase();
        var entry = table[key] || [options.label || value || "", "rune"];
        var node = document.createElement("span");
        node.className = "tr-badge" + (options.className ? " " + options.className : "");
        node.setAttribute("data-" + ({ roles: "role", modes: "mode", factions: "faction", resources: "resource" }[kind] || kind), key);
        node.setAttribute("data-tip-title", options.label || entry[0]);
        if (options.description) node.setAttribute("data-tip-body", options.description);
        if (options.icon !== false) node.appendChild(icons.icon(entry[1]));
        if (options.text === false) { node.setAttribute("role", "img"); node.setAttribute("aria-label", options.label || entry[0]); }
        else node.appendChild(document.createTextNode(options.label || entry[0]));
        return node;
    }

    function decorate(button, glyph) {
        var label = (button.id === "workflow_compact_btn" ? button.getAttribute("data-compact-label") : button.getAttribute("aria-label"))
            || button.textContent.replace(/\s+/g, " ").trim();
        if (!label) return;
        var alreadyIconified = button.classList.contains("hud-iconified");
        if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
        if (!button.hasAttribute("data-tip-title") || button.id === "workflow_compact_btn")
            button.setAttribute("data-tip-title", label);
        if (!alreadyIconified && !button.disabled && !button.hasAttribute("data-tip-body"))
            button.setAttribute("title", button.getAttribute("data-tip-title") || label);
        button.classList.add("hud-iconified");
        var icon = button.querySelector(":scope > .tt-icon");
        if (!icon) button.prepend(icons.icon(glyph));
        else if (icon.getAttribute("data-ui-icon") !== glyph) icon.replaceWith(icons.icon(glyph));
        Array.from(button.childNodes).forEach(function (node) {
            if (node.nodeType === 3 && node.textContent.trim()) {
                var span = document.createElement("span"); span.className = "hud-icon-only-label";
                node.replaceWith(span); span.appendChild(node);
            }
        });
    }
    function update() {
        var expedition = document.querySelector("#workflow_expedition_details > summary");
        if (expedition && !expedition.querySelector(".tt-icon")) {
            expedition.textContent = "";
            expedition.appendChild(icons.icon("camp"));
            expedition.setAttribute("aria-label", "Expedition menu");
            expedition.setAttribute("data-tip-title", "Expedition menu");
            expedition.setAttribute("data-tip-body", "Expedition links, save and exit, and item shortcut settings.");
        }
        document.querySelectorAll("#dcss_quick_dock [data-dock-key]").forEach(function (button) {
            decorate(button, glyphs[button.dataset.dockKey] || "rune");
        });
        var entries = { dock_party_sheet_btn: "overview", dock_save_btn: "save", dock_chat_btn: "chat", dock_codex_btn: "codex",
            workflow_map_btn: "map", party_banner_center: "camera", party_banner_cycle: "cycle-hero",
            party_add_btn: "add-hero", party_join_btn: "claim-hero", workflow_compact_btn: "compact", dock_save_exit_btn: "exit" };
        Object.keys(entries).forEach(function (id) {
            var button = document.getElementById(id); if (button) decorate(button, entries[id]);
        });
        document.querySelectorAll(".party-card-actions button").forEach(function (button) {
            decorate(button, button.classList.contains("party-navigate-btn") ? "navigate"
                : button.classList.contains("party-camera-btn") ? "camera"
                : button.classList.contains("party-control-btn") ? "control" : "inspect");
        });
        var signal = document.querySelector(".party-ping-heading");
        if (signal && !signal.querySelector(".tt-icon")) signal.appendChild(icons.icon("signal"));
        document.querySelectorAll(".party-ping-btn").forEach(function (button) {
            decorate(button, { look: "ping-look", danger: "ping-danger", loot: "ping-loot", stairs: "ping-stairs" }[button.dataset.pingKind] || "rune");
        });
        // Icon-only controls added by other modules still get a name and a tip.
        document.querySelectorAll("#normal :is(button, [role='button']) > .tt-icon:only-child").forEach(function (glyph) {
            var button = glyph.parentElement;
            icons.name(button, button.getAttribute("title") || button.getAttribute("data-tip-title"));
        });
    }
    var refresh = frameUpdate(update);
    $(document).on("party_state_rendered.hudIcons game_library_controls.hudIcons game_actions_changed.hudIcons", refresh)
        .on("game_cleanup.hudIcons", refresh.cancel);
    return { init: update, vocabulary: vocabulary, badge: badge, decorate: decorate };
});
