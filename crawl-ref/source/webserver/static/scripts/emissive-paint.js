/* Isolated emission buffers, flame tongues and visible-source reflections.
 * The consumer supplies visibility, source geometry and protected occupants. */
define(["flame-field", "liquid-field", "emissive-surface", "surface-reflections", "light-emission", "idle-work"],
function (flames, liquids, radiance, reflections, emission, idle) {
    "use strict";
    var cache = new Map(), mirrors = reflections.create(512), scenes = new WeakMap();
    // Flame, bloom and reflection frames for the next animation step are
    // rendered between paints rather than when the step arrives. The queue
    // outlives individual paints; later paints only add to it.
    var queue = new Map(), queued = false;
    function warm(remaining) {
        var iterator = queue.entries(), next = iterator.next();
        while (!next.done && remaining() > 0) {
            var entry = next.value[1];
            queue.delete(next.value[0]);
            if (entry.emitter) source(entry.emitter.cell, entry.now + 100, true, entry.glow);
            else mirrors.tile(entry.cell.x, entry.cell.y, entry.scene.at(entry.cell.x, entry.cell.y), entry.now + 100, true);
            next = iterator.next();
        }
        queued = queue.size > 0;
        return queued;
    }
    function enqueue(scene, entry, now, settings) {
        entry.emitters.forEach(function (emitter) {
            queue.set("e:" + emitter.cell.x + ":" + emitter.cell.y, { emitter: emitter, now: now, glow: settings.bloom !== false });
        });
        entry.water.forEach(function (cell) { queue.set("w:" + cell.x + ":" + cell.y, { cell: cell, scene: scene, now: now }); });
        if (queue.size && !queued) { queued = true; idle.add("emissive-paint", warm); }
    }
    function bitmap(data, width, height) {
        var canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
        var ctx = canvas.getContext("2d");
        if (!ctx) return null;
        var image = ctx.createImageData(width, height); image.data.set(data); ctx.putImageData(image, 0, 0); return canvas;
    }
    function source(cell, now, animated, glow) {
        var config = cell.emission, phase = animated && config.animated !== false && config.type !== "glow"
            ? Math.floor(now / (config.type === "lava" ? 400 : 100)) : 0;
        var key = [cell.x, cell.y, config.type, config.width, config.height, config.y, config.colour, phase, glow].join(":");
        if (cache.has(key)) return cache.get(key);
        var pixels = new Uint8ClampedArray(32 * 32 * 4), seed = Math.abs(cell.x * 31 + cell.y * 47) % 256;
        for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
            var index = (y * 32 + x) * 4;
            if (config.type === "flame") {
                var sample = flames.sample(((x + .5) / 32 - .5) / (config.width / 2),
                    (config.y - (y + .5) / 32) / config.height, phase / 10, seed);
                pixels.set(sample.colour, index); pixels[index + 3] = sample.alpha * 255;
            } else if (config.type === "lava") {
                var lava = liquids.sample(cell.x * 32 + x, cell.y * 32 + y, phase % 256, true);
                pixels.set(lava.colour, index); pixels[index + 3] = 255;
            } else {
                var distance = Math.hypot(x - 15.5, y - 17.5), strength = Math.max(0, 1 - distance / 6);
                pixels.set(config.colour, index); pixels[index + 3] = strength * strength * 255;
            }
        }
        var haloKey = "bloom:" + [cell.x, cell.y, config.type, config.width, config.height, config.y, config.colour,
            config.type === "flame" ? Math.floor(phase / 2) : phase].join(":"), halo = cache.get(haloKey);
        if (glow && !halo) {
            var blurred = radiance.bloom(pixels, 32, 32, 8);
            halo = bitmap(blurred.data, blurred.width, blurred.height); cache.set(haloKey, halo);
        }
        var result = { core: config.type === "flame" ? bitmap(pixels, 32, 32) : null,
            bloom: glow ? halo : null };
        cache.set(key, result); while (cache.size > 256) cache.delete(cache.keys().next().value);
        return result;
    }
    // Which cells reflect or emit, and which receivers each emitter may reach,
    // follow the scene window and its occupancy; they are not re-derived per frame.
    function prepare(scene, settings) {
        var version = scene.base ? scene.base.version : 0;
        var flags = [settings.reflections !== false, settings.bloom !== false, settings.spells !== false].join(":");
        var entry = scenes.get(scene);
        if (entry && entry.version === version && entry.flags === flags) return entry;
        var currentCells = new Map(); scene.cells.forEach(function (cell) { currentCells.set(cell.x + ":" + cell.y, cell); });
        var water = scene.cells.filter(function (cell) { return settings.reflections !== false && cell.surface === "water" && !cell.occupied; });
        var emitters = scene.cells.filter(function (cell) { return cell.emission && !cell.emission.blocked
            && (settings.bloom !== false || settings.spells !== false && cell.emission.type === "flame"); }).slice(0, 32).map(function (cell) {
            var light = scene.lights.find(function (entry) { return entry.x === cell.x && entry.y === cell.y; });
            if (!light) return null;
            var receivers = light.receivers.filter(function (receiver) {
                var current = currentCells.get(receiver.x + ":" + receiver.y);
                return current && (!current.occupied || current.emission && !current.emission.blocked);
            });
            return { cell: cell, light: light, receivers: receivers, key: null, path: null };
        }).filter(Boolean);
        entry = { version: version, flags: flags, water: water, emitters: emitters };
        scenes.set(scene, entry);
        return entry;
    }
    function clipTo(ctx, emitter, coords, key) {
        if (typeof Path2D !== "function") {
            ctx.beginPath();
            emitter.receivers.forEach(function (receiver) { var p = coords(receiver.x, receiver.y); ctx.rect(p.x, p.y, p.width, p.height); });
            ctx.clip(); return;
        }
        if (!emitter.path || emitter.key !== key) {
            emitter.key = key; emitter.path = new Path2D();
            emitter.receivers.forEach(function (receiver) { var p = coords(receiver.x, receiver.y); emitter.path.rect(p.x, p.y, p.width, p.height); });
        }
        ctx.clip(emitter.path);
    }
    function paint(ctx, scene, coords, now, animated, settings) {
        settings = settings || {};
        var reflected = 0, glows = 0, fire = 0, entry = prepare(scene, settings);
        var origin = coords(0, 0) || {}, key = [origin.x, origin.y, origin.width, origin.height].join(":");
        ctx.save(); ctx.imageSmoothingEnabled = false;
        entry.water.forEach(function (cell) {
            var image = mirrors.tile(cell.x, cell.y, scene.at(cell.x, cell.y), now, animated);
            if (!image) return;
            var point = coords(cell.x, cell.y); ctx.drawImage(image, point.x, point.y, point.width, point.height); reflected++;
        });
        entry.emitters.forEach(function (emitter) {
            var cell = emitter.cell, light = emitter.light;
            var image = source(cell, now, animated, settings.bloom !== false), point = coords(cell.x, cell.y);
            ctx.save();
            clipTo(ctx, emitter, coords, key);
            ctx.imageSmoothingEnabled = true;
            ctx.globalAlpha = emission.level(light, now, animated) * (cell.emission.type === "lava" ? .38 : .72);
            if (image.bloom) {
                ctx.drawImage(image.bloom, point.x - point.width / 4, point.y - point.height / 4, point.width * 1.5, point.height * 1.5); glows++;
            }
            ctx.restore();
            if (image.core && settings.spells !== false) {
                ctx.drawImage(image.core, point.x, point.y, point.width, point.height); fire++;
            }
        });
        ctx.restore();
        if (animated && idle) enqueue(scene, entry, now, settings);
        return { reflections: reflected, blooms: glows, flames: fire };
    }
    return { paint: paint, clear: function () { cache.clear(); mirrors.clear(); queue.clear(); } };
});
