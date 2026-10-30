define(["jquery", "./status-icons", "./native-tile-art", "./frame-update"], function ($, icons, art, frameUpdate) {
    "use strict";
    var focusedControl = "";
    function isolate(event) {
        if (event.type.indexOf("key") === 0 && event.key === "Tab") return;
        event.stopPropagation();
    }
    // Short visible captions so no reading is a bare number; full names stay in hover/focus help.
    var captions = { level: "Lv", floor: "Floor", ac: "AC", ev: "EV", sh: "SH", stealth: "Stealth", noise: "Noise", speed: "Move" };
    function chip(root, key, glyph) {
        var node = root.children("[data-reading='" + key + "']");
        if (node.length) return node;
        node = $("<span class='party-icon-reading' tabindex='0' role='img' data-tip-live></span>")
            .attr({ "data-reading": key, id: "party_reading_" + root.closest(".party-card").attr("data-party-slot") + "_" + key })
            .append(icons.icon(glyph), $("<span class='party-reading-label' aria-hidden='true'></span>").text(captions[key] || ""),
                $("<span class='party-reading-value'></span>"))
            .on("click keydown keypress keyup", isolate).appendTo(root);
        return node;
    }
    function reading(root, key, glyph, label, value, body) {
        var node = chip(root, key, glyph), known = value !== null && value !== undefined;
        var text = known ? String(value) : "?";
        node.attr({ "aria-label": label + ": " + (known ? text : "unavailable"),
            "data-tip-title": label, "data-tip-body": body || (known ? label + ": " + text : label + " unavailable"),
            "data-reading-state": known ? "known" : "unknown" });
        node.children(".party-reading-value").text(text);
        return node;
    }
    function cluster(meta, className, label) {
        var node = meta.children("." + className);
        if (node.length) return node;
        return $("<span class='party-reading-cluster' role='group'></span>").addClass(className)
            .attr("aria-label", label).appendTo(meta);
    }
    function finite(value) { return Number.isFinite(value) ? value : null; }
    function metadata(card, hero) {
        var meta = card.children(".party-member-meta"), root = meta.children(".party-icon-meta");
        if (!root.length) {
            root = $("<span class='party-icon-meta'></span>");
            var identity = meta.children(".party-hero-identity");
            if (identity.length) root.insertAfter(identity); else root.prependTo(meta);
        }
        // The identity line already carries the level; keep the chip for tests
        // and hover help but let the defense cluster own the visible numbers.
        reading(root, "level", "level-cap", "Experience level", finite(hero.xl));
        var floorBody = hero.place ? "Current floor: " + hero.place : "Current floor unavailable";
        if (Number.isInteger(hero.region_id)) {
            floorBody += " · Region R" + (hero.region_id + 1)
                + (hero.on_same_level === false ? " (Other floor)"
                    : hero.same_region === false ? " (Independent chunk)" : " (Synced chunk)")
                + (hero.region_combat ? " · Combat" : " · Explore");
        }
        var floorNode = reading(root, "floor", "map", "Current floor", hero.place || null, floorBody);
        if (Number.isInteger(hero.region_id)) {
            floorNode.attr({
                "data-region-id": "R" + (hero.region_id + 1),
                "data-region-sync": hero.on_same_level === false ? "away"
                    : hero.same_region === false ? "independent" : "synced"
            });
        } else {
            floorNode.removeAttr("data-region-id data-region-sync");
        }
        if (!card.hasClass("is-controlled-card")) {
            var defenses = cluster(root, "party-defense-cluster", "Defenses");
            [["ac", "armour", "Armour class"], ["ev", "evasion", "Evasion"], ["sh", "shield", "Shielding"]]
                .forEach(function (entry) { reading(defenses, entry[0], entry[1], entry[2], finite(hero[entry[0]])); });
        }
        var name = card.find(".party-member-name");
        if (!card.hasClass("is-controlled-card"))
            name.attr("data-tip-body", [hero.species, hero.job, hero.title, hero.place].filter(Boolean).join(" · "));
    }
    function noise(root, hero) {
        var silenced = (hero.statuses || []).some(function (status) {
            return /\bsilenced?\b/i.test(status.text || status.light || "");
        });
        var value = finite(hero.adjusted_noise);
        if (silenced) value = 0;
        var category = value === null ? "unavailable" : silenced ? "silenced" : value <= 333 ? "quiet"
            : value <= 666 ? "loud" : value < 1000 ? "very loud" : "extremely loud";
        var node = reading(root, "noise", "noise", "Noise", value === null ? null : "", "Noise: " + category
            + ". Native sound heard near this hero after recent actions; this is separate from stealth.");
        node.attr({ role: value === null ? "img" : "meter", "aria-label": "Noise: " + category, "aria-valuetext": category,
            "aria-valuemin": 0, "aria-valuemax": 1000 });
        var track = node.children(".party-reading-track");
        if (!track.length) track = $("<span class='party-reading-track' aria-hidden='true'><i></i></span>").appendTo(node);
        track.css("display", value === null ? "none" : "").children("i").css("width", value === null ? 0 : Math.max(0, Math.min(100, value / 10)) + "%");
        if (value === null) node.removeAttr("aria-valuenow");
        else node.attr("aria-valuenow", value);
    }
    function equipment(root, hero) {
        var profile = hero.equipment_profile;
        var slots = profile && Array.isArray(profile.slots) ? profile.slots.filter(function (slot) {
            return slot.type === "weapon" || ["weapon_offhand", "offhand"].includes(slot.type) && slot.capacity > 0;
        }) : [];
        var items = profile && Array.isArray(profile.items) ? profile.items : [];
        var signature = JSON.stringify([slots, slots.map(function (slot) {
            return items.find(function (item) { return item.inv_slot === slot.inv_slot; });
        }), hero.weapon]);
        if (root.attr("data-loadout-signature") === signature) return;
        root.attr("data-loadout-signature", signature).empty();
        if (!slots.length) slots = [{ type: "weapon", label: "Wielded weapon", state: "unknown", name: hero.weapon }];
        slots.forEach(function (slot) {
            if (slot.type !== "weapon" && !Number.isInteger(slot.inv_slot)) return;
            var item = items.find(function (entry) { return entry.inv_slot === slot.inv_slot; });
            var unarmed = slot.type === "weapon" && ["empty", "unavailable"].includes(slot.state)
                && !Number.isInteger(slot.inv_slot);
            var label = unarmed ? hero.weapon || "Unarmed" : slot.name || "Wielded equipment unavailable";
            var glyph = unarmed ? "abilities" : slot.type === "offhand" ? "shield" : "question";
            var button = $("<button type='button' class='party-wielded-item'></button>")
                .attr({ id: "party_wielded_" + hero.slot + "_" + slot.type,
                    "aria-label": label + ". Inspect equipment", "data-tip-title": label,
                    "data-tip-body": slot.label + (slot.state ? " · " + slot.state : ""), "data-tip-meta": "Open equipment" })
                .append(art.create(item && item.art, label, "party-wielded-art", icons.icon(glyph)))
                .on("click", function (event) {
                    event.stopPropagation();
                    var party = window.crawl_party;
                    if (party && party.open_inspector) party.open_inspector(hero.slot, "equipment");
                }).on("keydown keypress keyup", isolate);
            root.append(button);
        });
    }
    function utility(card, hero) {
        var root = card.find(".party-member-equipment");
        if (!root.hasClass("party-icon-utility")) {
            root.empty().removeClass("party-weapon-text").addClass("party-icon-utility")
                .removeAttr("data-tip-title data-tip-body").attr({ role: "group", "aria-label": "Stealth, noise, speed, equipment, effects and traits" });
            root.append($("<span class='party-loadout'></span>"));
        }
        var stealth = hero.resists && finite(hero.resists.Stlth);
        reading(root, "stealth", "moon", "Stealth", stealth === undefined ? null : stealth,
            "Native stealth rating: " + (stealth === null || stealth === undefined ? "unavailable" : stealth) + ". Higher ratings make detection less likely.");
        noise(root, hero);
        var speed = finite(hero.move_delay_aut);
        if (speed === null && Number.isFinite(hero.move_aut) && Number.isFinite(hero.speed_stat))
            speed = hero.move_aut * hero.speed_stat / 10;
        reading(root, "speed", "speed", "Movement delay", speed === null ? null : (speed / 10).toFixed(1),
            "Move: " + (speed === null ? "unavailable" : speed + " aut (" + (speed / 10).toFixed(1) + " turns)")
            + ". Attack: " + (Number.isFinite(hero.atk_aut) ? hero.atk_aut + " aut" : "unavailable") + ". Lower delay means faster actions.");
        equipment(root.children(".party-loadout"), hero);
        var quiver = root.children(".party-quiver-shortcut");
        if (card.hasClass("is-controlled-card") && !quiver.length)
            $("<button type='button' class='party-quiver-shortcut' aria-label='Quiver. Open equipment' data-tip-title='Quiver' data-tip-meta='Open equipment'></button>")
                .attr("id", "party_quiver_" + hero.slot).append(icons.icon("quiver")).on("click", function (event) {
                    event.stopPropagation(); window.crawl_party.open_inspector(hero.slot, "equipment");
                }).on("keydown keypress keyup", isolate).appendTo(root);
        else if (!card.hasClass("is-controlled-card")) quiver.remove();
        if (card.hasClass("is-controlled-card"))
            root.append(card.children(".party-member-top").find(".party-card-status, .party-passive-strip"));
    }
    function progress(card, hero) {
        var bar = card.find(".party-member-state"), level = bar.find(".party-member-level");
        var text = Number.isFinite(hero.xl) && hero.xl >= 27 ? "100%"
            : Number.isFinite(hero.xl_next) ? Math.max(0, Math.min(100, hero.xl_next)) + "%" : "?";
        if (level.attr("data-reading-value") !== text) {
            level.attr("data-reading-value", text).empty().append(icons.icon("experience"), document.createTextNode(text));
            if (!level.prev(".party-reading-label").length)
                $("<span class='party-reading-label' aria-hidden='true'>XP</span>").insertBefore(level);
        }
        var activity = bar.find(".party-member-activity"), label = activity.text() || activity.attr("aria-label");
        var glyph = hero.alive === false || hero.ghost_haunting ? "skull" : hero.on_same_level === false ? "map"
            : /combat|acting|waiting/i.test(label) ? "autofight" : "explore";
        activity.attr("aria-label", label);
        if (activity.attr("data-reading-glyph") !== glyph)
            activity.attr("data-reading-glyph", glyph).empty().append(icons.icon(glyph));
        var timingNote = hero.queued_action
            ? "Queued · " + (Number.isFinite(hero.aut_lead) && hero.aut_lead > 0 ? hero.aut_lead + " aut" : hero.queued_action)
            : (Number.isFinite(hero.aut_lead) && hero.aut_lead > 0
                ? "Recovering · " + hero.aut_lead + " / " + (hero.last_action_aut || 10) + " aut"
                : "");
        bar.attr("data-tip-meta", timingNote);
        if (hero.queued_action) bar.attr("data-queued-action", String(hero.queued_action));
        else bar.removeAttr("data-queued-action");
        if (Number.isFinite(hero.aut_lead) && hero.aut_lead > 0) bar.attr("data-recovery-aut", String(hero.aut_lead));
        else bar.removeAttr("data-recovery-aut");
    }
    function mount() {
        var state = window.crawl_party && window.crawl_party.state;
        if (!state || !Array.isArray(state.members)) return;
        $("#party_hud_members > .party-card").each(function () {
            var card = $(this), hero = state.members.find(function (member) { return member.slot === Number(card.attr("data-party-slot")); });
            if (!hero) return;
            card.addClass("party-icon-first"); metadata(card, hero); utility(card, hero); progress(card, hero);
        });
        if (focusedControl) {
            var target = document.getElementById(focusedControl);
            focusedControl = "";
            if (target) target.focus({ preventScroll: true });
        }
        if (window.dcss_tooltips && $(".party-icon-first [aria-describedby~='dcss_rich_tooltip']").length)
            window.dcss_tooltips.refresh();
    }
    var refresh = frameUpdate(mount);
    function init() {
        $(document).off(".cardReadings").on("party_state_rendered.cardReadings", refresh)
            .on("game_cleanup.cardReadings", refresh.cancel)
            .on("party_cards_rebuilding.cardReadings", function () {
                var target = document.activeElement;
                focusedControl = $(target).is(".party-icon-reading, .party-wielded-item, .party-quiver-shortcut") ? target.id : "";
            });
        mount();
    }
    return { init: init, mount: mount };
});
