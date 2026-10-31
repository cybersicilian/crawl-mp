define(["jquery"], function ($) {
    "use strict";
    var imageTransform = function (texture, source) { return source; };
    var mounted = new WeakMap();
    $(document).on("texture_pack_changed.nativeArt", function () {
        document.querySelectorAll(".native-equipment-art").forEach(function (frame) {
            var render = mounted.get(frame); if (render) render();
        });
    });
    // Both items and portraits use native atlas rectangles and layer clipping.
    // Atlas elements belong to the active game version; no guessed tile IDs.
    function images(art) {
        if (!art || !Array.isArray(art.layers) || !art.layers.length) return [];
        return art.layers.map(function (layer) {
            var texture = layer.texture || art.texture;
            return ["main", "player", "icons"].includes(texture) ? document.getElementById(texture) : null;
        });
    }
    function draw(canvas, art) {
        var sources = images(art);
        if (!sources.length || !sources.every(function (image, index) {
            var layer = art.layers[index];
            return image && image.complete && image.naturalWidth
                && ["sx", "sy", "w", "h", "ox", "oy", "ymax"].every(function (key) { return Number.isFinite(layer[key]); })
                && layer.sx >= 0 && layer.sy >= 0 && layer.w > 0 && layer.h > 0
                && layer.sx + layer.w <= image.naturalWidth && layer.sy + layer.h <= image.naturalHeight;
        })) return false;
        var context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = false;
        art.layers.forEach(function (layer, index) {
            context.save(); context.beginPath(); context.rect(0, 0, 32, layer.ymax); context.clip();
            context.drawImage(imageTransform(layer.texture || art.texture, sources[index]),
                layer.sx, layer.sy, layer.w, layer.h, layer.ox, layer.oy, layer.w, layer.h);
            context.restore();
        });
        return true;
    }
    function create(art, label, className, fallback) {
        var frame = document.createElement("span");
        frame.className = "native-equipment-art " + (className || "");
        frame.setAttribute("role", "img"); frame.setAttribute("aria-label", label);
        if (fallback) frame.appendChild(fallback);
        var sources = images(art);
        if (!sources.length || sources.some(function (image) { return !image; })) {
            frame.dataset.art = "unavailable"; return frame;
        }
        function render() {
            if (sources.some(function (image) { return !image.complete; })) { frame.dataset.art = "loading"; return; }
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
            canvas.setAttribute("aria-hidden", "true");
            if (!draw(canvas, art)) { frame.dataset.art = "unavailable"; return; }
            frame.replaceChildren(canvas); frame.dataset.art = "ready";
        }
        mounted.set(frame, render);
        sources.forEach(function (image) {
            if (!image.complete) {
                image.addEventListener("load", render, { once: true });
                image.addEventListener("error", function () { frame.dataset.art = "unavailable"; }, { once: true });
            }
        });
        render();
        return frame;
    }
    return { create: create, draw: draw,
        setImageTransform: function (transform) { imageTransform = transform; } };
});
