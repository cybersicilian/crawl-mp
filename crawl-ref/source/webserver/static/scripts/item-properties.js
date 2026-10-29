define([], function () {
    "use strict";

    // Stable semantic frame order for the licensed Raven 16px HUD atlas.
    // Native item, power, deity, and rune artwork stays in its original game atlas.
    var spriteNames = [
        "zoom-in", "zoom-out", "zoom-reset", "camp", "layout", "move", "expand", "camera",
        "save", "map", "navigate", "signal", "user", "plus", "compact", "chevron-up",
        "remove", "question", "faith", "faith-none", "coin", "confusion", "silence", "book",
        "chat", "poison", "flame", "frost", "bolt", "shield", "speed", "slow",
        "wing", "eye", "moon", "heart", "skull", "spark", "blade", "trait",
        "ready", "rune", "stairs", "loot", "potion", "helmet", "boots", "gloves",
        "cloak", "danger", "corrosion", "strength", "intelligence", "dexterity", "armour", "evasion",
        "sound", "blink", "holy", "reflection", "chain", "explore", "autofight", "rest",
        "pickup", "inventory", "abilities", "spells", "powers", "skills", "codex", "overview",
        "stairs-up", "stairs-down", "floor", "inspect", "control", "cycle-hero", "claim-hero", "add-hero",
        "ping-look", "ping-danger", "ping-loot", "ping-stairs", "filter-all", "filter-equipped", "filter-pack", "inventory-open",
        "experience", "time", "quiver", "contamination", "doom", "slot-add", "slot-clear", "slot-missing",
        "tray-expand", "search", "exit", "equipped", "level-cap", "jewellery", "scroll", "wand",
        "ammo", "staff", "supplies", "banes", "bestiary", "arcane-deck", "compass-rose", "compass-needle"
    ];
    var spriteFrames = Object.create(null);
    spriteNames.forEach(function (name, index) { spriteFrames[name] = index; });
    var spriteAtlas = { url: "/static/ui-sprites/hud-sprites.438f559c163c.png", size: 16, columns: 16, width: 256, height: 112 };
    var iconAliases = {
        fire: "flame", cold: "frost", electricity: "bolt", life: "skull",
        will: "shield", stealth: "moon", "see-invisible": "eye", flight: "wing",
        magic: "spark", regeneration: "heart", slaying: "blade", protection: "armour",
        "drag-panel": "move", "resize-panel": "expand", gold: "coin", runes: "rune",
        noise: "sound", weapon: "blade",
        "action-items": "inventory", "action-abilities": "abilities", "action-spells": "spells",
        "gear-filter": "filter-equipped", "pack-filter": "filter-pack", "all-filter": "filter-all"
    };
    var entries = Object.create(null);

    function register(aliases, key, label, iconName, kind, description) {
        aliases.split("|").forEach(function (alias) {
            entries[alias.toLowerCase()] = { key: key, label: label, icon: iconName,
                kind: kind, description: description };
        });
    }

    // Abbreviations and values mirror artefact.cc, describe.cc, and item-name.cc.
    register("rF", "fire", "Fire resistance", "flame", "resistance", "Resistance to fire.");
    register("rC", "cold", "Cold resistance", "frost", "resistance", "Resistance to cold.");
    register("rN", "life", "Negative energy resistance", "skull", "resistance", "Resistance to negative energy.");
    register("rPois", "poison", "Poison resistance", "poison", "resistance", "Protection from poison.");
    register("rElec", "electricity", "Electricity resistance", "bolt", "resistance", "Protection from electricity.");
    register("Will|MR", "will", "Willpower", "shield", "resistance", "Resistance to hostile enchantments.");
    register("rCorr", "corrosion", "Corrosion resistance", "corrosion", "resistance", "Protection from acid and corrosion.");
    register("rMut", "mutation", "Mutation resistance", "trait", "resistance", "Protection from mutation.");
    register("Str", "strength", "Strength", "strength", "attribute", "Affects strength.");
    register("Int", "intelligence", "Intelligence", "intelligence", "attribute", "Affects intelligence.");
    register("Dex", "dexterity", "Dexterity", "dexterity", "attribute", "Affects dexterity.");
    register("AC", "armour", "Armour class", "armour", "attribute", "Affects armour class.");
    register("EV", "evasion", "Evasion", "evasion", "attribute", "Affects evasion.");
    register("SH", "shielding", "Shielding", "shield", "attribute", "Affects shielding.");
    register("Slay", "slaying", "Slaying", "blade", "attribute", "Affects accuracy and damage with weapons.");
    register("HP", "health", "Health", "heart", "attribute", "Affects maximum health.");
    register("MP", "magic", "Magic capacity", "spark", "attribute", "Affects maximum magic points.");
    register("Stlth", "stealth", "Stealth", "moon", "attribute", "Affects stealth.");
    register("SInv", "see-invisible", "See invisible", "eye", "ability", "Allows you to see invisible creatures.");
    register("Fly|+Fly", "flight", "Flight", "wing", "ability", "Grants flight.");
    register("+Inv", "invisibility", "Invisibility", "moon", "ability", "Allows you to turn invisible.");
    register("+Blink|Blink", "blink", "Blink", "blink", "ability", "Allows you to blink.");
    register("Regen", "regeneration", "Regeneration", "heart", "ability", "Increases health regeneration.");
    register("RegenMP", "magic-regeneration", "Magic regeneration", "spark", "ability", "Increases magic regeneration.");
    register("Clar", "clarity", "Clarity", "eye", "ability", "Protects from confusion, rage, mesmerisation and fear.");
    register("RMsl|Repulsion", "repulsion", "Missile repulsion", "shield", "ability", "Protects from missiles.");
    register("Reflect", "reflection", "Reflection", "reflection", "ability", "Reflects blocked projectiles.");
    register("Spirit", "spirit", "Guardian spirit", "heart", "ability", "Incoming damage is shared between health and magic reserves.");
    register("Wiz", "wizardry", "Wizardry", "book", "ability", "Helps with spellcasting success.");
    register("Archmagi", "archmagi", "Archmagi", "spark", "ability", "Enhances spell power.");
    register("Harm", "harm", "Harm", "danger", "ability", "Increases damage dealt and taken.");
    register("Rampage", "rampage", "Rampage", "blade", "ability", "Grants rampaging movement towards enemies.");
    register("Acrobat", "acrobat", "Acrobat", "evasion", "ability", "Improves evasion after moving or waiting.");
    register("*Noise", "noise", "Noise", "sound", "penalty", "May make a loud noise when swung.");
    register("-Cast", "no-casting", "Prevents spellcasting", "book", "penalty", "Prevents spellcasting.");
    register("-Tele", "no-teleport", "Prevents teleportation", "chain", "penalty", "Prevents most forms of teleportation.");
    register("*Rage", "rage", "Involuntary berserk", "blade", "penalty", "May cause berserk rage when making melee attacks.");
    register("^Contam", "contamination", "Contamination", "spark", "penalty", "Causes magical contamination when unequipped.");
    register("*Corrode", "corrode", "Corrosion", "corrosion", "penalty", "May corrode you when you take damage.");
    register("^Drain", "drain", "Draining", "skull", "penalty", "Drains maximum health when unequipped.");
    register("*Slow", "slow", "Slowing", "slow", "penalty", "May slow you when you take damage.");
    register("^Fragile", "fragile", "Fragile", "danger", "penalty", "Is destroyed when unequipped.");
    register("*Silence", "silence", "Silence", "sound", "penalty", "May silence you when you take damage.");
    register("Bane", "bane", "Bane", "danger", "penalty", "Inflicts a random bane when equipped.");

    [
        ["speed", "Speed", "speed"], ["flame|flaming", "Flaming", "flame"],
        ["freeze|freezing", "Freezing", "frost"], ["elec|electrocution", "Electrocution", "bolt"],
        ["venom", "Venom", "poison"], ["holy|holy wrath", "Holy wrath", "holy"],
        ["protect|protection", "Protection", "armour"], ["drain|draining", "Draining", "skull"],
        ["heavy", "Heavy", "blade"], ["vamp|vampirism", "Vampirism", "heart"],
        ["pain", "Pain", "skull"], ["antimagic", "Antimagic", "spark"],
        ["distort|distortion", "Distortion", "blink"], ["chaos", "Chaos", "rune"],
        ["penet|penetration", "Penetration", "blade"], ["reap|reaping", "Reaping", "skull"],
        ["spect|spectralising", "Spectral", "blade"], ["rebuke", "Rebuke", "shield"],
        ["valour", "Valour", "blade"], ["entangle|entangling", "Entangling", "chain"],
        ["sunder|sundering", "Sundering", "blade"], ["concuss|concussion", "Concussion", "strength"],
        ["devious", "Devious", "moon"], ["acid", "Acid", "corrosion"],
        ["confuse|confusion", "Confusion", "eye"], ["weak|weakness", "Weakness", "strength"],
        ["vuln|vulnerability", "Vulnerability", "shield"], ["foul flame", "Foul flame", "flame"]
    ].forEach(function (brand) {
        register(brand[0], "brand-" + brand[0].split("|")[0], brand[1], brand[2], "brand",
            brand[1] + " weapon brand.");
    });

    function describe(input) {
        var raw = typeof input === "string" ? input.trim() : "";
        var entry = entries[raw.toLowerCase()], value = "";
        if (!entry) {
            var match = /^(.+?)([+-]+|[+-]\d+)$/.exec(raw);
            if (match && entries[match[1].toLowerCase()]) {
                entry = entries[match[1].toLowerCase()];
                value = match[2];
            }
        }
        if (!entry) return { key: "unknown", label: raw, value: "", raw: raw,
            description: "Item inscription: " + raw, icon: "rune", kind: "unknown" };
        return { key: entry.key, label: entry.label, value: value, raw: raw,
            description: entry.description, icon: entry.icon, kind: entry.kind };
    }

    function tokenize(chunk) {
        var words = [], expression = /\S+/g, match, result = [], unknownStart = null;
        while ((match = expression.exec(chunk))) words.push({ text: match[0], index: match.index });
        function flush(end) {
            if (unknownStart === null) return;
            result.push(describe(chunk.slice(unknownStart, end).trim()));
            unknownStart = null;
        }
        for (var i = 0; i < words.length; i++) {
            var word = words[i], property = describe(word.text), used = 1;
            if (i + 1 < words.length) {
                var pair = describe(word.text + " " + words[i + 1].text);
                if (pair.kind !== "unknown") { property = pair; used = 2; }
            }
            if (property.kind === "unknown") {
                if (unknownStart === null) unknownStart = word.index;
            } else {
                flush(word.index);
                result.push(property);
                i += used - 1;
            }
        }
        flush(chunk.length);
        return result;
    }

    function parse(input) {
        var original = typeof input === "string" ? input : "";
        var match = /^(.*?)\s+\{([^{}]+)\}\s*$/.exec(original);
        if (!match) return { name: original, properties: [], original: original };
        var properties = [];
        match[2].split(",").forEach(function (chunk) { properties = properties.concat(tokenize(chunk)); });
        if (!properties.length) return { name: original, properties: [], original: original };
        return { name: match[1], properties: properties, original: original };
    }

    function resolveIcon(name) {
        var canonical = Object.prototype.hasOwnProperty.call(iconAliases, name) ? iconAliases[name] : name;
        if (!Object.prototype.hasOwnProperty.call(spriteFrames, canonical)) canonical = "rune";
        return canonical;
    }

    function iconSprite(name) {
        var frame = spriteFrames[resolveIcon(name)];
        return { url: spriteAtlas.url, x: (frame % spriteAtlas.columns) * spriteAtlas.size,
            y: Math.floor(frame / spriteAtlas.columns) * spriteAtlas.size,
            width: spriteAtlas.size, height: spriteAtlas.size };
    }

    function icon(name) {
        var canonical = resolveIcon(name);
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 20 20");
        svg.setAttribute("class", "tt-icon");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        svg.setAttribute("data-ui-icon", name);
        svg.setAttribute("data-ui-glyph", canonical);
        var frame = spriteFrames[canonical];
        svg.setAttribute("data-ui-sprite", frame);
        svg.style.overflow = "hidden"; svg.style.imageRendering = "pixelated";
        var image = document.createElementNS(svg.namespaceURI, "image");
        image.setAttribute("href", spriteAtlas.url);
        // A 16px control samples one source pixel per screen pixel. The stable
        // 20-unit wrapper preserves every existing layout and transform contract.
        var scale = 20 / spriteAtlas.size;
        image.setAttribute("x", -(frame % spriteAtlas.columns) * 20);
        image.setAttribute("y", -Math.floor(frame / spriteAtlas.columns) * 20);
        image.setAttribute("width", spriteAtlas.width * scale); image.setAttribute("height", spriteAtlas.height * scale);
        image.style.imageRendering = "pixelated";
        svg.appendChild(image);
        return svg;
    }

    function badge(property, options) {
        options = options || {};
        if (typeof property === "string") property = describe(property);
        var node = document.createElement("span");
        var valueText = property.value === undefined || property.value === null ? "" : String(property.value);
        var title = property.label + (valueText ? " " + valueText : "");
        node.className = "item-property item-property-" + property.kind;
        node.setAttribute("data-property", property.key);
        node.setAttribute("data-property-raw", property.raw || title);
        node.setAttribute("data-property-value", valueText);
        node.setAttribute("data-tip-title", title);
        node.setAttribute("data-tip-body", property.description);
        node.setAttribute("title", title + "\n" + property.description);
        node.setAttribute("aria-label", title + ". " + property.description);
        node.setAttribute("role", "img");
        if (options.focusable !== false) node.setAttribute("tabindex", "0");
        node.appendChild(icon(property.icon));
        if (property.kind === "unknown" || options.labels) {
            var label = document.createElement("span");
            label.className = "item-property-label";
            label.textContent = property.label;
            node.appendChild(label);
        }
        if (valueText) {
            var value = document.createElement("span");
            value.className = "item-property-value";
            value.textContent = valueText;
            node.appendChild(value);
        }
        return node;
    }

    // Signed levels share the existing artwork; each negative level gets its own X.
    // Zero and unknown values retain a muted symbol so the defense stays identifiable.
    function levelIcons(name, level) {
        var known = Number.isFinite(level), count = known ? Math.abs(Math.trunc(level)) : 0;
        var group = document.createElement("span");
        group.className = "resistance-icons" + (known ? count ? "" : " is-zero" : " is-unknown");
        group.setAttribute("aria-hidden", "true");
        for (var i = 0; i < Math.max(1, count); i++) {
            var glyph = icon(name);
            glyph.classList.add(count ? "is-filled" : "is-empty");
            if (known && level < 0) {
                glyph.classList.add("is-vulnerable");
                ["resistance-cross-outline", "resistance-cross"].forEach(function (className) {
                    var cross = document.createElementNS(glyph.namespaceURI, "path");
                    cross.setAttribute("class", className);
                    cross.setAttribute("d", "M4 4L16 16M16 4L4 16");
                    glyph.appendChild(cross);
                });
            }
            group.appendChild(glyph);
        }
        if (!known) {
            var unknown = document.createElement("span");
            unknown.textContent = "?";
            group.appendChild(unknown);
        }
        return group;
    }

    function render(input, options) {
        var parsed = parse(input), node = document.createElement("span");
        node.className = "item-property-name";
        var name = document.createElement("span");
        name.className = "item-base-name";
        name.textContent = parsed.name;
        node.appendChild(name);
        if (parsed.properties.length) {
            var group = document.createElement("span");
            group.className = "item-properties";
            parsed.properties.forEach(function (property) { group.appendChild(badge(property, options)); });
            node.appendChild(group);
        }
        return node;
    }

    function append(target, input, options) {
        var node = render(input, options);
        target.appendChild(node);
        return node;
    }

    return { parse: parse, describe: describe, icon: icon, levelIcons: levelIcons, badge: badge, render: render, append: append,
        iconNames: function () { return spriteNames.concat(Object.keys(iconAliases)); },
        iconAtlas: function () { return Object.assign({}, spriteAtlas); }, iconSprite: iconSprite,
        hasIcon: function (name) { return Object.prototype.hasOwnProperty.call(spriteFrames, name)
            || Object.prototype.hasOwnProperty.call(iconAliases, name); } };
});
