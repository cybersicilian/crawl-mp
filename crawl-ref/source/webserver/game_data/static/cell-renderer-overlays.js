define(["./view_data", "./enums"], function (view_data, enums) {
    "use strict";

    // Party annotations share the renderer's native canvas coordinate system and
    // are painted per cell inside the dirty-chunk repaint, so every size below is
    // derived from the device-pixel cell size rather than CSS pixels.
    var slot_colours = ["#fce94f", "#34e2e2", "#8ae234", "#ad7fa8"];
    var threat_colour = "#ff5a4a", hover_colour = "#f6e7c1", halo = "rgba(0, 0, 0, 0.78)";
    var ping_styles = {
        look: { col: "#34e2e2", prefix: "LOOK" }, danger: { col: "#ef2929", prefix: "DANGER" },
        loot: { col: "#fce94f", prefix: "LOOT" }, stairs: { col: "#8ae234", prefix: "STAIRS" }
    };
    function controlledSlot(state) {
        if (Number.isInteger(state.controlled_slot)) return state.controlled_slot;
        return Number.isInteger(state.active_slot) ? state.active_slot : 0;
    }
    function here(member) {
        return member && member.on_same_level !== false && member.pos
            && Number.isFinite(member.pos.x) && Number.isFinite(member.pos.y);
    }
    function circle(ctx, x, y, radius, width, style, alpha, dash) {
        ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.strokeStyle = style;
        ctx.setLineDash(dash || []);
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
    }
    function plate(ctx, x, y, text, colour, font, align) {
        ctx.font = font; ctx.textAlign = align; ctx.textBaseline = "top";
        var width = Math.ceil(ctx.measureText(text).width) + 4, height = parseInt(font, 10) + 2;
        var left = align === "right" ? x - width : x;
        ctx.globalAlpha = 0.92; ctx.fillStyle = "#080808"; ctx.fillRect(left, y, width, height);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.strokeRect(left + 0.5, y + 0.5, width - 1, height - 1);
        ctx.globalAlpha = 1; ctx.fillStyle = colour; ctx.fillText(text, align === "right" ? x - 2 : x + 2, y + 1);
        return height;
    }
    function heroRing(ctx, m, x, y, w, h, controlled) {
        var u = Math.min(w, h), cx = x + w / 2, cy = y + h / 2, col = slot_colours[m.slot % slot_colours.length];
        var downed = m.ghost_haunting || m.alive === false;
        var width = Math.max(1, Math.round(u * (controlled ? 0.07 : 0.045)));
        var radius = u * 0.46 - width / 2, dash = controlled || downed ? [] : [Math.max(2, u * 0.09), Math.max(2, u * 0.06)];
        if (downed) { col = "#9a9a9a"; dash = [Math.max(1, u * 0.04), Math.max(1, u * 0.05)]; }
        circle(ctx, cx, cy, radius, width + 2, halo, controlled ? 0.9 : 0.7);
        circle(ctx, cx, cy, radius, width, col, downed ? 0.6 : controlled ? 1 : 0.85, dash);
        if (controlled && !downed)
            circle(ctx, cx, cy, radius - width - Math.max(1, u * 0.03), Math.max(1, Math.round(u * 0.025)), col, 0.6);
        return col;
    }
    function recoveryArc(ctx, m, x, y, w, h) {
        var pct = 0;
        if (m.aut_lead > 0) pct = m.aut_lead / Math.max(10, m.last_action_aut || 10);
        else if (m.cooldown_remaining_ms > 0) pct = m.cooldown_remaining_ms / Math.max(100, m.cooldown_ms || 500);
        pct = Math.max(0, Math.min(1, pct));
        if (!pct) return;
        var u = Math.min(w, h), cx = x + w / 2, cy = y + h / 2, radius = u * 0.46 - Math.max(1, u * 0.07) * 1.5 - 2;
        var start = -Math.PI / 2, end = start + Math.PI * 2 * pct;
        ctx.globalAlpha = 0.22; ctx.fillStyle = "#0a0c10";
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, end); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.95; ctx.lineWidth = Math.max(1, Math.round(u * 0.05)); ctx.lineCap = "round";
        ctx.strokeStyle = m.queued_action ? "#34e2e2" : "#e9b96e";
        ctx.beginPath(); ctx.arc(cx, cy, radius, start, end); ctx.stroke();
    }
    function badgeFor(m) {
        if (m.queued_action) return { text: "Q", col: "#34e2e2", bg: "#06161a" };
        if (m.statuses && m.statuses.length) {
            var first = m.statuses[0], text = String(first.light || first.text || "BUFF").toUpperCase().slice(0, 5);
            if (m.statuses.length > 1) text = text.slice(0, 3) + "+" + (m.statuses.length - 1);
            return first.is_bad ? { text: text, col: "#ef2929", bg: "#1e0808" } : { text: text, col: "#fce94f", bg: "#1a1606" };
        }
        if (m.aut_lead > 0) return { text: "+" + (m.aut_lead / 10).toFixed(1) + "t", col: "#e9b96e", bg: "#1c1306" };
        var r = m.resists;
        if (r && (r.rPois > 0 || r.rElec > 0 || r.rFire > 0 || r.rCold > 0))
            return { text: r.rPois > 0 ? "rP" : r.rElec > 0 ? "rE" : r.rFire > 0 ? "rF" : "rC", col: "#8ae234", bg: "#081808" };
        if (m.spells && m.spells.length) return { text: "SPL", col: "#34e2e2", bg: "#06161a" };
        if (m.mutations && m.mutations.length) return { text: "TRT", col: "#fce94f", bg: "#181406" };
        return m.alive ? { text: "RDY", col: "#8ae234", bg: "#081408" } : null;
    }
    function hero(ctx, m, x, y, w, h, controlled) {
        var col = heroRing(ctx, m, x, y, w, h, controlled);
        recoveryArc(ctx, m, x, y, w, h);
        // Nameplate: P-number plus a short name, readable without colour perception.
        var short_name = (m.name || "").slice(0, 6);
        var label = "P" + (m.slot + 1) + (short_name ? ":" + short_name : "") + (m.ghost_haunting || !m.alive ? "*" : "");
        plate(ctx, x + 1, y + 1, label, col, Math.max(9, Math.floor(h * 0.23)) + "px monospace", "left");
        var bar_h = 0;
        if (!controlled && m.alive && m.hp_max > 0) {
            bar_h = Math.max(2, Math.floor(h / 14));
            var hp_pct = Math.max(0, Math.min(1, m.hp / m.hp_max));
            ctx.globalAlpha = 1; ctx.fillStyle = "#000"; ctx.fillRect(x, y + h - bar_h - 1, w, bar_h + 1);
            ctx.fillStyle = "#6e0008"; ctx.fillRect(x + 1, y + h - bar_h, w - 2, bar_h - 1);
            ctx.fillStyle = hp_pct <= 0.3 ? "#ef2929" : hp_pct <= 0.6 ? "#fce94f" : "#8ae234";
            ctx.fillRect(x + 1, y + h - bar_h, Math.floor((w - 2) * hp_pct), bar_h - 1);
        }
        var badge = badgeFor(m);
        if (!badge) return;
        var font = Math.max(8, Math.floor(h * 0.2));
        ctx.font = "bold " + font + "px monospace"; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
        var bw = Math.min(w - 4, Math.ceil(ctx.measureText(badge.text).width) + 6), bh = font + 2;
        var bottom = y + h - (bar_h ? bar_h + 2 : 1), left = x + w - bw - 1, top = bottom - bh;
        ctx.globalAlpha = 1; ctx.fillStyle = badge.bg; ctx.fillRect(left, top, bw, bh);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.strokeRect(left - 0.5, top - 0.5, bw + 1, bh + 1);
        ctx.fillStyle = badge.col; ctx.fillRect(left, top, 2, bh);
        ctx.fillText(badge.text, x + w - 2, bottom - 1, bw - 3);
    }
    // Native readiness plus adjacency to a living hero: the enemy can strike before
    // that hero's next action. Nothing further is inferred from speed or energy.
    function threatAt(state, cx, cy) {
        var readings = Array.isArray(state.enemy_initiative) ? state.enemy_initiative : [];
        var heroes = (state.members || []).filter(function (m) { return here(m) && m.alive !== false && !m.ghost_haunting; });
        return readings.find(function (enemy) {
            if (enemy.x !== cx || enemy.y !== cy || enemy.ready !== true || enemy.perception === "last_known") return false;
            return heroes.some(function (m) { return Math.max(Math.abs(m.pos.x - cx), Math.abs(m.pos.y - cy)) === 1; });
        });
    }
    function reticle(ctx, x, y, w, h) {
        var u = Math.min(w, h), inset = Math.max(1, Math.round(u * 0.08)), tick = Math.max(3, Math.round(u * 0.2));
        var width = Math.max(1, Math.round(u * 0.055));
        [halo, threat_colour].forEach(function (style, pass) {
            ctx.strokeStyle = style; ctx.lineWidth = pass ? width : width + 2; ctx.globalAlpha = pass ? 0.95 : 0.8;
            ctx.lineCap = "square"; ctx.beginPath();
            [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (corner) {
                var px = corner[0] < 0 ? x + inset : x + w - inset, py = corner[1] < 0 ? y + inset : y + h - inset;
                ctx.moveTo(px, py + corner[1] * -tick); ctx.lineTo(px, py); ctx.lineTo(px + corner[0] * -tick, py);
            });
            ctx.stroke();
        });
        plate(ctx, x + w - 1, y + 1, "!", threat_colour, "bold " + Math.max(9, Math.floor(h * 0.24)) + "px monospace", "right");
    }
    function hover(ctx, x, y, w, h) {
        var u = Math.min(w, h), width = Math.max(1, Math.round(u * 0.04));
        ctx.globalAlpha = 0.1; ctx.fillStyle = hover_colour; ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 0.55; ctx.lineWidth = width; ctx.strokeStyle = hover_colour;
        ctx.strokeRect(x + width / 2, y + width / 2, w - width, h - width);
    }
    function ping(ctx, p, x, y, w, h, now) {
        var style = ping_styles[p.kind] || ping_styles.look, u = Math.min(w, h);
        var phase = ((now - p.created) % 800) / 800, inset = Math.max(1, Math.floor((1 - phase) * 0.28 * u));
        var width = Math.max(1, Math.round(u * 0.045));
        ctx.globalAlpha = 0.9; ctx.lineWidth = width + 2; ctx.strokeStyle = "#000";
        ctx.strokeRect(x + inset + 0.5, y + inset + 0.5, Math.max(4, w - 2 * inset - 1), Math.max(4, h - 2 * inset - 1));
        ctx.lineWidth = width; ctx.strokeStyle = style.col;
        ctx.strokeRect(x + inset + 0.5, y + inset + 0.5, Math.max(4, w - 2 * inset - 1), Math.max(4, h - 2 * inset - 1));
        var tag = style.prefix + " · " + (p.user || "Ping"), font = Math.max(9, Math.floor(h * 0.23));
        ctx.font = font + "px monospace";
        var tw = Math.ceil(ctx.measureText(tag).width) + 4;
        plate(ctx, Math.round(x + w / 2 - tw / 2), y + h - font - 3, tag, style.col, font + "px monospace", "left");
    }
    return {
        render_party_overlays: function (cx, cy, x, y) {
            if (!window.crawl_party) return;
            var scaled = this.scaled_size(), ctx = this.ctx, w = scaled.width, h = scaled.height;
            var state = window.crawl_party.state, controlled = state ? controlledSlot(state) : -1;
            ctx.save();
            try {
                var cursor = view_data.cursor_locs && view_data.cursor_locs[enums.CURSOR_MOUSE];
                if (cursor && cursor.x === cx && cursor.y === cy) hover(ctx, x, y, w, h);
                if (state && Array.isArray(state.members)) {
                    var threat = threatAt(state, cx, cy);
                    if (threat) reticle(ctx, x, y, w, h);
                    state.members.forEach(function (m) {
                        if (here(m) && m.pos.x === cx && m.pos.y === cy)
                            hero(ctx, m, x, y, w, h, m.slot === controlled || (controlled < 0 && m.active));
                    });
                }
                var pings = window.crawl_party.pings, now = Date.now();
                (pings || []).forEach(function (p) {
                    if (p.x === cx && p.y === cy && p.expires > now) ping(ctx, p, x, y, w, h, now);
                });
            } finally { ctx.restore(); }
        }
    };
});
