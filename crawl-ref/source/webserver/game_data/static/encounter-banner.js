/* Combat-mode transitions from confirmed party snapshots: a brief non-blocking
   banner over the map, plus repaint requests for tiles whose threat reticle
   (ready enemy adjacent to a hero) appeared or disappeared. No new messages. */
define(["jquery", "./party-model"], function ($, party) {
    "use strict";
    var renderer, running = false, combat = null, floor, banner = null, timer = null, marks = new Set();
    function remove() {
        clearTimeout(timer); timer = null;
        if (banner) banner.remove();
        banner = null;
    }
    function show(mode, title, detail) {
        remove();
        var host = document.getElementById("dungeon_viewport") || document.body;
        banner = document.createElement("div");
        banner.className = "encounter-banner"; banner.dataset.mode = mode;
        banner.setAttribute("role", "status"); banner.setAttribute("aria-live", "polite");
        banner.textContent = title;
        if (detail) { var small = document.createElement("small"); small.textContent = detail; banner.appendChild(small); }
        host.appendChild(banner);
        // Next frame so the opacity transition runs; reduced motion disables it in CSS.
        window.requestAnimationFrame(function () { if (banner) banner.classList.add("is-shown"); });
        timer = setTimeout(function () {
            if (banner) banner.classList.remove("is-shown");
            timer = setTimeout(remove, 300);
        }, 2200);
    }
    function controlled(state) {
        var slot = party.controlledSlot(state);
        return (state.members || []).find(function (member) { return member.slot === slot; });
    }
    function threatCells(state) {
        var cells = new Set();
        var heroes = (state.members || []).filter(function (m) {
            return m.on_same_level !== false && m.alive !== false && !m.ghost_haunting && m.pos
                && Number.isFinite(m.pos.x) && Number.isFinite(m.pos.y);
        });
        (Array.isArray(state.enemy_initiative) ? state.enemy_initiative : []).forEach(function (enemy) {
            if (enemy.ready !== true || enemy.perception === "last_known" || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) return;
            if (heroes.some(function (m) { return Math.max(Math.abs(m.pos.x - enemy.x), Math.abs(m.pos.y - enemy.y)) === 1; }))
                cells.add(enemy.x + "," + enemy.y);
        });
        return cells;
    }
    function sync(event, state) {
        if (!running || !state) return;
        var hero = controlled(state), changedFloor = floor !== undefined && floor !== state.floor;
        floor = state.floor;
        var next = threatCells(state);
        if (renderer && renderer.element) {
            marks.forEach(function (key) { if (!next.has(key)) repaint(key); });
            next.forEach(function (key) { if (!marks.has(key)) repaint(key); });
        }
        marks = next;
        if (!hero) { combat = null; return; }
        var now = Boolean(party.inCombat(state, hero));
        // First snapshot, floor changes and control changes are baselines, not transitions.
        if (combat === null || changedFloor || combat.slot !== hero.slot) { combat = { slot: hero.slot, value: now }; return; }
        if (now === combat.value) return;
        combat = { slot: hero.slot, value: now };
        if (now) show("combat", "Tactical combat", "Turn order engaged · plan, then Go");
        else show("clear", "Area clear", "Free exploration resumed");
    }
    function repaint(key) {
        var parts = key.split(","), x = Number(parts[0]), y = Number(parts[1]);
        if (renderer.in_view && renderer.in_view(x, y) && renderer.render_loc) renderer.render_loc(x, y);
    }
    function reset() { remove(); combat = null; floor = undefined; marks = new Set(); }
    $(document).on("game_init.encounterBanner", function () { reset(); running = true; })
        .on("game_cleanup.encounterBanner game_connection_lost.encounterBanner game_preinit.encounterBanner", function () {
            running = false; reset();
        })
        .on("party_state_rendered.encounterBanner", sync);
    return { attach: function (view) { renderer = view; } };
});
