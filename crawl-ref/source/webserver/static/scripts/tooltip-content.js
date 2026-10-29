/* One presentation contract for native descriptions and rich-tooltip metadata. */
define(["item-properties", "rich-text"], function (artwork, richText) {
    "use strict";

    var definitions = {
        "Base armour rating": ["Base armour", "armour"],
        "Base shield rating": ["Base shielding", "shield"],
        "Encumbrance rating": ["Encumbrance", "strength"],
        "Max blocks/turn": ["Blocks / turn", "shield"],
        "Evasion": ["Evasion", "evasion"],
        "Base accuracy": ["Base accuracy", "eye"],
        "Base damage": ["Base damage", "blade"],
        "Base attack delay": ["Base attack delay", "slow", " t"],
        "Minimum attack delay": ["Minimum delay", "speed", " t"],
        "Minimum delay skill": ["Skill for min. delay", "book"],
        "Enchantment limit": ["Enchant limit", "spark"],
        "Level": ["Level", "book"],
        "MP": ["Magic cost", "spark", " MP"],
        "Power": ["Power", "bolt"],
        "Fail": ["Failure", "danger"],
        "Damage": ["Damage", "blade"],
        "Range": ["Range", "eye"],
        "Aptitude": ["Aptitude", "trait"],
        "Cost": ["Cost", "loot"]
    };
    var states = { Equipped: "ready", Carried: "loot", Memorized: "book", "Not memorized": "book" };
    var number = "([+-]?\\d+(?:\\.\\d+)?|∞|inf)";
    var nativeFields = Object.keys(definitions).filter(function (key) {
        return /^(Base |Encumbrance|Max blocks|Evasion)/.test(key);
    });
    var nativePattern = new RegExp("(" + nativeFields.join("|") + "):\\s*" + number, "g");

    function fact(key, value) {
        var definition = definitions[key];
        return { key: key, label: definition[0], icon: definition[1], value: value + (definition[2] || "") };
    }

    // Match complete native stat lines only. Unfamiliar prose stays intact.
    function parse(body, meta) {
        var facts = [], search = [], lines = [];
        String(body || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
            var prefix = line.match(/^\s*(Stash search prefixes|Menu\/colouring prefixes):[ \t]*(.*)$/);
            if (prefix) {
                if (prefix[2].trim()) search.push({ label: prefix[1], value: prefix[2].trim() });
                return;
            }
            var enchantment = line.match(/^\s*It can be maximally enchanted to (\+\d+)\.\s*$/);
            if (enchantment) { facts.push(fact("Enchantment limit", enchantment[1])); return; }
            var delay = line.match(/^\s*This weapon's minimum attack delay \((\d+(?:\.\d+)?)\) is reached at skill level (\d+)\.\s*$/);
            if (delay) {
                facts.push(fact("Minimum attack delay", delay[1]), fact("Minimum delay skill", delay[2]));
                return;
            }
            var found = [];
            var remainder = line.replace(nativePattern, function (match, key, value) {
                found.push(fact(key, value)); return "";
            });
            if (found.length && !remainder.trim()) facts = facts.concat(found);
            else lines.push(line);
        });
        var context = String(meta || "").split(" · ").filter(function (part) {
            var match = part.match(/^(Level|Aptitude) ([+-]?\d+(?:\.\d+)?)$/)
                || part.match(/^(Power|Fail|Damage|Range|Cost): (.+)$/);
            if (match && match[2] !== "—" && match[2] !== "Unavailable") {
                facts.push(fact(match[1], match[2])); return false;
            }
            var magic = part.match(/^(\d+) MP$/);
            if (magic) { facts.push(fact("MP", magic[1])); return false; }
            return Boolean(part);
        });
        return { facts: facts, text: lines.join("\n").trim(), search: search, meta: context.join(" · ") };
    }

    function element(tag, className, text) {
        var node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function renderFacts(facts) {
        var list = element("dl", "tip-facts");
        list.setAttribute("aria-label", "Statistics");
        facts.forEach(function (entry) {
            var cell = element("div", "tip-fact"), label = element("dt", "tip-fact-label");
            cell.setAttribute("data-stat", entry.key);
            label.append(artwork.icon(entry.icon), element("span", "", entry.label));
            cell.append(label, element("dd", "tip-fact-value", entry.value));
            list.appendChild(cell);
        });
        return list;
    }

    // Rich prose uses the shared renderer; player-supplied HTML remains escaped.
    function render(node, body, meta) {
        var data = parse(body, meta);
        node.textContent = "";
        node.setAttribute("data-tip-reading", [body, meta].filter(Boolean).join("\n\n"));
        node.classList.add("tip-content");
        if (data.facts.length) node.appendChild(renderFacts(data.facts));
        if (data.text) {
            var prose = element("div", "tip-description");
            prose.innerHTML = richText.render(data.text);
            node.appendChild(prose);
        }
        if (data.search.length) {
            var details = element("details", "tip-search-details");
            details.addEventListener("toggle", function () {
                node.dispatchEvent(new CustomEvent("tooltip-content-resize", { bubbles: true }));
            });
            details.appendChild(element("summary", "", "Search details"));
            var list = element("dl", "tip-search-values");
            data.search.forEach(function (entry) {
                list.append(element("dt", "", entry.label), element("dd", "", entry.value));
            });
            details.appendChild(list); node.appendChild(details);
        }
        return data.meta;
    }

    function renderMeta(node, text) {
        node.textContent = "";
        node.classList.add("tip-context");
        String(text || "").split(" · ").filter(Boolean).forEach(function (part) {
            var state = Object.prototype.hasOwnProperty.call(states, part) && states[part];
            var span = element("span", state ? "tip-state" : "tip-context-note");
            if (state) span.appendChild(artwork.icon(state));
            span.appendChild(document.createTextNode(part)); node.appendChild(span);
        });
    }

    function renderTitle(node, title) {
        node.textContent = "";
        node.setAttribute("data-tip-reading-title", title || "");
        node.appendChild(artwork.render(title, { focusable: false }));
    }

    return { parse: parse, render: render, renderMeta: renderMeta, renderTitle: renderTitle };
});
