define(["item-properties"], function (properties) {
    "use strict";

    var rules = [
        [/poison|rpois|toxic|venom/i, "poison"],
        [/burn|fire|rfire|flam|sticky/i, "flame"],
        [/cold|frost|rcold|frozen|ice/i, "frost"],
        [/elec|lightning|shock/i, "bolt"],
        [/confus|daze|vertigo/i, "confusion"],
        [/silenc/i, "silence"],
        [/paraly|petrif|\bpetr\b|\bstone\b|constrict|held|bound|mesmer|entang|grasp|clutch|\bweb/i, "chain"],
        [/contamin|glow|vulnerab|frail/i, "danger"],
        [/see.?invis|sinv|blind|marked|scry/i, "eye"],
        [/corro|acid/i, "corrosion"],
        [/negative energy|life protection/i, "skull"],
        [/strength|\bstr\b/i, "strength"],
        [/intelligence|\bint\b/i, "intelligence"],
        [/dexterity|\bdex\b/i, "dexterity"],
        [/haste|fast|speed|swift/i, "speed"],
        [/slow|recov|exhaust/i, "slow"],
        [/teleport|blink|disjoin|dimension/i, "blink"],
        [/fly|flying|flight/i, "wing"],
        [/invis|stealth|shadow|umbra/i, "moon"],
        [/might|berserk|slay/i, "blade"],
        [/shield|protect|resist|armour|will|ward|\bmr\b/i, "shield"],
        [/regen|heal|vital|elixir/i, "heart"],
        [/ghost|dead|death|drain|haunt|doom|flay/i, "skull"],
        [/barb|spik|brambl/i, "danger"],
        [/spell|magic|mana|mp\b/i, "spark"],
        [/trait|mutat|innate/i, "trait"],
        [/ready/i, "ready"]
    ];

    function resolve(label) {
        var property = properties.describe(label);
        if (property.kind !== "unknown") return property.icon;
        for (var i = 0; i < rules.length; i++)
            if (rules[i][0].test(label)) return rules[i][1];
        return "rune";
    }

    function frameTone(tone) {
        return /^(active|bad|passive|unknown)$/.test(tone) ? tone : "unknown";
    }

    // The frame owns presentation only. Callers retain tooltip, focus, input and
    // native effect semantics; ordinary UI/action icons stay unframed.
    function frame(element, options) {
        options = options || {};
        var tone = frameTone(options.tone);
        element.classList.add("status-icon-frame");
        element.setAttribute("data-status-tone", tone);
        element.setAttribute("data-status-expiring", String(options.expiring === true));
        if (options.glyph) {
            var current = element.querySelector(":scope > .tt-icon");
            if (!current || current.getAttribute("data-ui-icon") !== options.glyph) {
                var glyph = properties.icon(options.glyph);
                if (current) current.replaceWith(glyph);
                else element.insertBefore(glyph, element.firstChild);
            }
            element.setAttribute("data-status-icon", options.glyph);
        }
        var warning = element.querySelector(":scope > .status-icon-warning, :scope > .party-effect-warning");
        if (tone === "bad" && !warning) {
            warning = document.createElement("span");
            warning.className = "status-icon-warning party-effect-warning";
            warning.setAttribute("aria-hidden", "true");
            element.appendChild(warning);
        } else if (tone !== "bad" && warning) warning.remove();
        if (tone === "bad" && warning) warning.classList.add("status-icon-warning");
        return element;
    }

    // Accepts the canonical party-status-model effect projection, also usable by
    // future surfaces without a hero card or jQuery dependency.
    function effect(view) {
        var element = document.createElement("span"), tone = frameTone(view.tone);
        var meta = tone === "bad" ? "Harmful effect" : tone === "unknown"
            ? "Effect type unavailable" : tone === "passive" ? "Passive effect" : "Active effect";
        if (Number.isFinite(view.duration) && view.duration > 0)
            meta += " · About " + view.duration + " standard turns remaining";
        if (view.expiring) meta += " · Expiring";
        element.className = "party-effect is-" + tone + (view.expiring ? " is-expiring" : "");
        element.setAttribute("role", "img");
        element.setAttribute("tabindex", "0");
        element.setAttribute("aria-label", view.name + ". " + meta);
        element.setAttribute("data-tip-title", view.name);
        element.setAttribute("data-tip-body", view.description || "");
        element.setAttribute("data-tip-meta", meta);
        element.setAttribute("data-effect-key", view.key);
        return frame(element, { glyph: view.key === "unknown" ? "question" : resolve(view.name),
            tone: tone, expiring: view.expiring });
    }

    function decorate(root) {
        if (!root) return;
        var selector = ".party-buff-pill, .status_light";
        var elements = Array.from(root.querySelectorAll(selector));
        if (root.matches && root.matches(selector)) elements.unshift(root);
        elements.forEach(function (el) {
            if (el.classList.contains("status-icon-frame") && el.getAttribute("data-status-decoration") !== "auto") return;
            var name = resolve(el.getAttribute("data-tip-title") || el.textContent);
            el.setAttribute("data-status-decoration", "auto");
            el.classList.toggle("status-icon-labelled", Boolean(el.textContent.trim()));
            frame(el, { glyph: name, tone: el.classList.contains("is-bad") ? "bad"
                : el.classList.contains("is-buff") ? "active" : "unknown",
                expiring: el.classList.contains("is-expiring") });
        });
    }

    return { icon: properties.icon, resolve: resolve, frame: frame, effect: effect, decorate: decorate,
        names: properties.iconNames, has: properties.hasIcon };
});
