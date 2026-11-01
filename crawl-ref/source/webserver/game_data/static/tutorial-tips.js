/* One gentle, non-blocking tip at a time, the first time a player meets something.
   Tips never take focus, send a game command or pause anything. */
define(["jquery", "comm", "client", "graphics-preferences", "./enums", "./game-context", "./map_knowledge",
    "./play-guide", "./party-model", "./creature-roster-model", "./tutorial-tips-model"],
function ($, comm, client, preferences, enums, game, map, guide, party, roster, model) {
    "use strict";
    var EVALUATE = 400, BLOCKED_RETRY = 1500, JEV_DEADLINE = 2500, SETTLE = 2500, SCAN = 8, NARROW = 640, SIGNAL_LIFE = 45000;
    var catalog = [], seen = {}, quiet = true, jevReady = false, loaded = false;
    var root = null, live = null, current = null, notBefore = 0, lifeTimer = null, evaluateTimer = null;
    var request = 0, waiting = null, onOpenSettings = null, started = false, signals = {};

    function settings() { return preferences.snapshot().settings; }
    function hero() { return guide.context().hero; }
    /* What the player is doing now, or null while a menu or dialog holds tips back. */
    function activity() {
        if (!game.get_input_mode || client.is_watching() || document.querySelector("#ui-stack > *, dialog[open]")) return null;
        var input = game.get_input_mode(), modes = enums.mouse_mode;
        if (input === modes.NORMAL || input === modes.COMMAND) return "play";
        if (input === modes.TARGET || input === modes.TARGET_DIR || input === modes.TARGET_PATH) return "target";
        return input === modes.PROMPT ? "prompt" : null;
    }
    function playing() { return activity() === "play"; }
    function scan(member) {
        var found = { features: {}, allies: 0, harmless: 0, clouds: 0, items: 0 }, origin = member.pos;
        var members = (guide.context().state || {}).members || [];
        if (!origin) return found;
        for (var y = origin.y - SCAN; y <= origin.y + SCAN; y++) {
            for (var x = origin.x - SCAN; x <= origin.x + SCAN; x++) {
                var cell = map.get(x, y);
                if (!cell || !map.visible(cell)) continue;
                var feature = cell.feature_name && model.classify(cell.feature_name);
                if (feature) found.features[feature] = true;
                if (cell.t && cell.t.cloud && cell.t.cloud[0]) found.clouds++;
                if (cell.item_name && (x !== origin.x || y !== origin.y)) found.items++;
                if (!cell.mon) continue;
                if (roster.harmless(cell.mon)) found.harmless++;
                // Teammates also appear as friendly map actors.
                else if (cell.mon.att === 4 && !members.some(function (entry) {
                    return entry.pos && entry.pos.x === x && entry.pos.y === y;
                })) found.allies++;
            }
        }
        return found;
    }
    function ratio(value, max) { return Number.isFinite(value) && max > 0 ? value / max : 1; }
    function see(member, mode) {
        var state = guide.context().state, around = scan(member), now = Date.now(), active = {};
        var others = state.members.filter(function (entry) { return entry.slot !== member.slot; });
        Object.keys(signals).forEach(function (name) { if (signals[name] > now) active[name] = true; });
        var clock = member.zot_clock;
        return { mode: mode, health: ratio(member.hp, member.hp_max), magic: ratio(member.mp, member.mp_max), level: member.xl || 1,
            turns: member.turns || 0, place: member.place || "", species: member.species || "", background: member.job || "",
            god: member.god || "", stairs: member.stairs || "", multiplayer: Boolean(state.multiplayer),
            combat: Boolean(party.inCombat(state, member)), explored: guide.explored(), enemies: guide.enemies(member),
            allies: around.allies, harmless: around.harmless, clouds: around.clouds, items: around.items,
            features: around.features, inventory: member.inventory || [], signals: active,
            floorItems: member.floor_items_known ? (member.floor_items || []).length : 0,
            statuses: (member.statuses || []).reduce(function (all, entry) {
                return all.concat([entry.text, entry.light].filter(Boolean));
            }, []),
            badStatuses: (member.statuses || []).filter(function (entry) { return entry.is_bad === true; }).length,
            spells: (member.spells || []).length, abilities: (member.abilities || []).length,
            memorisable: member.spell_library ? member.spell_library.memorisable || 0 : 0,
            library: member.spell_library ? member.spell_library.total || 0 : 0,
            canTrain: member.training_supported === true, kills: member.kill_total || 0,
            resource: member.spell_resource || "mp", gold: member.gold || 0, penance: Boolean(member.penance),
            resists: Object.values(member.resists || {}).some(Boolean), mutations: (member.mutations || []).length,
            banes: (member.banes || []).length, runes: (member.runes || []).length, gems: (member.gems || []).length,
            zot: clock && clock.active && clock.capacity_aut > 0 ? 1 - clock.remaining_aut / clock.capacity_aut : 0,
            party: state.members.length, canTrade: Boolean(state.party_trade) && others.length > 0,
            canExclude: Boolean(state.tile_exclusions),
            teammateDown: others.some(down), teammateAway: others.some(function (entry) { return entry.on_same_level === false; }),
            aiTeammate: others.some(function (entry) { return Boolean(entry.ai); }) };
    }
    function remember(tip) {
        if (seen[tip.id]) return;
        seen[tip.id] = true;
        comm.send_message("tips_seen", { ids: [tip.id] });
    }
    function highlight(key, on) {
        $("#dcss_quick_dock [data-dock-key]").each(function () {
            var value = this.dataset.dockKey === "\t" ? "Tab" : this.dataset.dockKey;
            if (!on) this.classList.remove("is-tip-target");
            else if (value === key) this.classList.add("is-tip-target");
        });
    }
    function clearLife() { clearTimeout(lifeTimer); lifeTimer = null; }
    function close() {
        clearLife();
        if (!current) return false;
        highlight(null, false);
        current = null;
        if (root) root.replaceChildren();
        if (live) live.textContent = "";
        return true;
    }
    function hold() {
        clearLife();
        var span = model.lifetime(settings().tips_duration);
        if (span) lifeTimer = setTimeout(close, span);
    }
    function body(tip) {
        var text = document.createElement("p");
        model.segments(tip.body).forEach(function (part) {
            if (!part.key) { text.appendChild(document.createTextNode(part.text)); return; }
            var cap = document.createElement("kbd"); cap.textContent = part.text; text.appendChild(cap);
        });
        return text;
    }
    function card(tip, byJev, actions) {
        var node = document.createElement("article"), head = document.createElement("header");
        node.className = "tutorial-tip"; node.dataset.tip = tip.id;
        node.dataset.tipTone = tip.urgent ? "danger" : "plain";
        var eyebrow = document.createElement("span"); eyebrow.className = "tutorial-tip-eyebrow";
        eyebrow.textContent = byJev ? "Jev's tip" : "Tip";
        var title = document.createElement("h2"); title.textContent = tip.title;
        head.append(eyebrow, title);
        node.append(head, body(tip));
        if (actions) node.appendChild(actions);
        return node;
    }
    function actions() {
        var row = document.createElement("div"), got = document.createElement("button"), more = document.createElement("button");
        row.className = "tutorial-tip-actions";
        got.type = more.type = "button";
        got.className = "tutorial-tip-primary"; got.append("Got it ");
        var cap = document.createElement("kbd"); cap.textContent = "Esc"; got.appendChild(cap);
        more.className = "tutorial-tip-settings"; more.textContent = "Tip settings";
        got.addEventListener("click", function () { this.blur(); close(); });
        more.addEventListener("click", function () { this.blur(); if (onOpenSettings) onOpenSettings(); });
        row.append(got, more);
        return row;
    }
    function apply(values) {
        if (!root) return;
        root.dataset.tipSize = values.tips_size; root.dataset.tipPosition = values.tips_position;
    }
    function show(tip, byJev) {
        mount();
        if (!root) return;
        var values = settings();
        close(); remember(tip);
        current = tip; apply(values);
        root.appendChild(card(tip, byJev, actions()));
        live.textContent = "Tip. " + tip.title + ". " + tip.body.replace(/`/g, "");
        if (values.tips_highlight && tip.keys) highlight(tip.keys[0], true);
        hold();
        notBefore = Date.now() + model.gap(values.tips_pace);
    }
    function down(member) { return member.alive === false || Boolean(member.ghost_haunting); }
    function candidates(mode, known) {
        var member = hero();
        if (!member) return null;
        var view = see(member, mode === "play" && down(member) ? "downed" : mode);
        return { view: view, tips: model.eligible(catalog, view, known, settings().tips_level) };
    }
    function settle(choice, byJev) {
        clearTimeout(waiting); waiting = null;
        // The world may have moved on while Jev thought; never show a stale tip.
        var mode = activity(), found = mode && candidates(mode, seen);
        if (!found || !found.tips.length || current) return;
        var picked = found.tips.find(function (tip) { return tip.id === choice; });
        show(picked || found.tips[0], Boolean(picked && byJev));
    }
    function evaluate() {
        evaluateTimer = null;
        if (!loaded || quiet || waiting || settings().tips_level === "off") return;
        // A menu or prompt holds tips back; an idle game sends nothing to wake us after it closes.
        var mode = activity();
        if (!mode) { evaluateTimer = setTimeout(evaluate, BLOCKED_RETRY); return; }
        var found = candidates(mode, seen);
        if (!found || !found.tips.length) return;
        var first = found.tips[0], now = Date.now();
        if (current && (current.urgent || !first.urgent)) return;
        if (!first.urgent && now < notBefore) {
            // Nothing else may wake this up if the player is reading or idle.
            evaluateTimer = setTimeout(evaluate, notBefore - now);
            return;
        }
        var values = settings();
        if (first.urgent || found.tips.length < 2 || !jevReady || !values.tips_jev) { show(first, false); return; }
        var id = ++request;
        waiting = setTimeout(function () { settle(null, false); }, JEV_DEADLINE);
        comm.send_message("tip_choose", { request_id: id, candidates: found.tips.slice(0, 8).map(function (tip) { return tip.id; }),
            context: model.context(found.view) });
    }
    function schedule() {
        if (started && !evaluateTimer) evaluateTimer = setTimeout(evaluate, EVALUATE);
    }
    function practice(key) {
        model.practiced(catalog, key).forEach(function (tip) {
            if (current && current.id === tip.id) close();
            remember(tip);
        });
    }
    function onKey(event) {
        if (!loaded || event.ctrlKey || event.altKey || event.metaKey || !playing()) return;
        var original = event.originalEvent || event;
        if (event.type === "game_keydown") { if (original.key === "Tab" && !event.shiftKey) practice("Tab"); }
        else practice(String.fromCharCode(event.which));
    }
    function onClick(event) {
        var button = loaded && event.target.closest("#dcss_quick_dock [data-dock-key]");
        if (button && !button.disabled) practice(button.dataset.dockKey === "\t" ? "Tab" : button.dataset.dockKey);
    }
    function mount() {
        var view = document.getElementById("dungeon_viewport");
        if (!view) return;
        // A phone-width map column is too narrow to hold the card.
        var host = window.innerWidth <= NARROW ? document.body : view;
        root = document.getElementById("tutorial_tip");
        if (!root) { root = document.createElement("div"); root.id = "tutorial_tip"; }
        if (root.parentNode !== host) host.appendChild(root);
        root.setAttribute("aria-label", "Tutorial tip");
        root.setAttribute("role", "complementary");
        // Announced from a permanent region so screen readers hear it without a focus change.
        live = document.getElementById("tutorial_tip_live");
        if (!live) {
            live = document.createElement("p"); live.id = "tutorial_tip_live"; live.className = "tutorial-tip-live";
            live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");
            view.appendChild(live);
        }
        root.onmouseenter = root.onfocusin = clearLife;
        root.onmouseleave = root.onfocusout = function () { if (current) hold(); };
        apply(settings());
    }
    function receive(data) {
        if (!data || !Array.isArray(data.seen) || !data.catalog) return;
        catalog = data.catalog.tips; seen = {}; loaded = true;
        data.seen.forEach(function (id) { seen[id] = true; });
        quiet = data.quiet === true; jevReady = data.jev === true;
        $(document).trigger("tutorial_tips_changed");
        schedule();
    }
    function stop() {
        started = false; loaded = false; catalog = []; seen = {}; signals = {}; quiet = true; jevReady = false;
        clearTimeout(evaluateTimer); evaluateTimer = null; clearTimeout(waiting); waiting = null;
        close(); root = live = null; notBefore = 0;
        document.removeEventListener("click", onClick, true);
    }
    function init(openSettings) {
        stop();
        onOpenSettings = openSettings; started = true;
        if (client.is_watching()) return;
        mount();
        notBefore = Date.now() + SETTLE;
        document.addEventListener("click", onClick, true);
        comm.send_message("tips_fetch");
    }
    comm.register_handlers({
        tips_state: receive,
        tip_choice: function (data) { if (data && data.request_id === request && waiting) settle(data.choice, true); }
    });
    $(document).on("party_state_rendered.tutorialTips game_explore_finished.tutorialTips map_knowledge_changed.tutorialTips game_popup_changed.tutorialTips", schedule)
        .on("game_keydown.tutorialTips game_keypress.tutorialTips", onKey)
        .on("game_message_text.tutorialTips", function (event, text) {
            var name = model.signal(text);
            if (name) { signals[name] = Date.now() + SIGNAL_LIFE; schedule(); }
        })
        .on("graphics_settings_changed.tutorialTips", function (event, state) {
            if (state.settings.tips_level === "off") close();
            else if (current) { apply(state.settings); hold(); }
        })
        .on("game_cleanup.tutorialTips", stop);
    return { init: init, dismiss: close, card: card, showing: function () { return Boolean(current); },
        fits: function () {
            var mode = activity(), found = mode && candidates(mode, {});
            return found ? found.tips.map(function (tip) { return tip.id; }) : [];
        },
        catalog: function () { return catalog; }, seen: function () { return Object.assign({}, seen); },
        jevAvailable: function () { return jevReady; },
        resetSeen: function () { comm.send_message("tips_reset"); } };
});
