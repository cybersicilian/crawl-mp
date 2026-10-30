define(["jquery", "item-properties"], function ($, properties) {
    "use strict";
    var detached = null, moved = [];
    var readings = [
        ["ac", "armour"], ["ev", "evasion"], ["sh", "shield"],
        ["str", "strength"], ["int", "intelligence"], ["dex", "dexterity"]
    ];
    function glyph(target, name) {
        if (!target || target.querySelector(":scope > .personal-stat-glyph")) return;
        var node = document.createElement("span");
        node.className = "personal-stat-glyph"; node.setAttribute("aria-hidden", "true");
        node.appendChild(properties.icon(name)); target.prepend(node);
    }
    function isolate(event) {
        if (event.type.indexOf("key") === 0 && event.key === "Tab") return;
        event.stopPropagation();
    }
    function accessible(target, role) {
        if (!target) return;
        target.setAttribute("tabindex", "0"); target.setAttribute("role", role || "img");
        target.setAttribute("data-tip-live", "");
        target.setAttribute("aria-label", target.getAttribute("data-tip-title") || "Character detail");
        $(target).off(".personalStats").on("keydown.personalStats keypress.personalStats keyup.personalStats click.personalStats", isolate);
    }
    function nativeRow(stats, id) {
        var value = stats.querySelector("#stats_" + id);
        return value && value.closest(".stat-row-interactive");
    }
    function moveInto(node, target) {
        if (!node || node.parentNode === target) return;
        var anchor = document.createComment("native character detail");
        node.before(anchor); moved.push({ node: node, anchor: anchor }); target.appendChild(node);
    }
    function restoreLayout(stats) {
        moved.forEach(function (entry) {
            if (entry.anchor.parentNode) entry.anchor.replaceWith(entry.node);
        });
        moved = []; $(stats).find(".personal-stat-context").remove();
    }
    function equipment(target, name) {
        if (!target) return;
        target.classList.add("personal-equipment"); glyph(target, name); accessible(target, "button");
        target.setAttribute("aria-label", (target.getAttribute("data-tip-title") || "Equipment") + ". Open equipment");
        $(target).on("click.personalStats keydown.personalStats", function (event) {
            if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            var card = target.closest(".party-card"), party = window.crawl_party;
            if (card && party && typeof party.open_inspector === "function")
                party.open_inspector(Number(card.dataset.partySlot), "equipment");
        });
    }
    function updateNoise(stats) {
        var noise = stats.querySelector("#stats_noise"); if (!noise) return;
        accessible(noise, "meter"); glyph(noise, "noise");
        var rail = stats.querySelector("#stats_noise_bar_full");
        var value = rail && parseFloat(rail.style.width), category = noise.getAttribute("data-level");
        var label = category === "blank" ? "Silenced" : "Noise: " + (category || "unavailable");
        noise.setAttribute("aria-label", label); noise.setAttribute("aria-valuetext", label);
        noise.setAttribute("aria-valuemin", "0"); noise.setAttribute("aria-valuemax", "100");
        if (Number.isFinite(value)) noise.setAttribute("aria-valuenow", Math.max(0, Math.min(100, value)));
        else noise.removeAttribute("aria-valuenow");
        var icon = noise.querySelector(".personal-stat-glyph");
        icon.replaceChildren(properties.icon(category === "blank" ? "silence" : "noise"));
    }
    function present(stats) {
        readings.forEach(function (entry) {
            var row = nativeRow(stats, entry[0]); if (!row) return;
            row.classList.add("personal-stat-reading"); glyph(row, entry[1]); accessible(row);
        });
        updateNoise(stats);
        var details = stats.querySelector(".hud-stats-details"); if (!details) return;
        var context = details.querySelector(".personal-stat-context");
        if (!context) {
            context = document.createElement("div"); context.className = "personal-stat-context";
            context.setAttribute("role", "group"); context.setAttribute("aria-label", "Noise, equipment and hazards"); details.appendChild(context);
        }
        moveInto(stats.querySelector("#stats_noise"), context);
        [["weapon", "weapon"], ["offhand_weapon", "weapon"], ["quiver", "quiver"]].forEach(function (entry) {
            var row = nativeRow(stats, entry[0]); moveInto(row, context); equipment(row, entry[1]);
        });
        [["doom", "doom"], ["contam", "contamination"]].forEach(function (entry) {
            var hazard = stats.querySelector("#stats_" + entry[0] + "_ui");
            moveInto(hazard, context); if (!hazard) return;
            hazard.classList.add("personal-stat-hazard"); glyph(hazard, entry[1]); accessible(hazard);
        });
    }
    function preserve() {
        var $stats = $("#party_hud_members #stats");
        if ($stats.length) detached = $stats.detach();
    }
    function syncTips() {
        var card = document.querySelector(".party-card.is-controlled-card");
        if (!card) return;
        [["#stats_hpline", ".party-bar-wrap.hp-track"], ["#stats_mpline", ".party-bar-wrap.mp-track"]].forEach(function (pair) {
            var source = document.querySelector(pair[0]), target = card.querySelector(pair[1]);
            if (!source || !target) return;
            // The card's heat resource comes from its own hero snapshot. The
            // personal stream may still describe a different hero after switching.
            if (pair[1].indexOf("mp-track") !== -1
                && (target.hasAttribute("data-tip-heat") || source.hasAttribute("data-tip-heat"))) return;
            Array.from(source.attributes).filter(function (attribute) { return attribute.name.indexOf("data-tip-") === 0; })
                .filter(function (attribute) { return pair[1].indexOf("hp-track") === -1 || attribute.name !== "data-tip-body"; })
                .forEach(function (attribute) { target.setAttribute(attribute.name, attribute.value); });
            if (pair[1].indexOf("hp-track") !== -1) {
                if (!target.hasAttribute("data-health-tip-base"))
                    target.setAttribute("data-health-tip-base", target.getAttribute("data-tip-body") || "");
                target.setAttribute("data-tip-body", [source.getAttribute("data-tip-body"),
                    target.getAttribute("data-health-tip-base")].filter(Boolean).join("\n"));
            }
        });
        var state = window.crawl_party && window.crawl_party.state;
        var hero = state && state.members.find(function (member) { return member.slot === Number(card.dataset.partySlot); });
        var faith = card.querySelector(".party-faith"), origin = document.getElementById("stats_species_god");
        var piety = document.getElementById("stats_piety");
        if (faith && origin && piety && hero && hero.god && origin.textContent.indexOf(hero.god) !== -1)
            faith.setAttribute("data-tip-body", [faith.getAttribute("data-tip-faith-base"), piety.getAttribute("data-tip-body")].filter(Boolean).join("\n"));
        var name = card.querySelector(".party-member-name"), title = document.getElementById("stats_titleline");
        if (name && title && hero && title.textContent.indexOf(hero.name) === 0) {
            name.setAttribute("data-tip-title", title.textContent);
            name.setAttribute("data-tip-body", title.getAttribute("data-tip-body") || "");
        }
        var progress = card.querySelector(".party-member-state"), time = document.getElementById("stats_time");
        if (progress && time && title && hero && title.textContent.indexOf(hero.name) === 0) {
            if (!progress.hasAttribute("data-personal-progress-base"))
                progress.setAttribute("data-personal-progress-base", progress.getAttribute("data-tip-body") || "");
            progress.setAttribute("data-tip-live", "");
            progress.setAttribute("data-tip-body", [progress.getAttribute("data-personal-progress-base"),
                time.getAttribute("data-tip-body")].filter(Boolean).join("\n"));
        }
    }
    function mount() {
        var $stats = $("#stats"); if (!$stats.length && detached) $stats = detached;
        if (!$stats.length) return;
        var $card = $(".party-card.is-controlled-card"), target = $card.find(".party-self-details");
        if (!window.crawl_party || !window.crawl_party.state || !window.crawl_party.state.members.length) $card = $();
        if (!$card.length) {
            restoreLayout($stats[0]);
            var $sidebar = $("#hud_sidebar_scroll");
            if (!$sidebar.length) $sidebar = $("#right_column");
            $stats.detach().prependTo($sidebar); detached = null; return;
        }
        if (!target.length) target = $("<div class='party-self-details' role='group' aria-label='Your character details'></div>").appendTo($card);
        if ($stats.parent()[0] !== target[0]) $stats.detach().appendTo(target);
        $stats.removeClass("hud-floating").children(".hud-panel-move, .hud-panel-resize").remove();
        detached = null; present($stats[0]); syncTips();
    }
    $(document).on("party_state_rendered.cardDetails player_state_changed.cardDetails", mount);
    return { preserve: preserve, mount: mount };
});
