/* Draw native packed layers, including the engine's order and clipping. */
define(["native-start"], function (native) {
    "use strict";
    var atlases = new Map();
    function atlas(url) {
        if (!atlases.has(url)) atlases.set(url, new Promise(function (resolve, reject) {
            var image = new Image(); image.onload = function () { resolve(image); };
            image.onerror = function () { atlases.delete(url); reject(new Error("Player tiles unavailable")); };
            image.src = url;
        }));
        return atlases.get(url);
    }
    function portrait(build, className) {
        var frame = document.createElement("span"); frame.className = "native-player-tile " + (className || "");
        var record = native.get(build), species = build.species;
        frame.setAttribute("role", "img");
        frame.setAttribute("aria-label", species.name + " · " + (record.status === "ready" ? "Starting equipment" : "Loading starting equipment"));
        if (record.status !== "ready") {
            if (species.tile) {
                var fallback = document.createElement("img"); fallback.src = species.tile.src; fallback.alt = "";
                fallback.width = 64; fallback.height = 64; frame.appendChild(fallback);
            }
            frame.setAttribute("aria-busy", String(record.status === "loading"));
            return frame;
        }
        var canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32;
        canvas.setAttribute("aria-hidden", "true"); frame.appendChild(canvas);
        var snapshot = record.snapshot;
        atlas(snapshot.atlas.src).then(function (image) {
            var context = canvas.getContext("2d"); context.imageSmoothingEnabled = false;
            snapshot.doll.forEach(function (layer) {
                context.save(); context.beginPath(); context.rect(0, 0, 32, layer.ymax); context.clip();
                context.drawImage(image, layer.sx, layer.sy, layer.w, layer.h, layer.ox, layer.oy, layer.w, layer.h);
                context.restore();
            });
            frame.dataset.equipped = "true";
        }).catch(function () { frame.setAttribute("aria-label", "Starting outfit image unavailable"); });
        return frame;
    }
    return portrait;
});
