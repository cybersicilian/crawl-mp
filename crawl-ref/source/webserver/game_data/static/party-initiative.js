define(["jquery", "./party-model", "./status-icons", "./portrait-status"], function ($, model, icons, portraitStatus) {
    "use strict";

    function create() {
        var $meter = $("<span class='party-initiative' role='img' tabindex='0' data-tip-live></span>");
        $meter.append("<span class='initiative-half initiative-bank' aria-hidden='true'><i></i></span>",
            "<span class='initiative-half initiative-debt' aria-hidden='true'><i></i></span>",
            "<span class='initiative-zero' aria-hidden='true'></span>");
        // Inspecting timing must not activate the card or send a game command.
        $meter.on("click keydown keypress keyup", function (event) { event.stopPropagation(); });
        return $meter;
    }

    function scale(timeline) {
        return Math.max.apply(null, [20].concat(timeline.map(function (entry) {
            return Math.ceil(Math.max(entry.banked || 0, entry.debt || 0) / 10) * 10;
        })));
    }
    function fill($meter, credit, debt, maximum) {
        $meter.find(".initiative-bank i").css("width", (credit || 0) / maximum * 100 + "%");
        $meter.find(".initiative-debt i").css("width", (debt || 0) / maximum * 100 + "%");
    }
    function createMonster() {
        return $("<span id='party_progress_monsters' class='party-context-stat' tabindex='0' role='img' data-tip-live hidden></span>")
            .append(icons.icon("bestiary"),
                create().removeAttr("tabindex role data-tip-live").attr("aria-hidden", "true"),
                $("<span class='monster-timing-values' aria-hidden='true'></span>"));
    }
    function updateMonster($root, state) {
        if (!$root.length) return;
        var visible = Boolean(state && state.multiplayer === true);
        $root.prop("hidden", !visible);
        if (!visible) {
            if (window.dcss_tooltips && $root.is("[aria-describedby~='dcss_rich_tooltip']"))
                window.dcss_tooltips.hide();
            return;
        }
        var view = model.monsterTiming(state), known = view.status !== "unknown";
        var maximum = scale(model.initiativeTimeline(state));
        var summary = view.status === "credit" ? "World catching up"
            : view.status === "debt" ? "World ahead" : known ? "In sync" : "Timing unavailable";
        $root.attr({ "data-timing-state": view.status, "aria-label": "Monsters: " + summary,
            "data-tip-title": "Region rhythm", "data-tip-body": known
                ? summary + ". The left fill shows the world catching up with this region's heroes; "
                    + "the right fill shows the world ahead of them. Each creature also follows its own speed and recovery."
                : "The native world clock or current-floor hero clocks are unavailable. No monster balance is inferred.",
            "data-tip-meta": "Solid: catching up · Hatched: ahead · Diamond: in sync" });
        $root.find(".monster-timing-values").text(summary);
        var $meter = $root.find(".party-initiative").attr("data-timing-state", view.status);
        fill($meter, view.credit, view.debt, maximum);
        if (window.dcss_tooltips && $root.is("[aria-describedby~='dcss_rich_tooltip']"))
            window.dcss_tooltips.refresh();
    }

    function update($members, state) {
        var timeline = model.initiativeTimeline(state);
        // All heroes use the same scale, with at least two standard turns per
        // half. Expand together for long actions instead of clipping balances.
        var maximum = scale(timeline);
        $members.children(".party-member-card").each(function () {
            var slot = Number($(this).attr("data-party-slot"));
            var member = state.members.find(function (hero) { return hero.slot === slot; });
            var entry = timeline.find(function (timing) { return timing.slot === slot; });
            if (!member || !entry) return;
            var $portrait = $(this).find(".party-portrait");
            if ($portrait.length && portraitStatus && portraitStatus.decorate)
                portraitStatus.decorate($portrait[0], member);
            var $meter = $(this).find(".party-initiative");
            var known = entry.banked !== undefined;
            var summary = known ? entry.debt > 0
                ? entry.banked > 0 ? "Recovering with catch-up time" : "Recovering"
                : entry.banked > 0 ? "Catch-up time available" : "Ready"
                : entry.status === "downed" ? "Downed — outside the action queue"
                : entry.status === "away" ? "Other floor — separate action queue"
                : entry.status === "independent" ? "Independent chunk — separate region clock"
                : "Timing unavailable";
            if (entry.queued_action)
                summary += " · Queued: " + entry.queued_action;
            var body = known ? summary + ". Solid green extends left for banked catch-up time; "
                + "hatched amber extends right during recovery. The center diamond marks readiness. "
                + "Banked time is the gap to the furthest teammate's clock on this floor. "
                + "Debt is time already committed ahead of the world clock. Both can coexist; "
                + "normal action costs and turn rules still apply."
                : summary + ". No banked time or debt is inferred.";
            var metaParts = known ? ["Solid: catch-up time · Hatched: recovery · Diamond: ready"] : [];
            if (entry.queued_action)
                metaParts.push("Queued: " + entry.queued_action);
            $meter.attr({ "data-timing-state": entry.status,
                "data-cooldown-pct": entry.cooldown_pct || 0,
                "aria-label": member.name + " initiative: " + summary,
                "data-tip-title": member.name + " · Initiative", "data-tip-body": body,
                "data-tip-meta": metaParts.join(" · ") });
            if (entry.queued_action) $meter.attr("data-queued-action", String(entry.queued_action));
            else $meter.removeAttr("data-queued-action");
            fill($meter, entry.banked, entry.debt, maximum);
        });
        if (window.dcss_tooltips && $members.find(".party-initiative[aria-describedby~='dcss_rich_tooltip']").length)
            window.dcss_tooltips.refresh();
    }

    return { create: create, update: update, createMonster: createMonster, updateMonster: updateMonster };
});
