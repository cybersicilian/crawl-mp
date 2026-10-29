define(["./party-status-model", "./status-icons"], function (model, icons) {
    "use strict";

    function project(hero) {
        var known = hero.statuses_known !== false && Array.isArray(hero.statuses);
        var matches = model.visualEffects(hero).filter(function (effect) {
            return /^(petrify|burning|berserk|poison|frozen|confused|slow|haste|invisible)$/.test(effect.kind);
        }).map(function (effect) {
            return { kind: effect.kind, tone: effect.tone, glyph: icons.resolve(effect.kind), key: effect.key };
        });
        var lead = Number.isFinite(hero.aut_lead) ? Math.max(0, hero.aut_lead) : 0;
        var cost = Math.max(10, Number.isFinite(hero.last_action_aut) && hero.last_action_aut > 0 ? hero.last_action_aut : 10);
        var rem_ms = Number.isFinite(hero.cooldown_remaining_ms) ? Math.max(0, hero.cooldown_remaining_ms) : 0;
        var total_ms = Math.max(100, Number.isFinite(hero.cooldown_ms) && hero.cooldown_ms > 0 ? hero.cooldown_ms : 500);
        var cooldown_pct = lead > 0 ? Math.round(100 * Math.min(1, lead / cost))
            : rem_ms > 0 ? Math.round(100 * Math.min(1, rem_ms / total_ms)) : 0;
        return { known: known, layers: matches.slice(0, 2), count: matches.length,
            ghost: matches.some(function (effect) { return effect.kind === "invisible"; }),
            cooldownPct: cooldown_pct, queued: Boolean(hero.queued_action) };
    }
    function decorate(portrait, hero) {
        if (!portrait) return;
        var view = project(hero), previous = portrait.querySelector(".portrait-status-interior");
        var ring = portrait.querySelector(".portrait-cooldown-ring");
        portrait.classList.toggle("has-portrait-cooldown", view.cooldownPct > 0 || view.queued);
        portrait.classList.toggle("has-portrait-queued", view.queued);
        portrait.setAttribute("data-portrait-cooldown", String(view.cooldownPct));
        if (view.cooldownPct > 0 || view.queued) {
            if (!ring) {
                ring = document.createElement("span");
                ring.className = "portrait-cooldown-ring";
                ring.setAttribute("aria-hidden", "true");
                portrait.appendChild(ring);
            }
            ring.style.setProperty("--cooldown-pct", (view.cooldownPct > 0 ? view.cooldownPct : 100) + "%");
            ring.setAttribute("data-queued", String(view.queued));
        } else if (ring) {
            ring.remove();
        }
        portrait.classList.toggle("has-portrait-status", view.layers.length > 0);
        portrait.setAttribute("data-portrait-status", view.known ? view.layers.map(function (effect) {
            return effect.kind;
        }).join(" ") || "clear" : "unknown");
        portrait.setAttribute("data-portrait-ghost", String(view.ghost));
        portrait.setAttribute("data-portrait-effect-count", String(view.count));
        if (!view.layers.length) { if (previous) previous.remove(); return; }
        var signature = JSON.stringify(view.layers);
        if (previous && previous.getAttribute("data-effect-signature") === signature) return;
        var interior = document.createElement("span");
        interior.className = "portrait-status-interior";
        interior.setAttribute("aria-hidden", "true");
        interior.setAttribute("data-effect-signature", signature);
        // Rebuilt native cards join the current animation phase instead of
        // restarting their motion on every HP/status snapshot. No timer needed.
        interior.style.setProperty("--portrait-motion-phase", (-performance.now() / 1000) + "s");
        view.layers.forEach(function (effect) {
            var layer = document.createElement("span");
            layer.className = "portrait-status-layer";
            layer.setAttribute("data-portrait-effect", effect.kind);
            layer.setAttribute("data-effect-tone", effect.tone);
            layer.setAttribute("data-status-icon", effect.glyph);
            interior.appendChild(layer);
        });
        if (previous) previous.replaceWith(interior);
        else portrait.appendChild(interior);
    }
    return { project: project, decorate: decorate };
});
