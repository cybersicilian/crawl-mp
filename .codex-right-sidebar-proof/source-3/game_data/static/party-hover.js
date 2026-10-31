define(["jquery", "comm", "client", "./party-model", "./map_knowledge", "./options"],
function ($, comm, client, model, map, options) {
    "use strict";
    var peers = new Map(), renderer, generation = null, running = false;
    var pointer = null, sent = null, pending = null, timer = null;
    var lastSend = 0, heartbeat = null;
    var lease = 6000, interval = 50;

    function redraw(loc) {
        if (renderer && loc && map.bounds()) renderer.render_loc(loc.x, loc.y);
    }
    function resetPeers() {
        var previous = Array.from(peers.values());
        peers.clear();
        previous.forEach(redraw);
    }
    function allowed() {
        var state = window.crawl_party && window.crawl_party.state;
        return running && generation !== null && !document.hidden && document.hasFocus()
            && options.get("tile_web_mouse_control") && state && state.enabled
            && (Number.isInteger(state.controlled_slot) || client.is_party_member());
    }
    function send(loc) {
        if (!window.socket || window.socket.readyState !== 1) return;
        var data = { generation: generation, active: Boolean(loc) };
        data.floor = window.crawl_party && window.crawl_party.state && window.crawl_party.state.floor;
        if (loc) { data.x = loc.x; data.y = loc.y; }
        comm.send_message("party_hover", data);
        sent = loc;
        lastSend = Date.now();
    }
    function flush() {
        timer = null;
        if (!allowed()) { leave(); return; }
        var loc = pending;
        pending = null;
        if (loc) send(loc);
    }
    function point(loc, event) {
        if (event) pointer = { x: event.clientX, y: event.clientY };
        var cell = map.get(loc.x, loc.y);
        if (!allowed() || !cell || !cell.t || !renderer.in_view(loc.x, loc.y)) {
            leave();
            return;
        }
        if (sent && sent.x === loc.x && sent.y === loc.y && !pending) return;
        pending = { x: loc.x, y: loc.y };
        if (!timer) {
            var delay = Math.max(0, interval - (Date.now() - lastSend));
            if (delay) timer = setTimeout(flush, delay);
            else flush();
        }
    }
    function leave() {
        clearTimeout(timer);
        timer = null;
        pending = null;
        pointer = null;
        if (sent) send(null);
        sent = null;
    }
    function reproject() {
        if (!pointer || !renderer) return;
        var bounds = renderer.element.getBoundingClientRect();
        if (pointer.x < bounds.left || pointer.x >= bounds.right
            || pointer.y < bounds.top || pointer.y >= bounds.bottom) { leave(); return; }
        var scaled = renderer.scaled_size(pointer.x - bounds.left, pointer.y - bounds.top);
        var cell = renderer.scaled_size();
        point({ x: Math.floor(scaled.width / cell.width) + renderer.view.x,
            y: Math.floor(scaled.height / cell.height) + renderer.view.y });
    }
    function receive(data) {
        if (!running || data.generation !== generation) return;
        var previous = peers.get(data.id);
        peers.delete(data.id);
        if (data.active && Number.isInteger(data.x) && Number.isInteger(data.y)
            && Number.isInteger(data.slot) && data.slot >= 0 && data.slot < model.colours.length)
            peers.set(data.id, { x: data.x, y: data.y, slot: data.slot, expires: Date.now() + lease });
        redraw(previous);
        redraw(peers.get(data.id));
    }
    function draw(view, cx, cy, x, y) {
        var pointers = Array.from(peers.values()).filter(function (peer) {
            return peer.x === cx && peer.y === cy && peer.expires > Date.now();
        });
        if (!pointers.length) return;
        var ctx = view.ctx, size = view.scaled_size();
        // Separate colored edges retain every player's identity on shared tiles.
        var slots = Array.from(new Set(pointers.map(function (peer) { return peer.slot; }))).sort();
        ctx.save();
        slots.forEach(function (slot, index) {
            var inset = 2 + index * 3, width = size.width - inset * 2, height = size.height - inset * 2;
            if (width < 4 || height < 4) return;
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = model.colours[slot];
            ctx.fillRect(x + inset, y + inset, width, height);
            ctx.globalAlpha = 1;
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#080808";
            ctx.strokeRect(x + inset, y + inset, width, height);
            ctx.lineWidth = 2;
            ctx.strokeStyle = model.colours[slot];
            ctx.strokeRect(x + inset, y + inset, width, height);
            // P-number also distinguishes players without color perception.
            var label = "P" + (slot + 1), font = Math.max(9, Math.floor(size.height * 0.24));
            ctx.font = "bold " + font + "px monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "bottom";
            var labelY = y + size.height - 3 - index * (font + 2);
            ctx.fillStyle = "#080808";
            ctx.fillRect(x + 3, labelY - font, ctx.measureText(label).width + 4, font + 2);
            ctx.fillStyle = model.colours[slot];
            ctx.fillText(label, x + 5, labelY);
        });
        ctx.restore();
    }
    comm.register_handlers({
        party_hover: receive,
        party_hover_reset: function (data) {
            leave();
            resetPeers();
            generation = data.generation;
        }
    });
    $(document).off("game_init.partyHover game_cleanup.partyHover visibilitychange.partyHover game_camera_changed.partyHover")
        .on("game_init.partyHover", function () {
        running = true;
        clearInterval(heartbeat);
        heartbeat = setInterval(function () {
            var now = Date.now();
            peers.forEach(function (peer, id) {
                if (peer.expires <= now) { peers.delete(id); redraw(peer); }
            });
            if (!allowed()) { leave(); return; }
            reproject();
            if (sent && now - lastSend >= 2000) send(sent);
        }, 500);
    }).on("game_cleanup.partyHover", function () {
        leave();
        running = false;
        generation = null;
        resetPeers();
        clearInterval(heartbeat);
        heartbeat = null;
    }).on("visibilitychange.partyHover", function () { if (document.hidden) leave(); })
        .on("game_camera_changed.partyHover", reproject);
    $(window).off("blur.partyHover pagehide.partyHover resize.partyHover")
        .on("blur.partyHover pagehide.partyHover", leave).on("resize.partyHover", reproject);

    return { attach: function (view) { renderer = view; }, point: point, leave: leave, draw: draw };
});
