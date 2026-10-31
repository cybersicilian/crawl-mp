/* Confirmed adjacent positions in, short interruptible presentation poses out. */
define([], function () {
    "use strict";
    function create() {
        var previous = new Map(), poses = new Map(), duration = 170;
        function sample(pose, now) {
            var t = Math.max(0, Math.min(1, (now - pose.born) / duration));
            var glide = 1 - Math.pow(1 - Math.min(1, t / .82), 3);
            return { x: pose.from.x + (pose.pos.x - pose.from.x) * glide,
                y: pose.from.y + (pose.pos.y - pose.from.y) * glide,
                lift: Math.sin(Math.PI * Math.min(1, t / .82)) * .055,
                squash: t > .75 ? Math.sin((t - .75) * Math.PI / .25) * .035 : 0,
                done: t >= 1 };
        }
        function update(entries, now, eligible) {
            var next = new Map(), steps = [];
            entries.forEach(function (entry) {
                var current = { key: entry.key, x: entry.x, y: entry.y, identity: entry.identity };
                if (!Number.isInteger(current.x) || !Number.isInteger(current.y)) return;
                next.set(entry.key, current);
                var old = previous.get(entry.key);
                if (!old || old.identity !== current.identity) { poses.delete(entry.key); return; }
                if (old.x === current.x && old.y === current.y) return;
                var distance = Math.max(Math.abs(old.x - current.x), Math.abs(old.y - current.y));
                if (distance !== 1 || !eligible(old, current)) { poses.delete(entry.key); return; }
                var active = poses.get(entry.key), start = active ? sample(active, now) : old;
                var pose = { key: entry.key, from: { x: start.x, y: start.y },
                    origin: { x: old.x, y: old.y }, pos: { x: current.x, y: current.y }, born: now };
                poses.set(entry.key, pose); steps.push(pose);
            });
            poses.forEach(function (pose, key) { if (!next.has(key)) poses.delete(key); });
            previous = next;
            while (poses.size > 24) poses.delete(poses.keys().next().value);
            return steps;
        }
        return { update: update, sample: sample, poses: poses,
            reset: function () { previous.clear(); poses.clear(); } };
    }
    return { create: create };
});
