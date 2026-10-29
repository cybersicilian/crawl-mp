/* Cached image grading. Geometry and alpha are invariant; source images stay intact. */
define([], function () {
    "use strict";
    function channel(value) { return Math.max(0, Math.min(255, Math.round(value))); }
    function pixels(data, profile) {
        var saturation = profile.saturation, contrast = profile.contrast, light = profile.brightness;
        var tint = profile.tint, amount = profile.tintAmount;
        for (var i = 0; i < data.length; i += 4) {
            if (!data[i + 3]) continue;
            var luma = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
            for (var c = 0; c < 3; c++) {
                var value = (luma + (data[i + c] - luma) * saturation - 127.5) * contrast + 127.5;
                value = Math.max(0, Math.min(255, value * light));
                data[i + c] = channel(value * (1 - amount) + tint[c] * amount);
            }
        }
        return data;
    }
    function create() {
        var cache = new WeakMap();
        function image(source, profile) {
            if (!source || !profile || !source.complete || !source.naturalWidth) return source;
            var version = [source.currentSrc || source.src, source.naturalWidth, source.naturalHeight].join(":");
            var entry = cache.get(source);
            if (!entry || entry.version !== version) {
                entry = { version: version, profiles: new WeakMap() }; cache.set(source, entry);
            }
            if (entry.profiles.has(profile)) return entry.profiles.get(profile);
            var canvas = document.createElement("canvas"), result = source;
            canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
            try {
                var ctx = canvas.getContext("2d");
                if (!ctx) { entry.profiles.set(profile, source); return source; }
                ctx.imageSmoothingEnabled = false;
                if ("filter" in ctx) {
                    ctx.filter = "saturate(" + profile.saturation + ") contrast(" + profile.contrast
                        + ") brightness(" + profile.brightness + ")";
                    ctx.drawImage(source, 0, 0);
                    ctx.filter = "none";
                    ctx.globalCompositeOperation = "source-atop";
                    ctx.globalAlpha = profile.tintAmount;
                    ctx.fillStyle = "rgb(" + profile.tint.join(",") + ")";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                } else {
                    ctx.drawImage(source, 0, 0);
                    var buffer = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    pixels(buffer.data, profile); ctx.putImageData(buffer, 0, 0);
                }
                (profile.preserve || []).forEach(function (rect) {
                    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
                    ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
                    ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height,
                        rect.x, rect.y, rect.width, rect.height);
                });
                result = canvas;
            } catch (error) {
                // An unreadable image retains its full original drawing capability.
                result = source;
            }
            entry.profiles.set(profile, result);
            return result;
        }
        return { image: image };
    }
    return { create: create, pixels: pixels };
});
