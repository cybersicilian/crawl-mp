define(["jquery", "./party-doom-model", "./status-icons"], function ($, model, icons) {
    "use strict";

    function mount() {
        var $meter = $("#party_doom_meter");
        if ($meter.length) return $meter;
        $meter = $("<div id='party_doom_meter' tabindex='0' role='meter' data-tip-live></div>")
            .attr({ "aria-label": "Zot clock", "aria-valuemin": 0 })
            .append("<span class='party-doom-heading' aria-hidden='true'>ZOT</span>",
                "<span class='party-doom-time' aria-hidden='true'></span>");
        var $track = $("<span class='party-doom-track' aria-hidden='true'></span>");
        var $bones = $("<span class='party-doom-bones'></span>");
        for (var i = 0; i < 9; ++i) $bones.append(icons.icon("skull"));
        $track.append($bones, "<span class='party-doom-fill'></span>");
        $meter.append($track, $("<span class='party-doom-bulb' aria-hidden='true'></span>").append(icons.icon("skull")),
            "<span class='party-doom-pressure' aria-hidden='true'></span>");
        // Reading the clock is turn-free, including while it has keyboard focus.
        $meter.on("click keydown keypress keyup", function (event) { event.stopPropagation(); });
        $("#party_hud").addClass("has-doom-meter").prepend($meter);
        return $meter;
    }

    function update(state) {
        var $meter = mount(), view = model.project(state);
        var known = view.status === "running" || view.status === "paused";
        var time = known ? model.turns(view.turns) : "";
        var summary = view.status === "running" ? time + " standard turns until Zot touches " + view.hero
            : view.status === "paused" ? "Zot clock paused · " + time + " turns banked"
            : view.status === "stopped" ? "Zot can no longer find the party" : "Zot clock unavailable";
        var body = known ? "The skull column drains as the earliest living hero's native Zot deadline approaches. "
            + "Next: " + view.hero + (view.place ? " in " + view.place : "") + ". "
            + view.shortLifespans + " short-lifespan trait" + (view.shortLifespans === 1 ? "" : "s")
            + " in the party: " + view.pressure + "× Zot pressure. Each adds 9× to the normal 1× rate. "
            + "New floors restore time; Cheibriados slows the clock. Zot's touch permanently reduces maximum HP."
            : view.status === "stopped" ? "The party is protected by the Orb or a completed Ziggurat."
            : "A living hero's native Zot clock is unavailable. No countdown is inferred.";
        if (view.status === "paused") body += " The clock does not advance here (for example, in the Abyss or Sprint).";
        $meter.attr({ "data-doom-state": view.status, "data-doom-warning": known ? view.warning : 0,
            "aria-label": "Doom meter · " + summary, "aria-valuetext": summary,
            "data-tip-title": "Doom meter · Zot clock", "data-tip-body": body,
            "data-tip-meta": known ? time + " turns left · 10 aut = 1 standard turn" : summary })
            .css("--doom-fill", known ? view.fraction * 100 + "%" : "0%");
        if (known) $meter.attr({ role: "meter", "aria-valuemin": 0,
            "aria-valuenow": Math.round(view.fraction * 1000) / 10, "aria-valuemax": 100 });
        else $meter.attr("role", "img").removeAttr("aria-valuenow aria-valuemin aria-valuemax aria-valuetext");
        $meter.find(".party-doom-heading").text(view.status === "paused" ? "PAUSE" : view.status === "stopped" ? "SAFE" : "ZOT");
        var compact = known ? view.turns >= 10000 ? Math.round(view.turns / 1000) + "k"
            : view.turns >= 1000 ? (view.turns / 1000).toFixed(1) + "k" : model.turns(view.turns) : "";
        $meter.find(".party-doom-time").text(known ? compact + "t" : view.status === "stopped" ? "∞" : "?");
        $meter.find(".party-doom-pressure").text(known ? "×" + view.pressure : "—");
        if (window.dcss_tooltips && $meter.is("[aria-describedby~='dcss_rich_tooltip']"))
            window.dcss_tooltips.refresh();
    }

    return { update: update };
});
