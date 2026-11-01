/* Sprites that belong to their surroundings: a soft ground shadow beneath and a
 * coloured rim on the edge facing the strongest light. Every pass follows native
 * alpha, so silhouettes, transparency and the sprite's own pixels are preserved. */
define(["light-field-sampling", "weighted-cache"], function (sampling, weighted) {
    "use strict";
    var postures = {
        standing: { alpha: .86, width: 1, height: .26, ground: .87 },
        hovering: { alpha: .44, width: .62, height: .18, ground: .91 },
        resting: { alpha: .6, width: .66, height: .2, ground: .84 }
    };
    var template;
    function clamp(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
    // All occlusion-filtered light at one cell, reduced to one direction and
    // colour. Opposing sources cancel into an even wash with no rim.
    function gather(lights, cx, cy) {
        var total = 0, vx = 0, vy = 0, r = 0, g = 0, b = 0;
        (lights || []).forEach(function (light) {
            var dx = light.x - cx, dy = light.y - cy, distance = Math.hypot(dx, dy);
            var energy = sampling.falloff(distance, light.radius) * light.strength * sampling.coverage(light.visibility, .5, .5);
            if (energy <= 0) return;
            total += energy; r += light.colour[0] * energy; g += light.colour[1] * energy; b += light.colour[2] * energy;
            if (distance) { vx += dx / distance * energy; vy += dy / distance * energy; }
        });
        if (!total) return null;
        var length = Math.hypot(vx, vy);
        return { energy: total, focus: length / total, x: length ? vx / length : 0, y: length ? vy / length : 0,
            colour: [Math.round(r / total), Math.round(g / total), Math.round(b / total)] };
    }
    function blob() {
        if (template !== undefined) return template;
        var canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 32;
        var ctx = canvas.getContext("2d");
        if (!ctx) return template = null;
        ctx.setTransform(2, 0, 0, 1, 0, 0);
        var gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, "rgba(5,7,13,.92)"); gradient.addColorStop(.55, "rgba(5,7,13,.62)");
        gradient.addColorStop(1, "rgba(5,7,13,0)");
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
        return template = canvas;
    }
    function shadow(ctx, x, y, size, light, posture) {
        var image = blob(), style = postures[posture] || postures.standing;
        if (!image) return;
        var reach = light ? clamp(light.energy * 9) * light.focus : 0, w = size.width, h = size.height;
        // Squeezed into its own tile rectangle: a neighbour's repaint never leaves a residue.
        var cx = x + w / 2 - (light ? light.x * reach * w * .11 : 0), cy = y + h * style.ground - (light ? light.y * reach * h * .05 : 0);
        var left = Math.max(x, cx - w * style.width / 2), right = Math.min(x + w, cx + w * style.width / 2);
        var top = Math.max(y, cy - h * style.height / 2), bottom = Math.min(y + h, cy + h * style.height / 2);
        var alpha = ctx.globalAlpha, smoothing = ctx.imageSmoothingEnabled;
        ctx.globalAlpha = alpha * style.alpha; ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, left, top, right - left, bottom - top);
        ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = smoothing;
    }
    // Light is quantized so that a retained sprite survives flicker and small moves.
    function bucket(light) {
        if (!light) return "dark";
        return [Math.round(Math.min(light.energy, .4) * 40), Math.round(Math.atan2(light.y, light.x) * 8 / Math.PI), Math.round(light.focus * 4),
            light.colour[0] >> 4, light.colour[1] >> 4, light.colour[2] >> 4].join(":");
    }
    function create() {
        var sprite, rim, spriteCtx, rimCtx, foot = null, footSize = null;
        var retained = weighted.create(16 * 1024 * 1024, 512, function (entry) { return entry.canvas.width * entry.canvas.height * 4; });
        function ensure(width, height) {
            if (!sprite) {
                sprite = document.createElement("canvas"); rim = document.createElement("canvas");
                spriteCtx = sprite.getContext("2d"); rimCtx = rim.getContext("2d");
            }
            if (!spriteCtx || !rimCtx) return false;
            if (sprite.width !== width || sprite.height !== height) {
                sprite.width = rim.width = width; sprite.height = rim.height = height; foot = null;
            }
            return true;
        }
        function ground(size, oy) {
            var key = size.width + ":" + size.height;
            if (foot && footSize === key) return foot;
            foot = spriteCtx.createLinearGradient(0, oy + size.height * .58, 0, oy + size.height);
            foot.addColorStop(0, "rgba(6,8,14,0)"); foot.addColorStop(1, "rgba(6,8,14,.3)");
            footSize = key; return foot;
        }
        function light(size, source, ox, oy) {
            var amount = clamp(source.energy * 9), unit = Math.max(1, Math.round(size.width / 32));
            var sx = Math.round(source.x * unit * 1.35), sy = Math.round(source.y * unit * 1.35);
            var colour = "rgb(" + source.colour.join(",") + ")", width = sprite.width, height = sprite.height;
            if ((sx || sy) && source.focus > .05) {
                rimCtx.globalCompositeOperation = "copy"; rimCtx.drawImage(sprite, 0, 0);
                rimCtx.globalCompositeOperation = "source-in"; rimCtx.fillStyle = colour; rimCtx.fillRect(0, 0, width, height);
                rimCtx.globalCompositeOperation = "destination-out"; rimCtx.drawImage(sprite, -sx, -sy);
                spriteCtx.globalCompositeOperation = "lighter"; spriteCtx.globalAlpha = amount * source.focus * .82;
                spriteCtx.drawImage(rim, 0, 0);
            }
            // A broad wash from the same side keeps the rim from reading as an outline.
            var cx = ox + size.width / 2, cy = oy + size.height / 2, span = size.width * .55;
            var wash = spriteCtx.createLinearGradient(cx + source.x * span, cy + source.y * span, cx - source.x * span * .3, cy - source.y * span * .3);
            wash.addColorStop(0, colour); wash.addColorStop(1, "rgba(" + source.colour.join(",") + ",0)");
            spriteCtx.globalCompositeOperation = "source-atop"; spriteCtx.globalAlpha = amount * .24;
            spriteCtx.fillStyle = wash; spriteCtx.fillRect(ox - size.width * .25, oy - size.height * .25, size.width * 1.5, size.height * 1.5);
        }
        // Paints one native actor through a scratch layer. Nothing else in the
        // native call changes, including its clips, alpha and overlap bookkeeping.
        function render(view, x, y, size, paint, source) {
            // Sprites reach at most half a tile up; three tiles spare any offset.
            var width = size.width * 3, height = size.height * 3, ox = size.width, oy = size.height;
            if (!ensure(width, height)) return null;
            var original = view.ctx, sy = view.current_sy, left = view.current_left_overlap;
            spriteCtx.setTransform(1, 0, 0, 1, 0, 0); spriteCtx.globalCompositeOperation = "source-over"; spriteCtx.globalAlpha = 1;
            spriteCtx.clearRect(0, 0, width, height);
            spriteCtx.save(); spriteCtx.translate(ox - x, oy - y);
            spriteCtx.globalAlpha = original.globalAlpha; spriteCtx.imageSmoothingEnabled = original.imageSmoothingEnabled;
            view.ctx = spriteCtx; view.current_sy = view.current_left_overlap = 0;
            var reachUp, reachLeft;
            try { paint(); } finally {
                view.ctx = original; spriteCtx.restore(); reachUp = view.current_sy; reachLeft = view.current_left_overlap;
                view.current_sy = sy; view.current_left_overlap = left;
            }
            if (source) light(size, source, ox, oy);
            spriteCtx.globalCompositeOperation = "source-atop"; spriteCtx.globalAlpha = 1;
            spriteCtx.fillStyle = ground(size, oy); spriteCtx.fillRect(0, oy + size.height * .58, width, size.height * .42);
            return { sy: reachUp, left: reachLeft };
        }
        // Retained sprites keep just the region a figure can occupy.
        function keep(size, key, reach) {
            var canvas = document.createElement("canvas"), ctx;
            canvas.width = size.width * 2; canvas.height = size.height * 2; ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.drawImage(sprite, size.width / 2, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
            var entry = { canvas: canvas, ox: -size.width / 2, oy: -size.height, sy: reach.sy, left: reach.left };
            retained.set(key, entry);
            return entry;
        }
        function dress(view, x, y, size, paint, source, key) {
            var id = key === undefined ? null : key + "|" + size.width + ":" + size.height + "|" + bucket(source);
            var entry = id && retained.get(id), reach = entry;
            if (!entry) {
                reach = render(view, x, y, size, paint, source);
                if (!reach) return false;
                entry = id && keep(size, id, reach);
            }
            if (entry) view.ctx.drawImage(entry.canvas, x + entry.ox, y + entry.oy);
            else view.ctx.drawImage(sprite, x - size.width, y - size.height);
            if (reach.sy < view.current_sy) view.current_sy = reach.sy;
            if (reach.left < view.current_left_overlap) view.current_left_overlap = reach.left;
            return true;
        }
        // The picture a figure last painted, for a reflection one tile below it.
        function portrait(size, source, key) {
            return key === undefined ? null : retained.get(key + "|" + size.width + ":" + size.height + "|" + bucket(source)) || null;
        }
        var water, waterCtx;
        // Rows mirror downward from the waterline and fade with depth; `mask`
        // limits them to the liquid, so a bank never shows a reflection.
        function reflect(ctx, x, y, size, picture, mask, offset, time) {
            if (!water) { water = document.createElement("canvas"); waterCtx = water.getContext("2d"); }
            if (!waterCtx) return false;
            if (water.width !== size.width || water.height !== size.height) { water.width = size.width; water.height = size.height; }
            waterCtx.setTransform(1, 0, 0, 1, 0, 0); waterCtx.globalCompositeOperation = "source-over"; waterCtx.globalAlpha = 1;
            waterCtx.clearRect(0, 0, size.width, size.height); waterCtx.imageSmoothingEnabled = false;
            var unit = Math.max(1, Math.round(size.height / 16)), feet = picture.canvas.height, unitX = size.width / 32;
            for (var row = 0; row < size.height; row += unit) {
                var depth = row / size.height, drift = Math.round(Math.sin(row / unit * .85 + time * 2.6) * unitX * (.6 + depth * 1.6));
                waterCtx.globalAlpha = .72 * Math.pow(1 - depth, 1.2);
                waterCtx.drawImage(picture.canvas, size.width / 2, feet - row - unit, size.width, unit, drift, row + offset, size.width, unit);
            }
            waterCtx.globalCompositeOperation = "source-atop"; waterCtx.globalAlpha = .24; waterCtx.fillStyle = "#12404f";
            waterCtx.fillRect(0, 0, size.width, size.height);
            if (mask) {
                waterCtx.globalCompositeOperation = "destination-in"; waterCtx.globalAlpha = 1;
                waterCtx.drawImage(mask, 0, 0, size.width, size.height);
            }
            ctx.drawImage(water, x, y);
            return true;
        }
        return { dress: dress, portrait: portrait, reflect: reflect, clear: retained.clear, stats: retained.stats };
    }
    return { gather: gather, shadow: shadow, create: create };
});
