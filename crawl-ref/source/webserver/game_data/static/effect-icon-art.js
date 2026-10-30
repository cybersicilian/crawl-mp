define(["./effect-icon-catalog"], function (catalog) {
    "use strict";
    var entries = new Map(), aliases = new Map();
    function normalize(label) {
        return String(label || "").replace(/\s*\([^)]*\)/g, "").trim().toLowerCase().replace(/\s+/g, " ");
    }
    catalog.entries.forEach(function (row) {
        entries.set(row[0], { key: row[0], frame: row[1], names: row[2], modifier: row[3] });
        row[2].forEach(function (label) {
            var name = normalize(label);
            // Native keys disambiguate shared labels such as "empowered".
            if (name && !aliases.has(name)) aliases.set(name, row[0]);
        });
    });
    var legacy = { hasted: "DUR_HASTE", fast: "DUR_HASTE", poisoned: "DUR_POISONING",
        slowed: "DUR_SLOW", "hasted and slowed": "STATUS_SPEED", "fast+slow": "STATUS_SPEED",
        "barbed spikes": "DUR_BARBS", "death's door": "DUR_DEATHS_DOOR", "not regenerating": "DUR_SICKNESS" };
    Object.keys(legacy).forEach(function (label) { aliases.set(label, legacy[label]); });
    function resolve(view) {
        if (!view || view.key === "unknown") return null;
        if (typeof view.iconKey === "string" && view.iconKey)
            return entries.has(view.iconKey) ? view.iconKey : null;
        if (typeof view.key === "string" && entries.has(view.key)) return view.key;
        return aliases.get(normalize(view.name)) || null;
    }
    function icon(key) {
        var entry = entries.get(key); if (!entry) return null;
        var atlas = catalog.atlas, svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        function node(tag, attributes) {
            var element = document.createElementNS(svg.namespaceURI, tag);
            Object.keys(attributes).forEach(function (name) { element.setAttribute(name, attributes[name]); });
            svg.appendChild(element); return element;
        }
        svg.setAttribute("viewBox", "0 0 32 32"); svg.setAttribute("class", "tt-icon effect-icon-art");
        svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
        svg.setAttribute("data-ui-icon", key); svg.setAttribute("data-ui-glyph", key);
        svg.setAttribute("data-ui-sprite", entry.frame); svg.setAttribute("data-effect-art", key);
        svg.style.overflow = "hidden"; svg.style.imageRendering = "pixelated";
        node("image", { href: atlas.url, x: -(entry.frame % atlas.columns) * atlas.size,
            y: -Math.floor(entry.frame / atlas.columns) * atlas.size, width: atlas.width, height: atlas.height });
        if (entry.modifier) {
            svg.setAttribute("data-effect-modifier", entry.modifier);
            node("rect", { x: 20, y: 20, width: 12, height: 12, rx: 2, fill: "#101722", stroke: "#e4d5b4", "stroke-width": 1 });
            var paths = {
                cooldown: "M26 22v4l3 2M26 22a4 4 0 1 0 .01 0",
                immune: "M22 23l4-1 4 1v4l-4 3-4-3zM24 26l2 2 3-4",
                curse: "M23 23l6 6m0-6l-6 6M26 22v8",
                borrowed: "M23 25l3-3 3 3-3 5z",
                severe: "M24 22v5m4-5v5M24 29h.1m3.9 0h.1",
                depleted: "M23 26h6M23 23l6 6",
                blocked: "M23 23l6 6M26 22a4 4 0 1 0 .01 0",
                charging: "M27 22l-4 5h3l-1 4 5-6h-3z"
            };
            node("path", { d: paths[entry.modifier], fill: "none", stroke: entry.modifier === "curse" ? "#f0a2cf" : "#ffe5a5",
                "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round" });
        }
        return svg;
    }
    return { resolve: resolve, icon: icon, has: function (key) { return entries.has(key); },
        entries: function () { return Array.from(entries.values()); }, atlas: catalog.atlas };
});
