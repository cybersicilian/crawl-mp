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

    // Text glyphs drawn inside the icon box when no sprite sheet loads. They sit
    // in the sprite's own 20-unit frame, so layouts and hit targets never change.
    // Unlisted roles fall back to their initial letter.
    var fallbackGlyphs = {
        "zoom-in": "+", "zoom-out": "−", "zoom-reset": "⟲", camp: "⌂", move: "✥", expand: "⤢",
        camera: "◎", save: "⬇", map: "▧", navigate: "➤", signal: "◉", plus: "+",
        "chevron-up": "▲", remove: "×", question: "?", faith: "✦", "faith-none": "○", coin: "$",
        confusion: "?", silence: "∅", book: "▤", chat: "…", poison: "☠", flame: "♨",
        frost: "❄", bolt: "⚡", shield: "⛨", speed: "»", slow: "«", wing: "⌃",
        eye: "◉", moon: "☾", heart: "♥", skull: "☠", spark: "✦", blade: "†",
        trait: "✱", ready: "✓", rune: "ᚱ", stairs: "≡", loot: "▣", potion: "⚗",
        danger: "!", corrosion: "≈", sound: "♪", blink: "⇝", holy: "✝", reflection: "◐",
        chain: "⛓", explore: "➤", autofight: "⚔", rest: "z", pickup: "g", inventory: "▣",
        abilities: "a", spells: "z", powers: "✦", skills: "m", codex: "▤", overview: "☰",
        "stairs-up": "<", "stairs-down": ">", floor: "·", inspect: "i", control: "◆",
        "cycle-hero": "⇄", "claim-hero": "☆", "add-hero": "+", "ping-look": "◎",
        "ping-danger": "!", "ping-loot": "$", "ping-stairs": ">", "filter-all": "∗",
        "filter-equipped": "⛨", "filter-pack": "▣", "inventory-open": "▣", experience: "★",
        time: "◷", quiver: "➶", contamination: "☢", doom: "☠", "slot-add": "+",
        "slot-clear": "×", "slot-missing": "?", "tray-expand": "▲", search: "⌕", exit: "⎋",
        equipped: "✓", "level-cap": "⊤", scroll: "≋", wand: "/", ammo: "➶", staff: "|",
        banes: "✗", bestiary: "☠", "compass-rose": "✧", "compass-needle": "▲"
    };
    // The committed legacy sheet shares the manifest's 16-column, 112-frame geometry.
    var legacyAtlasUrl = "/static/ui-sprites/hud-sprites.f4c7e20144b6.png";
    var browser = typeof document !== "undefined" && typeof Image === "function";
    var atlas = { state: "unknown", url: properties.iconAtlas ? properties.iconAtlas().url : "", requested: null };

    function fallbackGlyph(name) {
        var key = String(name || "").toLowerCase();
        if (Object.prototype.hasOwnProperty.call(fallbackGlyphs, key)) return fallbackGlyphs[key];
        return key ? key.charAt(0).toUpperCase() : "?";
    }

    function retarget(svg) {
        var image = svg.querySelector && svg.querySelector(":scope > image");
        if (image && atlas.state === "legacy" && image.getAttribute("href") === atlas.requested)
            image.setAttribute("href", atlas.url);
    }

    // While a sheet loads, sprites stay pure <image> nodes (the licensed-art
    // fidelity contract in tests/ui-glyphs.cjs). Only once every sheet has
    // failed does each icon gain a <text> glyph, shown by properties.css under
    // html[data-ui-sprites="missing"]. Idempotent so repeat calls are harmless.
    function addText(svg) {
        if (!svg || !svg.querySelector || svg.querySelector(":scope > .tt-icon-fallback")) return svg;
        var text = document.createElementNS(svg.namespaceURI, "text");
        text.setAttribute("class", "tt-icon-fallback");
        text.setAttribute("x", "10"); text.setAttribute("y", "10");
        text.setAttribute("text-anchor", "middle"); text.setAttribute("dominant-baseline", "central");
        text.textContent = fallbackGlyph(svg.getAttribute("data-ui-glyph") || svg.getAttribute("data-ui-icon"));
        svg.appendChild(text);
        return svg;
    }
    function withFallback(svg) {
        if (atlas.state === "missing") addText(svg);
        else if (atlas.state === "legacy") retarget(svg);
        return svg;
    }

    var baseIcon = properties.icon;
    function icon(name) { return withFallback(baseIcon(name)); }
    icon.withFallback = true;
    // item-properties.js is the shared SVG factory for every surface; route its
    // output through the same fallback until that module owns it directly.
    if (!properties.icon.withFallback) properties.icon = icon;

    function announce() {
        if (!browser) return;
        document.documentElement.setAttribute("data-ui-sprites", atlas.state);
        if (atlas.state === "legacy")
            document.querySelectorAll(".tt-icon > image").forEach(function (image) { retarget(image.parentNode); });
        if (atlas.state === "missing") document.querySelectorAll(".tt-icon").forEach(addText);
        if (typeof CustomEvent === "function")
            document.dispatchEvent(new CustomEvent("ui-sprites-resolved", { detail: { state: atlas.state, url: atlas.url } }));
    }

    // Resolution order: manifest sheet, committed legacy sheet, text glyphs.
    // Probing with Image() reports the 404 that an SVG <image> swallows silently.
    function probe() {
        if (!browser || atlas.requested !== null) return atlas;
        atlas.requested = atlas.url;
        var candidates = [atlas.url, legacyAtlasUrl].filter(function (url, index, list) {
            return url && list.indexOf(url) === index;
        });
        (function attempt(index) {
            if (index >= candidates.length) { atlas.state = "missing"; announce(); return; }
            var image = new Image();
            image.onload = function () {
                atlas.url = candidates[index];
                atlas.state = candidates[index] === atlas.requested ? "ready" : "legacy";
                announce();
            };
            image.onerror = function () { attempt(index + 1); };
            image.src = candidates[index];
        })(0);
        return atlas;
    }

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

    // Every icon role shown to a player carries a name. Decorative sprites stay
    // aria-hidden; the host element (or this wrapper) names them.
    function labelled(glyph, label, options) {
        options = options || {};
        var node = document.createElement("span");
        node.className = "tr-glyph" + (options.className ? " " + options.className : "");
        node.setAttribute("role", "img");
        node.setAttribute("aria-label", label);
        if (!options.silent) node.setAttribute("data-tip-title", label);
        node.appendChild(icon(glyph));
        return node;
    }
    function name(element, label) {
        if (!element || !label) return element;
        if (!element.getAttribute("aria-label") && !element.hasAttribute("aria-labelledby")
            && !element.textContent.trim()) element.setAttribute("aria-label", label);
        if (!element.hasAttribute("data-tip-title")) element.setAttribute("data-tip-title", label);
        return element;
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
                var glyph = icon(options.glyph);
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

    probe();

    return { icon: icon, resolve: resolve, frame: frame, effect: effect, decorate: decorate,
        labelled: labelled, name: name, fallbackGlyph: fallbackGlyph, probe: probe,
        atlas: function () { return { state: atlas.state, url: atlas.url, requested: atlas.requested }; },
        names: properties.iconNames, has: properties.hasIcon };
});
