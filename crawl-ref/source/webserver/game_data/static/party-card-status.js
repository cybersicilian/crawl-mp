define(["jquery", "./party-status-model", "./status-icons", "./party-faith", "./portrait-status", "item-properties"],
function ($, model, icons, faith, portraitStatus, properties) {
    "use strict";

    function badge(className, hero, name, glyph, body, meta, activate) {
        var $badge = $(activate ? "<button type='button'></button>" : "<span tabindex='0' role='img'></span>")
            .addClass("party-status-icon " + className)
            .attr({ "aria-label": hero.name + ": " + name + (meta ? ". " + meta : ""),
                "data-tip-title": name, "data-tip-body": body, "data-tip-meta": meta || "" })
            .append(icons.icon(glyph))
            .on("click", function (event) { event.stopPropagation(); if (activate) activate(); })
            .on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        icons.frame($badge[0], { glyph: glyph, tone: "passive" });
        return $badge;
    }
    function passives(hero, inspect) {
        var $row = $("<div class='party-passive-strip' role='group' aria-label='Resistances and movement speed'></div>");
        var defenses = [
            ["rPois", "Poison resistance", "poison"], ["rElec", "Electricity resistance", "bolt"],
            ["rFire", "Fire resistance", "flame"], ["rCold", "Cold resistance", "frost"],
            ["rNeg", "Negative energy resistance", "skull"], ["rCorr", "Corrosion resistance", "corrosion"]
        ];
        defenses.forEach(function (defense) {
            var value = hero.resists && hero.resists[defense[0]];
            if (!Number.isFinite(value) || value === 0) return;
            var immune = defense[0] === "rElec" && value > 3;
            var $defense = badge("is-passive" + (value < 0 ? " is-vulnerable" : ""), hero,
                immune ? "Electricity immunity" : defense[1], defense[2],
                immune ? "Immune to electrical damage." : "Native resistance level: " + value + ". Includes innate, equipment and temporary sources.",
                (immune ? "Immune" : value < 0 ? "Vulnerability level " + Math.abs(value) : "Resistance level " + value)
                    + " · Inspect full defenses", function () { inspect(hero.slot, "overview"); });
            $defense.children("svg").remove();
            icons.frame($defense[0], { tone: value < 0 ? "bad" : "passive" });
            $defense.addClass("status-icon-levels");
            $row.append($defense.append(properties.levelIcons(defense[2], value)));
        });
        if (Number.isFinite(hero.move_aut) && hero.move_aut !== 10)
            $row.append(badge("is-passive", hero, "Movement speed", hero.move_aut < 10 ? "speed" : "slow",
                "Each step costs " + hero.move_aut + " aut; a standard turn is 10 aut.", ""));
        return $row.children().length ? $row : null;
    }
    function create(hero) {
        var $root = $("<div class='party-card-status'></div>");
        var $row = $("<div class='party-effect-strip' role='group' aria-label='Active effects'></div>");
        var $active = $("<div class='party-effect-group' role='group' aria-label='Buffs and active effects'></div>");
        var $harmful = $("<div class='party-effect-group' role='group' aria-label='Debuffs'></div>");
        model.effects(hero).forEach(function (effect) {
            var $effect = $(icons.effect(effect)).addClass("party-status-icon")
                .attr("id", "party_effect_" + hero.slot + "_" + effect.key)
                .on("click keydown keypress keyup", function (event) { event.stopPropagation(); });
            $effect.attr("aria-label", hero.name + ": " + $effect.attr("aria-label"));
            (effect.tone === "bad" ? $harmful : $active).append($effect);
        });
        if ($active.children().length) $row.append($active);
        if ($harmful.children().length) $row.append($harmful);
        if ($row.children().length) $root.append($row);
        // Named labels for the two most important effects (harmful first).
        var named = model.effects(hero).filter(function (effect) { return effect.key !== "unknown"; });
        if (named.length) {
            var $names = $("<span class='party-effect-names' aria-hidden='true'></span>");
            named.slice(0, 2).forEach(function (effect) {
                $names.append($("<span class='party-effect-name'></span>").addClass("is-" + effect.tone)
                    .text(effect.name.replace(/\s*\(expiring\)\s*$/i, "")));
            });
            if (named.length > 2) $names.append($("<span class='party-effect-more'></span>").text("+" + (named.length - 2)));
            $root.append($names);
        }
        if (Number.isFinite(hero.defiance)) {
            $root.append($("<div class='party-member-state' role='meter' tabindex='0'></div>")
                .attr({ id: "party_defiance_" + hero.slot, "aria-label": hero.name + " Defiance", "aria-valuemin": 0,
                    "aria-valuemax": 100, "aria-valuenow": hero.defiance,
                    "data-tip-title": "Defiance · Rites " + hero.elder_rites + "/3",
                    "data-tip-body": hero.elder_summary })
                .append($("<span class='party-xp-fill' aria-hidden='true'></span>")
                    .css("width", Math.max(0, Math.min(100, hero.defiance)) + "%"),
                    $("<span class='party-resource-label'></span>")
                        .text("Defiance " + hero.defiance + "/100 · Rites " + hero.elder_rites + "/3")));
        }
        if (hero.chain_summary)
            $root.append($("<div class='party-member-state' tabindex='0'></div>")
                .text(hero.chain_summary).attr("data-tip-body", hero.chain_summary));
        return $root;
    }
    function activity(hero, state) {
        var current = model.activity(hero, state);
        var level = Number.isFinite(hero.xl) ? hero.xl : null, capped = level !== null && level >= 27;
        var progress = capped ? 100 : Number.isFinite(hero.xl_next) ? Math.max(0, Math.min(100, hero.xl_next)) : null;
        var label = "Lv. " + (level === null ? "?" : level) + " · " + current.label;
        var description = capped ? "Experience level cap reached" : progress === null
            ? "Experience progress unavailable" : progress + "% to the next experience level";
        var timingNote = hero.queued_action
            ? "Queued · " + (Number.isFinite(hero.aut_lead) && hero.aut_lead > 0 ? hero.aut_lead + " aut" : hero.queued_action)
            : (Number.isFinite(hero.aut_lead) && hero.aut_lead > 0
                ? "Recovering · " + hero.aut_lead + " / " + (hero.last_action_aut || 10) + " aut"
                : "");
        var $bar = $("<div class='party-member-state' role='progressbar' tabindex='0'></div>")
            .append($("<span class='party-xp-fill' aria-hidden='true'></span>").css("width", (progress === null ? 0 : progress) + "%"),
                $("<span class='party-member-level'></span>").text("Lv. " + (level === null ? "?" : level)),
                $("<span class='party-member-activity'></span>").text(current.label).addClass("is-" + current.tone))
            .attr({ id: "party_xp_" + hero.slot, "aria-label": hero.name + " · " + label,
                "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuetext": description,
                "data-progress-state": capped ? "capped" : progress === null ? "unknown" : "known",
                "data-tip-title": hero.name + " · " + label,
                "data-tip-body": description + ".\n" + [hero.species, hero.job, hero.title, hero.place].filter(Boolean).join(" · "),
                "data-tip-meta": timingNote })
            .on("click keydown keypress keyup", function (event) {
                if (event.type.indexOf("key") === 0 && event.key === "Tab") return;
                event.stopPropagation();
            });
        if (hero.queued_action) $bar.attr("data-queued-action", String(hero.queued_action));
        if (Number.isFinite(hero.aut_lead) && hero.aut_lead > 0) $bar.attr("data-recovery-aut", String(hero.aut_lead));
        if (progress !== null) $bar.attr("aria-valuenow", progress);
        return $bar;
    }
    // Deity and favour as one labelled text row; the shrine portrait stays decorative.
    function faithRow(hero) {
        var view = model.faith(hero);
        var stars = view.kind === "piety" && view.rank !== null
            ? new Array(view.rank + 1).join("\u2605") + new Array(7 - view.rank).join("\u2606") : "";
        var standing = view.kind === "defiance" ? "Defiance " + view.reserve + "/100"
            : !view.known ? "unknown" : !view.worships ? "" : view.kind === "gold" ? "gold" : view.kind === "xom" ? "mood"
            : view.rank === null ? "favour unknown" : view.rank + "/6";
        var $row = $("<div class='party-faith-row' role='img' tabindex='0'></div>")
            .attr({ id: "party_faith_row_" + hero.slot, "data-faith-kind": view.kind,
                "data-faith-state": !view.known ? "unknown" : view.penance ? "penance" : view.worships ? "devout" : "none",
                "aria-label": "Faith: " + view.name + (standing ? ", " + standing : "") + (view.penance ? ", under penance" : ""),
                "data-tip-title": view.name, "data-tip-badge": "[Faith]", "data-tip-body": view.summary,
                "data-tip-meta": view.description || "Press ^ for religion details" })
            .append($("<span class='party-faith-label' aria-hidden='true'></span>").text("Faith"),
                $("<span class='party-faith-name' aria-hidden='true'></span>").text(view.name))
            .on("click keydown keypress keyup", function (event) {
                if (event.type.indexOf("key") === 0 && event.key === "Tab") return;
                event.stopPropagation();
            });
        if (stars) $row.append($("<span class='party-faith-stars' aria-hidden='true'></span>").text(stars));
        else if (standing && view.worships) $row.append($("<span class='party-faith-standing' aria-hidden='true'></span>").text(standing));
        if (view.penance) $row.append($("<span class='party-faith-penance' aria-hidden='true'></span>").text("Penance"));
        return $row;
    }
    function portrait(hero, compass, inspect) {
        var root = faith.portrait(hero, compass, inspect);
        portraitStatus.decorate(root[0], hero);
        return root;
    }
    function health(hero) {
        var view = model.health(hero), label = view.known ? "HP " + hero.hp + "/" + hero.hp_max : "HP unavailable";
        if (view.poison > 0) label += " → " + view.forecast;
        var $bar = $("<div class='party-bar-wrap hp-track tr-meter' role='meter' tabindex='0'></div>")
            .attr({ id: "party_hp_" + hero.slot, "data-meter": "hp", "data-tip-title": hero.name + " Hit Points",
                "data-tip-body": view.summary, "data-tip-live": "", "aria-label": hero.name + ": " + view.summary,
                "aria-valuetext": view.summary, "data-health-state": view.known ? "known" : "unknown",
                "data-health-effects": view.effects.map(function (effect) { return effect.kind; }).join(" ") })
            .toggleClass("is-lethal-poison", view.lethal)
            .on("click keydown keypress keyup", function (event) {
                if (event.type.indexOf("key") === 0 && event.key === "Tab") return;
                event.stopPropagation();
            });
        if (view.known) $bar.attr({ "aria-valuemin": 0, "aria-valuemax": view.maximum, "aria-valuenow": view.hp });
        $bar.append($("<div class='party-hp-fill' aria-hidden='true'></div>").css("width", view.fill + "%")
            .toggleClass("crit", view.percent <= 30).toggleClass("warn", view.percent > 30 && view.percent <= 60));
        if (view.poison > 0) $bar.append($("<span class='party-hp-poison' aria-hidden='true'></span>")
            .css({ left: view.fill + "%", width: view.poison + "%" }));
        if (view.drained > 0) $bar.append($("<span class='party-hp-drained' aria-hidden='true'></span>")
            .css({ left: view.capacity + "%", width: view.drained + "%" }));
        $bar.append($("<span class='party-bar-label'></span>").text(label));
        if (view.lethal) $bar.append($("<span class='party-hp-warning' aria-hidden='true'>!</span>"));
        return $bar;
    }
    return { create: create, portrait: portrait, passives: passives, activity: activity, health: health, faithRow: faithRow };
});
