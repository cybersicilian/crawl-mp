define(["jquery", "comm", "client", "./menu-keyboard", "./menu-presentation", "hero-roles"], function ($, comm, client, keyboard, presentation, heroRoles) {
    "use strict";
    // Shared role vocabulary (hero-roles.js): Frontline / Striker / Caster / Support / Scout.
    // The background decides; the highest trained skill is only a fallback.
    var skillRoles = [
        { key: "frontline", label: "Frontline", skill: /^(fighting|armour|shields|maces|axes|polearms|staves|long blades|short blades|unarmed)/i },
        { key: "striker", label: "Striker", skill: /^(ranged|throwing|slings|bows|crossbows)/i },
        { key: "scout", label: "Scout", skill: /^(stealth|dodging)/i },
        { key: "support", label: "Support", skill: /^(invocations|evocations|shapeshifting)/i },
        { key: "caster", label: "Caster", skill: /^(spellcasting|conjurations|hexes|summonings|necromancy|translocations|alchemy|fire magic|ice magic|air magic|earth magic|forgecraft)/i }
    ];
    function role(member) {
        if (!member) return null;
        var byJob = heroRoles.roleForBackground(member.job);
        if (byJob && byJob.key !== "unknown") return { key: byJob.key, label: byJob.label };
        var best = (member.skills || []).slice().sort(function (a, b) { return Number(b.level || 0) - Number(a.level || 0); })[0];
        var bySkill = best && skillRoles.find(function (entry) { return entry.skill.test(best.name || ""); });
        return bySkill ? { key: bySkill.key, label: bySkill.label } : null;
    }
    function heroContext(hero) {
        var label = $("<span class='workflow-popup-hero'></span>");
        var identity = [hero.species, hero.job].filter(function (part) { return typeof part === "string" && part; }).join(" ");
        label.text("P" + (hero.slot + 1) + " · " + hero.name + (identity ? " — " + identity : ""));
        var badge = role(hero);
        if (badge) label.append($("<span class='workflow-hero-role tr-badge is-sm'></span>")
            .attr("data-role", badge.key).text(badge.label));
        return label;
    }
    function attach(element, depth) {
        element.addClass("workflow-surface");
        presentation.popup(element);
        if (element.children(".workflow-popup-tools").length) return;
        var tools = $("<div class='workflow-popup-tools'></div>");
        var state = window.crawl_party && window.crawl_party.state;
        var hero = state && state.members.find(function (member) { return member.slot === state.active_slot; });
        if (hero) tools.append(heroContext(hero));
        else tools.append($("<span class='workflow-popup-hero'></span>").text("Dungeon journal"));
        $("<button type='button' class='workflow-button'></button>")
            .text(depth > 1 ? "Back " : "Close ").append("<kbd aria-hidden='true'>Esc</kbd>")
            .attr("aria-label", depth > 1 ? "Back to the previous panel" : "Close panel")
            .prop("disabled", client.is_watching()).on("click", function (event) {
                event.stopPropagation(); comm.send_message("key", { keycode: 27 });
            }).appendTo(tools);
        var multiple = element.children(".workflow-selection-tools").length > 0;
        var hint = multiple ? "Click or Space: select · Enter: confirm · Esc: cancel"
            : element.hasClass("workflow-action-menu") ? "Letter keys select · Tab moves between actions · Enter activates"
            : element.hasClass("formatted-scroller") ? "↑ / ↓: scroll · Page Up / Down: page · Esc: return"
            : element.hasClass("menu_txt") ? "Use the letter keys shown below · Esc: return"
            : element.hasClass("workflow-prompt") ? "Enter: confirm · Esc: cancel"
                : "Letter keys select · Tab moves focus · Enter activates";
        element.append($("<div class='workflow-key-help workflow-popup-help'></div>").text(hint));
        element.prepend(tools);
    }
    function keydown(element, event) {
        return !client.is_watching() && keyboard.handle(element, event);
    }
    return { attach: attach, keydown: keydown, role: role };
});
