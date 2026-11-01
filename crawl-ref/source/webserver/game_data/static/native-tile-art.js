define(["jquery"], function ($) {
    "use strict";
    var imageTransform = function (texture, source) { return source; };
    var tileTransform = function () { return null; };
    var mounted = new WeakMap();
    $(document).on("texture_pack_changed.nativeArt art_materials_ready.nativeArt", function () {
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
    function details(art, sources) {
        return sources.map(function (source, index) {
            var layer = art.layers[index], image;
            try { image = tileTransform(layer.texture || art.texture, source, layer); }
            catch (error) { return null; }
            if (!image || image.complete === false) return null;
            var width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
            var scale = width / layer.w;
            return Number.isInteger(scale) && scale > 1 && scale <= 4 && height === layer.h * scale
                ? { image: image, width: width, height: height, scale: scale } : null;
        });
    }
    function draw(canvas, art, prepared, native) {
        var sources = images(art);
        if (!sources.length || !sources.every(function (image, index) {
            var layer = art.layers[index];
            return image && image.complete && image.naturalWidth
                && ["sx", "sy", "w", "h", "ox", "oy", "ymax"].every(function (key) { return Number.isFinite(layer[key]); })
                && layer.sx >= 0 && layer.sy >= 0 && layer.w > 0 && layer.h > 0
                && layer.sx + layer.w <= image.naturalWidth && layer.sy + layer.h <= image.naturalHeight;
        })) return false;
        var context = canvas.getContext("2d");
        if (!context) return false;
        var samples = prepared || details(art, sources);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = false;
        context.save();
        if (canvas.width !== 32 || canvas.height !== 32) context.scale(canvas.width / 32, canvas.height / 32);
        art.layers.forEach(function (layer, index) {
            var sample = samples[index];
            context.save(); context.beginPath(); context.rect(0, 0, 32, layer.ymax); context.clip();
            context.imageSmoothingEnabled = Boolean(sample);
            if (sample) context.drawImage(sample.image, 0, 0, sample.width, sample.height,
                layer.ox, layer.oy, layer.w, layer.h);
            else context.drawImage(native ? sources[index] : imageTransform(layer.texture || art.texture, sources[index]),
                layer.sx, layer.sy, layer.w, layer.h, layer.ox, layer.oy, layer.w, layer.h);
            context.restore();
        });
        context.restore();
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
            var samples = details(art, sources);
            var resolution = samples.reduce(function (scale, sample) { return Math.max(scale, sample ? sample.scale : 1); }, 1);
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32 * resolution;
            canvas.style.imageRendering = resolution > 1 ? "auto" : "pixelated";
            canvas.setAttribute("aria-hidden", "true");
            if (!draw(canvas, art, samples)) { frame.dataset.art = "unavailable"; return; }
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
    function drawIndices(canvas, tile, tiles) {
        var image = document.getElementById("main");
        if (!tile || !image || !image.complete || !image.naturalWidth) return false;
        var ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
        [].concat(tile).forEach(function (index) {
            var info = tiles.get_tile_info(index); if (!info) return;
            ctx.drawImage(image, info.sx, info.sy, info.ex - info.sx, info.ey - info.sy,
                info.ox + 16 - info.w / 2, info.oy + 32 - info.h, info.ex - info.sx, info.ey - info.sy);
        });
        return true;
    }
    return { create: create, draw: draw, drawIndices: drawIndices,
        drawNative: function (canvas, source) { return draw(canvas, source, [], true); },
        setImageTransform: function (transform) { imageTransform = transform; },
        setTileTransform: function (transform) { tileTransform = transform; } };
});
