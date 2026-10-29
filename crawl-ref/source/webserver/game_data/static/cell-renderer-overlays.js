define([], function () {
    "use strict";

    // Party annotations share the renderer's native canvas coordinate system.
    return {
        render_party_overlays: function(cx, cy, x, y)
        {
            if (!window.crawl_party)
                return;
            let scaled = this.scaled_size();
            var ctx = this.ctx;
            var slot_colours = ["#fce94f", "#34e2e2", "#8ae234", "#ad7fa8"];

            var state = window.crawl_party.state;
            if (state && state.members && state.members.length >= 1)
            {
                for (var i = 0; i < state.members.length; ++i)
                {
                    var m = state.members[i];
                    if (m.on_same_level === false || !m.pos)
                        continue;
                    if (m.pos.x === cx && m.pos.y === cy)
                    {
                        ctx.save();
                        try
                        {
                            var col = slot_colours[m.slot % slot_colours.length];
                            var w = scaled.width;
                            var h = scaled.height;
                            var c_len = Math.max(4, Math.floor(Math.min(w, h) * 0.24));

                            // Native DCSS 1px rectangular tile-corner brackets with #000 contrast border
                            ctx.lineWidth = 1;
                            ctx.strokeStyle = "#000000";
                            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

                            ctx.strokeStyle = col;
                            ctx.globalAlpha = m.active ? 0.95 : 0.75;
                            ctx.beginPath();
                            // Top-left bracket
                            ctx.moveTo(x + 1.5, y + 1.5 + c_len);
                            ctx.lineTo(x + 1.5, y + 1.5);
                            ctx.lineTo(x + 1.5 + c_len, y + 1.5);
                            // Top-right bracket
                            ctx.moveTo(x + w - 1.5 - c_len, y + 1.5);
                            ctx.lineTo(x + w - 1.5, y + 1.5);
                            ctx.lineTo(x + w - 1.5, y + 1.5 + c_len);
                            // Bottom-left bracket
                            ctx.moveTo(x + 1.5, y + h - 1.5 - c_len);
                            ctx.lineTo(x + 1.5, y + h - 1.5);
                            ctx.lineTo(x + 1.5 + c_len, y + h - 1.5);
                            // Bottom-right bracket
                            ctx.moveTo(x + w - 1.5 - c_len, y + h - 1.5);
                            ctx.lineTo(x + w - 1.5, y + h - 1.5);
                            ctx.lineTo(x + w - 1.5, y + h - 1.5 - c_len);
                            ctx.stroke();
                            ctx.globalAlpha = 1.0;

                            if ((m.aut_lead && m.aut_lead > 0) || (m.cooldown_remaining_ms && m.cooldown_remaining_ms > 0))
                            {
                                var pct = Math.max(0, Math.min(1, m.aut_lead > 0
                                    ? m.aut_lead / Math.max(10, m.last_action_aut || 10)
                                    : m.cooldown_remaining_ms / Math.max(100, m.cooldown_ms || 500)));
                                if (pct > 0)
                                {
                                    var center_x = x + w * 0.5;
                                    var center_y = y + h * 0.5;
                                    var radius = Math.max(4, Math.min(w, h) * 0.42);
                                    var start_a = -Math.PI / 2;
                                    var end_a = start_a + Math.PI * 2 * pct;
                                    ctx.beginPath();
                                    ctx.moveTo(center_x, center_y);
                                    ctx.arc(center_x, center_y, radius, start_a, end_a, false);
                                    ctx.closePath();
                                    ctx.fillStyle = "rgba(10, 12, 16, 0.45)";
                                    ctx.fill();

                                    ctx.beginPath();
                                    ctx.arc(center_x, center_y, radius, start_a, end_a, false);
                                    ctx.lineWidth = 1.5;
                                    ctx.strokeStyle = m.queued_action ? "#34e2e2" : "#e9b96e";
                                    ctx.stroke();
                                }
                            }

                            // Clean monospace pixel nameplate: P1:Host, P2:Lyra, P3:Karn
                            var short_name = (m.name || "").slice(0, 6);
                            var label = "P" + (m.slot + 1)
                                        + (short_name ? (":" + short_name) : "")
                                        + (m.ghost_haunting || !m.alive ? "*" : "");
                            var font_px = Math.max(9, Math.floor(h * 0.25));
                            ctx.font = font_px + "px monospace";
                            ctx.textAlign = "left";
                            ctx.textBaseline = "top";
                            var tw = Math.min(w - 2, Math.ceil(ctx.measureText(label).width) + 4);
                            var th = font_px + 2;
                            ctx.fillStyle = "#080808";
                            ctx.fillRect(x + 1, y + 1, tw, th);
                            ctx.strokeStyle = "#000000";
                            ctx.lineWidth = 1;
                            ctx.strokeRect(x + 0.5, y + 0.5, tw + 1, th + 1);
                            ctx.fillStyle = col;
                            ctx.fillText(label, x + 3, y + 2, w - 4);

                            var bar_h = 0;
                            if (!m.active && m.alive && m.hp_max > 0)
                            {
                                bar_h = Math.max(2, Math.floor(h / 16));
                                var hp_pct = Math.max(0, Math.min(1, m.hp / m.hp_max));
                                ctx.fillStyle = "#b30009";
                                ctx.fillRect(x, y + h - bar_h, w, bar_h);
                                ctx.fillStyle = hp_pct <= 0.3 ? "#ef2929" : (hp_pct <= 0.6 ? "#fce94f" : "#8ae234");
                                ctx.fillRect(x, y + h - bar_h, Math.floor(w * hp_pct), bar_h);
                            }

                            // Compact tactical micro-badge at bottom-right corner for buffs/statuses/resists/spells
                            var badge_text = "";
                            var badge_col = "#8ae234";
                            var badge_bg = "#081408";
                            if (m.queued_action)
                            {
                                badge_text = "Q";
                                badge_col = "#34e2e2";
                                badge_bg = "#06161a";
                            }
                            else if (m.statuses && m.statuses.length > 0)
                            {
                                var st0 = m.statuses[0];
                                badge_text = String(st0.light || st0.text || "BUFF").toUpperCase().slice(0, 5);
                                if (m.statuses.length > 1)
                                    badge_text = badge_text.slice(0, 3) + "+" + (m.statuses.length - 1);
                                if (st0.is_bad)
                                {
                                    badge_col = "#ef2929";
                                    badge_bg = "#1e0808";
                                }
                                else
                                {
                                    badge_col = "#fce94f";
                                    badge_bg = "#1a1606";
                                }
                            }
                            else if (m.aut_lead && m.aut_lead > 0)
                            {
                                badge_text = "+" + (m.aut_lead / 10).toFixed(1) + "t";
                                badge_col = "#e9b96e";
                                badge_bg = "#1c1306";
                            }
                            else if (m.resists && (m.resists.rPois > 0 || m.resists.rElec > 0 || m.resists.rFire > 0 || m.resists.rCold > 0))
                            {
                                badge_text = m.resists.rPois > 0 ? "rP" : (m.resists.rElec > 0 ? "rE" : (m.resists.rFire > 0 ? "rF" : "rC"));
                                badge_col = "#8ae234";
                                badge_bg = "#081808";
                            }
                            else if (m.spells && m.spells.length > 0)
                            {
                                badge_text = "SPL";
                                badge_col = "#34e2e2";
                                badge_bg = "#06161a";
                            }
                            else if (m.mutations && m.mutations.length > 0)
                            {
                                badge_text = "TRT";
                                badge_col = "#fce94f";
                                badge_bg = "#181406";
                            }
                            else if (m.alive)
                            {
                                badge_text = "RDY";
                                badge_col = "#8ae234";
                                badge_bg = "#081408";
                            }

                            if (badge_text)
                            {
                                var b_font_px = Math.max(8, Math.floor(h * 0.21));
                                ctx.font = "bold " + b_font_px + "px monospace";
                                ctx.textAlign = "right";
                                ctx.textBaseline = "bottom";
                                var bw = Math.min(w - 4, Math.ceil(ctx.measureText(badge_text).width) + 6);
                                var bh = b_font_px + 2;
                                var by_bottom = y + h - (bar_h > 0 ? bar_h + 1 : 1);
                                var bx_left = x + w - bw - 1;
                                var by_top = by_bottom - bh;

                                ctx.fillStyle = badge_bg;
                                ctx.fillRect(bx_left, by_top, bw, bh);
                                ctx.strokeStyle = "#000000";
                                ctx.lineWidth = 1;
                                ctx.strokeRect(bx_left - 0.5, by_top - 0.5, bw + 1, bh + 1);
                                ctx.fillStyle = badge_col;
                                ctx.fillRect(bx_left, by_top, 2, bh);
                                ctx.fillText(badge_text, x + w - 2, by_bottom - 1, bw - 3);
                            }
                        }
                        finally
                        {
                            ctx.restore();
                        }
                    }
                }
            }

            var pings = window.crawl_party.pings;
            if (pings && pings.length > 0)
            {
                var now = Date.now();
                var ping_styles = {
                    "look":   { col: "#34e2e2", prefix: "[LOOK] " },
                    "danger": { col: "#ef2929", prefix: "[DANGER] " },
                    "loot":   { col: "#fce94f", prefix: "[LOOT] " },
                    "stairs": { col: "#8ae234", prefix: "[STAIRS] " }
                };
                for (var j = 0; j < pings.length; ++j)
                {
                    var p = pings[j];
                    if (p.x !== cx || p.y !== cy || p.expires <= now)
                        continue;
                    ctx.save();
                    try
                    {
                        var st = ping_styles[p.kind] || ping_styles["look"];
                        var ring_col = st.col;
                        var phase = ((now - p.created) % 800) / 800.0;
                        var inset = Math.max(1, Math.floor((1.0 - phase) * 0.28 * Math.min(scaled.width, scaled.height)));
                        var rx = x + inset + 0.5;
                        var ry = y + inset + 0.5;
                        var rw = Math.max(4, scaled.width - 2 * inset - 1);
                        var rh = Math.max(4, scaled.height - 2 * inset - 1);

                        ctx.strokeStyle = "#000000";
                        ctx.lineWidth = 2;
                        ctx.strokeRect(rx, ry, rw, rh);
                        ctx.strokeStyle = ring_col;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(rx, ry, rw, rh);

                        var tag = st.prefix + (p.user || "Ping");
                        var pfont = Math.max(9, Math.floor(scaled.height * 0.25));
                        ctx.font = pfont + "px monospace";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "bottom";
                        var cx_px = x + 0.5 * scaled.width;
                        var tag_w = Math.ceil(ctx.measureText(tag).width) + 4;
                        var tag_h = pfont + 2;
                        ctx.fillStyle = "#080808";
                        ctx.fillRect(cx_px - tag_w / 2, y + scaled.height - tag_h - 1, tag_w, tag_h);
                        ctx.strokeStyle = "#000000";
                        ctx.lineWidth = 1;
                        ctx.strokeRect(cx_px - tag_w / 2 + 0.5, y + scaled.height - tag_h - 0.5, tag_w - 1, tag_h - 1);
                        ctx.fillStyle = ring_col;
                        ctx.fillText(tag, cx_px, y + scaled.height - 2);
                    }
                    finally
                    {
                        ctx.restore();
                    }
                }
            }
        },

    };
});
