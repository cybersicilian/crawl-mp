define(["jquery", "./map_knowledge", "./hero-feedback-model", "./map-effect-layer"],
function ($, map, model, layers) {
    "use strict";
    var tracker = model.create(), animations = new Map(), flashes = new Map(), running = false;
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var colours = { damage: "#ff9c83", heal: "#a6e4c4", level: "#f7d68d", step: "#cfba94" };
    var slot_colours = ["#fce94f", "#34e2e2", "#8ae234", "#ad7fa8"];
    var durations = { step: 230, damage: 820, heal: 820, level: 1100 };
    function heroColour(effect) { return slot_colours[(effect.slot || 0) % slot_colours.length]; }
    function label(effect) {
        if (effect.kind === "level") return "LEVEL " + effect.level;
        return (effect.amount > 0 ? "+" : "−") + Math.abs(effect.amount) + " HP";
    }

    function paint(ctx, effect, point, progress, pixelRatio) {
        var unit = Math.min(point.width, point.height), colour = colours[effect.kind];
        var x = point.x + point.width / 2, y = point.y + point.height * 0.7;
        var fade = Math.min(1, (1 - progress) * 3);
        ctx.fillStyle = ctx.strokeStyle = colour;
        if (effect.kind === "step") {
            var dx = effect.pos.x - effect.origin.x, dy = effect.pos.y - effect.origin.y;
            for (var i = 0; i < 3; i++) {
                ctx.globalAlpha = (1 - progress) * 0.32;
                var size = Math.max(1, Math.round(unit * 0.045 * (1 - progress * 0.5)));
                ctx.fillRect(Math.round(x - dx * unit * 0.4 + (i - 1) * unit * 0.12),
                    Math.round(y - dy * unit * 0.4 + unit * 0.12 - progress * unit * 0.1), size, size);
            }
            return;
        }
        ctx.globalAlpha = fade * (1 - progress) * 0.7;
        for (var spark = 0; spark < 8; spark++) {
            var angle = spark * Math.PI / 4;
            var radius = unit * (0.16 + progress * 0.42);
            var px = x + Math.cos(angle) * radius;
            var py = y + Math.sin(angle) * radius * 0.5 - progress * unit * 0.14;
            var dot = Math.max(1, Math.round(unit * 0.045));
            ctx.fillRect(Math.round(px), Math.round(py), dot, dot);
        }
        if (effect.kind !== "damage") {
            ctx.lineWidth = Math.max(1, unit * 0.025);
            ctx.beginPath();
            ctx.ellipse(x, y, unit * (0.23 + progress * 0.25), unit * (0.1 + progress * 0.1), 0, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Brief impact flash on the tile itself, strongest on the first frames.
            ctx.globalAlpha = Math.max(0, 0.35 - progress * 1.2);
            ctx.fillRect(point.x, point.y, point.width, point.height);
        }
        ctx.globalAlpha = fade;
        var fontSize = Math.round(Math.max(11 * pixelRatio, Math.min(22 * pixelRatio, unit * 0.3)));
        ctx.font = "bold " + fontSize + "px monospace";
        ctx.textAlign = "center";
        ctx.lineWidth = Math.max(2 * pixelRatio, unit * 0.065);
        ctx.strokeStyle = "#101418";
        ctx.lineJoin = "round";
        var text = label(effect);
        var rise = effect.kind === "level" ? 0.65 : 0.3;
        var ease = 1 - Math.pow(1 - progress, 2);
        var textY = point.y - unit * (rise + ease * 0.35);
        // Keep cues readable at the viewport edges without shifting their map anchors.
        var inset = ctx.measureText(text).width / 2 + 3 * pixelRatio;
        x = Math.max(inset, Math.min(ctx.canvas.width - inset, x));
        textY = Math.max(fontSize, textY);
        ctx.strokeText(text, x, textY);
        ctx.fillText(text, x, textY);
        // Thin hero-coloured underline ties the number to its owner.
        ctx.globalAlpha = fade * 0.9; ctx.fillStyle = heroColour(effect);
        var underline = Math.max(1, Math.round(pixelRatio));
        ctx.fillRect(Math.round(x - inset + 3 * pixelRatio), Math.round(textY + 2 * pixelRatio), Math.round((inset - 3 * pixelRatio) * 2), underline);
    }
    var layer = layers.create({ className: "hero-feedback-layer", limit: 24,
        visible: function (pos) { return map.visible(map.get(pos.x, pos.y)); }, paint: paint });

    function card(effect) {
        return document.querySelector(".party-member-card[data-party-slot='" + effect.slot + "']");
    }
    function animate(element, frames, duration, cleanup) {
        if (!element || !element.animate) { if (cleanup) cleanup(); return; }
        var animation = element.animate(frames, { duration: duration, easing: "ease-out" });
        function done() { if (animations.delete(animation) && cleanup) cleanup(); }
        animations.set(animation, done);
        animation.onfinish = done;
        animation.oncancel = done;
    }
    function cardFeedback(effect) {
        if (effect.kind === "step") return;
        var element = card(effect);
        if (!element) return;
        animate(element, [{ boxShadow: "inset 0 0 0 1px " + colours[effect.kind]
            + ", inset 0 0 18px " + colours[effect.kind] + "55" }, { boxShadow: "inset 0 0 0 1px transparent" }], 520);
        if (!effect.echo || effect.kind === "level") return;
        var bar = document.getElementById("party_hp_" + effect.slot);
        if (!bar) return;
        bar.querySelectorAll(".hero-hp-echo").forEach(function (node) { node.remove(); });
        var echo = document.createElement("span");
        echo.className = "hero-hp-echo " + effect.kind;
        echo.setAttribute("aria-hidden", "true");
        echo.style.left = Math.min(effect.from, effect.to) + "%";
        echo.style.width = Math.abs(effect.from - effect.to) + "%";
        bar.appendChild(echo);
        animate(echo, [{ opacity: 0.8, transform: "scaleX(1)" },
            { opacity: 0, transform: effect.kind === "damage" ? "scaleX(0)" : "scaleX(1)" }],
        480, function () { echo.remove(); });
    }
    // Reduced motion: a static outline on the hero card instead of any animation.
    function staticFlash(effect) {
        if (effect.kind === "step") return;
        var element = card(effect);
        if (!element) return;
        var className = "is-feedback-" + effect.kind;
        clearTimeout(flashes.get(element));
        element.classList.remove("is-feedback-damage", "is-feedback-heal", "is-feedback-level");
        element.classList.add(className);
        flashes.set(element, setTimeout(function () { element.classList.remove(className); flashes.delete(element); }, 700));
    }
    function clearFlashes() {
        flashes.forEach(function (timer, element) {
            clearTimeout(timer); element.classList.remove("is-feedback-damage", "is-feedback-heal", "is-feedback-level");
        });
        flashes.clear();
    }
    function clearCards() {
        animations.forEach(function (done, animation) {
            animation.cancel();
            // Web Animations dispatches cancel asynchronously; remove echoes now.
            done();
        });
        clearFlashes();
    }
    function clear() { layer.clear(); clearCards(); }
    function sync(event, state) {
        if (!state) return;
        var changes = tracker.update(state);
        if (changes.reset) clear();
        if (!layer.allowed()) {
            if (running && motion.matches && !document.hidden) changes.events.forEach(staticFlash);
            return;
        }
        changes.events.forEach(cardFeedback);
        layer.play(changes.events.filter(function (effect) { return effect.pos; }).map(function (effect) {
            return Object.assign({}, effect, { key: effect.slot + ":" + effect.kind,
                origin: effect.kind === "step" ? effect.from : null, duration: durations[effect.kind] });
        }));
    }
    $(document).on("game_init.heroFeedback", function () {
        clear(); tracker.reset(); layer.setEnabled(true); running = true;
    }).on("game_cleanup.heroFeedback", function () {
        running = false; layer.setEnabled(false); clear(); tracker.reset();
    }).on("party_state_rendered.heroFeedback", sync)
        .on("party_cards_rebuilding.heroFeedback", clearCards)
        .on("visibilitychange.heroFeedback", function () { if (document.hidden) { clear(); tracker.reset(); } });
    motion.addEventListener("change", function () { clear(); tracker.reset(); });
    return { attach: layer.attach };
});
