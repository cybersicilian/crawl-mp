/* Projected turn order: heroes and personally visible enemies on one rail.
 * Uses the existing initiative projection (banked time, recovery debt) and the
 * native enemy readings (energy deficit, speed). Nothing is simulated: entries
 * without native timing are listed last in an explicit "unknown" state. */
define(["jquery", "./party-model", "./enemy-banner-model", "./creature-roster-model", "./monster_list",
        "./enemy-initiative", "./frame-update", "./turn-order-model"],
function ($, model, banner, roster, nearby, enemies, frameUpdate, turns) {
    "use strict";
    // About two rows of tokens; the creature roster lists anyone past them.
    var TOKEN_LIMIT = 14;
    var state = null, signature = "", nodes = new Map(), beatNodes = new Map(), more = null;
    var portraits = enemies.createPainter();
    var threatNames = ["trivial", "easy", "tough", "nasty", "invisible"];

    function heroEntries(data) {
        var controlled = model.controlledSlot(data), timeline = model.initiativeTimeline(data);
        return data.members.map(function (member) {
            var timing = timeline.find(function (entry) { return entry.slot === member.slot; });
            if (!timing || timing.status === "downed" || timing.status === "away") return null;
            var known = timing.banked !== undefined;
            return { kind: "hero", id: "hero:" + member.slot, slot: member.slot, name: member.name,
                wait: known ? timing.debt || 0 : null, banked: known ? timing.banked || 0 : 0,
                state: known ? (timing.debt > 0 ? "recovering" : "ready") : timing.status,
                queued: Boolean(timing.queued_action), active: member.slot === controlled,
                acting: Boolean(member.active) };
        }).filter(Boolean);
    }
    function enemyEntries(data) {
        var contacts = roster.collect(data && data.enemy_initiative, nearby.contacts());
        return contacts.filter(function (contact) { return roster.category(contact) === "enemies"; })
            .map(function (contact) {
                var view = banner.project(contact), key = roster.key(contact);
                // Native speed is energy per standard turn (10 aut); the deficit is
                // energy still owed before the next action. Remembered contacts have no clock.
                var wait = view.remembered || !view.timed ? null
                    : contact.ready ? 0 : Math.round(contact.energy_deficit * 10 / Math.max(1, contact.speed));
                return { kind: "enemy", id: "enemy:" + key, key: key, name: contact.name, wait: wait, banked: 0,
                    x: contact.x, y: contact.y, perception: contact.perception,
                    state: view.remembered ? "remembered" : !view.timed ? "unknown" : contact.ready ? "ready" : "recovering",
                    threat: Number.isInteger(contact.threat) ? threatNames[contact.threat] || "unknown" : "unknown",
                    health: view.health };
            });
    }
    function title(entry) {
        return entry.count > 1 ? entry.name + " ×" + entry.count : entry.name;
    }
    function describe(entry) {
        var timing = entry.wait === null ? "timing unknown" : entry.wait === 0 ? "ready to act"
            : "about " + entry.wait + " aut until ready";
        if (entry.kind === "hero" && entry.banked > 0) timing += ", " + entry.banked + " aut banked";
        if (entry.queued) timing += ", action queued";
        return title(entry) + ": " + timing + (entry.kind === "enemy" ? ". Threat " + entry.threat : "")
            + (entry.kind === "hero" ? ". Center camera" : ". Mark on map");
    }
    function activate(entry) {
        if (entry.kind === "hero") {
            $(".party-card[data-party-slot='" + entry.slot + "'] .party-camera-btn").first().trigger("click");
        } else if (enemies.locate) enemies.locate(entry.key);
    }
    function create(entry) {
        var node = document.createElement("button");
        node.type = "button"; node.className = "turn-order-entry"; node.dataset.turnId = entry.id;
        node.innerHTML = "<span class='turn-order-marker' aria-hidden='true'></span>"
            + "<span class='turn-order-count' aria-hidden='true' hidden></span>";
        node.parts = { marker: node.querySelector(".turn-order-marker"), count: node.querySelector(".turn-order-count") };
        if (entry.kind === "hero") {
            node.parts.marker.textContent = "P" + (entry.slot + 1);
            node.style.setProperty("--slot-accent", model.colours[entry.slot % model.colours.length]);
        } else node.parts.canvas = node.parts.marker.appendChild(document.createElement("canvas"));
        $(node).on("click", function (event) { event.stopPropagation(); activate(entry); })
            .on("keydown keypress keyup mousedown mouseup", function (event) { event.stopPropagation(); });
        return node;
    }
    function text(element, value) { if (element.textContent !== value) element.textContent = value; }
    function attribute(element, name, value) {
        if (value === null || value === undefined) { if (element.hasAttribute(name)) element.removeAttribute(name); }
        else if (element.getAttribute(name) !== String(value)) element.setAttribute(name, value);
    }
    function reconcile(parent, children) {
        var current = parent.firstChild;
        children.forEach(function (child) {
            if (child === current) current = current.nextSibling;
            else parent.insertBefore(child, current);
        });
        while (current) { var removed = current; current = current.nextSibling; removed.remove(); }
    }
    function token(entry, position) {
        var node = nodes.get(entry.id);
        if (!node) { node = create(entry); nodes.set(entry.id, node); }
        if (entry.kind === "enemy") {
            var moved = !banner.sameContact(node.enemy, entry);
            node.enemy = entry;
            portraits.track(node, entry.x, entry.y);
            if (moved) portraits.invalidate(node);
        }
        node.parts.count.hidden = entry.count < 2;
        text(node.parts.count, "×" + entry.count);
        attribute(node, "data-kind", entry.kind);
        attribute(node, "data-timing-state", entry.state);
        attribute(node, "data-threat", entry.kind === "enemy" ? entry.threat : null);
        attribute(node, "data-active", entry.kind === "hero" && entry.active ? "true" : null);
        attribute(node, "data-acting", entry.kind === "hero" && entry.acting ? "true" : null);
        attribute(node, "data-queued", entry.queued ? "true" : null);
        attribute(node, "aria-label", position + ". " + describe(entry));
        attribute(node, "data-tip-title", title(entry));
        attribute(node, "data-tip-body", describe(entry));
        attribute(node, "data-tip-meta", entry.kind === "hero" ? "Projected from banked time and recovery debt"
            : "Projected from native speed and action energy");
        return node;
    }
    function beatNode(beat) {
        var node = beatNodes.get(beat.key);
        if (!node) {
            node = document.createElement("div"); node.className = "turn-order-beat";
            node.innerHTML = "<div class='turn-order-tokens'></div><span class='turn-order-reading' aria-hidden='true'></span>";
            beatNodes.set(beat.key, node);
        }
        text(node.lastChild, beat.reading);
        attribute(node, "data-beat", beat.wait === null ? "unknown" : beat.wait === 0 ? "now" : "later");
        return node;
    }
    function moreNode(count) {
        if (!more) { more = document.createElement("span"); more.className = "turn-order-more"; }
        var label = count + " more in the creature list";
        text(more, "+" + count);
        attribute(more, "aria-label", label);
        attribute(more, "data-tip-title", label);
        return more;
    }
    function render() {
        var root = document.getElementById("party_turn_order"), track = document.getElementById("party_turn_order_track");
        if (!root || !track) return;
        var members = state && Array.isArray(state.members) ? state.members : [];
        if (!members.length) { root.hidden = true; signature = ""; return; }
        var entries = heroEntries(state).concat(enemyEntries(state));
        var next = JSON.stringify(entries);
        if (next === signature) return;
        signature = next;
        root.hidden = entries.length === 0;
        var focused = document.activeElement && document.activeElement.dataset.turnId;
        var view = turns.beats(entries, TOKEN_LIMIT), position = 0;
        var children = view.beats.map(function (beat) {
            var node = beatNode(beat);
            reconcile(node.firstChild, beat.tokens.map(function (entry) { return token(entry, ++position); }));
            return node;
        });
        if (view.hidden) children.push(moreNode(view.hidden));
        reconcile(track, children);
        nodes.forEach(function (node, id) {
            if (!node.isConnected) { portraits.remove(node); nodes.delete(id); }
        });
        beatNodes.forEach(function (node, key) { if (!node.isConnected) beatNodes.delete(key); });
        attribute(root, "data-entry-count", entries.length);
        attribute(root, "data-timing-known", entries.some(function (entry) { return entry.wait !== null; }) ? "true" : "false");
        if (focused) {
            var target = track.querySelector("[data-turn-id='" + focused + "']");
            if (target && document.activeElement !== target) target.focus({ preventScroll: true });
        }
    }
    var refresh = frameUpdate(render);
    function update(next) { state = next; render(); }
    $(document).off(".turnOrder")
        .on("nearby_creatures_changed.turnOrder", refresh)
        .on("game_cleanup.turnOrder", function () {
            refresh.cancel(); portraits.clear(); state = null; signature = ""; nodes.clear(); beatNodes.clear();
            var track = document.getElementById("party_turn_order_track");
            if (track) track.replaceChildren();
        });
    return { update: update, heroEntries: heroEntries, enemyEntries: enemyEntries };
});
