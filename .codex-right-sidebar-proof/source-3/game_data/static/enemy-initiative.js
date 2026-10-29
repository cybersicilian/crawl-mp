define(["jquery", "./party-initiative", "./party-model", "./frame-update"],
function ($, initiative, party, frameUpdate) {
    "use strict";
    var observer;
    function position() {
        var rail = document.getElementById("enemy_initiative_rail");
        var hud = document.querySelector("#party_hud .is-controlled-card")
            || document.getElementById("party_hud_members");
        if (!rail || !hud) return;
        var bounds = hud.getBoundingClientRect();
        var compact = bounds.left < 134 || window.innerWidth < 700;
        rail.classList.toggle("is-compact", compact);
        if (compact) {
            Object.assign(rail.style, { left: "", top: "", maxHeight: "" });
        } else {
            Object.assign(rail.style, { left: Math.max(4, bounds.left - 122) + "px",
                top: Math.max(4, bounds.top) + "px",
                maxHeight: Math.max(80, window.innerHeight - bounds.top - 12) + "px" });
        }
    }
    var refresh = frameUpdate(position);
    function update(state) {
        var $rail = $("#enemy_initiative_rail");
        if (!$rail.length) return;
        var enemies = state && Array.isArray(state.enemy_initiative) ? state.enemy_initiative : [];
        var known = Boolean(state && Array.isArray(state.enemy_initiative));
        initiative.updateMonster($("#party_progress_monsters"), state);
        $rail.prop("hidden", !enemies.length && !(state && state.multiplayer));
        var live = new Set();
        enemies.forEach(function (enemy) {
            if (!Number.isFinite(enemy.energy_deficit) || !Number.isFinite(enemy.speed)) return;
            var key = enemy.id ? String(enemy.id) : enemy.x + "," + enemy.y;
            live.add(key);
            var node = Array.from($rail[0].querySelectorAll(".enemy-timing"))
                .find(function (entry) { return entry.dataset.enemyId === key; });
            if (!node) {
                node = document.createElement("div");
                node.className = "enemy-timing"; node.dataset.enemyId = key;
                node.tabIndex = 0; node.setAttribute("role", "img");
                node.innerHTML = "<span class='enemy-timing-name'></span><span class='enemy-timing-track' aria-hidden='true'><i></i></span><small></small>";
                $rail.find(".enemy-timing-list").append(node);
            }
            var delay = enemy.speed > 0 ? Math.ceil(Math.max(0, enemy.energy_deficit) * 10 / enemy.speed) : null;
            var reading = enemy.ready ? "Ready" : delay === null ? "Paused" : "~" + delay + " aut";
            node.dataset.ready = String(Boolean(enemy.ready));
            node.querySelector(".enemy-timing-name").textContent = enemy.name;
            node.querySelector("small").textContent = reading;
            node.querySelector("i").style.width = Math.max(0, 100 - enemy.energy_deficit / Math.max(10, enemy.energy_deficit) * 100) + "%";
            $(node).attr({ "aria-label": enemy.name + " initiative: " + reading,
                "data-tip-title": enemy.name + " · Initiative",
                "data-tip-body": "Native action energy: " + enemy.energy_deficit + " energy short; speed " + enemy.speed
                    + ". The estimate is region time until readiness, not an attack countdown. Energy gain is randomized; native targeting and action costs still apply.",
                "data-tip-meta": "10 aut = 1 standard turn · Visible enemies only" });
        });
        $rail.find(".enemy-timing").each(function () { if (!live.has(this.dataset.enemyId)) this.remove(); });
        $rail.find(".enemy-timing-empty").prop("hidden", enemies.length > 0)
            .text(known ? "No visible enemies" : "Enemy readings need an updated engine");
        var hero = state && (state.members || []).find(function (entry) { return entry.slot === party.controlledSlot(state); });
        $rail.attr("aria-label", "Enemy initiative beside " + (hero ? hero.name : "player"));
        refresh();
    }
    function init() {
        if (!$("#party_hud").length) return;
        $("#enemy_initiative_rail").remove();
        var $rail = $("<aside id='enemy_initiative_rail' hidden><strong>Enemies</strong><div class='enemy-timing-list'></div><small class='enemy-timing-empty'></small></aside>");
        $rail.append($("#party_progress_monsters")).prependTo("#party_hud");
        $rail.on("click keydown keypress keyup", function (event) { event.stopPropagation(); });
        if (observer) observer.disconnect();
        observer = new ResizeObserver(refresh);
        observer.observe(document.getElementById("party_hud"));
        update(window.crawl_party && window.crawl_party.state);
    }
    $(document).on("party_state_rendered.enemyInitiative", function (event, state) { update(state); })
        .on("hud_workspace_changed.enemyInitiative", refresh)
        .on("game_cleanup.enemyInitiative", function () {
            refresh.cancel(); if (observer) observer.disconnect(); observer = null;
            $("#enemy_initiative_rail").remove();
        });
    $(window).on("resize.enemyInitiative scroll.enemyInitiative", refresh);
    return { init: init, update: update };
});
