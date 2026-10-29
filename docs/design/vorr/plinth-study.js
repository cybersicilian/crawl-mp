/* Design-only SVG study. Native dimensions, classes, materials and layer order
 * follow party-faith.js; no god or gameplay state is registered by this page. */
(function () {
    "use strict";
    var record = document.getElementById("vorr-plinth-theme");
    var gallery = document.getElementById("plinth-gallery");
    if (!record || !gallery) return;
    var theme = JSON.parse(record.textContent);
    var namespace = "http://www.w3.org/2000/svg";
    var sequence = 0;
    function svgNode(tag, attributes, parent) {
        var element = document.createElementNS(namespace, tag);
        Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, attributes[key]); });
        if (parent) parent.appendChild(element);
        return element;
    }
    function path(parent, className, data) {
        return svgNode("path", { "class": className, d: data }, parent);
    }
    function material(defs, name, stops, id) {
        var key = "vorr-study-" + name + "-" + id;
        var gradient = svgNode("linearGradient", { id: key, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        stops.forEach(function (stop) {
            svgNode("stop", { offset: stop[0], "class": "faith-material-" + stop[1] }, gradient);
        });
        return "url(#" + key + ")";
    }
    function frame(rank, state) {
        var svg = svgNode("svg", { "class": "party-faith-frame", viewBox: "0 0 " + theme.envelope.join(" "), "aria-hidden": true });
        var defs = svgNode("defs", {}, svg);
        var id = ++sequence;
        var metal = material(defs, "metal", [[0, "light"], [.18, "accent"], [.46, "shade"], [.55, "light"], [1, "accent"]], id);
        var stone = material(defs, "stone", [[0, "stone-light"], [.24, "stone"], [.7, "stone"], [1, "stone-dark"]], id);
        path(svg, "faith-arch-shadow", theme.arch);
        path(svg, "faith-plinth-shadow", theme.base);
        path(svg, "faith-frame-structure", theme.arch).style.stroke = metal;
        path(svg, "faith-plinth-stone", theme.base).style.fill = stone;
        path(svg, "faith-plinth-bevel", theme.base).style.stroke = metal;
        var socket = svgNode("g", { "class": "faith-idol-setting", transform: "translate(30 62)" }, svg);
        path(socket, "faith-idol-recess", theme.setting).style.fill = stone;
        path(socket, "faith-idol-rim", theme.setting).style.stroke = metal;
        path(socket, "faith-idol-seat", "M-5 6Q0 4 5 6");
        [-1, 1].forEach(function (side) {
            var seal = svgNode("g", { transform: "translate(" + (30 + side * 17) + " 61) scale(.7)" }, svg);
            path(seal, "faith-seal-recess", theme.seal);
            path(seal, "faith-seal", theme.seal);
        });
        theme.layers.forEach(function (definition) {
            var layer = svgNode("g", { "class": "faith-craft faith-" + definition.name, "data-min-tier": definition.tier }, svg);
            if (rank === null || rank < definition.tier) layer.setAttribute("display", "none");
            path(layer, definition.className, definition.path || theme[definition.themePath]);
            if (definition.name === "glory") [6, 54].forEach(function (x) {
                var jewel = svgNode("g", { transform: "translate(" + x + " 19)" }, layer);
                path(jewel, "faith-jewel", theme.mote);
            });
        });
        if (rank > 0 && state === "devout") {
            var particles = svgNode("g", { "class": "faith-particles" }, svg);
            [[5, 51], [55, 45], [3, 36], [57, 32], [6, 25], [54, 20]].slice(0, rank).forEach(function (point, index) {
                var anchor = svgNode("g", { transform: "translate(" + point.join(" ") + ")" }, particles);
                var mote = svgNode("g", { "class": "faith-particle faith-motion-fall" }, anchor);
                mote.style.setProperty("--faith-particle-period", (13 + index * .7) + "s");
                mote.style.setProperty("--faith-particle-delay", (-index * 2.7 - 1.1) + "s");
                path(mote, "faith-mote", theme.mote);
            });
        }
        if (state === "penance") path(svg, "faith-fracture", "M5 56L10 60L7 63L13 67M55 56L50 60L53 63L47 67");
        return svg;
    }
    function sample(rank, state) {
        var figure = document.createElement("figure");
        figure.className = "plinth-sample";
        var stage = document.createElement("div");
        stage.className = "faith-study-stage";
        var portrait = document.createElement("div");
        portrait.className = "party-portrait faith-study-portrait";
        portrait.dataset.faithTier = rank === null ? "unknown" : rank;
        portrait.dataset.faithKind = "piety";
        portrait.dataset.faithState = state;
        portrait.dataset.faithMotion = state !== "devout" || !rank ? "still" : rank < 4 ? "quiet" : "radiant";
        portrait.style.setProperty("--faith-accent", theme.accent);
        var hero = document.createElement("img");
        hero.className = "faith-study-hero"; hero.src = theme.hero_reference; hero.alt = "";
        var compass = document.createElement("span");
        compass.className = "faith-study-compass"; compass.textContent = "✦"; compass.setAttribute("aria-hidden", "true");
        var altar = document.createElement("a");
        altar.className = "faith-study-badge"; altar.href = "#kit";
        altar.setAttribute("aria-label", state === "penance" ? "Vorr under penance, view proposed abilities" : "Vorr, favor " + (rank === null ? "unavailable" : rank + " of 6") + ", view proposed abilities");
        var inset = document.createElement("img"); inset.src = theme.inset; inset.alt = ""; altar.appendChild(inset);
        if (state === "penance") {
            var warning = document.createElement("span"); warning.className = "faith-study-warning";
            warning.textContent = "!"; warning.setAttribute("aria-hidden", "true"); altar.appendChild(warning);
        }
        portrait.append(hero, frame(rank, state), compass, altar); stage.appendChild(portrait);
        var caption = document.createElement("figcaption");
        caption.textContent = state === "penance" ? "Penance" : rank === null ? "Favor unavailable" : "Favor " + rank;
        var meaning = document.createElement("span"); meaning.className = "plinth-meaning";
        meaning.textContent = state !== "devout" ? "Existing state treatment" : rank === null ? "No rank inferred" : theme.gameplay_milestones[rank] || "Favor decoration";
        caption.appendChild(meaning); figure.append(stage, caption); return figure;
    }
    for (var rank = 0; rank <= 6; rank++) gallery.appendChild(sample(rank, "devout"));
    gallery.append(sample(5, "penance"), sample(null, "devout"));
}());
